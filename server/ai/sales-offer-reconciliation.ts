import { getPool } from "../db/connection";
import { checkoutTransaction } from "./checkout-agreements";
import {
  privateSalesPhone,
  type SalesOfferIdentity,
} from "./sales-offer-authority";
import { salesDiscountMessage } from "./sales-offer-evidence";

const parse = (v: any) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
};

/** Historical receipts are checked against frozen dispatch facts, not today's coupon validity. */
export async function reconcileSalesOffer(
  input: SalesOfferIdentity,
  attemptId: string
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
      request = parse(d?.request_json),
      g = request?.salesOfferGuard,
      stored = parse(r.evidence);
    let textMatches = false;
    try {
      textMatches = Boolean(
        stored && salesDiscountMessage(stored) === r.dispatch_text
      );
    } catch {
      /* corrupt evidence cannot confirm */
    }
    const valid = Boolean(
      d &&
      r.dispatch_started_at &&
      ["dispatching", "unknown", "accepted"].includes(r.state) &&
      r.instance_id &&
      d.instance_id === r.instance_id &&
      d.provider === r.provider &&
      d.account === r.provider_account &&
      d.account_provider === r.provider &&
      d.account_merchant === r.merchant_id &&
      [
        "green_api",
        "meta_cloud",
        ...(process.env.NODE_ENV === "test" ? ["mock"] : []),
      ].includes(d.provider) &&
      d.direction === "outgoing" &&
      request?.kind === "text" &&
      textMatches &&
      request?.text === r.dispatch_text &&
      privateSalesPhone(request?.to) === r.customer_phone &&
      g?.attemptId === r.id &&
      g?.conversationId === r.conversation_id &&
      g?.sourceMessageId === r.source_message_id
    );
    const receipt =
      typeof d?.provider_message_id === "string" &&
      /^[^\s<>\x00-\x1f]{1,255}$/.test(d.provider_message_id)
        ? d.provider_message_id
        : null;
    // Later failed delivery does not erase an already verified provider acceptance.
    const accepted = Boolean(
      valid &&
      receipt &&
      (["sent", "delivered", "read"].includes(d.status) ||
        (r.state === "accepted" && r.provider_message_id === receipt))
    );
    const deliveryState = !d
      ? "missing"
      : !valid
        ? "invalid"
        : d.status === "failed"
          ? "failed"
          : accepted
            ? d.status
            : "pending";
    let projected = false;
    let error = accepted ? null : deliveryState;
    if (accepted) {
      // Do not resurrect deleted conversations or put another customer's offer into a reassigned conversation.
      if (
        privateSalesPhone(conversations[0]?.customerPhone) !== r.customer_phone
      )
        error = "conversation_unavailable";
      else {
        const [messages] = await c.execute<any[]>(
          "SELECT id,direction,content,sender_type FROM messages WHERE conversationId=? AND externalId=?",
          [r.conversation_id, receipt]
        );
        if (
          messages.some(
            m =>
              m.direction !== "outgoing" ||
              m.content !== r.dispatch_text ||
              m.sender_type !== "assistant"
          )
        )
          throw new Error("Sales offer receipt projection conflict");
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
    await c.execute(
      `UPDATE sales_offer_attempts SET state=?,provider_message_id=?,
      reconciled_at=${accepted ? "COALESCE(reconciled_at,UTC_TIMESTAMP(3))" : "reconciled_at"},last_reconcile_error=?,
      next_reconcile_at=${accepted || (valid && d.status === "failed") ? "NULL" : "TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3))"},updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=?`,
      [
        accepted ? "accepted" : r.state,
        accepted ? receipt : r.provider_message_id,
        error,
        attemptId,
        input.merchantId,
      ]
    );
    return { accepted, projected, deliveryState };
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
