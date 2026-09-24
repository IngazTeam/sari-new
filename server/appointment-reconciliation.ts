import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  reconcileAppointmentSchema,
  type ReconcileAppointmentInput,
} from "../shared/appointment-reconciliation";
import { withBookingCapacityTransaction } from "./booking-capacity";
import {
  calendarIdentity,
  assertAppointmentSchema,
} from "./appointment-booking";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { databaseTimeEpoch } from "./db/time";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const unavailable = () =>
  Error("Calendar review requires fresh verified evidence");
const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
const day = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const snapshot = (row: any) => ({
  status: row.status,
  syncState: row.calendar_sync_state,
  revision: row.calendar_review_revision,
  eventId: row.google_event_id,
});
async function ready() {
  await assertAppointmentSchema();
  await assertRuntimeSchema(
    "appointment calendar review",
    [
      {
        table: "appointment_calendar_reviews",
        columns: ["actor_user_id", "proof_hash", "before_state", "after_state"],
        uniqueIndexes: [
          {
            name: "uq_appointment_review_request",
            columns: ["merchant_id", "request_id"],
          },
          {
            name: "uq_appointment_review_revision",
            columns: ["merchant_id", "appointment_reference", "revision"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
async function graph(
  c: PoolConnection,
  merchantId: number,
  appointmentId: number
) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM appointments WHERE id=? AND merchant_id=? FOR UPDATE",
    [appointmentId, merchantId]
  );
  const row = rows[0];
  if (!row) throw unavailable();
  const [services] = await c.execute<any[]>(
    "SELECT id,name FROM services WHERE id=? AND merchant_id=? FOR SHARE",
    [row.service_id, merchantId]
  );
  if (
    services.length !== 1 ||
    !Number.isSafeInteger(row.calendar_review_revision) ||
    row.calendar_review_revision < 0
  )
    throw unavailable();
  const [integrations] = await c.execute<any[]>(
    "SELECT * FROM google_integrations WHERE merchant_id=? AND integration_type='calendar' AND is_active=1 FOR SHARE",
    [merchantId]
  );
  let integration: any = null,
    credentials: any = null,
    identity: string | null = null;
  if (integrations.length === 1) {
    try {
      credentials = JSON.parse(integrations[0].credentials || "{}");
      identity = calendarIdentity(credentials);
      integration = integrations[0];
    } catch {
      /* Unusable credentials cannot authorize recovery. */
    }
  }
  const hasBinding =
    row.calendar_integration_id != null &&
    !!row.calendar_target_id &&
    !!row.calendar_identity_hash;
  const partialBinding =
    !hasBinding &&
    (row.calendar_integration_id != null ||
      row.calendar_target_id != null ||
      row.calendar_identity_hash != null);
  const matchingBinding =
    hasBinding &&
    integration &&
    row.calendar_integration_id === integration.id &&
    row.calendar_target_id === (integration.calendar_id || "primary") &&
    row.calendar_identity_hash === identity;
  const needsManualBinding =
    !hasBinding || (!row.google_event_id && !row.calendar_event_reference);
  // A different account must never silently replace an existing verified binding.
  const referenceConsistent =
    !row.calendar_event_reference ||
    (hasBinding &&
      (!row.google_event_id ||
        row.google_event_id === row.calendar_event_reference));
  const targetReady =
    !!integration &&
    !partialBinding &&
    referenceConsistent &&
    (!hasBinding || matchingBinding);
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const now = databaseTimeEpoch(clock[0].now),
    updated = databaseTimeEpoch(row.updated_at);
  if (!Number.isFinite(now)) throw unavailable();
  const busy =
    ["creating", "cancelling"].includes(row.calendar_sync_state) &&
    (!Number.isFinite(updated) || now - updated < 120000);
  const eligible =
    ["pending", "confirmed"].includes(row.status) &&
    [
      "creating",
      "create_unknown",
      "cancelling",
      "cancel_unknown",
      "legacy",
    ].includes(row.calendar_sync_state);
  const canRestore =
    eligible &&
    !busy &&
    targetReady &&
    row.calendar_sync_state !== "cancelling";
  const canCancel =
    eligible &&
    !busy &&
    targetReady &&
    !!row.google_event_id &&
    !needsManualBinding &&
    ["cancelling", "cancel_unknown"].includes(row.calendar_sync_state);
  const evidence = hash({
    row,
    service: services[0],
    target: integration
      ? {
          id: integration.id,
          calendar: integration.calendar_id || "primary",
          identity,
        }
      : null,
  });
  return {
    row,
    service: services[0],
    integration,
    credentials,
    identity,
    needsManualBinding,
    canRestore,
    canCancel,
    evidence,
    blocked: !eligible
      ? "ineligible"
      : busy
        ? "in_flight"
        : !targetReady
          ? "target_unavailable"
          : null,
  };
}
async function history(
  c: PoolConnection,
  merchantId: number,
  appointmentId: number
) {
  const [rows] = await c.execute<any[]>(
    "SELECT actor_user_id,action,outcome,failure_code,operator_reason,manual_binding,revision,created_at FROM appointment_calendar_reviews WHERE merchant_id=? AND appointment_reference=? ORDER BY revision DESC LIMIT 20",
    [merchantId, appointmentId]
  );
  return rows.map(row => ({
    actorUserId: Number(row.actor_user_id),
    action: String(row.action),
    outcome: String(row.outcome),
    failureCode: row.failure_code as string | null,
    reason: String(row.operator_reason),
    manualBinding: row.manual_binding === 1,
    revision: Number(row.revision),
    at: new Date(databaseTimeEpoch(row.created_at)).toISOString(),
  }));
}
export async function readAppointmentReview(
  merchantId: number,
  appointmentId: number
) {
  positive(merchantId);
  positive(appointmentId);
  await ready();
  return withBookingCapacityTransaction(merchantId, async c => {
    const data = await graph(c, merchantId, appointmentId);
    return {
      appointmentId,
      evidence: data.evidence,
      syncState: String(data.row.calendar_sync_state),
      status: String(data.row.status),
      eventId: String(
        data.row.google_event_id || data.row.calendar_event_reference || ""
      ),
      needsManualBinding: data.needsManualBinding,
      canRestore: data.canRestore,
      canCancel: data.canCancel,
      blocked: data.blocked,
      history: await history(c, merchantId, appointmentId),
    };
  });
}
type Result = {
  outcome: "verified_active" | "verified_cancelled" | "unverified";
  failureCode: string | null;
};
async function prior(
  c: PoolConnection,
  merchantId: number,
  requestId: string,
  requestHash: string
): Promise<Result | null> {
  const [rows] = await c.execute<any[]>(
    "SELECT request_hash,outcome,failure_code FROM appointment_calendar_reviews WHERE merchant_id=? AND request_id=?",
    [merchantId, requestId]
  );
  if (!rows.length) return null;
  if (rows[0].request_hash !== requestHash) throw unavailable();
  return { outcome: rows[0].outcome, failureCode: rows[0].failure_code };
}
function verify(
  event: any,
  data: Awaited<ReturnType<typeof graph>>,
  input: ReconcileAppointmentInput
): Result {
  const fail = (code: string): Result => ({
    outcome: "unverified",
    failureCode: code,
  });
  if (
    !event ||
    event.id !== input.eventId ||
    event.recurringEventId ||
    event.recurrence
  )
    return fail("identity_mismatch");
  if (input.action === "confirm_cancellation") {
    // A 404/410 is not proof of deletion. A fetched cancellation for a previously bound event is.
    return event.status === "cancelled" && data.row.google_event_id === event.id
      ? { outcome: "verified_cancelled", failureCode: null }
      : fail("cancellation_unconfirmed");
  }
  if (event.status !== "confirmed" || event.transparency === "transparent")
    return fail("event_not_active");
  const epoch = (value: unknown) =>
    typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      ? Date.parse(value)
      : NaN;
  if (
    epoch(event.start?.dateTime) !==
      Date.parse(
        `${day(data.row.appointment_date)}T${data.row.start_time}:00+03:00`
      ) ||
    epoch(event.end?.dateTime) !==
      Date.parse(
        `${day(data.row.appointment_date)}T${data.row.end_time}:00+03:00`
      )
  )
    return fail("time_mismatch");
  if (data.row.calendar_event_reference) {
    if (
      event.id !== data.row.calendar_event_reference ||
      event.extendedProperties?.private?.sariAppointment !==
        data.row.calendar_event_reference
    )
      return fail("identity_mismatch");
  } else if (data.needsManualBinding) {
    // Old rows have no provider reference. An operator must also attest the account binding.
    if (
      !input.bindingReviewed ||
      event.summary !==
        `${data.service.name} - ${data.row.customer_name || ""}` ||
      typeof event.description !== "string" ||
      !event.description
        .split(/\r?\n/)
        .includes(`Phone: ${data.row.customer_phone}`)
    )
      return fail("identity_mismatch");
  }
  return { outcome: "verified_active", failureCode: null };
}
/** Explicit operator action: one provider GET, then local state and audit in the capacity transaction. */
export async function reconcileAppointment(
  merchantId: number,
  actorUserId: number,
  raw: ReconcileAppointmentInput
) {
  positive(merchantId);
  positive(actorUserId);
  const input = reconcileAppointmentSchema.parse(raw);
  await ready();
  const requestHash = hash({ merchantId, actorUserId, input });
  const initial = await withBookingCapacityTransaction(merchantId, async c => {
    const replay = await prior(c, merchantId, input.requestId, requestHash);
    if (replay) return { replay };
    const data = await graph(c, merchantId, input.appointmentId);
    const expectedId =
      data.row.google_event_id || data.row.calendar_event_reference;
    if (
      data.evidence !== input.evidence ||
      !(input.action === "restore_sync" ? data.canRestore : data.canCancel) ||
      (expectedId && input.eventId !== expectedId) ||
      (data.needsManualBinding && !input.bindingReviewed)
    )
      throw unavailable();
    return { data };
  });
  if (initial.replay) return initial.replay;
  const data = initial.data!;
  let result: Result,
    proof: unknown = null;
  try {
    const provider = await import("./_core/googleCalendar");
    const credentials = await provider.validateAndRefreshCredentials(
      data.credentials
    );
    const event = await provider.getCalendarEvent(
      credentials,
      data.integration.calendar_id || "primary",
      input.eventId
    );
    result = verify(event, data, input);
    proof = {
      id: event?.id,
      status: event?.status,
      start: event?.start,
      end: event?.end,
      reference: event?.extendedProperties?.private?.sariAppointment,
      identityDigest: hash({
        summary: event?.summary,
        description: event?.description,
      }),
    };
  } catch {
    result = { outcome: "unverified", failureCode: "provider_unavailable" };
  }
  return withBookingCapacityTransaction(merchantId, async c => {
    const replay = await prior(c, merchantId, input.requestId, requestHash);
    if (replay) return replay;
    const current = await graph(c, merchantId, input.appointmentId);
    if (current.evidence !== data.evidence) throw unavailable();
    const before = snapshot(current.row),
      revision = current.row.calendar_review_revision + 1;
    if (result.outcome === "verified_active") {
      await c.execute(
        "UPDATE appointments SET google_event_id=?,calendar_sync_state='synced',calendar_integration_id=?,calendar_target_id=?,calendar_identity_hash=?,calendar_review_revision=? WHERE id=? AND merchant_id=?",
        [
          input.eventId,
          data.integration.id,
          data.integration.calendar_id || "primary",
          data.identity,
          revision,
          input.appointmentId,
          merchantId,
        ]
      );
    } else if (result.outcome === "verified_cancelled") {
      await c.execute(
        "UPDATE appointments SET status='cancelled',calendar_sync_state='cancelled',calendar_review_revision=? WHERE id=? AND merchant_id=?",
        [revision, input.appointmentId, merchantId]
      );
    } else {
      await c.execute(
        "UPDATE appointments SET calendar_review_revision=? WHERE id=? AND merchant_id=?",
        [revision, input.appointmentId, merchantId]
      );
    }
    const [updated] = await c.execute<any[]>(
      "SELECT * FROM appointments WHERE id=? AND merchant_id=?",
      [input.appointmentId, merchantId]
    );
    await c.execute(
      `INSERT INTO appointment_calendar_reviews (merchant_id,appointment_reference,actor_user_id,request_id,request_hash,revision,action,event_id,outcome,failure_code,operator_reason,manual_binding,proof_hash,before_state,after_state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        merchantId,
        input.appointmentId,
        actorUserId,
        input.requestId,
        requestHash,
        revision,
        input.action,
        input.eventId,
        result.outcome,
        result.failureCode,
        input.reason,
        data.needsManualBinding ? 1 : 0,
        hash({ evidence: data.evidence, proof, result }),
        JSON.stringify(before),
        JSON.stringify(snapshot(updated[0])),
      ]
    );
    return result;
  });
}
