/**
 * Sari Personality — Utility Functions (Extracted)
 * 
 * Pure utility functions extracted from sari-personality.ts to reduce
 * cognitive load. These are stateless, side-effect-free text processors.
 * 
 * ⚠️ IMPORTANT: These functions are ALSO kept in sari-personality.ts
 * because pentest tests read that file directly with readFileSync.
 * This module provides a clean import path for NEW code.
 */

// ═══════════════════════════════════════════════════════════════
// Prompt Sanitization
// ═══════════════════════════════════════════════════════════════

/**
 * Strip prompt injection patterns from merchant-controlled content.
 * Prevents: 'ignore previous instructions', 'system:', role impersonation, etc.
 */
export function sanitizeForPrompt(text: string): string {
  if (!text) return '';
  const normalized = text.normalize('NFKC');
  return normalized
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/do\s+not\s+follow/gi, '[filtered]')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تصرف\s*(كـ|ك)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد|اعداداتهم)/gi, '[filtered]');
}

/**
 * Strip phone numbers and emails from website content BEFORE AI context injection.
 */
export function stripContactInfoFromContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:\+?966[-\s.]?)?0?5\d[-\s.]\d{3}[-\s.]\d{4}/g, '')
    .replace(/(?:\+?\d{1,3}[-\s.]?)\d{10,14}/g, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════
// Off-Topic Detection
// ═══════════════════════════════════════════════════════════════

const OFF_TOPIC_PATTERNS = [
  // Cooking / Recipes
  /طريق[ةه]\s*(طبخ|عمل|تحضير)/i,
  /وصف[ةه]\s*(طبخ|أكل|حلى|كيك|طبيخ)/i,
  /كيف (أطبخ|اطبخ|أسوي|اسوي)\s/i,
  /مقادير\s/i,
  /وش\s*طابخ/i, /ايش\s*طابخ/i, /شو\s*طابخ/i,
  /طبخ[ةه]\s*(اليوم|الغدا|العشا)/i,
  // Weather
  /حال[ةه]\s*الطقس/i, /الجو\s*(اليوم|بكرة|غداً)/i, /درج[ةه]\s*الحرار/i,
  // Sports
  /نتيج[ةه]\s*مبارا/i, /الدوري\s*(السعودي|الإنجليزي)/i, /من\s*(فاز|كسب)/i,
  // News / Politics
  /آخر\s*الأخبار/i, /أخبار\s*(السعودية|العالم|اليوم)/i,
  /رأيك\s*(في|ب|عن)\s*(الحكوم|السياس|الرئيس|الملك)/i,
  // Religion (sensitive)
  /حكم\s*(شرعي|الصلا|الصيام)/i, /فتو[ىا]\s/i, /هل\s*(يجوز|حرام|حلال)\s/i,
  // Personal advice / Health
  /علاج\s/i, /أعراض\s/i, /دواء\s/i, /دكتور\s*(ينصح|يقول)/i,
  // Math / Homework
  /كم\s*يساوي\s*\d/i, /حل\s*(المسأل|السؤال|الواجب)/i, /اشرح\s*(لي\s*)?(الدرس|المادة)/i,
  // Jokes / Entertainment
  /قول\s*(لي\s*)?(نكت|طرف)/i, /لغز/i, /حزور[ةه]/i,
  // Programming / Tech (unless the business IS tech)
  /اكتب\s*(لي\s*)?(كود|برنامج|سكربت)/i,
  // Translation
  /ترجم\s*(لي)?\s/i, /معنى\s*كلم[ةه]/i,
  // General knowledge
  /من\s*(اخترع|اكتشف|بنى)\s/i, /عاصم[ةه]\s/i, /كم\s*(عدد\s*سكان|مساح[ةه])\s/i,
];

const SAFE_MESSAGE_PATTERNS = [
  /^(سلام|مرحب|هلا|أهل|hi|hello|hey|صباح|مساء|حياك)/i,
  /^(شكر|مشكور|الله يعطيك|thanks|thank you|ممتاز|تمام)/i,
  /^(مع السلامة|باي|bye|وداع)/i,
  /^(أوك|ok|تمام|ان شاء الله|خلاص|طيب)/i,
  /^(نعم|لا|أي|إي|أيوه|لا شكراً)/i,
];

/**
 * Check if a customer message is off-topic (unrelated to ANY business).
 */
export function isOffTopicQuestion(message: string): boolean {
  const msg = message.trim();
  if (msg.length < 8) return false;
  if (SAFE_MESSAGE_PATTERNS.some(p => p.test(msg))) return false;
  return OFF_TOPIC_PATTERNS.some(p => p.test(msg));
}

// ═══════════════════════════════════════════════════════════════
// Deal Stage Map
// ═══════════════════════════════════════════════════════════════

export const DEAL_STAGE_MAP: Record<string, string> = {
  browsing: 'new',
  inquiring: 'interested',
  comparing: 'qualified',
  hesitating: 'qualified',
  objecting: 'qualified',
  ready_to_buy: 'ready',
  post_purchase: 'purchased',
  returning: 'returning',
};

export const STAGE_ORDER: Record<string, number> = {
  new: 0, interested: 1, qualified: 2, ready: 3,
  payment_link_sent: 4, purchased: 5, paid: 6,
  returning: 7,
  payment_failed: -1, lost: -2,
};

// ═══════════════════════════════════════════════════════════════
// Product Search (Arabic-aware fuzzy matching)
// ═══════════════════════════════════════════════════════════════

/**
 * Search for relevant products using keyword matching with Arabic stem normalization.
 */
export async function searchRelevantProducts(
  message: string,
  allProducts: any[],
  limit: number = 20
): Promise<any[]> {
  if (allProducts.length === 0) return [];

  const priceCatalogKeywords = ['سعر', 'أسعار', 'اسعار', 'كم', 'باقة', 'باقات', 'بكج', 'حق', 'تكلفة',
    'price', 'pricing', 'cost', 'package', 'plan', 'منتجات', 'دورات', 'كتالوج', 'قائمة',
    'ايش عندكم', 'وش عندكم', 'ايه الباقات', 'ايش الباقات', 'شو عندكم',
    'المتوفرة', 'متوفرة', 'المتاحة', 'متاحة', 'حاليا', 'حالياً', 'كورسات',
    'التسجيل', 'مفتوح', 'courses', 'available', 'catalog', 'عندك', 'فيه'];
  const msgLower = message.toLowerCase();
  const isPriceQuery = priceCatalogKeywords.some(k => msgLower.includes(k));
  if (isPriceQuery) return allProducts;

  const normalizeArabic = (word: string): string[] => {
    const stems: string[] = [word];
    if (word.startsWith('ال')) stems.push(word.substring(2));
    for (const suffix of ['ات', 'ين', 'ية', 'ة', 'ون']) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        stems.push(word.substring(0, word.length - suffix.length));
      }
    }
    return stems;
  };

  const keywords = msgLower.split(/\s+/).filter(w => w.length > 1);

  const scoredProducts = allProducts.map(product => {
    let score = 0;
    const searchText = `${product.name} ${product.description || ''} ${product.category || ''} ${(product as any).tags || ''} ${(product as any).sku || ''} ${(product as any).shortDescription || ''}`.toLowerCase();

    keywords.forEach(keyword => {
      const stems = normalizeArabic(keyword);
      for (const stem of stems) {
        if (searchText.includes(stem)) { score += 1; break; }
      }
    });

    keywords.forEach(keyword => {
      const stems = normalizeArabic(keyword);
      for (const stem of stems) {
        if (product.name.toLowerCase().includes(stem)) { score += 2; break; }
      }
    });

    return { product, score };
  });

  const matched = scoredProducts
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.product);

  return matched.length > 0 ? matched : allProducts.slice(0, 15);
}

