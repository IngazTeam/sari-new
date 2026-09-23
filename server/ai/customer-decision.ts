/** Decisions about consent are shared by reply generation and tool execution. */
export function normalizeCustomerText(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isSalesRefusal(message: string): boolean {
  const text = normalizeCustomerText(message);
  return /(?:^|[\s،,.!؟])(?:لا|ما|مو|مش)\s*(?:اريد|ابغى|ابي|عايز|عاوز|بدي|احتاج|احتاج|حاب|مهتم|بشتري|اشتري|ارغب)/.test(text)
    || /(?:لا|لات)\s*(?:تحجز|تطلب|تسجل|تكمل|ترسل|تتواصل)/.test(text)
    || /(?:غيرت رايي|هونت|بطلت|الغ(?:ي|اء)?\s*(?:الطلب|الحجز|التسجيل)|لست مهتما|ليس الان|لا شكرا)/.test(text)
    || /(?:^|[\s،,.!؟])(?:غير موافق|مو موافق|مش موافق|لا اوافق|ما اوافق|مابي|ماابي|مو الحين|مش دلوقتي)(?:[\s،,.!؟]|$)/.test(text)
    || /\b(?:not okay|not ok|do not confirm|don't confirm|unsubscribe|stop messaging|stop contacting)\b/.test(text)
    || /\b(?:no thanks|not interested|(?:do not|don't|dont)\s+(?:want|buy|book|order|send|contact|continue)|cancel (?:the |my )?(?:order|booking)|changed my mind)\b/i.test(text)
    || /^(?:لا|no)[\s.!،]*$/.test(text);
}

export function isShortAffirmation(message: string): boolean {
  return /^(?:نعم|ايوه|ايوا|اي|تمام|موافق|اوكي|yes|ok|okay)(?:[\s،,.!]+(?:كمل(?: الطلب)?|اكمل(?: الطلب)?|توكل|please|go ahead))?[\s،,.!]*$/
    .test(normalizeCustomerText(message));
}

/** Asking how an order or payment works is a request for information, not consent. */
export function isPurchaseProcessQuestion(message: string): boolean {
  return /(?:كيف|طريقه|خطوات|how (?:do|can|to)|can i|could i).{0,45}(?:اطلب|الطلب|اشتري|شراء|ادفع|الدفع|order|buy|pay)/i.test(normalizeCustomerText(message));
}

/** A question about how to buy is interest, not permission to create an order. */
export function isExplicitPurchaseInstruction(message: string): boolean {
  if (isSalesRefusal(message)) return false;
  const text = normalizeCustomerText(message);
  if (/(?:كيف|هل|ممكن اعرف|how|can i|could i)/.test(text)) return false;
  return /(?:ابغى|ابي|اريد|عايز|عاوز|بدي)\s+(?:اطلب|طلب|اشتري|شراء|الشراء|احجز|اخذ)/.test(text)
    || /(?:^|[\s،])(?:اكمل الطلب|كمل الطلب|سجلني|احجز لي|اطلب لي)/.test(text)
    || /\b(?:i want to buy|place my order|complete (?:the |my )?order|book (?:it|me))\b/i.test(text);
}

export type PendingDecision = 'purchase' | 'information' | 'appointment' | 'none';

/** Used only to interpret a reply. Execution additionally verifies the saved offer. */
export function pendingDecisionFromQuestion(message?: string): PendingDecision {
  if (!message) return 'none';
  const text = normalizeCustomerText(message);
  if (/(?:ارسل|ارسلك|ارسل لك|اوضح|اشرح).{0,35}(?:التفاصيل|معلومات|الكتالوج|الخيارات)/.test(text)) return 'information';
  if (/(?:هل|تبي|تبغى|تحب|تريد|ناكد|تؤكد|اكد|رد).{0,65}(?:اكمل الطلب|نؤكد الطلب|تأكيد الطلب|تاكيد الطلب|انشاء الطلب|اسجل طلبك|نعم.{0,15}التاكيد)/.test(text)) return 'purchase';
  if (/(?:اكد|تبي|تبغى|تحب).{0,45}(?:الموعد|الحجز)/.test(text)) return 'appointment';
  return 'none';
}
