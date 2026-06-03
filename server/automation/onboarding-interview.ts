/**
 * WhatsApp Onboarding Interview
 * 
 * When a merchant connects WhatsApp, Sari conducts an intelligent interview
 * to collect business information. This data becomes the bot's "ground truth"
 * knowledge base — preventing fake/hallucinated responses.
 * 
 * Flow:
 * 1. Merchant connects WhatsApp → interview starts automatically
 * 2. Sari asks questions one by one (adapted to business type)
 * 3. Answers stored in DB → injected into AI context as highest-priority source
 * 4. Merchant can pause ("لاحقاً") and resume anytime
 */

import { getPool, getMerchantById } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type BusinessType = 'store' | 'services' | 'both' | null;
type AppliesTo = 'all' | 'store' | 'services' | 'both';

interface OnboardingQuestion {
  phase: number;
  key: string;
  question: string;
  applies: AppliesTo;
  followUp?: string; // optional clarification hint
}

// ═══════════════════════════════════════════════════════════════
// Question Bank — 25+ questions organized by phase
// ═══════════════════════════════════════════════════════════════

const QUESTION_BANK: OnboardingQuestion[] = [
  // ── Phase 1: Basics (all) ──
  { phase: 1, key: 'businessType', applies: 'all',
    question: 'وش نوع نشاطك؟\n\n1️⃣ متجر (بيع منتجات)\n2️⃣ خدمات (تدريب، استشارات، صيانة..)\n3️⃣ كلاهما\n\nأرسل الرقم أو الاسم' },
  { phase: 1, key: 'businessNameFull', applies: 'all',
    question: 'وش الاسم الكامل لنشاطك التجاري؟ (مثل: مركز إنجاز للتدريب)' },
  { phase: 1, key: 'businessDescription', applies: 'all',
    question: 'وصف نشاطك بسطر أو سطرين — وش تقدمون بالضبط؟' },
  { phase: 1, key: 'industry', applies: 'all',
    question: 'وش المجال أو الصناعة؟ (مثل: أزياء، إلكترونيات، تدريب، مطاعم، عقارات..)' },
  { phase: 1, key: 'address', applies: 'all',
    question: 'وين موقعكم / عنوان الفرع الرئيسي؟\n(أو أرسل "أونلاين" لو ما عندكم موقع فعلي)' },
  { phase: 1, key: 'branches', applies: 'all',
    question: 'كم عندكم فرع؟ وين؟\n(أو "فرع واحد" أو "أونلاين فقط")' },

  // ── Phase 2: Contact & Hours (all) ──
  { phase: 2, key: 'workingHours', applies: 'all',
    question: 'ايش ساعات العمل عندكم؟\n(مثل: "9ص - 10م كل يوم ماعدا الجمعة")' },
  { phase: 2, key: 'contactPhone', applies: 'all',
    question: 'هل فيه رقم تواصل ثاني غير الواتساب؟\n(أو "لا" لو هذا الرقم الوحيد)' },
  { phase: 2, key: 'contactEmail', applies: 'all',
    question: 'ايش الإيميل الرسمي للتواصل؟\n(أو "مافيه" لو ما عندكم)' },
  { phase: 2, key: 'socialMedia', applies: 'all',
    question: 'ايش حساباتكم بالسوشل ميديا؟\n(انستقرام، تويتر، سناب.. أرسل الروابط أو أسماء الحسابات)' },
  { phase: 2, key: 'websiteUrl', applies: 'all',
    question: 'هل عندكم موقع إلكتروني؟\n(أرسل الرابط أو "لا")' },

  // ── Phase 3: Products & Services (all) ──
  { phase: 3, key: 'topProducts', applies: 'all',
    question: 'ايش أبرز المنتجات أو الخدمات عندكم؟ (أهم 3 إلى 5)' },
  { phase: 3, key: 'bestSeller', applies: 'all',
    question: 'ايش أكثر منتج أو خدمة مطلوبة عندكم؟' },
  { phase: 3, key: 'priceRange', applies: 'all',
    question: 'ايش نطاق الأسعار عندكم تقريباً؟ (من كم لكم)' },
  { phase: 3, key: 'currentOffers', applies: 'all',
    question: 'هل عندكم عروض أو خصومات حالياً؟\n(أو "لا يوجد حالياً")' },

  // ── Phase 4: Payment & Shipping (store/both only) ──
  { phase: 4, key: 'paymentMethods', applies: 'store',
    question: 'ايش طرق الدفع المتاحة عندكم؟\n(تحويل بنكي، فيزا، مدى، كاش، تابي، تمارا..)' },
  { phase: 4, key: 'shippingInfo', applies: 'store',
    question: 'هل عندكم توصيل؟ كم تكلفته؟\n(مثل: "توصيل مجاني فوق 200 ريال" أو "30 ريال لكل المناطق")' },
  { phase: 4, key: 'shippingDuration', applies: 'store',
    question: 'كم مدة التوصيل المتوقعة؟\n(مثل: "1-3 أيام داخل الرياض، 3-5 أيام لباقي المناطق")' },
  { phase: 4, key: 'returnPolicy', applies: 'store',
    question: 'ايش سياسة الاسترجاع أو الاستبدال عندكم؟' },
  { phase: 4, key: 'minimumOrder', applies: 'store',
    question: 'هل فيه حد أدنى للطلب؟\n(أو "لا يوجد")' },

  // ── Phase 5: Services-specific (services/both only) ──
  { phase: 5, key: 'bookingInfo', applies: 'services',
    question: 'هل الحجز مطلوب مسبقاً؟ وكيف يحجز العميل؟' },
  { phase: 5, key: 'serviceDuration', applies: 'services',
    question: 'كم مدة الخدمة أو الجلسة عادةً؟' },
  { phase: 5, key: 'subscriptionInfo', applies: 'services',
    question: 'هل عندكم اشتراكات أو باقات؟\n(مثل: "باقة شهرية 500 ريال" أو "لا")' },
  { phase: 5, key: 'certifications', applies: 'services',
    question: 'هل تقدمون شهادات أو اعتمادات؟\n(أو "لا")' },
  { phase: 5, key: 'prerequisites', applies: 'services',
    question: 'هل فيه متطلبات مسبقة للتسجيل أو الاستفادة من الخدمة؟\n(أو "لا يوجد")' },

  // ── Phase 6: Policies & Differentiators (all) ──
  { phase: 6, key: 'uniqueAdvantage', applies: 'all',
    question: 'ايش يميزكم عن المنافسين؟ (ميزة أو اثنتين)' },
  { phase: 6, key: 'warranty', applies: 'all',
    question: 'هل فيه ضمان أو كفالة على منتجاتكم/خدماتكم؟\n(أو "لا يوجد")' },
  { phase: 6, key: 'commonFAQ', applies: 'all',
    question: 'ايش أكثر سؤال يسألونه العملاء عادةً؟' },
  { phase: 6, key: 'commonFAQAnswer', applies: 'all',
    question: 'وش الجواب عليه؟' },
  { phase: 6, key: 'botInstructions', applies: 'all',
    question: 'فيه شي تبي البوت يعرفه أو يتجنبه؟\n(مثل: "لا تذكر أسعار قديمة" أو "لا تقارن بمنافسين")' },
];

