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
    || /\b(?:no thanks|not interested|not ready to (?:buy|order|book)|(?:do not|don't|dont)\s+(?:want|buy|book|order|send|contact|continue|place|complete|proceed)|changed my mind)\b/.test(text)
    // A request to keep an existing order is not a request to cancel it.
    || /\bcancel (?:the |my )?(?:order|booking)\b/.test(text.replace(/\b(?:do not|don't|dont|never)\s+cancel\b/g, 'keep'))
    || /^(?:(?:no|please)[,\s]+)?not (?:now|yet)[\s.!،]*$/.test(text)
    || /^(?:لا|no)[\s.!،]*$/.test(text);
}

export function isShortAffirmation(message: string): boolean {
  return /^(?:نعم|ايوه|ايوا|اي|تمام|موافق|اوكي|yes|ok|okay)(?:[\s،,.!]+(?:كمل(?: الطلب)?|اكمل(?: الطلب)?|توكل|please|go ahead))?[\s،,.!]*$/
    .test(normalizeCustomerText(message));
}

/** Asking how an order or payment works is a request for information, not consent. */
export function isPurchaseProcessQuestion(message: string): boolean {
  return /(?:كيف|ازا[يى]|شلون|طريقه|خطوات|هل (?:اقدر|يمكن)|how (?:do|can|to)|can i|could i).{0,65}(?:اطلب|الطلب|اشتري|شراء|ادفع|الدفع|احجز|الحجز|order|buy|pay|book)/.test(normalizeCustomerText(message));
}

/** A question about how to buy is interest, not permission to create an order. */
export function isExplicitPurchaseInstruction(message: string): boolean {
  if (isSalesRefusal(message) || isPurchaseProcessQuestion(message)) return false;
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
  // A bare yes cannot select between questions or alternatives. Quoted examples
  // and historical statements are not the assistant's current question either.
  const text = normalizeCustomerText(message.replace(/\r?\n/g, '. '));
  if ((text.match(/[?؟]/g)?.length ?? 0) > 1 || /[«»"“”]/.test(text)) return 'none';
  const clause = text.split(/[.!?؟]/).map(part => part.trim()).filter(Boolean).at(-1) ?? '';
  if (/(?:^|\s)(?:ام|او|or)(?:\s|$)/.test(clause)) return 'none';
  if (/\b(?:not|never|don't|dont|without)\b/.test(clause)
    || /(?:^|\s)(?:لا|الا|ما|مو|مش|عدم|بدون)(?:\s|$)/.test(clause)) return 'none';
  const directQuestion = /^(?:هل|تبي|تبغى|تحب|تريد|ناكد|اكد)(?:\s|$)/.test(clause)
    || /^(?:shall i|can i|would you like|do you want)\b/.test(clause);
  const confirmationPrompt = /^(?:رد|يرجى الرد)\s+ب?نعم\s+لتاكيد الطلب$/.test(clause);
  if (!directQuestion && !confirmationPrompt) return 'none';
  const information = /(?:التفاصيل|تفاصيل|معلومات|الكتالوج|الخيارات|طريقه|خطوات|معرفه|كيف)/.test(clause)
    || /\b(?:details|information|catalog(?:ue)?|options|explain|steps|how|know)\b/.test(clause);
  const purchase = confirmationPrompt || /(?:اكمل|كمل|نوكد|تاكيد|انشاء|اكد)\s+(?:الطلب|طلبك)|اسجل\s+طلبك/.test(clause)
    || /\b(?:place|complete|confirm)\s+(?:(?:the|your)\s+)?order\b/.test(clause);
  const appointment = /(?:الموعد|الحجز)/.test(clause)
    || /\b(?:confirm|book)\s+(?:(?:the|your)\s+)?(?:appointment|booking)\b/.test(clause);
  const decisions: PendingDecision[] = [];
  if (information) decisions.push('information');
  if (purchase) decisions.push('purchase');
  if (appointment) decisions.push('appointment');
  return decisions.length === 1 ? decisions[0] : 'none';
}
