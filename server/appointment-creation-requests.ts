import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  scopedAppointmentCreationSchema,
  type AppointmentCreationInput,
} from "../shared/appointment-creation";
import {
  appointmentRequestIdentitySchema,
  type AppointmentRequestIdentity,
} from "../shared/appointment-request";
import {
  assertAppointmentSchema,
  reserveAppointmentInTransaction,
} from "./appointment-booking";
import { withBookingCapacityTransaction } from "./booking-capacity";
import { assertRuntimeSchema } from "./db/schema-readiness";

const unavailable = () => Error("Appointment request unavailable or changed");
const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
async function ready() {
  await assertAppointmentSchema();
  await assertRuntimeSchema(
    "appointment creation requests",
    [
      {
        table: "appointment_creation_requests",
        columns: [
          "actor_user_id",
          "request_hash",
          "appointment_reference",
          "created_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_appointment_creation_request",
            columns: ["merchant_id", "request_id"],
          },
          {
            name: "uq_appointment_creation_reference",
            columns: ["merchant_id", "appointment_reference"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
function fingerprint(input: AppointmentCreationInput, actorUserId: number) {
  // Canonical explicit fields: omitted optional values and empty names have the same stored meaning.
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        merchantId: input.merchantId,
        actorUserId,
        synchronizeCalendar: true,
        serviceId: input.serviceId,
        staffId: input.staffId ?? null,
        appointmentDate: input.appointmentDate,
        startTime: input.startTime,
        customerPhone: input.customerPhone,
        customerName: input.customerName || null,
        notes: input.notes ?? null,
      })
    )
    .digest("hex");
}
async function request(
  connection: PoolConnection,
  merchantId: number,
  identity: AppointmentRequestIdentity
) {
  const [rows] = await connection.execute<any[]>(
    "SELECT actor_user_id,request_hash,appointment_reference FROM appointment_creation_requests WHERE merchant_id=? AND request_id=?",
    [merchantId, identity.requestId]
  );
  if (!rows.length) return null;
  if (rows[0].actor_user_id !== identity.actorUserId) throw unavailable();
  return rows[0];
}
async function current(
  connection: PoolConnection,
  merchantId: number,
  appointmentId: number,
  requestId: string
) {
  positive(appointmentId);
  const [rows] = await connection.execute<any[]>(
    "SELECT status,calendar_sync_state FROM appointments WHERE id=? AND merchant_id=? FOR UPDATE",
    [appointmentId, merchantId]
  );
  // Retained request rows are tombstones, never permission to recreate a deleted appointment.
  if (!rows.length)
    return {
      state: "appointment_unavailable" as const,
      requestId,
      appointmentId,
    };
  return {
    state: "recorded" as const,
    requestId,
    appointmentId,
    appointmentStatus: z
      .enum(["pending", "confirmed", "cancelled", "completed", "no_show"])
      .parse(rows[0].status),
    calendarSyncState: z
      .enum([
        "none",
        "creating",
        "create_unknown",
        "synced",
        "cancelling",
        "cancel_unknown",
        "cancelled",
        "legacy",
      ])
      .parse(rows[0].calendar_sync_state),
  };
}
/** A read never dispatches provider work, even for a request whose commit acknowledgement was lost. */
export async function readAppointmentCreationRequest(
  merchantId: number,
  raw: AppointmentRequestIdentity
) {
  positive(merchantId);
  const identity = appointmentRequestIdentitySchema.parse(raw);
  await ready();
  return withBookingCapacityTransaction(merchantId, async connection => {
    const prior = await request(connection, merchantId, identity);
    if (!prior)
      return { state: "not_found" as const, requestId: identity.requestId };
    return current(
      connection,
      merchantId,
      Number(prior.appointment_reference),
      identity.requestId
    );
  });
}
/** Request identity and appointment reservation commit together under the cross-process capacity lock. */
export async function reserveCalendarAppointmentRequest(
  raw: AppointmentCreationInput,
  rawIdentity: AppointmentRequestIdentity
) {
  const input = scopedAppointmentCreationSchema.parse(raw),
    identity = appointmentRequestIdentitySchema.parse(rawIdentity);
  const requestHash = fingerprint(input, identity.actorUserId);
  await ready();
  return withBookingCapacityTransaction(input.merchantId, async connection => {
    const prior = await request(connection, input.merchantId, identity);
    if (prior) {
      if (prior.request_hash !== requestHash) throw unavailable();
      const result = await current(
        connection,
        input.merchantId,
        Number(prior.appointment_reference),
        identity.requestId
      );
      if (result.state !== "recorded") throw unavailable();
      return { kind: "replay" as const, result };
    }
    const reservation = await reserveAppointmentInTransaction(
      connection,
      input,
      true
    );
    await connection.execute(
      "INSERT INTO appointment_creation_requests (merchant_id,request_id,actor_user_id,request_hash,appointment_reference) VALUES (?,?,?,?,?)",
      [
        input.merchantId,
        identity.requestId,
        identity.actorUserId,
        requestHash,
        reservation.appointmentId,
      ]
    );
    return { kind: "new" as const, reservation };
  });
}
