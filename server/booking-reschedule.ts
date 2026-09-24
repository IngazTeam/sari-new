import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  bookingRescheduleActionSchema,
  type BookingRescheduleAction,
  type BookingRescheduleReview,
} from "../shared/booking-reschedule";
import {
  assertBookingAgreementSchema,
  bookingAgreementDigest as hash,
  bookingAmendmentFingerprint,
  readBookingSelectionSnapshot,
  BookingAgreementUnavailableError,
} from "./ai/booking-agreements";
import {
  readBookingCalendarGraph,
  verifyBookingCalendarEvent,
} from "./booking-calendar";
import { readBookingConsentReview } from "./booking-consent-review";
import {
  withBookingCapacityTransaction,
  BookingCapacityUnavailableError,
} from "./booking-capacity";
import {
  assertCalendarRescheduleCapacity,
  bookingCalendarProof,
} from "./booking-reschedule-state";
import { databaseTimeEpoch } from "./db/time";
import { enqueueBookingRescheduleNotice, readBookingNoticeReview } from "./booking-reschedule-notification";

const fail = () =>
  Error("Booking reschedule requires refreshed verified evidence");
const positive = (v: number) => z.number().int().positive().safe().parse(v);
const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const iso = (v: any) => new Date(databaseTimeEpoch(v)).toISOString();
async function graph(c: PoolConnection, merchantId: number, bookingId: number) {
  const g = await readBookingCalendarGraph(c, merchantId, bookingId);
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM booking_calendar_reschedules WHERE merchant_id=? AND booking_reference=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
    [merchantId, bookingId]
  );
  const move = rows[0];
  if (!move) return null;
  const saved = json(move.snapshot),
    after = saved.after;
  const [agreements] = await c.execute<any[]>(
    "SELECT * FROM conversation_booking_agreements WHERE merchant_id=? AND id IN (?,?) ORDER BY id FOR UPDATE",
    [merchantId, saved.before.customer_agreement_id, move.agreement_id]
  );
  const old = agreements.find(a => a.id === saved.before.customer_agreement_id),
    a = agreements.find(a => a.id === move.agreement_id);
  const virtual = {
    ...g.b,
    customer_agreement_id: move.agreement_id,
    booking_date: after.bookingDate,
    start_time: after.startTime,
    end_time: after.endTime,
  };
  const consent = await readBookingConsentReview(c, merchantId, virtual);
  const intact =
    !!g.link &&
    g.b.google_event_id === g.link.event_reference &&
    hash(saved) === move.snapshot_hash &&
    saved.agreementId === move.agreement_id &&
    !!old &&
    old.state === "accepted" &&
    hash(json(old.snapshot)) === old.snapshot_hash &&
    hash(
      bookingAmendmentFingerprint(
        g.b,
        old.snapshot_hash,
        bookingCalendarProof(g.link)
      )
    ) === hash(saved.before) &&
    !!a &&
    a.conversation_id === old.conversation_id &&
    a.customer_phone === g.b.customer_phone &&
    a.booking_reference === bookingId &&
    a.state === "accepted" &&
    a.target_booking_id === bookingId &&
    a.prior_agreement_id === old.id &&
    a.before_hash === hash(saved.before) &&
    a.snapshot_hash === hash(after) &&
    hash(json(a.snapshot)) === a.snapshot_hash &&
    a.consent_message_id === saved.consentId &&
    move.service_id === after.serviceId &&
    move.staff_id === after.staffId &&
    String(
      move.booking_date instanceof Date
        ? move.booking_date.toISOString()
        : move.booking_date
    ).slice(0, 10) === after.bookingDate &&
    move.start_time === after.startTime &&
    move.end_time === after.endTime;
  let financial = g.b.payment_status !== "unpaid";
  for (const table of [
    "payment_links",
    "booking_checkout_attempts",
    "order_payments",
  ]) {
    const [effects] = await c.execute<any[]>(
      `SELECT id FROM ${table} WHERE booking_id=? LIMIT 1 FOR UPDATE`,
      [bookingId]
    );
    financial ||= effects.length > 0;
  }
  let available = false;
  if (intact && ["pending", "moving", "move_unknown"].includes(move.state)) {
    try {
      const fresh = await readBookingSelectionSnapshot(
        c,
        merchantId,
        {
          serviceId: after.serviceId,
          staffId: after.staffId,
          bookingDate: after.bookingDate,
          startTime: after.startTime,
        },
        bookingId
      );
      available = hash(fresh) === hash(after);
    } catch (error) {
      if (
        !(error instanceof BookingAgreementUnavailableError) &&
        !(error instanceof BookingCapacityUnavailableError)
      )
        throw error;
    }
  }
  const consentCurrent =
    consent.state === "ready" &&
    consent.consent?.id === saved.consentId &&
    consent.latest?.id === saved.consentId;
  const busy =
    move.state === "moving" &&
    (!Number.isFinite(databaseTimeEpoch(move.updated_at)) ||
      g.now - databaseTimeEpoch(move.updated_at) < 120000);
  const blocker =
    !g.binding || !g.target
      ? "binding"
      : !intact
        ? "changed"
        : financial
          ? "financial"
          : g.b.status !== "confirmed" ||
              (move.state === "pending" &&
                Date.parse(
                  `${g.payload.date}T${g.payload.startTime}:00+03:00`
                ) <= g.now)
            ? "booking"
            : !consentCurrent
              ? "consent"
              : !available
                ? "availability"
                : busy
                  ? "inFlight"
                  : null;
  return {
    ...g,
    move,
    saved,
    after,
    a,
    consent,
    intact,
    financial,
    available,
    consentCurrent,
    blocker,
    canMove:
      move.state === "pending" &&
      g.link?.state === "reschedule_pending" &&
      !blocker,
    canVerify:
      ["moving", "move_unknown"].includes(move.state) &&
      ["moving", "move_unknown"].includes(g.link?.state) &&
      !busy &&
      g.binding &&
      intact &&
      !financial,
    canAbandon:
      move.state === "pending" &&
      g.link?.state === "reschedule_pending" &&
      !move.request_id,
    evidence: hash({
      calendar: g.evidence,
      move,
      consent,
      intact,
      financial,
      available,
    }),
    nextPayload: {
      ...g.payload,
      agreementId: move.agreement_id,
      date: after.bookingDate,
      startTime: after.startTime,
      endTime: after.endTime,
    },
  };
}
export async function getBookingRescheduleReview(
  merchantId: number,
  bookingId: number
): Promise<BookingRescheduleReview | null> {
  positive(merchantId);
  positive(bookingId);
  await assertBookingAgreementSchema();
  return withBookingCapacityTransaction(merchantId, async c => {
    const g = await graph(c, merchantId, bookingId);
    if (!g) return null;
    const [history] = await c.execute<any[]>(
      "SELECT action,outcome,reason,created_at FROM booking_calendar_reviews WHERE merchant_id=? AND booking_reference=? AND action IN ('move','verify_move','abandon_move') ORDER BY id DESC LIMIT 20",
      [merchantId, bookingId]
    );
    return {
      state: g.move.state,
      evidence: g.evidence,
      canMove: g.canMove,
      canVerify: g.canVerify,
      canAbandon: g.canAbandon,
      blocker: g.blocker,
      before: {
        date: g.saved.before.booking_date,
        startTime: g.saved.before.start_time,
        endTime: g.saved.before.end_time,
      },
      after: {
        date: g.after.bookingDate,
        startTime: g.after.startTime,
        endTime: g.after.endTime,
      },
      offerText: g.a?.offer_text ?? "",
      consent: g.consent.consent,
      history: history.map(row => ({
        action: row.action,
        outcome: row.outcome,
        reason: row.reason,
        at: iso(row.created_at),
      })),
      notification: await readBookingNoticeReview(c, merchantId, g.move.id),
    };
  });
}
type Result = { state: string; replayed: boolean };
async function prior(
  c: PoolConnection,
  merchantId: number,
  input: BookingRescheduleAction,
  requestHash: string
): Promise<Result | null> {
  for (const table of [
    "booking_calendar_reviews",
    "booking_calendar_reschedules",
    "booking_calendar_cancellations",
    "booking_calendar_links",
    "booking_operation_audits",
  ]) {
    const [rows] = await c.execute<any[]>(
      `SELECT * FROM ${table} WHERE merchant_id=? AND request_id=?`,
      [merchantId, input.requestId]
    );
    if (rows.length) {
      if (rows[0].request_hash !== requestHash) throw fail();
      return { state: rows[0].outcome ?? rows[0].state, replayed: true };
    }
  }
  return null;
}
async function audit(
  c: PoolConnection,
  merchantId: number,
  actor: number,
  input: BookingRescheduleAction,
  requestHash: string,
  state: string,
  failure: string | null,
  proof: unknown
) {
  await c.execute(
    "INSERT INTO booking_calendar_reviews (merchant_id,booking_reference,actor_user_id,request_id,request_hash,action,outcome,failure_code,reason,proof_hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [
      merchantId,
      input.bookingId,
      actor,
      input.requestId,
      requestHash,
      input.action === "move"
        ? "move"
        : input.action === "verify"
          ? "verify_move"
          : "abandon_move",
      state,
      failure,
      input.reason,
      hash(proof),
    ]
  );
}
/** A prospective hold is durable before PATCH. Recovery reads; it never retries an uncertain write. */
export async function rescheduleBookingCalendar(
  merchantId: number,
  actor: number,
  raw: BookingRescheduleAction
): Promise<Result> {
  positive(merchantId);
  positive(actor);
  const input = bookingRescheduleActionSchema.parse(raw);
  await assertBookingAgreementSchema();
  const requestHash = hash({ merchantId, actor, input });
  const first = await withBookingCapacityTransaction(merchantId, async c => {
    const replay = await prior(c, merchantId, input, requestHash);
    if (replay) return { replay };
    const g = await graph(c, merchantId, input.bookingId);
    if (
      !g ||
      g.evidence !== input.evidence ||
      !(input.action === "move"
        ? g.canMove
        : input.action === "verify"
          ? g.canVerify
          : g.canAbandon)
    )
      throw fail();
    if (input.action === "abandon") {
      await c.execute(
        "UPDATE booking_calendar_reschedules SET state='abandoned',revision=revision+1 WHERE id=?",
        [g.move.id]
      );
      await c.execute(
        "UPDATE booking_calendar_links SET state='synced',failure_code=NULL,revision=revision+1 WHERE id=?",
        [g.link.id]
      );
      await audit(c, merchantId, actor, input, requestHash, "abandoned", null, {
        evidence: g.evidence,
      });
      return { replay: { state: "abandoned", replayed: false } };
    }
    return { g };
  });
  if (first.replay) return first.replay;
  const g = first.g!,
    provider = await import("./_core/googleCalendar");
  let credentials: any, etag: string | undefined;
  if (input.action === "move") {
    credentials = await provider.validateAndRefreshCredentials(
      g.target!.credentials
    );
    const event = await provider.getCalendarEvent(
      credentials,
      g.target!.calendarId,
      g.link.event_reference
    );
    if (
      verifyBookingCalendarEvent(event, g, g.link.event_reference) ||
      typeof event?.etag !== "string" ||
      !/^"[\x21\x23-\x7e]{1,254}"$/.test(event.etag)
    )
      throw fail();
    etag = event.etag;
    await provider.assertCalendarTimeFree(
      credentials,
      g.target!.calendarId,
      new Date(`${g.after.bookingDate}T${g.after.startTime}:00+03:00`),
      new Date(`${g.after.bookingDate}T${g.after.endTime}:00+03:00`)
    );
    const replay = await withBookingCapacityTransaction(merchantId, async c => {
      const replay = await prior(c, merchantId, input, requestHash);
      if (replay) return replay;
      const current = await graph(c, merchantId, input.bookingId);
      if (!current || !current.canMove || current.evidence !== g.evidence)
        throw fail();
      await assertCalendarRescheduleCapacity(
        c,
        merchantId,
        g.target!,
        g.after.bookingDate,
        g.after.startTime,
        g.after.endTime,
        input.bookingId
      );
      const [other] = await c.execute<any[]>(
        `SELECT l.id FROM booking_calendar_links l JOIN bookings b ON b.merchant_id=l.merchant_id AND b.id=l.booking_reference
        WHERE l.merchant_id=? AND l.integration_id=? AND l.calendar_id=? AND l.identity_hash=? AND b.id<>? AND b.booking_date=? AND b.start_time<? AND b.end_time>? AND b.status IN ('pending','confirmed','in_progress') LIMIT 1`,
        [
          merchantId,
          g.target!.id,
          g.target!.calendarId,
          g.target!.identity,
          input.bookingId,
          g.after.bookingDate,
          g.after.endTime,
          g.after.startTime,
        ]
      );
      if (other.length) throw fail();
      const [appointments] = await c.execute<any[]>(
        `SELECT id FROM appointments WHERE merchant_id=? AND calendar_integration_id=? AND calendar_target_id=? AND calendar_identity_hash=?
        AND appointment_date>=? AND appointment_date<DATE_ADD(?,INTERVAL 1 DAY) AND start_time<? AND end_time>? AND status IN ('pending','confirmed') LIMIT 1`,
        [
          merchantId,
          g.target!.id,
          g.target!.calendarId,
          g.target!.identity,
          g.after.bookingDate,
          g.after.bookingDate,
          g.after.endTime,
          g.after.startTime,
        ]
      );
      if (appointments.length) throw fail();
      await c.execute(
        "UPDATE booking_calendar_reschedules SET state='moving',actor_user_id=?,request_id=?,request_hash=?,event_etag=?,reason=? WHERE id=?",
        [actor, input.requestId, requestHash, etag!, input.reason, g.move.id]
      );
      await c.execute(
        "UPDATE booking_calendar_links SET state='moving',revision=revision+1 WHERE id=?",
        [g.link.id]
      );
      return null;
    });
    if (replay) return replay;
  }
  let failure: string | null = null,
    proof: any = null;
  try {
    credentials ??= await provider.validateAndRefreshCredentials(
      g.target!.credentials
    );
    const event =
      input.action === "move"
        ? await provider.rescheduleCalendarEventIfMatch(
            credentials,
            g.target!.calendarId,
            g.link.event_reference,
            etag!,
            {
              start: new Date(
                `${g.after.bookingDate}T${g.after.startTime}:00+03:00`
              ),
              end: new Date(
                `${g.after.bookingDate}T${g.after.endTime}:00+03:00`
              ),
              agreementId: g.move.agreement_id,
            }
          )
        : await provider.getCalendarEvent(
            credentials,
            g.target!.calendarId,
            g.link.event_reference
          );
    failure = verifyBookingCalendarEvent(
      event,
      { ...g, payload: g.nextPayload },
      g.link.event_reference
    );
    proof = {
      id: event?.id,
      status: event?.status,
      start: event?.start,
      end: event?.end,
      properties: event?.extendedProperties?.private,
      etag: event?.etag,
    };
  } catch {
    failure = "provider_unavailable";
  }
  return withBookingCapacityTransaction(merchantId, async c => {
    const [old] = await c.execute<any[]>(
      "SELECT request_hash,outcome FROM booking_calendar_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (old.length) {
      if (old[0].request_hash !== requestHash) throw fail();
      return { state: old[0].outcome, replayed: true };
    }
    const current = await graph(c, merchantId, input.bookingId);
    if (
      !current ||
      current.move.id !== g.move.id ||
      (input.action === "verify" && current.evidence !== g.evidence) ||
      (input.action === "move" &&
        (current.move.revision !== g.move.revision ||
          current.move.state !== "moving"))
    )
      throw fail();
    if (
      !current.binding ||
      !["moving", "move_unknown"].includes(current.link?.state) ||
      !current.intact ||
      current.financial ||
      current.b.status !== "confirmed"
    )
      failure = "binding_changed";
    else if (!current.consentCurrent || !current.available)
      failure = "consent_changed";
    const state = failure ? "move_unknown" : "applied";
    if (!failure) {
      await c.execute(
        "UPDATE bookings SET booking_date=?,start_time=?,end_time=?,customer_agreement_id=? WHERE id=? AND merchant_id=?",
        [
          g.after.bookingDate,
          g.after.startTime,
          g.after.endTime,
          g.move.agreement_id,
          input.bookingId,
          merchantId,
        ]
      );
      await c.execute(
        "UPDATE booking_calendar_links SET state='synced',agreement_id=?,payload=?,payload_hash=?,failure_code=NULL,revision=revision+1,checked_at=UTC_TIMESTAMP(3) WHERE id=?",
        [
          g.move.agreement_id,
          JSON.stringify(g.nextPayload),
          hash(g.nextPayload),
          g.link.id,
        ]
      );
      await c.execute(
        "INSERT INTO booking_operation_audits (merchant_id,booking_reference,actor_user_id,request_id,request_hash,operation,before_state,after_state,changed_fields) VALUES (?,?,?,?,?,'update',?,?,?)",
        [
          merchantId,
          input.bookingId,
          actor,
          input.requestId,
          requestHash,
          JSON.stringify(g.saved.before),
          JSON.stringify({
            status: "confirmed",
            date: g.after.bookingDate,
            startTime: g.after.startTime,
            endTime: g.after.endTime,
            agreementId: g.move.agreement_id,
          }),
          JSON.stringify(["bookingDate", "startTime", "endTime"]),
        ]
      );
    } else
      await c.execute(
        "UPDATE booking_calendar_links SET state='move_unknown',failure_code=?,revision=revision+1,checked_at=UTC_TIMESTAMP(3) WHERE id=?",
        [failure, g.link.id]
      );
    await c.execute(
      "UPDATE booking_calendar_reschedules SET state=?,failure_code=?,revision=revision+1 WHERE id=?",
      [state, failure, g.move.id]
    );
    if (!failure) await enqueueBookingRescheduleNotice(c, merchantId, g.move.id);
    await audit(c, merchantId, actor, input, requestHash, state, failure, {
      evidence: g.evidence,
      proof,
      failure,
    });
    return { state, replayed: false };
  });
}
