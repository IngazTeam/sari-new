import type { Pool, RowDataPacket } from 'mysql2/promise';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { getFollowupPolicy } from './followup-policy';
import { isFollowupTimeAllowed } from '../../shared/followup-policy';

export function followupPhoneForms(raw: string): string[] {
  const phone = normalizeCampaignPhone(raw);
  return phone ? [phone, `+${phone}`, `00${phone}`, ...(/^9665\d{8}$/.test(phone) ? [`0${phone.slice(3)}`, phone.slice(3)] : [])] : [];
}

/** Executed inside transport after account loading and delivery reservation.
 * A customer reply/withdrawal arriving during those awaits must prevent dispatch. */
export async function canDispatchSalesFollowup(pool: Pool, input: {
  merchantId: number; to: string; idempotencyKey: string; followUpGuard?: { id: number; token: string };
}): Promise<boolean> {
  const guard = input.followUpGuard, phone = normalizeCampaignPhone(input.to);
  if (!guard || !Number.isSafeInteger(guard.id) || guard.id <= 0 || !/^claim_[\w]+$/.test(guard.token)
    || input.idempotencyKey !== `sales_followup:${input.merchantId}:${guard.id}` || !phone) return false;
  const forms = followupPhoneForms(input.to);
  const placeholders = forms.map(() => '?').join(',');
  const eligibilitySql = `SELECT f.id FROM sales_followups f
    JOIN conversations c ON c.id = f.conversation_id AND c.merchantId = f.merchant_id AND c.customerPhone = f.customer_phone
    JOIN messages anchor ON anchor.id = f.anchor_message_id AND anchor.conversationId = c.id AND anchor.direction = 'incoming'
    WHERE f.id = ? AND f.merchant_id = ? AND f.customer_phone = ? AND f.processing_token = ?
    AND f.sent_at IS NULL AND f.cancelled_at IS NULL AND f.anchor_message_id IS NOT NULL
    AND f.scheduled_at <= UTC_TIMESTAMP() AND f.claimed_at >= TIMESTAMPADD(MINUTE, -10, UTC_TIMESTAMP(3))
    AND c.deal_stage NOT IN ('paid', 'purchased', 'lost')
    AND NOT (c.human_takeover = 1 AND (c.human_expires_at IS NULL OR c.human_expires_at > UTC_TIMESTAMP()))
    AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversationId = c.id AND m.direction = 'incoming' AND m.id > f.anchor_message_id)
    AND (f.follow_up_type = 'customer_requested' OR EXISTS (SELECT 1 FROM campaign_consent_state s WHERE s.merchant_id = f.merchant_id
      AND s.customer_phone IN (${placeholders}) AND s.status = 'granted'))
    AND NOT EXISTS (SELECT 1 FROM campaign_consent_state s WHERE s.merchant_id = f.merchant_id
      AND s.customer_phone IN (${placeholders}) AND s.status = 'withdrawn'
      AND (f.follow_up_type <> 'customer_requested' OR s.last_decided_at >= anchor.createdAt))`;
  const parameters = [guard.id, input.merchantId, input.to, guard.token, ...forms, ...forms];
  const [rows] = await pool.execute<RowDataPacket[]>(eligibilitySql, parameters);
  if (rows.length !== 1) return false;
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await connection.beginTransaction();
    // Also serializes policy edits. No database lock is held over the provider call.
    const [merchant] = await connection.execute<RowDataPacket[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [input.merchantId]);
    if (!merchant.length) return false;
    const { policy } = await getFollowupPolicy(input.merchantId, connection);
    if (!isFollowupTimeAllowed(policy)) return false;
    const [eligible] = await connection.execute<RowDataPacket[]>(eligibilitySql, parameters);
    if (eligible.length !== 1) return false;
    const [prior] = await connection.execute<RowDataPacket[]>('SELECT * FROM sales_followup_dispatches WHERE followup_id=?', [guard.id]);
    if (prior.length) return prior[0].merchant_id === input.merchantId && prior[0].customer_phone === phone && prior[0].state !== 'released';
    const [counts] = await connection.execute<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM sales_followup_dispatches WHERE merchant_id=? AND customer_phone=?
        AND state<>'released' AND admitted_at>=TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP(3))) +
      (SELECT COUNT(*) FROM sales_followups f WHERE f.merchant_id=? AND f.customer_phone IN (${placeholders})
        AND f.sent_at>=TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP(3))
        AND NOT EXISTS (SELECT 1 FROM sales_followup_dispatches d WHERE d.followup_id=f.id)) AS count`,
    [input.merchantId, phone, input.merchantId, ...forms]);
    if (Number(counts[0].count) >= policy.weeklyLimit) return false;
    await connection.execute(`INSERT INTO sales_followup_dispatches (followup_id,merchant_id,customer_phone) VALUES (?,?,?)`, [guard.id, input.merchantId, phone]);
    await connection.commit();
    return true;
  } finally { try { await connection.rollback(); } finally { connection.release(); } }
}

/** Only a definitive rejection releases capacity. Crashes/unknown outcomes keep their reservation. */
export async function settleSalesFollowupDispatch(pool: Pick<Pool, 'execute'>, merchantId: number, followupId: number,
  outcome: 'accepted' | 'rejected' | 'unknown') {
  await pool.execute(`UPDATE sales_followup_dispatches SET state=?,settled_at=UTC_TIMESTAMP(3)
    WHERE followup_id=? AND merchant_id=? AND state='reserved'`,
  [outcome === 'rejected' ? 'released' : outcome, followupId, merchantId]);
}
