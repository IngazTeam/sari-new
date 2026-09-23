import { getPool } from "../db/connection";
import { checkoutTransaction } from "./checkout-agreements";
import {
  privateSalesPhone,
  type SalesOfferIdentity,
} from "./sales-offer-authority";
import {
  inspectSalesOfferReceipt,
  salesOfferProjectionConflict,
  salesOfferEvidenceHash,
  type SalesOfferReviewOutcome,
} from "./sales-offer-receipt-proof";

export type SalesOfferReview = {
  expectedRevision: number;
  evidence: string;
  actorUserId: number;
  note: string;
};

/** Historical receipts are checked against frozen dispatch facts, not today's coupon validity. */
export async function reconcileSalesOffer(
  input: SalesOfferIdentity,
  attemptId: string,
  review?: SalesOfferReview
) {
  if (
    ![input.merchantId, input.conversationId, input.incomingMessageId].every(
      n => Number.isSafeInteger(n) && n > 0
    ) ||
    !/^[a-f0-9-]{36}$/.test(attemptId) ||
    !privateSalesPhone(input.customerPhone)
  )
    throw new Error("Sales offer identity invalid");
  return checkoutTransaction(async c => {
    // Match the dispatch lock order. Missing/deleted conversations do not erase the historical receipt.
    const [conversations] = await c.execute<any[]>(
      "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE",
      [input.conversationId, input.merchantId]
    );
    const [rows] = await c.execute<any[]>(
      `SELECT * FROM sales_offer_attempts WHERE id=? AND merchant_id=?
      AND conversation_id=? AND source_message_id=? AND kind='share' FOR UPDATE`,
      [
        attemptId,
        input.merchantId,
        input.conversationId,
        input.incomingMessageId,
      ]
    );
    const r = rows[0];
    if (!r || r.customer_phone !== privateSalesPhone(input.customerPhone))
      throw new Error("Sales offer dispatch result requires review");
    const [deliveries] = await c.execute<any[]>(
      `SELECT d.*,i.instance_id AS account,i.provider AS account_provider,i.merchant_id AS account_merchant
      FROM whatsapp_message_deliveries d LEFT JOIN whatsapp_instances i ON i.id=d.instance_id
      WHERE d.merchant_id=? AND d.idempotency_key=? FOR UPDATE`,
      [input.merchantId, `sales_offer:${input.merchantId}:${attemptId}`]
    );
    const d = deliveries[0],
      proof = inspectSalesOfferReceipt(r, d);
    const { accepted, receipt, valid, deliveryState } = proof;
    const [messages] = receipt
      ? await c.execute<any[]>(
          "SELECT id,direction,content,sender_type FROM messages WHERE conversationId=? AND externalId=? ORDER BY id FOR UPDATE",
          [r.conversation_id, receipt]
        )
      : [[]];
    if (review) {
      if (
        privateSalesPhone(conversations[0]?.customerPhone) !== r.customer_phone
      )
        throw new Error("Sales offer review unavailable");
      const [sources] = await c.execute<any[]>(
        "SELECT id,direction,content FROM messages WHERE conversationId=? AND id=? FOR UPDATE",
        [r.conversation_id, r.source_message_id]
      );
      const evidence = salesOfferEvidenceHash(
        r,
        d,
        conversations[0].customerPhone,
        sources[0],
        messages
      );
      if (
        r.review_revision !== review.expectedRevision ||
        evidence !== review.evidence
      )
        throw new Error("Sales offer review evidence changed");
    }
    let projected = false;
    let error: string | null = accepted ? null : deliveryState;
    if (accepted) {
      // Do not resurrect deleted conversations or put another customer's offer into a reassigned conversation.
      if (
        privateSalesPhone(conversations[0]?.customerPhone) !== r.customer_phone
      )
        error = "conversation_unavailable";
      else {
        if (salesOfferProjectionConflict(r, messages)) {
          if (!review)
            throw new Error("Sales offer receipt projection conflict");
          error = "projection_conflict";
        } else {
          if (!messages.length) {
            await c.execute(
              `INSERT INTO messages (conversationId,direction,messageType,content,externalId,isProcessed,aiResponse,sender_type,createdAt)
            VALUES (?,'outgoing','text',?,?,1,?,'assistant',?)`,
              [
                r.conversation_id,
                r.dispatch_text,
                receipt,
                r.dispatch_text,
                r.dispatch_started_at,
              ]
            );
            await c.execute(
              "UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?",
              [
                r.dispatch_started_at,
                r.dispatch_started_at,
                r.conversation_id,
                input.merchantId,
              ]
            );
          }
          projected = true;
        }
      }
    }
    await c.execute(
      `UPDATE sales_offer_attempts SET state=?,provider_message_id=?,
      reconciled_at=${accepted ? "COALESCE(reconciled_at,UTC_TIMESTAMP(3))" : "reconciled_at"},last_reconcile_error=?,
      next_reconcile_at=${accepted || (valid && d.status === "failed") || !r.dispatch_started_at || !["dispatching", "unknown"].includes(r.state) ? "NULL" : "TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3))"},updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=?`,
      [
        accepted ? "accepted" : r.state,
        accepted ? receipt : r.provider_message_id,
        error,
        attemptId,
        input.merchantId,
      ]
    );
    const outcome: SalesOfferReviewOutcome = accepted
      ? projected
        ? "recorded"
        : "accepted_unprojected"
      : valid && d.status === "failed"
        ? "failed"
        : "unresolved";
    if (review) {
      await c.execute(
        `INSERT INTO sales_offer_reviews (merchant_id,attempt_id,actor_user_id,revision,evidence_hash,outcome,delivery_state,note)
        VALUES (?,?,?,?,?,?,?,?)`,
        [
          input.merchantId,
          attemptId,
          review.actorUserId,
          r.review_revision + 1,
          review.evidence,
          outcome,
          deliveryState,
          review.note,
        ]
      );
      await c.execute(
        "UPDATE sales_offer_attempts SET review_revision=review_revision+1 WHERE id=? AND merchant_id=?",
        [attemptId, input.merchantId]
      );
    }
    return { accepted, projected, deliveryState, outcome };
  });
}

/** Bounded claims only read receipts and repair local history; this worker never sends. */
export async function runSalesOfferReconciliationBatch() {
  const jobs = await checkoutTransaction(async c => {
    const [rows] = await c.execute<
      any[]
    >(`SELECT id,merchant_id,conversation_id,source_message_id,customer_phone FROM sales_offer_attempts
      WHERE kind='share' AND next_reconcile_at<=UTC_TIMESTAMP(3) ORDER BY next_reconcile_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const r of rows)
      await c.execute(
        "UPDATE sales_offer_attempts SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?",
        [r.id]
      );
    return rows;
  });
  for (const r of jobs) {
    try {
      await reconcileSalesOffer(
        {
          merchantId: r.merchant_id,
          conversationId: r.conversation_id,
          incomingMessageId: r.source_message_id,
          customerPhone: r.customer_phone,
        },
        r.id
      );
    } catch {
      const pool = await getPool();
      await pool
        ?.execute(
          "UPDATE sales_offer_attempts SET last_reconcile_error='projection_unavailable' WHERE id=? AND merchant_id=?",
          [r.id, r.merchant_id]
        )
        .catch(() => {});
    }
  }
  return jobs.length;
}

export async function startSalesOfferReconciliationWorker() {
  let active: Promise<unknown> | undefined,
    stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = runSalesOfferReconciliationBatch()
      .catch(() => console.error("[SalesOffer] Reconciliation deferred"))
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