// ═══════════════════════════════════════════════════════════════
// Pause/Skip Detection
// ═══════════════════════════════════════════════════════════════

const PAUSE_PATTERNS = [
  /^(لاحق|بعدين|بعد شوي|مو الحين|skip|later|لحظة|وقت ثاني|مشغول)/i,
  /^(خلاص|كفاية|وقف|stop|enough|يكفي|باقي بعدين)/i,
];

const BUSINESS_TYPE_MAP: Record<string, BusinessType> = {
  '1': 'store', 'متجر': 'store', 'store': 'store', 'منتجات': 'store',
  '2': 'services', 'خدمات': 'services', 'services': 'services', 'تدريب': 'services',
  '3': 'both', 'كلاهما': 'both', 'both': 'both', 'الاثنين': 'both',
};

// ═══════════════════════════════════════════════════════════════
// DB Operations
// ═══════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS merchant_onboarding_answers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        field_key VARCHAR(50) NOT NULL,
        question_text TEXT NOT NULL,
        answer_text TEXT NOT NULL,
        phase INT NOT NULL DEFAULT 1,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_merchant_field (merchant_id, field_key),
        INDEX idx_merchant (merchant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    console.warn('[Onboarding] Table creation failed (non-blocking):', err);
  }
}

// Ensure table exists on first import
let _tableReady = false;
async function ready(): Promise<void> {
  if (!_tableReady) { await ensureTable(); _tableReady = true; }
}

