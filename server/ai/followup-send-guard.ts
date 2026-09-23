import type { Pool, RowDataPacket } from 'mysql2/promise';
import { normalizeCampaignPhone } from '../automation/campaign-guard';

/** Executed inside transport after account loading and delivery reservation.
 * A customer reply/withdrawal arriving during those awaits must prevent dispatch. */
export async function canDispatchSalesFollowup(pool: Pick<Pool, 'execute'>, input: {
  merchantId: number; to: string; idempotencyKey: string; followUpGuard?: { id: number; token: string };
}): Promise<boolean> {
  const guard = input.followUpGuard, phone = normalizeCampaignPhone(input.to);
  if (!guard || !Number.isSafeInteger(guard.id) || guard.id <= 0 || !/^claim_[\w]+$/.test(guard.token)
    || input.idempotencyKey !== `sales_followup:${input.merchantId}:${guard.id}` || !phone) return false;
  const forms = [phone, `+${phone}`, `00${phone}`, ...(/^9665\d{8}$/.test(phone) ? [`0${phone.slice(3)}`, phone.slice(3)] : [])];
  const placeholders = forms.map(() => '?').join(',');
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT f.id FROM sales_followups f
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
      AND (f.follow_up_type <> 'customer_requested' OR s.last_decided_at >= anchor.createdAt))
    AND (SELECT COUNT(*) FROM sales_followups prior WHERE prior.merchant_id = f.merchant_id AND prior.customer_phone = f.customer_phone
      AND prior.sent_at >= TIMESTAMPADD(DAY, -7, UTC_TIMESTAMP())) < 3`,
  [guard.id, input.merchantId, input.to, guard.token, ...forms, ...forms]);
  // Clock is checked here too; a slow account lookup may cross into quiet hours.
  const saudiHour = (new Date().getUTCHours() + 3) % 24;
  return rows.length === 1 && saudiHour >= 8 && saudiHour < 23;
}
