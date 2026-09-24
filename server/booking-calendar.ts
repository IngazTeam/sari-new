import { randomBytes } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import {
  bookingCalendarActionSchema,
  type BookingCalendarAction,
  type BookingCalendarReview,
} from "../shared/booking-calendar";
import {
  bookingAgreementDigest as hash,
  assertBookingAgreementSchema,
} from "./ai/booking-agreements";
import { readBookingConsentReview } from "./booking-consent-review";
import { withBookingCapacityTransaction } from "./booking-capacity";
import {
  assertBookingCalendarSchema,
  readBookingCalendarLink,
} from "./booking-calendar-state";
import { calendarIdentity } from "./appointment-booking";
import { databaseTimeEpoch } from "./db/time";
import { z } from "zod";

const fail = () => Error("Booking calendar requires fresh verified evidence");
const positive = (v: number) => z.number().int().positive().safe().parse(v);
const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const day = (v: any) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const payload = (
  b: any,
  serviceName: string,
  operatorReason: string | null = null,
  reviewEvidence: string | null = null
) => ({
  version: 1,
  bookingId: b.id,
  agreementId: b.customer_agreement_id,
  serviceId: b.service_id,
  staffId: b.staff_id,
  serviceName,
  customerName: b.customer_name || "",
  customerPhone: b.customer_phone,
  date: day(b.booking_date),
  startTime: b.start_time,
  endTime: b.end_time,
  operatorReason,
  reviewEvidence,
});
async function ready() {
  await assertBookingAgreementSchema();
  await assertBookingCalendarSchema();
}
async function graph(c: PoolConnection, merchantId: number, bookingId: number) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE",
    [bookingId, merchantId]
  );
  const b = rows[0];
  if (!b) throw fail();
  const link = await readBookingCalendarLink(c, merchantId, bookingId);
  const [services] = await c.execute<any[]>(
    "SELECT name FROM services WHERE id=? AND merchant_id=? FOR SHARE",
    [b.service_id, merchantId]
  );
  if (services.length !== 1) throw fail();
  const consent = await readBookingConsentReview(c, merchantId, b);
  const [integrations] = await c.execute<any[]>(
    "SELECT * FROM google_integrations WHERE merchant_id=? AND integration_type='calendar' AND is_active=1 ORDER BY id LIMIT 2 FOR SHARE",
    [merchantId]
  );
  let target: {
    id: number;
    calendarId: string;
    identity: string;
    credentials: any;
  } | null = null;
  if (integrations.length === 1)
    try {
      const i = integrations[0],
        credentials = json(i.credentials);
      const calendarId = i.calendar_id || "primary";
      if (typeof calendarId === "string" && calendarId.length <= 255)
        target = {
          id: i.id,
          calendarId,
          identity: calendarIdentity(credentials),
          credentials,
        };
    } catch {
      /* Invalid or ambiguous accounts cannot authorize an external effect. */
    }
  const savedPayload = link ? json(link.payload) : null;
  const currentPayload = payload(
    b,
    services[0].name,
    savedPayload?.operatorReason ?? null,
    savedPayload?.reviewEvidence ?? null
  );
  let binding = !link;
  if (link) {
    const saved = savedPayload;
    binding =
      !!target &&
      link.integration_id === target.id &&
      link.calendar_id === target.calendarId &&
      link.identity_hash === target.identity &&
      link.agreement_id === b.customer_agreement_id &&
      hash(saved) === link.payload_hash &&
      typeof saved.operatorReason === "string" &&
      saved.operatorReason.trim().length >= 10 &&
      saved.operatorReason.length <= 500 &&
      typeof saved.reviewEvidence === "string" &&
      /^[a-f0-9]{64}$/.test(saved.reviewEvidence) &&
      hash(currentPayload) === link.payload_hash &&
      (!b.google_event_id || b.google_event_id === link.event_reference);
  }
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const now = databaseTimeEpoch(clock[0].now);
  if (!Number.isFinite(now)) throw fail();
  const busy =
    link?.state === "creating" &&
    (!Number.isFinite(databaseTimeEpoch(link.updated_at)) ||
      now - databaseTimeEpoch(link.updated_at) < 120000);
  const canCreate =
    !link &&
    !b.google_event_id &&
    b.status === "confirmed" &&
    consent.state === "ready" &&
    !!target;
  const canVerify =
    !!link &&
    ["creating", "create_unknown", "synced"].includes(link.state) &&
    !busy &&
    !!target &&
    binding;
  const targetProof = target
    ? {
        id: target.id,
        calendarId: target.calendarId,
        identity: target.identity,
      }
    : null;
  return {
    b,
    link,
    target,
    payload: currentPayload,
    binding,
    consent,
    canCreate,
    canVerify,
    now,
    blocked: !target
      ? "account"
      : !binding
        ? "binding"
        : busy
          ? "in_flight"
          : !link && b.google_event_id
            ? "legacy"
            : !link && !canCreate
              ? "consent"
              : null,
    evidence: hash({ b, link, consent, target: targetProof }),
  };
}
async function history(
  c: PoolConnection,
  merchantId: number,
  bookingId: number
) {
  const [rows] = await c.execute<any[]>(
    "SELECT actor_user_id,action,outcome,failure_code,reason,created_at FROM booking_calendar_reviews WHERE merchant_id=? AND booking_reference=? ORDER BY id DESC LIMIT 20",
    [merchantId, bookingId]
  );
  return rows.map(r => ({
    actorUserId: r.actor_user_id,
    action: r.action,
    outcome: r.outcome,
    failureCode: r.failure_code,
    reason: r.reason,
    at: new Date(databaseTimeEpoch(r.created_at)).toISOString(),
  }));
}
export async function readBookingCalendarReview(
  merchantId: number,
  bookingId: number
): Promise<BookingCalendarReview> {
  positive(merchantId);
  positive(bookingId);
  await ready();
  return withBookingCapacityTransaction(merchantId, async c => {
    const g = await graph(c, merchantId, bookingId);
    return {
      state: g.link?.state ?? (g.b.google_event_id ? "legacy" : "none"),
      eventId: g.link?.event_reference ?? g.b.google_event_id ?? null,
      calendarId: g.link?.calendar_id ?? g.target?.calendarId ?? null,
      evidence: g.evidence,
      canCreate: g.canCreate,
      canVerify: g.canVerify,
      canRelease:
        g.link?.state === "synced" &&
        Date.parse(`${g.payload.date}T${g.payload.endTime}:00+03:00`) <= g.now,
      blocked: g.blocked,
      checkedAt: g.link?.checked_at
        ? new Date(databaseTimeEpoch(g.link.checked_at)).toISOString()
        : null,
      history: await history(c, merchantId, bookingId),
    };
  });
}
type Result = {
  state: "creating" | "create_unknown" | "synced";
  replayed: boolean;
};
const outcome = (state: string, replayed = false): Result => ({
  state: ["creating", "synced"].includes(state)
    ? (state as "creating" | "synced")
    : "create_unknown",
  replayed,
});
async function prior(
  c: PoolConnection,
  merchantId: number,
  input: BookingCalendarAction,
  requestHash: string
): Promise<Result | null> {
  const [reviews] = await c.execute<any[]>(
    "SELECT request_hash,outcome FROM booking_calendar_reviews WHERE merchant_id=? AND request_id=?",
    [merchantId, input.requestId]
  );
  if (reviews.length) {
    if (reviews[0].request_hash !== requestHash) throw fail();
    return outcome(reviews[0].outcome, true);
  }
  const [links] = await c.execute<any[]>(
    "SELECT request_hash,state FROM booking_calendar_links WHERE merchant_id=? AND request_id=?",
    [merchantId, input.requestId]
  );
  if (links.length) {
    if (links[0].request_hash !== requestHash) throw fail();
    return outcome(links[0].state, true);
  }
  return null;
}
function verify(
  event: any,
  g: Awaited<ReturnType<typeof graph>>,
  reference: string
): string | null {
  if (
    !event ||
    event.id !== reference ||
    event.recurringEventId ||
    event.recurrence ||
    event.extendedProperties?.private?.sariBooking !== reference ||
    event.extendedProperties?.private?.sariAgreement !==
      String(g.payload.agreementId)
  )
    return "identity_mismatch";
  if (event.status !== "confirmed" || event.transparency === "transparent")
    return "event_not_active";
  const epoch = (s: unknown) =>
    typeof s === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(s)
      ? Date.parse(s)
      : NaN;
  if (
    epoch(event.start?.dateTime) !==
      Date.parse(`${g.payload.date}T${g.payload.startTime}:00+03:00`) ||
    epoch(event.end?.dateTime) !==
      Date.parse(`${g.payload.date}T${g.payload.endTime}:00+03:00`)
  )
    return "time_mismatch";
  return null;
}
/** One durable creation dispatch. Retries inspect the existing reference, never repeat its POST. */
export async function synchronizeBookingCalendar(
  merchantId: number,
  actorUserId: number,
  raw: BookingCalendarAction
): Promise<Result> {
  positive(merchantId);
  positive(actorUserId);
  const input = bookingCalendarActionSchema.parse(raw);
  await ready();
  const requestHash = hash({ merchantId, actorUserId, input });
  let creationCredentials: any;
  if (input.action === "create") {
    const preflight = await withBookingCapacityTransaction(
      merchantId,
      async c => {
        const replay = await prior(c, merchantId, input, requestHash);
        if (replay) return { replay };
        const data = await graph(c, merchantId, input.bookingId);
        if (data.evidence !== input.evidence || !data.canCreate) throw fail();
        return { data };
      }
    );
    if (preflight.replay) return preflight.replay;
    const data = preflight.data!,
      provider = await import("./_core/googleCalendar");
    creationCredentials = await provider.validateAndRefreshCredentials(
      data.target!.credentials
    );
    await provider.assertCalendarTimeFree(
      creationCredentials,
      data.target!.calendarId,
      new Date(`${data.payload.date}T${data.payload.startTime}:00+03:00`),
      new Date(`${data.payload.date}T${data.payload.endTime}:00+03:00`)
    );
  }
  const initial = await withBookingCapacityTransaction(merchantId, async c => {
    const replay = await prior(c, merchantId, input, requestHash);
    if (replay) return { replay };
    const g = await graph(c, merchantId, input.bookingId);
    if (
      g.evidence !== input.evidence ||
      !(input.action === "create" ? g.canCreate : g.canVerify)
    )
      throw fail();
    const reference =
      g.link?.event_reference ?? `saribook${randomBytes(16).toString("hex")}`;
    if (input.action === "create") {
      const [overlap] = await c.execute<any[]>(
        `SELECT l.id FROM booking_calendar_links l JOIN bookings b ON b.id=l.booking_reference AND b.merchant_id=l.merchant_id
        WHERE l.merchant_id=? AND l.integration_id=? AND l.calendar_id=? AND l.identity_hash=? AND b.booking_date=? AND b.start_time<? AND b.end_time>?
        AND b.status IN ('pending','confirmed','in_progress') LIMIT 1`,
        [
          merchantId,
          g.target!.id,
          g.target!.calendarId,
          g.target!.identity,
          g.payload.date,
          g.payload.endTime,
          g.payload.startTime,
        ]
      );
      if (overlap.length) throw fail();
      g.payload.operatorReason = input.reason;
      g.payload.reviewEvidence = input.evidence;
      await c.execute(
        `INSERT INTO booking_calendar_links (merchant_id,booking_reference,actor_user_id,request_id,request_hash,agreement_id,integration_id,calendar_id,identity_hash,event_reference,payload,payload_hash)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          merchantId,
          input.bookingId,
          actorUserId,
          input.requestId,
          requestHash,
          g.payload.agreementId,
          g.target!.id,
          g.target!.calendarId,
          g.target!.identity,
          reference,
          JSON.stringify(g.payload),
          hash(g.payload),
        ]
      );
    }
    return { g, reference };
  });
  if (initial.replay) return initial.replay;
  const { g, reference } = initial as {
    g: Awaited<ReturnType<typeof graph>>;
    reference: string;
  };
  let failureCode: string | null = null,
    proof: any = null;
  try {
    const provider = await import("./_core/googleCalendar"),
      credentials =
        creationCredentials ??
        (await provider.validateAndRefreshCredentials(g.target!.credentials));
    const event =
      input.action === "create"
        ? await provider.createCalendarEvent(
            credentials,
            g.target!.calendarId,
            {
              id: reference,
              privateProperties: {
                sariBooking: reference,
                sariAgreement: String(g.payload.agreementId),
              },
              summary: `${g.payload.serviceName} - ${g.payload.customerName}`,
              description: `Booking: ${g.payload.bookingId}\nPhone: ${g.payload.customerPhone}`,
              start: new Date(
                `${g.payload.date}T${g.payload.startTime}:00+03:00`
              ),
              end: new Date(`${g.payload.date}T${g.payload.endTime}:00+03:00`),
            }
          )
        : await provider.getCalendarEvent(
            credentials,
            g.target!.calendarId,
            reference
          );
    failureCode = verify(event, g, reference);
    proof = {
      id: event?.id,
      status: event?.status,
      start: event?.start,
      end: event?.end,
      properties: event?.extendedProperties?.private,
      etag: event?.etag,
    };
  } catch {
    failureCode = "provider_unavailable";
  }
  return withBookingCapacityTransaction(merchantId, async c => {
    // Creation already has a dispatch row; only a completed review counts as final replay here.
    const [old] = await c.execute<any[]>(
      "SELECT request_hash,outcome FROM booking_calendar_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (old.length) {
      if (old[0].request_hash !== requestHash) throw fail();
      return outcome(old[0].outcome, true);
    }
    const current = await graph(c, merchantId, input.bookingId);
    if (!current.link || current.link.event_reference !== reference)
      throw fail();
    if (input.action === "verify" && current.evidence !== g.evidence)
      throw fail();
    // A late creation response must not overwrite a later explicit recovery.
    if (
      input.action === "create" &&
      (current.link.revision !== 0 || current.link.state !== "creating")
    )
      throw fail();
    if (!current.binding || hash(current.payload) !== hash(g.payload))
      failureCode = "binding_changed";
    else if (
      input.action === "create" &&
      current.consent.evidence !== g.consent.evidence
    )
      failureCode = "consent_changed";
    const state = failureCode ? "create_unknown" : "synced";
    await c.execute(
      "UPDATE booking_calendar_links SET state=?,failure_code=?,revision=revision+1,checked_at=UTC_TIMESTAMP(3) WHERE id=?",
      [state, failureCode, current.link.id]
    );
    if (!failureCode)
      await c.execute(
        "UPDATE bookings SET google_event_id=? WHERE id=? AND merchant_id=?",
        [reference, input.bookingId, merchantId]
      );
    await c.execute(
      `INSERT INTO booking_calendar_reviews (merchant_id,booking_reference,actor_user_id,request_id,request_hash,action,outcome,failure_code,reason,proof_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        merchantId,
        input.bookingId,
        actorUserId,
        input.requestId,
        requestHash,
        input.action,
        state,
        failureCode,
        input.reason,
        hash({ evidence: g.evidence, proof, failureCode }),
      ]
    );
    return outcome(state);
  });
}
