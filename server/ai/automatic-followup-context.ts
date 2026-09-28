import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withCampaignOptOutNotice } from '../automation/campaign-guard';
import { readStoredUnderstanding } from './conversation-understanding';
import { semanticIdentityMatches, type ConversationUnderstanding } from './conversation-understanding-context';
import type { CheckoutIdentity } from './checkout-agreements';

export const AUTOMATIC_FOLLOWUP_SOURCE = 'contextual_auto_v1';
export const AUTOMATIC_FOLLOWUP_TYPE = 'contextual_sales';
const hour = 3_600_000;
const messages = {
  consideration: 'أتابع معك بخصوص الخيارات التي ناقشناها. هل بقيت نقطة تحتاج توضيحًا قبل قرارك؟',
  options: 'هل يناسبك أن نراجع الخيارات حسب احتياجك ونحدد الفروق المهمة لك؟',
  price: 'هل تحب أن نراجع ما يشمله السعر والخيارات المناسبة لميزانيتك؟',
  trust: 'هل بقيت معلومة عن الخدمة أو السياسات تحتاج التأكد منها؟ أساعدك في مراجعتها.',
  comparison: 'هل تحتاج توضيح الفروق بين خياراتنا لتكمل المقارنة حسب أولوياتك؟',
  delivery: 'هل تحتاج أن نراجع خيارات التوصيل المتاحة لمنطقتك؟',
  question: 'أتابع استفسارك السابق. هل ما زلت تحتاج مساعدة في توضيح نقطة معينة؟',
} as const;

/** AI chooses whether, why and when. No caller text or lexical detector grants this decision. */
export function resolveAutomaticFollowup(analysis: ConversationUnderstanding | undefined, sourceTime: Date) {
  const decision = analysis?.automaticFollowup;
  if (!decision || decision.status !== 'recommend' || !decision.purpose || !decision.delayHours
    || analysis!.confidence < .85 || analysis!.conditional || analysis!.ambiguous || analysis!.action !== 'respond'
    || ['declined', 'post_purchase', 'unknown'].includes(analysis!.intent)
    || ['respect_decline', 'resolve_existing_order'].includes(analysis!.goal)
    || ['handoff', 'respect_decline', 'resolve_issue'].includes(analysis!.nextStep)
    || analysis!.followup && analysis!.followup.status !== 'none'
    || analysis!.appointmentReminder && analysis!.appointmentReminder.status !== 'none'
    || !Number.isFinite(sourceTime.getTime())) return null;
  return { due: new Date(sourceTime.getTime() + decision.delayHours * hour),
    text: withCampaignOptOutNotice(messages[decision.purpose]), purpose: decision.purpose };
}

export async function readAutomaticFollowup(db: Pool | PoolConnection, input: CheckoutIdentity) {
  if (!semanticIdentityMatches(input)) throw Error('Automatic follow-up identity mismatch');
  return readStoredUnderstanding(db, input);
}

/** No legacy downgrade: old automated jobs without this contract require a new customer turn.
 * Requested follow-ups have their separate historical consent contract. */
export async function hasAutomaticFollowupProof(db: Pool | PoolConnection, row: RowDataPacket): Promise<boolean> {
  if (row.follow_up_type === 'customer_requested') return row.source !== AUTOMATIC_FOLLOWUP_SOURCE;
  if (row.source !== AUTOMATIC_FOLLOWUP_SOURCE || row.follow_up_type !== AUTOMATIC_FOLLOWUP_TYPE) return false;
  try {
    const stored = await readStoredUnderstanding(db, { merchantId: row.merchant_id, conversationId: row.conversation_id,
      customerPhone: row.customer_phone, incomingMessageId: row.anchor_message_id });
    const [sources] = await db.execute<RowDataPacket[]>("SELECT createdAt FROM messages WHERE id=? AND conversationId=? AND direction='incoming'",
      [row.anchor_message_id, row.conversation_id]);
    if (!stored || sources.length !== 1) return false;
    const decision = resolveAutomaticFollowup(stored.analysis, new Date(sources[0].createdAt));
    const scheduled = new Date(row.scheduled_at).getTime(), now = Date.now();
    // Quiet hours may postpone up to one day. Never accelerate or revive an old recommendation.
    return !!decision && row.message_text === decision.text && scheduled >= decision.due.getTime()
      && scheduled <= decision.due.getTime() + 24 * hour && now <= decision.due.getTime() + 24 * hour;
  } catch { return false; }
}
