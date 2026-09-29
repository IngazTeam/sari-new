export type BusinessType = "store" | "services" | "both" | null;
type AppliesTo = "all" | "store" | "services" | "both";

export interface OnboardingQuestion {
  phase: number;
  key: string;
  question: string;
  applies: AppliesTo;
  followUp?: string; // optional clarification hint
}

// ═══════════════════════════════════════════════════════════════
// Question Bank — 25+ questions organized by phase
// ═══════════════════════════════════════════════════════════════

export const QUESTION_BANK: OnboardingQuestion[] = [
  // ── Phase 1: Basics (all) ──
  {
    phase: 1,
    key: "businessType",
    applies: "all",
    question:
      "وش نوع نشاطك؟\n\n1️⃣ متجر (بيع منتجات)\n2️⃣ خدمات (تدريب، استشارات، صيانة..)\n3️⃣ كلاهما\n\nأرسل الرقم أو الاسم",
  },
  {
    phase: 1,
    key: "businessNameFull",
    applies: "all",
    question: "وش الاسم الكامل لنشاطك التجاري؟ (مثل: مركز إنجاز للتدريب)",
  },
  {
    phase: 1,
    key: "businessDescription",
    applies: "all",
    question: "وصف نشاطك بسطر أو سطرين — وش تقدمون بالضبط؟",
  },
  {
    phase: 1,
    key: "industry",
    applies: "all",
    question:
      "وش المجال أو الصناعة؟ (مثل: أزياء، إلكترونيات، تدريب، مطاعم، عقارات..)",
  },
  {
    phase: 1,
    key: "address",
    applies: "all",
    question:
      'وين موقعكم / عنوان الفرع الرئيسي؟\n(أو أرسل "أونلاين" لو ما عندكم موقع فعلي)',
  },
  {
    phase: 1,
    key: "branches",
    applies: "all",
    question: 'كم عندكم فرع؟ وين؟\n(أو "فرع واحد" أو "أونلاين فقط")',
  },

  // ── Phase 2: Contact & Hours (all) ──
  {
    phase: 2,
    key: "workingHours",
    applies: "all",
    question: 'ايش ساعات العمل عندكم؟\n(مثل: "9ص - 10م كل يوم ماعدا الجمعة")',
  },
  {
    phase: 2,
    key: "contactPhone",
    applies: "all",
    question:
      'هل فيه رقم تواصل ثاني غير الواتساب؟\n(أو "لا" لو هذا الرقم الوحيد)',
  },
  {
    phase: 2,
    key: "contactEmail",
    applies: "all",
    question: 'ايش الإيميل الرسمي للتواصل؟\n(أو "مافيه" لو ما عندكم)',
  },
  {
    phase: 2,
    key: "socialMedia",
    applies: "all",
    question:
      "ايش حساباتكم بالسوشل ميديا؟\n(انستقرام، تويتر، سناب.. أرسل الروابط أو أسماء الحسابات)",
  },
  {
    phase: 2,
    key: "websiteUrl",
    applies: "all",
    question: 'هل عندكم موقع إلكتروني؟\n(أرسل الرابط أو "لا")',
  },

  // ── Phase 3: Products & Services (all) ──
  {
    phase: 3,
    key: "topProducts",
    applies: "all",
    question: "ايش أبرز المنتجات أو الخدمات عندكم؟ (أهم 3 إلى 5)",
  },
  {
    phase: 3,
    key: "bestSeller",
    applies: "all",
    question: "ايش أكثر منتج أو خدمة مطلوبة عندكم؟",
  },
  {
    phase: 3,
    key: "priceRange",
    applies: "all",
    question: "ايش نطاق الأسعار عندكم تقريباً؟ (من كم لكم)",
  },
  {
    phase: 3,
    key: "currentOffers",
    applies: "all",
    question: 'هل عندكم عروض أو خصومات حالياً؟\n(أو "لا يوجد حالياً")',
  },

  // ── Phase 4: Payment & Shipping (store/both only) ──
  {
    phase: 4,
    key: "paymentMethods",
    applies: "store",
    question:
      "ايش طرق الدفع المتاحة عندكم؟\n(تحويل بنكي، فيزا، مدى، كاش، تابي، تمارا..)",
  },
  {
    phase: 4,
    key: "shippingInfo",
    applies: "store",
    question:
      'هل عندكم توصيل؟ كم تكلفته؟\n(مثل: "توصيل مجاني فوق 200 ريال" أو "30 ريال لكل المناطق")',
  },
  {
    phase: 4,
    key: "shippingDuration",
    applies: "store",
    question:
      'كم مدة التوصيل المتوقعة؟\n(مثل: "1-3 أيام داخل الرياض، 3-5 أيام لباقي المناطق")',
  },
  {
    phase: 4,
    key: "returnPolicy",
    applies: "store",
    question: "ايش سياسة الاسترجاع أو الاستبدال عندكم؟",
  },
  {
    phase: 4,
    key: "minimumOrder",
    applies: "store",
    question: 'هل فيه حد أدنى للطلب؟\n(أو "لا يوجد")',
  },

  // ── Phase 5: Services-specific (services/both only) ──
  {
    phase: 5,
    key: "bookingInfo",
    applies: "services",
    question: "هل الحجز مطلوب مسبقاً؟ وكيف يحجز العميل؟",
  },
  {
    phase: 5,
    key: "serviceDuration",
    applies: "services",
    question: "كم مدة الخدمة أو الجلسة عادةً؟",
  },
  {
    phase: 5,
    key: "subscriptionInfo",
    applies: "services",
    question:
      'هل عندكم اشتراكات أو باقات؟\n(مثل: "باقة شهرية 500 ريال" أو "لا")',
  },
  {
    phase: 5,
    key: "certifications",
    applies: "services",
    question: 'هل تقدمون شهادات أو اعتمادات؟\n(أو "لا")',
  },
  {
    phase: 5,
    key: "prerequisites",
    applies: "services",
    question:
      'هل فيه متطلبات مسبقة للتسجيل أو الاستفادة من الخدمة؟\n(أو "لا يوجد")',
  },

  // ── Phase 6: Policies & Differentiators (all) ──
  {
    phase: 6,
    key: "uniqueAdvantage",
    applies: "all",
    question: "ايش يميزكم عن المنافسين؟ (ميزة أو اثنتين)",
  },
  {
    phase: 6,
    key: "warranty",
    applies: "all",
    question: 'هل فيه ضمان أو كفالة على منتجاتكم/خدماتكم؟\n(أو "لا يوجد")',
  },
  {
    phase: 6,
    key: "commonFAQ",
    applies: "all",
    question: "ايش أكثر سؤال يسألونه العملاء عادةً؟",
  },
  {
    phase: 6,
    key: "commonFAQAnswer",
    applies: "all",
    question: "وش الجواب عليه؟",
  },
  {
    phase: 6,
    key: "botInstructions",
    applies: "all",
    question:
      'فيه شي تبي البوت يعرفه أو يتجنبه؟\n(مثل: "لا تذكر أسعار قديمة" أو "لا تقارن بمنافسين")',
  },
];

