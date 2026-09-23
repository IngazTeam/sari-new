import { getPool } from '../db/connection';
import { assertCheckoutIdentity, checkoutTransaction, type CheckoutIdentity } from './checkout-agreements';
import { parseRequestedFollowupTime } from './requested-followup-time';
import { scheduleFollowUp } from './proactive-followup';

export async function handleRequestedFollowup(input: CheckoutIdentity): Promise<string | null> {
  const pool = await getPool(); if (!pool) throw new Error('Follow-up storage unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT m.content, m.createdAt FROM messages m JOIN conversations c ON c.id=m.conversationId
    WHERE m.id=? AND m.direction='incoming' AND c.id=? AND c.merchantId=? AND c.customerPhone=?`,
  [input.incomingMessageId, input.conversationId, input.merchantId, input.customerPhone]);
  if (rows.length !== 1) throw new Error('Follow-up source unavailable');
  const requested = parseRequestedFollowupTime(rows[0].content || '', new Date(rows[0].createdAt));
  if (!requested) return null;
  await checkoutTransaction(connection => assertCheckoutIdentity(connection, input));
  if (requested.kind === 'clarify') return 'حدد يوم المتابعة والوقت صباحاً أو مساءً بتوقيت السعودية، بين 8 صباحاً و11 مساءً. مثال: ذكرني الخميس الساعة 5 مساءً. لم أسجل موعداً بعد.';
  // A repeated source message reuses its already persisted request.
  const [existing] = await pool.execute<any[]>(`SELECT id FROM sales_followups WHERE merchant_id=? AND conversation_id=?
    AND anchor_message_id=? AND follow_up_type='customer_requested' AND cancelled_at IS NULL`,
  [input.merchantId, input.conversationId, input.incomingMessageId]);
  if (!existing.length) {
    if (!await scheduleFollowUp({ merchantId: input.merchantId, customerPhone: input.customerPhone, conversationId: input.conversationId,
      followUpType: 'customer_requested', requestedSourceMessageId: input.incomingMessageId, source: 'customer_request' })) {
      return 'تعذر تسجيل المتابعة بهذا الموعد الآن. لم أضف موعداً جديداً؛ يمكنك متابعة الحديث هنا أو طلب المساعدة من الفريق.';
    }
  }
  const label = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory' }).format(requested.at);
  return `سجلت متابعة واحدة في ${label} بتوقيت السعودية. إذا رددت قبل الموعد تُلغى المتابعة السابقة. هذا الطلب لا يشترك بك في الرسائل التسويقية.`;
}
