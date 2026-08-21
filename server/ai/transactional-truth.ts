const UNVERIFIED_ACTION_PATTERN = /(تم\s+(?:تسجيل|إنشاء|تأكيد|حجز|تحويل|إرسال)\s+(?:طلب|طلبك|حجز|حجزك|موعد|موعدك)|سجلت\s+طلبك|(?:استفسارك|سؤالك)\s+مسجل|وص[ّ]?لت\s+طلبك|حو[ّ]?لتك\s+(?:للفريق|للمختص)|بيتواصل\s+معك)/i;

/**
 * Customer-facing transactional claims require a persisted action identifier.
 * Intention, routing and LLM text are never proof that an action happened.
 */
export function containsUnverifiedActionClaim(response: string, confirmedActionId?: string | number): boolean {
  if (confirmedActionId !== undefined && confirmedActionId !== null && String(confirmedActionId).trim()) {
    return false;
  }
  return UNVERIFIED_ACTION_PATTERN.test(response);
}

export const UNVERIFIED_ACTION_FALLBACK =
  'لم يتم تنفيذ طلب أو حجز حتى الآن. أقدر أوضح لك الخطوات، ويجب أن يظهر رقم مرجعي عند اكتمال العملية.';
