/** Explicit customer declines are interpreted centrally; elapsed time only marks inactivity. */
import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { recordContextualSalesLoss, type ContextualSalesLoss } from './contextual-sales-loss';
export type LossDetectionResult = ContextualSalesLoss;
export type LossReason = ContextualSalesLoss['reason'];
// Fairness only, never execution authority. Restarting begins again; stored source keys deduplicate successful work.
let recoveryAfterMessageId = 0;

/** Bounded background recovery for a turn not projected in the live reply path.
 * No provider calls, keyword classification, outbound contact or financial inference. */
export async function detectLostDeals(): Promise<LossDetectionResult[]> {
  const results: LossDetectionResult[] = [];
  try {
    const pool = await getPool(); if (!pool) return results;
    await assertRuntimeSchema('contextual loss detector', [
      { table: 'conversations', columns: ['deal_stage','loss_reason','stalled_since'] },
      { table: 'ai_conversation_understanding', columns: ['incoming_message_id','result_json','state'] },
      { table: 'sari_learning_signals', columns: ['merchant_id','source_key','signal_type'] },
    ]);
    // Actual message activity is evidence of waiting only, never proof of rejection or payment failure.
    // Cap mutations per scan; a resumed conversation loses its inactivity marker, even at the same stage.
    await pool.execute(`UPDATE conversations c SET c.stalled_since=NULL
      WHERE c.deal_stage IN ('interested','qualified','ready','payment_link_sent','payment_failed')
        AND c.loss_reason IS NULL AND c.stalled_since IS NOT NULL
        AND EXISTS(SELECT 1 FROM messages m WHERE m.conversationId=c.id AND m.createdAt>=TIMESTAMPADD(HOUR,-72,UTC_TIMESTAMP()))
      LIMIT 200`);
    await pool.execute(`UPDATE conversations c SET c.stalled_since=(SELECT MAX(m.createdAt) FROM messages m WHERE m.conversationId=c.id)
      WHERE c.deal_stage IN ('interested','qualified','ready','payment_link_sent','payment_failed')
        AND c.loss_reason IS NULL AND c.stalled_since IS NULL
        AND EXISTS(SELECT 1 FROM messages m WHERE m.conversationId=c.id)
        AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversationId=c.id AND m.createdAt>=TIMESTAMPADD(HOUR,-72,UTC_TIMESTAMP()))
      LIMIT 200`);
    const [rows] = await pool.execute<any[]>(`SELECT c.id,c.merchantId,c.customerPhone,u.incoming_message_id FROM conversations c
      JOIN ai_conversation_understanding u ON u.conversation_id=c.id AND u.merchant_id=c.merchantId
      JOIN messages m ON m.id=u.incoming_message_id AND m.conversationId=c.id AND m.direction='incoming'
      WHERE c.deal_stage NOT IN ('paid','purchased') AND c.human_takeover=0 AND u.state='ready'
        AND u.incoming_message_id>?
        AND JSON_UNQUOTE(JSON_EXTRACT(u.result_json,'$.salesLoss.status'))='declined'
        AND NOT EXISTS(SELECT 1 FROM messages newer WHERE newer.conversationId=c.id AND newer.direction='incoming' AND newer.id>m.id)
        AND NOT EXISTS(SELECT 1 FROM sari_learning_signals s WHERE s.merchant_id=c.merchantId
          AND s.source_key=CONCAT('contextual_loss:',c.id,':',u.incoming_message_id) AND s.signal_type='sales_declined')
      ORDER BY u.incoming_message_id LIMIT 200`, [recoveryAfterMessageId]);
    // Bad evidence or a merchant at quota must not permanently starve a later merchant.
    recoveryAfterMessageId = rows.length === 200 ? Number(rows[rows.length - 1].incoming_message_id) : 0;
    for (const row of rows) {
      try {
        const result = await recordContextualSalesLoss({ merchantId: row.merchantId, conversationId: row.id,
          customerPhone: row.customerPhone, incomingMessageId: row.incoming_message_id });
        if (result) results.push(result);
      } catch { console.warn('[LossDetector] Source not projected', { reason: 'evidence_or_storage_unavailable' }); }
    }
  } catch { console.warn('[LossDetector] Scan unavailable'); }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Summary (for Sales Pipeline Board)
// ═══════════════════════════════════════════════════════════════

/**
 * Get pipeline summary for a merchant — used by the Sales Pipeline Board.
 */
export { readLegacyPipelineSummary as getPipelineSummary } from '../pipeline-legacy';