// ═══════════════════════════════════════════════════════════════
// Knowledge Gap Detection
// ═══════════════════════════════════════════════════════════════

/** Partnership/B2B keywords that always trigger escalation */
const PARTNERSHIP_KEYWORDS = [
  'تعاون', 'شراكة', 'مدرب', 'مدربة', 'محتوى تدريبي', 'مقدم خدمة',
  'تقديم محتوى', 'نتعاون', 'أقدم خدمات', 'عرض تعاون', 'فرصة تعاون',
  'partnership', 'collaboration', 'trainer', 'instructor', 'supplier',
  'مقدمة خدمة', 'أقدر أقدم', 'عندي خبرة', 'متخصص', 'متخصصة',
  'استشاري', 'استشارية', 'أبي أتعاون', 'ابغى اتعاون',
];

/** Bot responses that indicate the AI doesn't have the answer */
const GAP_INDICATORS = [
  'خلني أتأكد', 'خلني أتحقق', 'خلني أرجع لك', 'بتأكد وأرد',
  'أتأكد من المعلومة', 'أرجع لك خلال', 'وأرد عليك',
  'ما أقدر أجاوبك', 'أتواصل مع الفريق', 'أرجع للفريق',
  'أسأل المختص', 'لا أملك هذه المعلومة', 'أبغى أتأكد',
  'ما عندي تفاصيل', 'أحتاج أتأكد', 'أحتاج أرجع',
  'ما عندنا', 'ما لقيت', 'مو موجود', 'غير متوفر',
  'ما يتوفر حالي', 'مافي عندنا', 'ما نوفر',
  "i'll check", "let me verify", "i'm not sure", "let me get back",
  'محذوف', 'تواصل مع', 'تواصل معنا عبر', 'يمكنك التواصل',
  'تقدر تتواصل', 'راسلنا على',
];

