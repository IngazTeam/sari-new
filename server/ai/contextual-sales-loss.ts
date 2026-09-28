import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  assertCheckoutIdentity,
  type CheckoutIdentity,
} from "./checkout-agreements";
import { readStoredUnderstanding } from "./conversation-understanding";
import { contextualSalesLossReason } from "./contextual-sales-loss-contract";
import { captureLearningSignalsInTransaction } from "./learning-signal-capture";

export type ContextualSalesLoss = {
  merchantId: number;
  conversationId: number;
  sourceMessageId: number;
  reason: NonNullable<ReturnType<typeof contextualSalesLossReason>>;
  basis: "interpreted_customer_decline";
};

/** One transaction commits the interpreted decision, its source and learning signal.
 * Silence, provider outage and a delayed payment never become a loss classification. */
export async function recordContextualSalesLoss(
  input: CheckoutIdentity
): Promise<ContextualSalesLoss | null> {
  await assertRuntimeSchema("contextual sales loss", [
    {
      table: "conversations",
      columns: ["deal_stage", "loss_reason", "stalled_since"],
    },
    {
      table: "sari_learning_signals",
      columns: ["source_key"],
      uniqueIndexes: [
        {
          name: "uq_learning_source",
          columns: ["merchant_id", "source_key", "signal_type"],
        },
      ],
    },
    {
      table: "ai_purchase_outcomes",
      columns: ["merchant_id", "conversation_id", "outcome_type"],
    },
  ]);
  const pool = await getPool();
  if (!pool) return null;
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    const [owners] = await c.execute<any[]>(
      "SELECT id FROM merchants WHERE id=? FOR UPDATE",
      [input.merchantId]
    );
    if (owners.length !== 1) return null;
    const source = await assertCheckoutIdentity(c, input);
    const stored = await readStoredUnderstanding(c, input);
    const reason = contextualSalesLossReason(stored?.analysis);
    if (!reason) return null;
    const [rows] = await c.execute<any[]>(
      `SELECT c.deal_stage,c.loss_reason,m.createdAt AS source_time,u.result_digest,
      EXISTS(SELECT 1 FROM ai_purchase_outcomes p WHERE p.merchant_id=c.merchantId AND p.conversation_id=c.id
        AND p.outcome_type IN ('purchase_completed','purchase_refunded')) AS has_purchase
      FROM conversations c JOIN messages m ON m.conversationId=c.id AND m.id=?
      JOIN ai_conversation_understanding u ON u.merchant_id=c.merchantId AND u.conversation_id=c.id AND u.incoming_message_id=m.id
      WHERE c.id=? AND c.merchantId=? AND c.customerPhone=?`,
      [
        input.incomingMessageId,
        input.conversationId,
        input.merchantId,
        input.customerPhone,
      ]
    );
    const row = rows[0];
    if (
      !row ||
      ["paid", "purchased"].includes(row.deal_stage) ||
      row.has_purchase
    )
      return null;
    const sourceKey = `contextual_loss:${input.conversationId}:${input.incomingMessageId}`;
    const [prior] = await c.execute<any[]>(
      "SELECT id FROM sari_learning_signals WHERE merchant_id=? AND source_key=? AND signal_type='sales_declined'",
      [input.merchantId, sourceKey]
    );
    await captureLearningSignalsInTransaction(c, [
      {
        merchantId: input.merchantId,
        conversationId: input.conversationId,
        signalType: "sales_declined",
        signalWeight: 1,
        strict: true,
        sourceKey,
        customerMessage: source.content,
        contextSummary: JSON.stringify({
          version: 1,
          basis: "interpreted_customer_decline",
          sourceMessageId: input.incomingMessageId,
          interpretationDigest: row.result_digest,
          reason,
          causality: "unmeasured",
          financialOutcome: "unmeasured",
        }),
      },
    ]);
    // Re-read sealed authority before projecting: injected storage failures and source mutations roll back both writes.
    const final = await readStoredUnderstanding(c, input);
    if (contextualSalesLossReason(final?.analysis) !== reason)
      throw Error("Loss interpretation changed");
    // A committed source is historical evidence. A transport retry must not undo a later manual stage correction.
    if (prior.length) {
      await c.commit();
      return null;
    }
    await c.execute(
      "UPDATE conversations SET deal_stage='lost',loss_reason=?,stalled_since=? WHERE id=? AND merchantId=? AND deal_stage NOT IN ('paid','purchased')",
      [reason, row.source_time, input.conversationId, input.merchantId]
    );
    await c.commit();
    return {
      merchantId: input.merchantId,
      conversationId: input.conversationId,
      sourceMessageId: input.incomingMessageId,
      reason,
      basis: "interpreted_customer_decline",
    };
  } finally {
    try {
      await c.rollback();
    } finally {
      c.release();
    }
  }
}
