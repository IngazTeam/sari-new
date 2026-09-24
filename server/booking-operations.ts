import { createHash } from "node:crypto";
import {
  withBookingCapacityTransaction,
  validateBookingStaff,
  hasBookingConflict,
} from "./booking-capacity";
import { z } from "zod";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { databaseTimeEpoch } from "./db/time";
import { assertBookingAgreementSchema } from "./ai/booking-agreements";
import { readBookingConsentReview } from "./booking-consent-review";
import { bookingConsentAttestationSchema } from "../shared/booking-consent-review";
import { assertBookingCalendarMutation } from "./booking-calendar-state";
import {
  bookingTransitions,
  bookingStatusSchema,
  updateBookingOperationSchema,
  deleteBookingOperationSchema,
  type UpdateBookingOperationInput,
  type DeleteBookingOperationInput,
} from "../shared/booking-operations";

const unavailable = () =>
  new Error(
    "Booking operation requires current operational and payment evidence"
  );
const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
const day = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const snapshot = (row: any) => ({
  status: row.status,
  paymentStatus: row.payment_status,
  serviceId: row.service_id,
  staffId: row.staff_id,
  bookingDate: day(row.booking_date),
  startTime: row.start_time,
  endTime: row.end_time,
  durationMinutes: row.duration_minutes,
  amountMinor: row.final_price,
  cancelledBy: row.cancelled_by,
  confirmedAt: row.confirmed_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
});

