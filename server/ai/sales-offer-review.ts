import { z } from "zod";
import { getPool } from "../db/connection";
import { databaseTimeEpoch } from "../db/time";
import { privateSalesPhone } from "./sales-offer-authority";
import { reconcileSalesOffer } from "./sales-offer-reconciliation";
import {
  inspectSalesOfferReceipt,
  salesOfferEvidenceHash,
  salesOfferProjectionConflict,
  type SalesOfferReviewOutcome,
  type SalesOfferDeliveryState,
} from "./sales-offer-receipt-proof";

const id = z.number().int().positive().safe();
export const offerReviewSchema = z
  .object({
    conversationId: id,
    attemptId: z.string().uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    evidence: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
    note: z.string().trim().min(3).max(1000),
  })
  .strict();
export const offerListSchema = z
  .object({ conversationId: id, beforeSourceId: id.optional() })
  .strict();
const iso = (date: string | Date) =>
  new Date(databaseTimeEpoch(date)).toISOString();

export async function listSalesOfferAttempts(
  merchantId: number,
  conversationId: number,
  beforeSourceId?: number
) {
  id.parse(merchantId);
  offerListSchema.parse({ conversationId, beforeSourceId });
  const pool = await getPool();
  if (!pool) throw new Error("Sales offer storage unavailable");
  const [conversations] = await pool.execute<any[]>(
    "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=?",
    [conversationId, merchantId]
  );
  const phone = privateSalesPhone(conversations[0]?.customerPhone);
  if (!phone) throw new Error("Sales offer conversation unavailable");
  const [rows] = await pool.execute<any[]>(
    `SELECT * FROM sales_offer_attempts WHERE merchant_id=? AND conversation_id=?
    AND customer_phone=? AND kind='share' AND source_message_id<? ORDER BY source_message_id DESC LIMIT 11`,
    [
      merchantId,
      conversationId,
      phone,
      beforeSourceId ?? Number.MAX_SAFE_INTEGER,
    ]
  );
  const items = [];
  for (const r of rows.slice(0, 10)) {
    const [deliveries] = await pool.execute<any[]>(
      `SELECT d.*,i.instance_id AS account,i.provider AS account_provider,i.merchant_id AS account_merchant
      FROM whatsapp_message_deliveries d LEFT JOIN whatsapp_instances i ON i.id=d.instance_id WHERE d.merchant_id=? AND d.idempotency_key=?`,
      [merchantId, `sales_offer:${merchantId}:${r.id}`]
    );
    const d = deliveries[0],
      proof = inspectSalesOfferReceipt(r, d);
    const [sources] = await pool.execute<any[]>(
      "SELECT id,direction,content FROM messages WHERE conversationId=? AND id=?",
      [conversationId, r.source_message_id]
    );
    const [messages] = proof.receipt
      ? await pool.execute<any[]>(
          "SELECT id,direction,content,sender_type FROM messages WHERE conversationId=? AND externalId=? ORDER BY id",
          [conversationId, proof.receipt]
        )
      : [[]];
    const [reviews] = await pool.execute<any[]>(
      "SELECT actor_user_id,note,outcome,delivery_state,created_at FROM sales_offer_reviews WHERE merchant_id=? AND attempt_id=? ORDER BY revision DESC LIMIT 1",
      [merchantId, r.id]
    );
    const conflict = salesOfferProjectionConflict(r, messages),
      projected = proof.accepted && messages.length > 0 && !conflict;
    const source = sources[0];
    items.push({
      id: r.id as string,
      revision: r.review_revision as number,
      evidence: salesOfferEvidenceHash(
        r,
        d,
        conversations[0].customerPhone,
        source,
        messages
      ),
      state: proof.deliveryState,
      accepted: proof.accepted,
      projected,
      projectionConflict: proof.accepted && conflict,
      attemptState: r.state as
        | "reserved"
        | "dispatching"
        | "accepted"
        | "unknown"
        | "cancelled",
      sourceMessageId: r.source_message_id as number,
      sourceText:
        source?.direction === "incoming" ? String(source.content) : null,
      text: r.dispatch_text as string | null,
      createdAt: iso(r.created_at),
      receipt: proof.accepted ? proof.receipt : null,
      lastReview: reviews[0]
        ? {
            actorUserId: reviews[0].actor_user_id as number,
            note: reviews[0].note as string,
            outcome: reviews[0].outcome as SalesOfferReviewOutcome,
            deliveryState: reviews[0].delivery_state as SalesOfferDeliveryState,
            at: iso(reviews[0].created_at),
          }
        : null,
    });
  }
  // A number reassignment during reads must not disclose the previous customer's offer history.
  const [current] = await pool.execute<any[]>(
    "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=?",
    [conversationId, merchantId]
  );
  if (current[0]?.customerPhone !== conversations[0].customerPhone)
    throw new Error("Sales offer conversation changed");
  return {
    items,
    nextCursor: rows.length > 10 ? (rows[9].source_message_id as number) : null,
  };
}

export async function reviewSalesOffer(
  input: z.infer<typeof offerReviewSchema> & {
    merchantId: number;
    actorUserId: number;
  }
) {
  const review = offerReviewSchema
    .extend({ merchantId: id, actorUserId: id })
    .parse(input);
  const pool = await getPool();
  if (!pool) throw new Error("Sales offer storage unavailable");
  const [rows] = await pool.execute<any[]>(
    `SELECT source_message_id,customer_phone FROM sales_offer_attempts
    WHERE id=? AND merchant_id=? AND conversation_id=? AND kind='share'`,
    [review.attemptId, review.merchantId, review.conversationId]
  );
  if (rows.length !== 1) throw new Error("Sales offer review unavailable");
  return reconcileSalesOffer(
    {
      merchantId: review.merchantId,
      conversationId: review.conversationId,
      incomingMessageId: rows[0].source_message_id,
      customerPhone: rows[0].customer_phone,
    },
    review.attemptId,
    review
  );
}
