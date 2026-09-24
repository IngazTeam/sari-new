import { z } from "zod";
import type { PoolConnection } from "mysql2/promise";
import {
  bookingNotificationReviewSchema,
  type BookingNoticeReview,
  type BookingNotificationReviewInput,
} from "../shared/booking-reschedule";
import { bookingAgreementDigest as hash } from "./ai/booking-agreements";
import { withBookingCapacityTransaction } from "./booking-capacity";
import { databaseTimeEpoch } from "./db/time";
import {
  assertBookingNotificationSchema,
  inspectBookingNotice,
  reconcileBookingNoticeInTransaction,
} from "./booking-reschedule-notification";

const id = z.number().int().positive().safe();
const iso = (v: any) =>
  v ? new Date(databaseTimeEpoch(v)).toISOString() : null;
const fail = () => Error("Notification review requires refreshed evidence");
const reviewable = new Set([
  "accepted",
  "unknown",
  "failed",
  "suppressed",
  "manual_review",
]);

async function view(c: PoolConnection, r: any): Promise<BookingNoticeReview> {
  const proof = await inspectBookingNotice(c, r);
  const [history] = await c.execute<any[]>(
    "SELECT * FROM booking_notification_reviews WHERE merchant_id=? AND notification_id=? ORDER BY id DESC LIMIT 20",
    [r.merchant_id, r.id]
  );
  const projected =
    proof.accepted &&
    proof.conversationMatches &&
    !proof.conflict &&
    proof.messages.length === 1;
  const issue = proof.accepted
    ? !proof.conversationMatches
      ? "conversation_unavailable"
      : proof.conflict
        ? "projection_conflict"
        : !projected
          ? "projection_missing"
          : null
    : r.dispatch_started_at
      ? proof.valid
        ? "provider_unconfirmed"
        : "receipt_unverified"
      : r.last_error;
  const d = proof.d;
  return {
    id: r.id,
    kind: r.kind,
    // Exclude polling timestamps: scheduling another read does not change the proof.
    evidence: hash({
      notice: [
        r.id,
        r.merchant_id,
        r.booking_reference,
        r.reschedule_id,
        r.kind,
        r.cancellation_id,
        r.confirmation_id,
        r.snapshot,
        r.snapshot_hash,
        r.dispatch_text,
        r.state,
        r.claim_token,
        iso(r.dispatch_started_at),
        iso(r.accepted_at),
        r.provider_message_id,
        r.delivery_state,
        r.projection_message_id,
        r.last_error,
      ],
      delivery: d
        ? [
            d.id,
            d.direction,
            d.instance_id,
            d.provider,
            d.account,
            d.account_provider,
            d.account_merchant,
            d.phone_number_id,
            d.provider_account_id,
            d.status,
            d.provider_message_id,
            d.request_json,
          ]
        : null,
      conversation: proof.conversationPhone,
      messages: proof.messages,
      reviewId: history[0]?.id ?? 0,
    }),
    canReview: reviewable.has(r.state),
    state: r.state,
    delivery: proof.delivery,
    projected,
    text: r.dispatch_text,
    receipt: proof.receipt,
    issue,
    dispatchAt: iso(r.dispatch_started_at),
    acceptedAt: iso(r.accepted_at),
    history: history.map(h => ({
      actorUserId: h.actor_user_id,
      reason: h.reason,
      state: h.outcome,
      delivery: h.delivery_state,
      projected: !!h.projected,
      at: iso(h.created_at)!,
    })),
  };
}

/** Read the saved receipt, without sending, reconciling or silently recording a review. */
export async function readBookingNoticeReview(
  c: PoolConnection,
  merchantId: number,
  moveId: number,
  kind: "reschedule" | "cancellation" | "confirmation" = "reschedule"
) {
  const [rows] = await c.execute<any[]>(
    `SELECT * FROM booking_reschedule_notifications WHERE merchant_id=? AND ${kind === "confirmation" ? "confirmation_id" : kind === "cancellation" ? "cancellation_id" : "reschedule_id"}=? AND kind=? FOR UPDATE`,
    [merchantId, moveId, kind]
  );
  return rows[0] ? view(c, rows[0]) : null;
}

/** Reconcile and audit atomically. Even failed/unknown attempts are never requeued here. */
export async function reviewBookingNotification(
  merchantId: number,
  actorUserId: number,
  raw: BookingNotificationReviewInput
) {
  id.parse(merchantId);
  id.parse(actorUserId);
  const input = bookingNotificationReviewSchema.parse(raw);
  await assertBookingNotificationSchema();
  const requestHash = hash({
    operation: "verify_booking_notice",
    merchantId,
    actorUserId,
    input,
  });
  return withBookingCapacityTransaction(merchantId, async c => {
    const [owned] = await c.execute<any[]>(
      "SELECT id FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE",
      [input.bookingId, merchantId]
    );
    const [rows] = await c.execute<any[]>(
      "SELECT * FROM booking_reschedule_notifications WHERE id=? AND merchant_id=? AND booking_reference=? FOR UPDATE",
      [input.notificationId, merchantId, input.bookingId]
    );
    if (owned.length !== 1 || rows.length !== 1) throw fail();
    const [prior] = await c.execute<any[]>(
      "SELECT * FROM booking_notification_reviews WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior[0].request_hash !== requestHash) throw fail();
      return { state: prior[0].outcome as string, replayed: true };
    }
    const before = await view(c, rows[0]);
    if (!before.canReview || before.evidence !== input.evidence) throw fail();
    await reconcileBookingNoticeInTransaction(
      c,
      merchantId,
      input.notificationId
    );
    const [fresh] = await c.execute<any[]>(
      "SELECT * FROM booking_reschedule_notifications WHERE id=? AND merchant_id=?",
      [input.notificationId, merchantId]
    );
    const after = await view(c, fresh[0]);
    await c.execute(
      `INSERT INTO booking_notification_reviews (merchant_id,notification_id,booking_reference,actor_user_id,request_id,request_hash,evidence_hash,outcome,delivery_state,projected,reason) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        merchantId,
        input.notificationId,
        input.bookingId,
        actorUserId,
        input.requestId,
        requestHash,
        input.evidence,
        after.state,
        after.delivery,
        after.projected ? 1 : 0,
        input.reason,
      ]
    );
    return { state: after.state, replayed: false };
  });
}