async function schemaReady() {
  await assertBookingAgreementSchema();
  await assertRuntimeSchema(
    "booking operations",
    [
      {
        table: "booking_checkout_attempts",
        columns: ["booking_id", "merchant_id", "state"],
      },
      {
        table: "booking_operation_audits",
        columns: [
          "booking_reference",
          "actor_user_id",
          "request_hash",
          "before_state",
          "after_state",
          "changed_fields",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_operation_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
async function execute(
  merchantId: number,
  actorUserId: number,
  operation: "update" | "delete",
  input: UpdateBookingOperationInput | DeleteBookingOperationInput
) {
  positive(merchantId);
  positive(actorUserId);
  await schemaReady();
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ merchantId, actorUserId, operation, input }))
    .digest("hex");
  return withBookingCapacityTransaction(merchantId, async connection => {
    const [bookings] = await connection.execute<any[]>(
      "SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE",
      [input.bookingId, merchantId]
    );
    const [previous] = await connection.execute<any[]>(
      "SELECT * FROM booking_operation_audits WHERE merchant_id=? AND request_id=? FOR UPDATE",
      [merchantId, input.operationId]
    );
    if (previous.length) {
      if (
        previous.length !== 1 ||
        previous[0].request_hash !== requestHash ||
        previous[0].booking_reference !== input.bookingId ||
        previous[0].actor_user_id !== actorUserId
      )
        throw unavailable();
      return {
        success: true as const,
        alreadyApplied: true,
        deleted: operation === "delete",
      };
    }
    const booking = bookings[0];
    if (!booking || booking.status !== input.expectedStatus)
      throw unavailable();
    const [services] = await connection.execute<any[]>(
      "SELECT * FROM services WHERE id=? AND merchant_id=? FOR UPDATE",
      [booking.service_id, merchantId]
    );
    if (services.length !== 1) throw unavailable();
    const [links] = await connection.execute<any[]>(
      "SELECT id,merchant_id FROM payment_links WHERE booking_id=? ORDER BY id FOR UPDATE",
      [booking.id]
    );
    const [attempts] = await connection.execute<any[]>(
      "SELECT id,merchant_id FROM booking_checkout_attempts WHERE booking_id=? ORDER BY id FOR UPDATE",
      [booking.id]
    );
    const [payments] = await connection.execute<any[]>(
      "SELECT id,merchant_id FROM order_payments WHERE booking_id=? ORDER BY id FOR UPDATE",
      [booking.id]
    );
    if (
      [...links, ...attempts, ...payments].some(
        row => row.merchant_id !== merchantId
      )
    )
      throw unavailable();
    const hasFinancialHistory =
      links.length > 0 ||
      attempts.length > 0 ||
      payments.length > 0 ||
      booking.payment_status !== "unpaid";
    const before = snapshot(booking);
    let reviewedConsent:
      | import("../shared/booking-consent-review").BookingConsentAttestation
      | null = null;
    let after: ReturnType<typeof snapshot> | null = null,
      changedFields: string[] = [];
    if (operation === "delete") {
      await assertBookingCalendarMutation(connection, booking, {
        remove: true,
      });
      if (
        hasFinancialHistory ||
        !["pending", "cancelled"].includes(booking.status) ||
        booking.google_event_id ||
        booking.confirmed_at ||
        booking.completed_at
      )
        throw unavailable();
      const [reviews] = await connection.execute<any[]>(
        "SELECT id FROM booking_reviews WHERE booking_id=? LIMIT 1",
        [booking.id]
      );
      if (reviews.length) throw unavailable();
      await connection.execute(
        "DELETE FROM bookings WHERE id=? AND merchant_id=?",
        [booking.id, merchantId]
      );
    } else {
      const patch = input as UpdateBookingOperationInput;
      const next = patch.status ?? booking.status;
      if (
        next !== booking.status &&
        !bookingTransitions[bookingStatusSchema.parse(booking.status)].includes(
          next
        )
      )
        throw unavailable();
      if (booking.payment_status === "refunded" && next !== booking.status)
        throw unavailable();
      if (patch.cancellationReason !== undefined && next !== "cancelled")
        throw unavailable();
      const scheduleChanged =
        (patch.staffId !== undefined && patch.staffId !== booking.staff_id) ||
        (patch.bookingDate !== undefined &&
          patch.bookingDate !== day(booking.booking_date)) ||
        (patch.startTime !== undefined &&
          patch.startTime !== booking.start_time) ||
        (patch.endTime !== undefined && patch.endTime !== booking.end_time);
      await assertBookingCalendarMutation(connection, booking, {
        schedule: scheduleChanged,
        status: next,
      });
      if (
        scheduleChanged ||
        (booking.status === "pending" && next === "confirmed") ||
        patch.consentReview
      ) {
        const consent = await readBookingConsentReview(
          connection,
          merchantId,
          booking
        );
        if (scheduleChanged && consent.state !== "none") throw unavailable();
        if (
          booking.status === "pending" &&
          next === "confirmed" &&
          consent.state !== "none"
        ) {
          const attestation = patch.consentReview;
          if (
            consent.state !== "ready" ||
            !attestation ||
            attestation.agreementId !== consent.agreementId ||
            attestation.evidence !== consent.evidence
          )
            throw unavailable();
          reviewedConsent = attestation;
        } else if (patch.consentReview) throw unavailable();
      }
      if (scheduleChanged) {
        if (
          hasFinancialHistory ||
          booking.google_event_id ||
          services[0].is_active !== 1 ||
          !["pending", "confirmed"].includes(booking.status) ||
          !["pending", "confirmed"].includes(next)
        )
          throw unavailable();
        const staffId = patch.staffId ?? booking.staff_id;
        await validateBookingStaff(
          connection,
          merchantId,
          services[0],
          staffId
        );
        const date = patch.bookingDate ?? day(booking.booking_date),
          start = patch.startTime ?? booking.start_time,
          end = patch.endTime ?? booking.end_time;
        if (
          minutes(end) - minutes(start) !== booking.duration_minutes ||
          booking.duration_minutes < 1
        )
          throw unavailable();
        if (
          await hasBookingConflict(
            connection,
            merchantId,
            {
              serviceId: booking.service_id,
              staffId: staffId ?? undefined,
              bookingDate: date,
              startTime: start,
              endTime: end,
            },
            booking.id
          )
        )
          throw unavailable();
      }
      const columns: Record<string, string> = {
        status: "status",
        staffId: "staff_id",
        bookingDate: "booking_date",
        startTime: "start_time",
        endTime: "end_time",
        notes: "notes",
        cancellationReason: "cancellation_reason",
      };
      const assignments: string[] = [],
        values: any[] = [];
      for (const [key, column] of Object.entries(columns)) {
        const value = (patch as any)[key];
        if (value === undefined) continue;
        assignments.push(`${column}=?`);
        values.push(value);
        changedFields.push(key);
      }
      if (next !== booking.status) {
        const timestamp = {
          confirmed: "confirmed_at",
          completed: "completed_at",
          cancelled: "cancelled_at",
        }[next as "confirmed" | "completed" | "cancelled"];
        if (timestamp)
          assignments.push(
            `${timestamp}=COALESCE(${timestamp},UTC_TIMESTAMP())`
          );
        if (next === "cancelled") {
          assignments.push("cancelled_by='merchant'");
          await connection.execute(
            "UPDATE payment_links SET is_active=0,status='disabled' WHERE booking_id=?",
            [booking.id]
          );
        }
      }
      if (!assignments.length) throw unavailable();
      await connection.execute(
        `UPDATE bookings SET ${assignments.join(",")} WHERE id=? AND merchant_id=?`,
        [...values, booking.id, merchantId]
      );
      const [updated] = await connection.execute<any[]>(
        "SELECT * FROM bookings WHERE id=? AND merchant_id=?",
        [booking.id, merchantId]
      );
      after = snapshot(updated[0]);
    }
    await connection.execute(
      `INSERT INTO booking_operation_audits (merchant_id,booking_reference,actor_user_id,request_id,request_hash,operation,before_state,after_state,changed_fields)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        merchantId,
        booking.id,
        actorUserId,
        input.operationId,
        requestHash,
        operation,
        JSON.stringify({
          ...before,
          ...(reviewedConsent ? { consentReview: reviewedConsent } : {}),
        }),
        after ? JSON.stringify(after) : null,
        JSON.stringify(changedFields),
      ]
    );
    return {
      success: true as const,
      alreadyApplied: false,
      deleted: operation === "delete",
    };
  });
}

export async function updateBookingOperation(
  merchantId: number,
  actorUserId: number,
  raw: UpdateBookingOperationInput
) {
  return execute(
    merchantId,
    actorUserId,
    "update",
    updateBookingOperationSchema.parse(raw)
  );
}
export async function deleteBookingOperation(
  merchantId: number,
  actorUserId: number,
  raw: DeleteBookingOperationInput
) {
  return execute(
    merchantId,
    actorUserId,
    "delete",
    deleteBookingOperationSchema.parse(raw)
  );
}

export async function getBookingOperationHistory(
  merchantId: number,
  bookingId: number
) {
  positive(merchantId);
  positive(bookingId);
  await schemaReady();
  const pool = await getPool();
  if (!pool) throw unavailable();
  const [bookings] = await pool.execute<any[]>(
    "SELECT id FROM bookings WHERE id=? AND merchant_id=?",
    [bookingId, merchantId]
  );
  const [rows] = await pool.execute<any[]>(
    "SELECT actor_user_id,operation,before_state,after_state,changed_fields,created_at FROM booking_operation_audits WHERE merchant_id=? AND booking_reference=? ORDER BY id DESC LIMIT 20",
    [merchantId, bookingId]
  );
  if (!bookings.length && !rows.length) throw unavailable();
  const json = (value: any) =>
    typeof value === "string" ? JSON.parse(value) : value;
  return rows.map(row => ({
    actorUserId: Number(row.actor_user_id),
    operation: z.enum(["update", "delete"]).parse(row.operation),
    beforeStatus: bookingStatusSchema.parse(json(row.before_state).status),
    afterStatus:
      row.after_state == null
        ? null
        : bookingStatusSchema.parse(json(row.after_state).status),
    changedFields: z
      .array(
        z.enum([
          "status",
          "staffId",
          "bookingDate",
          "startTime",
          "endTime",
          "notes",
          "cancellationReason",
        ])
      )
      .parse(json(row.changed_fields)),
    consentReview:
      json(row.before_state).consentReview == null
        ? null
        : bookingConsentAttestationSchema.parse(
            json(row.before_state).consentReview
          ),
    at: new Date(databaseTimeEpoch(row.created_at)).toISOString(),
  }));
}