async function saveAnswer(merchantId: number, key: string, question: string, answer: string, phase: number): Promise<void> {
  await ready();
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `INSERT INTO merchant_onboarding_answers (merchant_id, field_key, question_text, answer_text, phase)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE answer_text = VALUES(answer_text), question_text = VALUES(question_text), updated_at = NOW()`,
    [merchantId, key, question, answer, phase],
  );
}

async function getAnswers(merchantId: number): Promise<Record<string, string>> {
  await ready();
  const pool = await getPool();
  if (!pool) return {};
  const [rows] = await pool.execute(
    `SELECT field_key, answer_text FROM merchant_onboarding_answers WHERE merchant_id = ?`,
    [merchantId],
  );
  const result: Record<string, string> = {};
  for (const row of (rows as any[])) {
    result[row.field_key] = row.answer_text;
  }
  return result;
}

async function getInterviewStep(merchantId: number): Promise<number> {
  const merchant = await getMerchantById(merchantId);
  return (merchant as any)?.onboardingStep || 0;
}

async function setInterviewStep(merchantId: number, step: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE merchants SET onboarding_step = ? WHERE id = ?`,
    [step, merchantId],
  );
}

async function setInterviewCompleted(merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;
  await pool.execute(
    `UPDATE merchants SET onboarding_completed = 1, onboarding_completed_at = NOW() WHERE id = ?`,
    [merchantId],
  );
}

// ═══════════════════════════════════════════════════════════════
// Core Logic
// ═══════════════════════════════════════════════════════════════

function getApplicableQuestions(businessType: BusinessType): OnboardingQuestion[] {
  return QUESTION_BANK.filter(q => {
    const a = q.applies;
    if (a === 'all') return true;
    if (!businessType) return q.phase <= 1; // Before we know type, only phase 1
    if (businessType === 'both') return true; // Both → all questions
    // store merchants see 'store' and 'both' questions
    if (businessType === 'store') return a === 'store' || a === 'both';
    // services merchants see 'services' and 'both' questions
    if (businessType === 'services') return a === 'services' || a === 'both';
    return false;
  });
}

/**
 * Check if onboarding interview is active for this merchant
 */
export async function isOnboardingActive(merchantId: number): Promise<boolean> {
  try {
    const merchant = await getMerchantById(merchantId);
    if (!merchant) return false;
    // Interview is active if not completed AND step > 0 (started)
    const completed = (merchant as any).onboardingCompleted === 1;
    const step = (merchant as any).onboardingStep || 0;
    return !completed && step > 0;
  } catch {
    return false;
  }
}

/**
 * Check if merchant needs onboarding (never started)
 */
export async function needsOnboarding(merchantId: number): Promise<boolean> {
  try {
    const merchant = await getMerchantById(merchantId);
    if (!merchant) return false;
    return (merchant as any).onboardingCompleted !== 1 && ((merchant as any).onboardingStep || 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Get the next question for the merchant
 */
export async function getNextQuestion(merchantId: number): Promise<{
  question: OnboardingQuestion;
  questionNumber: number;
  totalQuestions: number;
  phase: number;
} | null> {
  const answers = await getAnswers(merchantId);
  const businessType = (answers['businessType'] as BusinessType) || null;
  const resolvedType = businessType
    ? (BUSINESS_TYPE_MAP[businessType.toLowerCase()] || businessType as BusinessType)
    : null;
  const applicable = getApplicableQuestions(resolvedType);

  let idx = 0;
  for (const q of applicable) {
    idx++;
    if (!answers[q.key]) {
      return {
        question: q,
        questionNumber: idx,
        totalQuestions: applicable.length,
        phase: q.phase,
      };
    }
  }
  return null; // All answered
}

/**
 * Start the onboarding interview — sends the welcome + first question
 */
export async function startOnboardingInterview(merchantId: number): Promise<string> {
  await ready();
  await setInterviewStep(merchantId, 1);

  const merchant = await getMerchantById(merchantId);
  const name = merchant?.businessName || 'صاحب النشاط';

  const next = await getNextQuestion(merchantId);
  if (!next) return '';

  return `مرحباً ${name}! 🎉

أنا ساري، مساعدك الذكي. عشان أقدر أخدم عملائك بأفضل شكل ممكن، أحتاج أعرف شوية معلومات عن نشاطك.

📋 عندي ${next.totalQuestions} سؤال بسيط — تقدر تجاوب الحين أو ترسل "لاحقاً" وتكمل بأي وقت.

━━━━━━━━━━━━━━━━
❓ السؤال ${next.questionNumber} من ${next.totalQuestions}:

${next.question}`;
}

/**
 * Handle a reply from the merchant during the interview
 */
export async function handleOnboardingReply(merchantId: number, message: string): Promise<{
  handled: boolean;
  response: string;
}> {
  const text = message.trim();
  if (!text) return { handled: false, response: '' };

  // Check for pause/skip
  if (PAUSE_PATTERNS.some(p => p.test(text))) {
    return {
      handled: true,
      response: `تمام! 👍 نكمل بعدين. أرسل "أكمل المقابلة" أو "متابعة" بأي وقت وأكمل معك من وين وقفنا.`,
    };
  }

  // Check for resume command
  if (/^(أكمل|اكمل|متابعة|كمل|continue|resume)/i.test(text)) {
    const next = await getNextQuestion(merchantId);
    if (!next) {
      await setInterviewCompleted(merchantId);
      return { handled: true, response: getCompletionMessage() };
    }
    return {
      handled: true,
      response: `أهلاً! نكمل من وين وقفنا 😊\n\n❓ السؤال ${next.questionNumber} من ${next.totalQuestions}:\n\n${next.question}`,
    };
  }

  // Find current question (first unanswered)
  const nextBefore = await getNextQuestion(merchantId);
  if (!nextBefore) {
    await setInterviewCompleted(merchantId);
    return { handled: true, response: getCompletionMessage() };
  }

  // Special handling for businessType question
  let answer = text;
  if (nextBefore.question.key === 'businessType') {
    const mapped = BUSINESS_TYPE_MAP[text.toLowerCase().trim()];
    if (mapped) answer = mapped;
  }

  // Save the answer
  await saveAnswer(merchantId, nextBefore.question.key, nextBefore.question.question, answer, nextBefore.question.phase);
  await setInterviewStep(merchantId, (nextBefore.questionNumber || 0) + 1);

  // Get next question
  const nextAfter = await getNextQuestion(merchantId);
  if (!nextAfter) {
    await setInterviewCompleted(merchantId);
    return { handled: true, response: `✅ تم حفظ إجابتك.\n\n${getCompletionMessage()}` };
  }

  // Phase transition message
  let phaseMsg = '';
  if (nextBefore.phase !== nextAfter.phase) {
    const phaseNames: Record<number, string> = {
      1: '📌 الأساسيات', 2: '📞 التواصل وساعات العمل', 3: '🛍️ المنتجات والخدمات',
      4: '💳 الدفع والتوصيل', 5: '🎯 تفاصيل الخدمات', 6: '⭐ السياسات والمميزات',
    };
    phaseMsg = `\n━━━━━━━━━━━━━━━━\n📂 القسم التالي: ${phaseNames[nextAfter.phase] || ''}\n`;
  }

  return {
    handled: true,
    response: `✅ تم!${phaseMsg}\n\n❓ السؤال ${nextAfter.questionNumber} من ${nextAfter.totalQuestions}:\n\n${nextAfter.question.question}`,
  };
}

function getCompletionMessage(): string {
  return `🎉 ممتاز! خلصنا كل الأسئلة!

الحين أنا جاهز أخدم عملائك بمعلومات دقيقة وصحيحة 💪

📌 لو تبي تعدل أي معلومة لاحقاً، أرسل:
"تحديث [اسم المعلومة]: [القيمة الجديدة]"
مثال: "تحديث العنوان: حي النرجس، الرياض"`;
}

// ═══════════════════════════════════════════════════════════════
// Update Command Handler
// ═══════════════════════════════════════════════════════════════

const UPDATE_KEY_MAP: Record<string, string> = {
  'العنوان': 'address', 'الموقع': 'address', 'الفرع': 'address',
  'ساعات العمل': 'workingHours', 'الدوام': 'workingHours', 'أوقات العمل': 'workingHours',
  'الإيميل': 'contactEmail', 'الايميل': 'contactEmail', 'البريد': 'contactEmail',
  'رقم التواصل': 'contactPhone', 'الرقم': 'contactPhone', 'الجوال': 'contactPhone',
  'طرق الدفع': 'paymentMethods', 'الدفع': 'paymentMethods',
  'التوصيل': 'shippingInfo', 'الشحن': 'shippingInfo',
  'الاسترجاع': 'returnPolicy', 'الاستبدال': 'returnPolicy',
  'العروض': 'currentOffers', 'الخصومات': 'currentOffers',
  'الوصف': 'businessDescription', 'وصف النشاط': 'businessDescription',
  'الميزة': 'uniqueAdvantage', 'المميزات': 'uniqueAdvantage',
};

export async function handleUpdateCommand(merchantId: number, message: string): Promise<{
  handled: boolean;
  response: string;
}> {
  const match = message.match(/^تحديث\s+([^:]+):\s*(.+)/);
  if (!match) return { handled: false, response: '' };

  const fieldName = match[1].trim();
  const newValue = match[2].trim();
  const key = UPDATE_KEY_MAP[fieldName];

  if (!key) {
    return {
      handled: true,
      response: `❌ ما تعرفت على "${fieldName}". الحقول المتاحة:\n${Object.keys(UPDATE_KEY_MAP).join('، ')}`,
    };
  }

  await saveAnswer(merchantId, key, `تحديث: ${fieldName}`, newValue, 0);
  return {
    handled: true,
    response: `✅ تم تحديث ${fieldName} بنجاح!`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Context Builder — for AI prompt injection
// ═══════════════════════════════════════════════════════════════

const FIELD_LABELS: Record<string, string> = {
  businessNameFull: 'النشاط', businessDescription: 'الوصف', industry: 'المجال',
  businessType: 'النوع', address: 'العنوان', branches: 'الفروع',
  workingHours: 'ساعات العمل', contactPhone: 'رقم التواصل',
  contactEmail: 'الإيميل', socialMedia: 'السوشل ميديا', websiteUrl: 'الموقع',
  topProducts: 'أبرز المنتجات/الخدمات', bestSeller: 'الأكثر طلباً',
  priceRange: 'نطاق الأسعار', currentOffers: 'العروض الحالية',
  paymentMethods: 'طرق الدفع', shippingInfo: 'التوصيل', shippingDuration: 'مدة التوصيل',
  returnPolicy: 'الاسترجاع/الاستبدال', minimumOrder: 'الحد الأدنى للطلب',
  bookingInfo: 'الحجز', serviceDuration: 'مدة الخدمة',
  subscriptionInfo: 'الاشتراكات/الباقات', certifications: 'الشهادات/الاعتمادات',
  prerequisites: 'متطلبات التسجيل',
  uniqueAdvantage: 'ما يميزنا', warranty: 'الضمان/الكفالة',
  commonFAQ: 'أكثر سؤال شائع', commonFAQAnswer: 'جواب السؤال الشائع',
  botInstructions: 'تعليمات خاصة للبوت',
};

/**
 * Build formatted context string from onboarding answers.
 * This is injected into sari-personality.ts as highest-priority context.
 */
export async function buildOnboardingContext(merchantId: number): Promise<string | null> {
  try {
    const answers = await getAnswers(merchantId);
    const keys = Object.keys(answers);
    if (keys.length === 0) return null;

    const lines: string[] = [];
    for (const [key, value] of Object.entries(answers)) {
      const label = FIELD_LABELS[key] || key;
      if (value && value !== 'لا' && value !== 'مافيه' && value !== 'لا يوجد') {
        lines.push(`- ${label}: ${value}`);
      }
    }

    if (lines.length === 0) return null;

    // Special: bot instructions go as a separate directive
    const instructions = answers['botInstructions'];
    let result = lines.filter(l => !l.includes('تعليمات خاصة للبوت')).join('\n');

    if (instructions && instructions !== 'لا' && instructions !== 'مافيه') {
      result += `\n\n⚠️ تعليمات خاصة من التاجر: ${instructions}`;
    }

    return result;
  } catch (err) {
    console.warn('[Onboarding] buildOnboardingContext failed:', err);
    return null;
  }
}