/**
 * Detect if GPT's response indicates a knowledge gap.
 */
export function isKnowledgeGapResponse(botResponse: string, customerMessage: string): boolean {
  const resp = botResponse.toLowerCase();
  const msg = customerMessage.toLowerCase();

  if (msg.match(/^(سلام|مرحب|هلا|أهل|hi|hello|شكر|مع السلامة|باي|تمام|أوك|ok|حياك)/)) return false;
  if (resp.length < 30) return false;

  if (PARTNERSHIP_KEYWORDS.some(kw => msg.includes(kw))) {
    return true;
  }

  return GAP_INDICATORS.some(indicator => resp.includes(indicator));
}

// ═══════════════════════════════════════════════════════════════
// Acquisition Source Detection
// ═══════════════════════════════════════════════════════════════

const ACQUISITION_PATTERNS: [RegExp, string][] = [
  [/(?:تويتر|تويت|tweet|twitter|𝕏|x\.com)/i, 'twitter'],
  [/(?:سناب|snapchat|snap)/i, 'snapchat'],
  [/(?:انستقرام|انستا|insta|instagram)/i, 'instagram'],
  [/(?:تيك\s?توك|tiktok|tik\s?tok)/i, 'tiktok'],
  [/(?:يوتيوب|youtube)/i, 'youtube'],
  [/(?:جوجل|قوقل|google|بحث)/i, 'google'],
  [/(?:صديق|صاحب|قريب|أحد|واحد\s*قال|نصحني|رشحني|حولني)/i, 'referral'],
  [/(?:إعلان|اعلان|ad|ads|advertisement|بنر)/i, 'ads'],
  [/(?:واتساب|whatsapp|واتس)/i, 'whatsapp'],
  [/(?:فيسبوك|فيس|facebook|fb)/i, 'facebook'],
];

/**
 * Detect how the customer discovered the business from their message.
 */
export function detectAcquisitionSource(message: string): string | null {
  for (const [pattern, source] of ACQUISITION_PATTERNS) {
    if (pattern.test(message)) return source;
  }
  return null;
}
