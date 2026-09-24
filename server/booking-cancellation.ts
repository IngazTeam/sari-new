import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  bookingCancellationActionSchema,
  type BookingCancellationAction,
  type BookingCancellationReview,
} from "../shared/booking-cancellation";
import {
  bookingAgreementDigest as hash,
  assertBookingAgreementSchema,
} from "./ai/booking-agreements";
import { explicitBookingCancellation } from "./ai/booking-cancellation-intent";
export { explicitBookingCancellation } from "./ai/booking-cancellation-intent";
import {
  readBookingCalendarGraph,
  verifyBookingCalendarEvent,
} from "./booking-calendar";
import { withBookingCapacityTransaction } from "./booking-capacity";
import { databaseTimeEpoch } from "./db/time";
import {
  assertBookingNotificationSchema,
  enqueueBookingCancellationNotice,
} from "./booking-reschedule-notification";
import { readBookingNoticeReview } from "./booking-notification-review";

const fail = () =>
  Error("Booking cancellation requires fresh verified evidence");
const positive = (v: number) => z.number().int().positive().safe().parse(v);
const json = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
const iso = (v: any) => new Date(databaseTimeEpoch(v)).toISOString();
async function graph(c: PoolConnection, merchantId: number, bookingId: number) {
  const g = await readBookingCalendarGraph(c, merchantId, bookingId);
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM booking_calendar_cancellations WHERE merchant_id=? AND booking_reference=? FOR UPDATE",
    [merchantId, bookingId]
  );
  const cancellation = rows[0] ?? null;
  const [agreements] = await c.execute<any[]>(
    "SELECT * FROM conversation_booking_agreements WHERE id=? AND merchant_id=? AND booking_reference=? AND customer_phone=? AND state='accepted' FOR UPDATE",
    [g.b.customer_agreement_id, merchantId, bookingId, g.b.customer_phone]
  );
  const a = agreements[0];
  let request: BookingCancellationReview["request"] = null;
  if (a && hash(json(a.snapshot)) === a.snapshot_hash) {
    const [conversations] = await c.execute<any[]>(
      "SELECT id FROM conversations WHERE id=? AND merchantId=? AND customerPhone=? FOR UPDATE",
      [a.conversation_id, merchantId, g.b.customer_phone]
    );
    if (conversations.length === 1) {
      const [messages] = await c.execute<any[]>(
        "SELECT id,content,createdAt FROM messages WHERE conversationId=? AND direction='incoming' ORDER BY id DESC LIMIT 1 FOR SHARE",
        [a.conversation_id]
      );
      const m = messages[0],
        time = m && databaseTimeEpoch(m.createdAt);
      if (
        m &&
        m.id > a.consent_message_id &&
        typeof m.content === "string" &&
        m.content.length <= 8000 &&
        Number.isFinite(time) &&
        time <= g.now &&
        g.now - time <= 86400000 &&
        explicitBookingCancellation(m.content, bookingId)
      ) {
        request = { id: m.id, text: m.content, at: iso(m.createdAt) };
      }
    }
  }
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
  const commitment = {
    booking: {
      id: g.b.id,
      merchantId,
      status: g.b.status,
      paymentStatus: g.b.payment_status,
      basePrice: g.b.base_price,
      finalPrice: g.b.final_price,
      discount: g.b.discount_amount,
      googleEventId: g.b.google_event_id,
    },
    payload: g.payload,
    link: g.link
      ? {
          id: g.link.id,
          integrationId: g.link.integration_id,
          calendarId: g.link.calendar_id,
          identity: g.link.identity_hash,
          reference: g.link.event_reference,
          agreementId: g.link.agreement_id,
          payloadHash: g.link.payload_hash,
        }
      : null,
  };
  const saved = cancellation ? json(cancellation.snapshot) : null;
  const intact =
    !cancellation ||
    (hash(saved) === cancellation.snapshot_hash &&
      hash(saved.commitment) === hash(commitment));
  const requestCurrent =
    !!request && (!cancellation || hash(saved.request) === hash(request));
  const busy =
    cancellation?.state === "cancelling" &&
    (!Number.isFinite(databaseTimeEpoch(cancellation.updated_at)) ||
      g.now - databaseTimeEpoch(cancellation.updated_at) < 120000);
  const upcoming =
    Date.parse(`${g.payload.date}T${g.payload.startTime}:00+03:00`) > g.now;
  const blocker =
    !g.link || !g.binding || !g.target
      ? "binding"
      : financial
        ? "financial"
        : !intact
          ? "changed"
          : busy
            ? "inFlight"
            : g.b.status !== "confirmed" || (!cancellation && !upcoming)
              ? "booking"
              : !requestCurrent
                ? "request"
                : null;
  const canCancel = !cancellation && g.link?.state === "synced" && !blocker;
  const canVerify =
    !!cancellation &&
    ["cancelling", "cancel_unknown"].includes(cancellation.state) &&
    !busy &&
    !!g.target &&
    g.binding &&
    intact &&
    !financial &&
    g.b.status === "confirmed";
  return {
    ...g,
    cancellation,
    commitment,
    saved,
    request,
    requestCurrent,
    financial,
    intact,
    busy,
    blocker,
    canCancel,
    canVerify,
    evidence: hash({
      calendar: g.evidence,
      cancellation,
      commitment,
      request,
      financial,
    }),
  };
}
export async function getBookingCancellationReview(
  merchantId: number,
  bookingId: number
): Promise<BookingCancellationReview | null> {
  positive(merchantId);
  positive(bookingId);
  await assertBookingAgreementSchema();
  await assertBookingNotificationSchema();
  return withBookingCapacityTransaction(merchantId, async c => {
    const g = await graph(c, merchantId, bookingId);
    if (!g.link) return null;
    const [history] = await c.execute<any[]>(
      "SELECT action,outcome,reason,created_at FROM booking_calendar_reviews WHERE merchant_id=? AND booking_reference=? AND action IN ('cancel','verify_cancel') ORDER BY id DESC LIMIT 20",
      [merchantId, bookingId]
    );
    return {
      state: g.cancellation?.state ?? "none",
      evidence: g.evidence,
      canCancel: g.canCancel,
      canVerify: g.canVerify,
      blocker: g.blocker,
      appointment: {
        serviceName: g.payload.serviceName,
        date: g.payload.date,
        startTime: g.payload.startTime,
        endTime: g.payload.endTime,
      },
      request: g.request,
      originalRequest: g.saved?.request ?? null,
      history: history.map(row => ({
        action: row.action,
        outcome: row.outcome,
        reason: row.reason,
        at: iso(row.created_at),
      })),
      notification: g.cancellation
        ? await readBookingNoticeReview(
            c,
            merchantId,
            g.cancellation.id,
            "cancellation"
          )
        : null,
    };
  });
}
type Result = { state: string; replayed: boolean };
async function prior(
  c: PoolConnection,
  merchantId: number,
  requestId: string,
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
      [merchantId, requestId]
    );
    if (rows.length) {
      if (rows[0].request_hash !== requestHash) throw fail();
      return { state: rows[0].outcome ?? rows[0].state, replayed: true };
    }
  }
  return null;
}
/** One conditional DELETE per durable dispatch. Every later action is a read of the original event. */
export async function cancelBookingCalendar(
  merchantId: number,
  actorUserId: number,
  raw: BookingCancellationAction
): Promise<Result> {
  positive(merchantId);
  positive(actorUserId);
  const input = bookingCancellationActionSchema.parse(raw);
  await assertBookingAgreementSchema();
  await assertBookingNotificationSchema();
  const requestHash = hash({ merchantId, actorUserId, input });
  const first = await withBookingCapacityTransaction(merchantId, async c => {
    const replay = await prior(c, merchantId, input.requestId, requestHash);
    if (replay) return { replay };
    const g = await graph(c, merchantId, input.bookingId);
    if (
      g.evidence !== input.evidence ||
      !(input.action === "cancel" ? g.canCancel : g.canVerify)
    )
      throw fail();
    return { g };
  });
  if (first.replay) return first.replay;
  const g = first.g!,
    provider = await import("./_core/googleCalendar");
  let credentials: any, etag: string | undefined;
  if (input.action === "cancel") {
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
    const reserved = await withBookingCapacityTransaction(
      merchantId,
      async c => {
        const replay = await prior(c, merchantId, input.requestId, requestHash);
        if (replay) return replay;
        const current = await graph(c, merchantId, input.bookingId);
        if (current.evidence !== g.evidence || !current.canCancel) throw fail();
        const snapshot = {
          version: 1,
          commitment: current.commitment,
          request: current.request,
        };
        await c.execute(
          "INSERT INTO booking_calendar_cancellations (merchant_id,booking_reference,actor_user_id,request_id,request_hash,snapshot,snapshot_hash,event_etag,reason,evidence_hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            merchantId,
            input.bookingId,
            actorUserId,
            input.requestId,
            requestHash,
            JSON.stringify(snapshot),
            hash(snapshot),
            etag!,
            input.reason,
            input.evidence,
          ]
        );
        await c.execute(
          "UPDATE booking_calendar_links SET state='cancelling',failure_code=NULL,revision=revision+1 WHERE id=?",
          [g.link.id]
        );
        return null;
      }
    );
    if (reserved) return reserved;
  }
  let failureCode: string | null = null,
    proof: unknown = null;
  try {
    credentials ??= await provider.validateAndRefreshCredentials(
      g.target!.credentials
    );
    if (input.action === "cancel") {
      const acknowledged = await provider.deleteCalendarEventIfMatch(
        credentials,
        g.target!.calendarId,
        g.link.event_reference,
        etag!
      );
      if (acknowledged !== true) throw fail();
      proof = { acknowledged: true, etag };
    } else {
      const event = await provider.getCalendarEvent(
        credentials,
        g.target!.calendarId,
        g.link.event_reference
      );
      // Deleted single events may retain only their ID. Prior dispatch pins the exact verified event.
      if (
        !event ||
        event.id !== g.link.event_reference ||
        event.status !== "cancelled" ||
        event.recurringEventId ||
        event.recurrence
      )
        failureCode = "cancellation_unverified";
      proof = { id: event?.id, status: event?.status, etag: event?.etag };
    }
  } catch {
    failureCode = "provider_unavailable";
  }
  return withBookingCapacityTransaction(merchantId, async c => {
    const [reviews] = await c.execute<any[]>(
      "SELECT request_hash,outcome FROM booking_calendar_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (reviews.length) {
      if (reviews[0].request_hash !== requestHash) throw fail();
      return { state: reviews[0].outcome, replayed: true };
    }
    const current = await graph(c, merchantId, input.bookingId),
      cancellation = current.cancellation;
    if (
      !cancellation ||
      (input.action === "verify" && current.evidence !== g.evidence) ||
      (input.action === "cancel" &&
        (cancellation.revision !== 0 || cancellation.state !== "cancelling"))
    )
      throw fail();
    if (!current.binding || !current.intact || current.financial)
      failureCode = "binding_changed";
    else if (!current.requestCurrent) failureCode = "request_changed";
    const state = failureCode ? "cancel_unknown" : "cancelled";
    await c.execute(
      "UPDATE booking_calendar_cancellations SET state=?,failure_code=?,revision=revision+1 WHERE id=?",
      [state, failureCode, cancellation.id]
    );
    await c.execute(
      "UPDATE booking_calendar_links SET state=?,failure_code=?,revision=revision+1,checked_at=UTC_TIMESTAMP(3) WHERE id=?",
      [state, failureCode, current.link.id]
    );
    if (!failureCode) {
      await c.execute(
        "UPDATE bookings SET status='cancelled',cancelled_by='customer',cancelled_at=UTC_TIMESTAMP(),cancellation_reason=? WHERE id=? AND merchant_id=?",
        [input.reason, input.bookingId, merchantId]
      );
      await enqueueBookingCancellationNotice(c, merchantId, cancellation.id);
      await c.execute(
        "INSERT INTO booking_operation_audits (merchant_id,booking_reference,actor_user_id,request_id,request_hash,operation,before_state,after_state,changed_fields) VALUES (?,?,?,?,?,'update',?,?,?)",
        [
          merchantId,
          input.bookingId,
          actorUserId,
          input.requestId,
          requestHash,
          JSON.stringify({
            status: current.b.status,
            cancellationRequest: current.saved.request,
          }),
          JSON.stringify({ status: "cancelled" }),
          JSON.stringify(["status", "cancellationReason"]),
        ]
      );
    }
    await c.execute(
      "INSERT INTO booking_calendar_reviews (merchant_id,booking_reference,actor_user_id,request_id,request_hash,action,outcome,failure_code,reason,proof_hash) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        merchantId,
        input.bookingId,
        actorUserId,
        input.requestId,
        requestHash,
        input.action === "cancel" ? "cancel" : "verify_cancel",
        state,
        failureCode,
        input.reason,
        hash({ evidence: g.evidence, proof, failureCode }),
      ]
    );
    return { state, replayed: false };
  });
}
