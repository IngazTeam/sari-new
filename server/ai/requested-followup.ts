import { getPool } from '../db/connection';
import { assertCheckoutIdentity, checkoutTransaction, type CheckoutIdentity } from './checkout-agreements';
import { parseRequestedFollowupTime } from './requested-followup-time';
import { scheduleFollowUp } from './proactive-followup';
import { getFollowupPolicy } from './followup-policy';

export async function handleRequestedFollowup(input: CheckoutIdentity): Promise<string | null> {
  const pool = await getPool(); if (!pool) throw new Error('Follow-up storage unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT m.content, m.createdAt FROM messages m JOIN conversations c ON c.id=m.conversationId
    WHERE m.id=? AND m.direction='incoming' AND c.id=? AND c.merchantId=? AND c.customerPhone=?`,
  [input.incomingMessageId, input.conversationId, input.merchantId, input.customerPhone]);
  if (rows.length !== 1) throw new Error('Follow-up source unavailable');
  if (!parseRequestedFollowupTime(rows[0].content || '', new Date(rows[0].createdAt))) return null;
  await checkoutTransaction(connection => assertCheckoutIdentity(connection, input));
  const { policy } = await getFollowupPolicy(input.merchantId);
  if (!policy.enabled) return 'المتابعات متوقفة حالياً لدى المتجر. لم أضف موعداً جديداً؛ يمكنك متابعة الحديث هنا أو طلب مساعدة الفريق.';
  // A repeated source message reuses its already persisted request.
  const findSaved = () => pool.execute<any[]>(`SELECT id,scheduled_at,schedule_timezone FROM sales_followups WHERE merchant_id=? AND conversation_id=?
    AND anchor_message_id=? AND follow_up_type='customer_requested' AND cancelled_at IS NULL`,
  [input.merchantId, input.conversationId, input.incomingMessageId]);
  let [existing] = await findSaved();
  if (!existing.length) {
    const requested = parseRequestedFollowupTime(rows[0].content || '', new Date(rows[0].createdAt), new Date(), policy);
    if (requested?.kind !== 'requested') return `حدد يوم المتابعة والوقت بتوقيت ${policy.timeZone}، خلال ساعات الإرسال من ${policy.startHour}:00 إلى ما قبل ${policy.endHour}:00. مثال: ذكرني الخميس الساعة ${String(policy.startHour).padStart(2, '0')}:00. لم أسجل موعداً بعد.`;
    if (!await scheduleFollowUp({ merchantId: input.merchantId, customerPhone: input.customerPhone, conversationId: input.conversationId,
      followUpType: 'customer_requested', requestedSourceMessageId: input.incomingMessageId, source: 'customer_request' })) {
      return 'تعذر تسجيل المتابعة بهذا الموعد الآن. لم أضف موعداً جديداً؛ يمكنك متابعة الحديث هنا أو طلب المساعدة من الفريق.';
    }
    [existing] = await findSaved();
  }
  if (existing.length !== 1) return 'تعذر التحقق من الموعد المحفوظ الآن. أعد المحاولة قبل الاعتماد عليه.';
  const zone = existing[0].schedule_timezone || 'Asia/Riyadh';
  const label = new Intl.DateTimeFormat('ar-SA', { dateStyle: 'full', timeStyle: 'short', timeZone: zone, calendar: 'gregory' }).format(new Date(existing[0].scheduled_at));
  return `سجلت متابعة واحدة في ${label} بتوقيت ${zone}. إذا رددت قبل الموعد تُلغى المتابعة السابقة. هذا الطلب لا يشترك بك في الرسائل التسويقية.`;
}
