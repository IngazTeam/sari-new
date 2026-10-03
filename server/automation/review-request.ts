/**
 * Compatibility boundary for retired, unscoped review automation.
 * An order ID or updatedAt timestamp cannot authorize contacting a customer or
 * recording their rating. A replacement needs scoped delivery evidence,
 * consent, a tenant channel, authenticated responses and durable receipts.
 */
export const REVIEW_AUTOMATION_BLOCKED = 'review_request:scoped_invitation_required' as const;
export const reviewAutomationReadiness = Object.freeze({
  state: 'blocked' as const,
  reason: REVIEW_AUTOMATION_BLOCKED,
  schedulesMessages: false as const,
  requirements: Object.freeze([
    'delivery_event', 'merchant_authorization', 'customer_consent',
    'tenant_channel', 'durable_invitation_receipt', 'authenticated_response',
  ] as const),
});

export async function shouldRequestReview(_orderId: number): Promise<boolean> { return false; }

/** Pure copy only; this function never schedules or sends an invitation. */
export function generateReviewMessage(customerName: string, orderNumber: string, merchantName: string): string {
  return `مرحباً ${customerName}! 👋

كيف كانت تجربتك مع طلبك #${orderNumber} من ${merchantName}؟

رأيك يهمنا. اختر تقييمًا من 1 إلى 5:

5 · ⭐⭐⭐⭐⭐ ممتاز
4 · ⭐⭐⭐⭐ جيد جداً
3 · ⭐⭐⭐ جيد
2 · ⭐⭐ مقبول
1 · ⭐ ضعيف

يمكنك أيضاً إضافة تعليقك لمساعدتنا على التحسين 💚`;
}

export async function sendReviewRequest(_orderId: number): Promise<{ success: false; error: string }> {
  return { success: false, error: REVIEW_AUTOMATION_BLOCKED };
}

export async function processReviewResponse(_orderId: number, rating: number, _comment?: string): Promise<{ success: false; error: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { success: false, error: 'Invalid rating' };
  // A bare order number does not prove that this customer submitted this rating.
  return { success: false, error: REVIEW_AUTOMATION_BLOCKED };
}

/** No implicit user/tenant scope; callers must use the authenticated workspace. */
export async function getMerchantReviewStats(_merchantId: number): Promise<never> {
  throw new Error('review_request:authenticated_workspace_required');
}
