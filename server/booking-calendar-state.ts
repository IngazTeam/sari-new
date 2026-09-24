import type { PoolConnection } from "mysql2/promise";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { databaseTimeEpoch } from "./db/time";
import { readActiveBookingReschedule } from "./booking-reschedule-state";
export async function assertBookingCalendarSchema() {
  await assertRuntimeSchema(
    "booking calendar dispatch",
    [
      { table: "booking_reschedule_notifications", columns: ["kind", "confirmation_id", "cancellation_id", "reschedule_id", "snapshot", "snapshot_hash", "dispatch_text", "state", "claim_token", "delivery_state", "projection_message_id", "next_check_at"],
        uniqueIndexes: [{ name: "uq_booking_notice_move", columns: ["merchant_id", "reschedule_id"] }] },
      {
        table: "booking_calendar_reschedules",
        columns: [
          "booking_reference",
          "agreement_id",
          "service_id",
          "staff_id",
          "booking_date",
          "start_time",
          "end_time",
          "snapshot",
          "snapshot_hash",
          "state",
          "request_id",
          "request_hash",
          "event_etag",
          "revision",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_move_agreement",
            columns: ["merchant_id", "agreement_id"],
          },
          {
            name: "uq_booking_move_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
      {
        table: "booking_calendar_cancellations",
        columns: [
          "booking_reference",
          "actor_user_id",
          "request_hash",
          "snapshot",
          "snapshot_hash",
          "event_etag",
          "reason",
          "evidence_hash",
          "state",
          "revision",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_cancel_booking",
            columns: ["merchant_id", "booking_reference"],
          },
          {
            name: "uq_booking_cancel_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
      {
        table: "booking_calendar_links",
        columns: [
          "booking_reference",
          "request_hash",
          "agreement_id",
          "integration_id",
          "calendar_id",
          "identity_hash",
          "event_reference",
          "payload",
          "payload_hash",
          "state",
          "revision",
          "checked_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_calendar_booking",
            columns: ["merchant_id", "booking_reference"],
          },
          {
            name: "uq_booking_calendar_request",
            columns: ["merchant_id", "request_id"],
          },
          { name: "uq_booking_calendar_event", columns: ["event_reference"] },
        ],
      },
      {
        table: "booking_calendar_reviews",
        columns: [
          "booking_reference",
          "request_hash",
          "action",
          "outcome",
          "reason",
          "proof_hash",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_calendar_review_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
export async function readBookingCalendarLink(
  c: PoolConnection,
  merchantId: number,
  bookingId: number
) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM booking_calendar_links WHERE merchant_id=? AND booking_reference=? FOR UPDATE",
    [merchantId, bookingId]
  );
  return rows[0] ?? null;
}
/** Never release a slot while a calendar write may still exist. */
export async function assertBookingCalendarMutation(
  c: PoolConnection,
  booking: any,
  input: { schedule?: boolean; remove?: boolean; status?: string }
) {
  const link = await readBookingCalendarLink(
    c,
    booking.merchant_id,
    booking.id
  );
  if (!link) return;
  if (
    [
      "cancelling",
      "cancel_unknown",
      "reschedule_pending",
      "moving",
      "move_unknown",
    ].includes(link.state)
  )
    throw Error("Calendar cancellation requires review");
  const changed = input.status && input.status !== booking.status;
  if (
    input.schedule ||
    input.remove ||
    (changed && (link.state !== "synced" || input.status === "cancelled"))
  )
    throw Error("Calendar commitment requires review");
  if (changed && ["completed", "no_show"].includes(input.status!)) {
    const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
    const date =
      booking.booking_date instanceof Date
        ? booking.booking_date.toISOString().slice(0, 10)
        : String(booking.booking_date).slice(0, 10);
    if (
      Date.parse(`${date}T${booking.end_time}:00+03:00`) >
      databaseTimeEpoch(clock[0].now)
    )
      throw Error("Calendar slot is still active");
  }
}

/** Caller holds the booking lock; a cancellation dispatch fences later checkout issuance. */
export async function assertBookingNotCancelling(
  c: PoolConnection,
  merchantId: number,
  bookingId: number
) {
  const [rows] = await c.execute<any[]>(
    "SELECT id FROM booking_calendar_cancellations WHERE merchant_id=? AND booking_reference=? FOR UPDATE",
    [merchantId, bookingId]
  );
  if (rows.length) throw Error("Booking cancellation prevents checkout");
  if (await readActiveBookingReschedule(c, merchantId, bookingId))
    throw Error("Booking reschedule prevents checkout");
}