// ═══════════════════════════════════════════════════════════════

export const FIELD_LABELS: Record<string, string> = {
  businessNameFull: "النشاط",
  businessDescription: "الوصف",
  industry: "المجال",
  businessType: "النوع",
  address: "العنوان",
  branches: "الفروع",
  workingHours: "ساعات العمل",
  contactPhone: "رقم التواصل",
  contactEmail: "الإيميل",
  socialMedia: "السوشل ميديا",
  websiteUrl: "الموقع",
  topProducts: "أبرز المنتجات/الخدمات",
  bestSeller: "الأكثر طلباً",
  priceRange: "نطاق الأسعار",
  currentOffers: "العروض الحالية",
  paymentMethods: "طرق الدفع",
  shippingInfo: "التوصيل",
  shippingDuration: "مدة التوصيل",
  returnPolicy: "الاسترجاع/الاستبدال",
  minimumOrder: "الحد الأدنى للطلب",
  bookingInfo: "الحجز",
  serviceDuration: "مدة الخدمة",
  subscriptionInfo: "الاشتراكات/الباقات",
  certifications: "الشهادات/الاعتمادات",
  prerequisites: "متطلبات التسجيل",
  uniqueAdvantage: "ما يميزنا",
  warranty: "الضمان/الكفالة",
  commonFAQ: "أكثر سؤال شائع",
  commonFAQAnswer: "جواب السؤال الشائع",
  botInstructions: "تعليمات خاصة للبوت",
};

export function nextOnboardingQuestion(answers: Record<string, string>) {
  const type = answers.businessType;
  const applicable = QUESTION_BANK.filter(
    q => q.applies === "all" || type === "both" || q.applies === type
  );
  const index = applicable.findIndex(q => !answers[q.key]);
  return index < 0
    ? null
    : {
        question: applicable[index],
        questionNumber: index + 1,
        totalQuestions: applicable.length,
        phase: applicable[index].phase,
      };
}
export function onboardingPrompt(answers: Record<string, string>) {
  const next = nextOnboardingQuestion(answers);
  return next
    ? "لنكمل معلومات نشاطك. يمكنك طلب التوقف أو الاستئناف في أي وقت.\n\nالسؤال " +
        next.questionNumber +
        " من " +
        next.totalQuestions +
        ":\n" +
        next.question.question +
        "\n\nاستخدم «الرد» على هذه الرسالة لإرسال الإجابة وحفظها للسؤال الصحيح."
    : "";
}
