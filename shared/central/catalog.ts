import ar from "./content.ar.json";
import en from "./content.en.json";
import helpAr from "./help.ar.json";

export type CentralLanguage = "ar" | "en";
export type CentralPage = {
  kind: string;
  label: string;
  title: string;
  description: string;
  sectionTitle?: string;
  sectionDescription?: string;
  parent?: string;
  sector?: string;
  features?: { icon: string; title: string; text: string }[];
  steps?: string[][];
  faq?: string[][];
  children?: string[];
  sections?: {
    title: string;
    text?: string;
    paragraphs?: string[];
    bullets?: string[];
    id?: string;
  }[];
  date?: string;
  readTime?: string;
  version?: string;
  noindex?: boolean;
};
const special: Record<
  string,
  [string, string, string, string, string, string, string]
> = {
  "/": [
    "home",
    "ساري",
    "Sary",
    "شغلك يكبر.\nوساري معك.",
    "Your business grows.\nSary grows with you.",
    "ساري وكيل مبيعات وخدمة عملاء بالذكاء الاصطناعي على واتساب. يجيب من معلومات نشاطك، يساعد في الطلبات والحجوزات، ويكمل مع فريقك.",
    "Sary is an AI sales and customer service agent for WhatsApp. Answer from your business knowledge, guide orders and bookings, and collaborate with your team.",
  ],
  "/pricing": [
    "pricing",
    "الباقات والأسعار",
    "Plans and pricing",
    "ابدأ بخطوة.\nوكبّرها مع ساري.",
    "Start with a step.\nGrow with Sary.",
    "قارن الباقات والأسعار والحدود الحالية المنشورة في النظام، واختر ما يناسب حجم محادثات نشاطك.",
    "Compare current published plans, prices and limits, and choose the fit for your business conversations.",
  ],
  "/try-sari": [
    "demo",
    "جرّب ساري",
    "Try Sary",
    "خلّك العميل.\nوشاهد كيف تكمل الرحلة.",
    "Be the customer.\nSee where the conversation goes.",
    "جرّب أمثلة تفاعلية لمحادثات متجر ومركز تدريب وخدمات، ثم ابدأ إعداد ساري بمعلومات نشاطك.",
    "Explore interactive examples for a store, training centre and service business, then set up Sary with your own business knowledge.",
  ],
  "/sectors": [
    "sectors",
    "القطاعات",
    "Industries",
    "شغلك له طريقته.\nوساري يفهمها.",
    "Your business has its own rhythm.\nSary follows it.",
    "استكشف استخدامات ساري للعيادات والمطاعم والصالونات ومراكز التدريب والعقارات والاستشارات.",
    "Explore Sary for clinics, restaurants, salons, training centres, real estate and professional services.",
  ],
  "/products": [
    "catalog",
    "المنتجات والخدمات",
    "Products and services",
    "معلوماتك أوضح.\nواختيار عميلك أسهل.",
    "Clearer information.\nEasier choices.",
    "نظّم معلومات منتجاتك وخدماتك وأسعارك في ساري، أو اربط أدوات نشاطك لتوفير إجابات مرتبطة بالبيانات المتاحة.",
    "Organise product, service and pricing information in Sary, or connect your business tools to support answers from available data.",
  ],
  "/resources/blog": [
    "blog",
    "مدونة ساري",
    "Sary journal",
    "أفكار تستاهل وقتك.\nوخطوة تطوّر شغلك.",
    "Ideas worth your time.\nA step forward for your business.",
    "أدلة عملية لتحسين محادثات واتساب والمبيعات وخدمة العملاء والتكاملات مع ساري.",
    "Practical guides to WhatsApp conversations, sales, customer service and integrations with Sary.",
  ],
  "/resources/help-center": [
    "help",
    "مركز المساعدة",
    "Help centre",
    "كل سؤال،\nله بداية واضحة.",
    "Every question\nhas a starting point.",
    "إجابات عن إعداد ساري وربط واتساب والمحادثات والحملات والاشتراك، مع أدلة للخطوات التالية.",
    "Find answers about Sary setup, WhatsApp connections, conversations, campaigns and subscriptions, with guides to the next step.",
  ],
  "/resources/success-stories": [
    "stories",
    "استخدامات ساري",
    "Sary in practice",
    "نفس الذكاء.\nوحكايات شغل مختلفة.",
    "The same intelligence.\nDifferent business stories.",
    "سيناريوهات توضيحية تشرح رحلة العميل في المتاجر ومراكز التدريب والخدمات مع ساري.",
    "Illustrative scenarios showing customer journeys for stores, training centres and service businesses with Sary.",
  ],
  "/company/about": [
    "about",
    "عن ساري",
    "About Sary",
    "التقنية تصير أجمل.\nلما تخلّي للبشر مساحة.",
    "Technology feels better.\nWhen it makes room for people.",
    "تعرّف على ساري: منصة تجمع معلومات نشاطك ومحادثات عملائك لمساعدة فريقك على البيع والخدمة بوضوح واهتمام.",
    "Meet Sary: a platform that connects business knowledge and customer conversations to help teams sell and serve with clarity and care.",
  ],
  "/company/contact": [
    "contact",
    "تواصل معنا",
    "Contact us",
    "طموحك يبدأ بحوار.\nونحن نسمعك.",
    "Your ambition starts a conversation.\nWe are listening.",
    "تواصل مع فريق ساري لمناقشة احتياجات نشاطك والقطاعات والتكاملات والباقات المناسبة.",
    "Contact Sary to discuss your business needs, industry workflows, integrations and available plans.",
  ],
  "/support": [
    "contact",
    "دعم ساري",
    "Sary support",
    "خلّنا نكمّل\nالخطوة معك.",
    "Let us help\nwith your next step.",
    "افتح طلب دعم موثق لفريق ساري وتابع حالة الخدمة أو ابحث عن إجابتك في مركز المساعدة.",
    "Submit a tracked support request to Sary, check service status or find an answer in the help centre.",
  ],
  "/login": [
    "auth",
    "تسجيل الدخول",
    "Sign in",
    "شغلك ينتظرك.",
    "Your business is waiting.",
    "ادخل لحسابك، وكمّل يومك مع ساري.",
    "Sign in and continue your day with Sary.",
  ],
  "/signup": [
    "auth",
    "إنشاء حساب",
    "Create an account",
    "كل بداية كبيرة.\nتبدأ بخطوة.",
    "Every big beginning\nstarts with one step.",
    "أنشئ حسابك، ثم جهّز نشاطك وقناة واتساب.",
    "Create your account, then set up your business and WhatsApp channel.",
  ],
  "/forgot-password": [
    "auth",
    "استعادة كلمة المرور",
    "Password recovery",
    "نسيت كلمة المرور؟",
    "Forgot your password?",
    "اكتب بريد حسابك لنبدأ خطوة الاستعادة.",
    "Enter your account email to start password recovery.",
  ],
  "/reset-password": [
    "auth",
    "كلمة مرور جديدة",
    "New password",
    "صفحة جديدة.\nوكلمة مرور جديدة.",
    "A fresh start.\nA new password.",
    "استخدم رابط الاستعادة لتعيين كلمة مرور قوية لحسابك.",
    "Use your recovery link to set a strong password for your account.",
  ],
  "/verify-email": [
    "auth",
    "تأكيد البريد",
    "Verify your email",
    "خطوة تؤكد\nبدايتك.",
    "One step to confirm\nyour beginning.",
    "استخدم الرابط الذي وصلك للتحقق من بريد حسابك.",
    "Use the link sent to you to verify your account email.",
  ],
  "/accept-invite": [
    "auth",
    "دعوة الفريق",
    "Team invitation",
    "شغل أجمل.\nلما نكمله مع بعض.",
    "Better work.\nWhen we do it together.",
    "راجع دعوة المتجر واقبلها بالحساب الذي استلمها.",
    "Review the store invitation and accept it with the account that received it.",
  ],
  "/subscribe": [
    "checkout",
    "الاشتراك",
    "Subscription",
    "خطتك واضحة.\nوخطوتك محسوبة.",
    "A clear plan.\nA considered next step.",
    "راجع باقتك ودورة الفوترة قبل المتابعة إلى بوابة الدفع.",
    "Review your plan and billing period before continuing to the payment provider.",
  ],
  "/pay": [
    "checkout",
    "دفع الطلب",
    "Order payment",
    "تفاصيل واضحة.\nقبل الخطوة التالية.",
    "Clear details.\nBefore the next step.",
    "راجع تفاصيل طلب المتجر قبل المتابعة إلى بوابة الدفع.",
    "Review the store’s payment request before continuing to the payment provider.",
  ],
  "/payment/callback": [
    "payment",
    "حالة الاشتراك",
    "Subscription status",
    "نتابع خطوتك.",
    "Following your next step.",
    "نعرض حالة العملية المؤكدة من النظام.",
    "We show the transaction status confirmed by the platform.",
  ],
  "/payment/return": [
    "payment",
    "حالة الدفع",
    "Payment status",
    "نتابع خطوتك.",
    "Following your next step.",
    "نعرض حالة العملية المؤكدة من النظام.",
    "We show the transaction status confirmed by the platform.",
  ],
};
export const centralCatalog: Record<
  CentralLanguage,
  Record<string, CentralPage>
> = {
  ar: ar as Record<string, CentralPage>,
  en: en as Record<string, CentralPage>,
};
for (const [
  path,
  [kind, arLabel, enLabel, arTitle, enTitle, arDesc, enDesc],
] of Object.entries(special)) {
  centralCatalog.ar[path] = {
    kind,
    label: arLabel,
    title: arTitle,
    description: arDesc,
    noindex: ["auth", "checkout", "payment"].includes(kind),
  };
  centralCatalog.en[path] = {
    kind,
    label: enLabel,
    title: enTitle,
    description: enDesc,
    noindex: ["auth", "checkout", "payment"].includes(kind),
  };
}
export const CENTRAL_PATHS = Object.keys(centralCatalog.ar);
export const CENTRAL_INDEXABLE_PATHS = CENTRAL_PATHS.filter(
  p => !centralCatalog.ar[p].noindex
);
export const CENTRAL_ORIGIN = "https://sary.live";
export function centralLanguage(search: string): CentralLanguage {
  return new URLSearchParams(search).get("lang") === "en" ? "en" : "ar";
}
export function centralPath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}
export function getCentralPage(
  path: string,
  lang: CentralLanguage
): CentralPage | undefined {
  const clean = centralPath(path);
  const key = /^\/reset-password\/[^/]+$/.test(clean)
    ? "/reset-password"
    : /^\/subscribe\/[^/]+$/.test(clean)
      ? "/subscribe"
      : /^\/pay\/[^/]+\/status$/.test(clean)
        ? "/payment/return"
        : /^\/pay\/[^/]+$/.test(clean)
          ? "/pay"
          : clean;
  return centralCatalog[lang][key];
}
export function centralHref(path: string, lang: CentralLanguage): string {
  const url = new URL(path, CENTRAL_ORIGIN);
  url.searchParams.delete("lang");
  if (lang === "en") url.searchParams.set("lang", "en");
  return url.pathname + url.search + url.hash;
}
export const helpEn = [
  {
    category: "Getting started",
    questions: [
      {
        q: "How do I start with Sary?",
        a: "Create an account, add business knowledge and connect the supported tools you use. Test a complete customer journey before expanding usage.",
      },
      {
        q: "Do I need technical experience?",
        a: "Start with account settings and business information. Contact support for a workflow that needs additional setup.",
      },
      {
        q: "What information should I prepare?",
        a: "Prepare products, services, current prices, opening hours, policies and instructions for situations that need a teammate.",
      },
    ],
  },
  {
    category: "Connecting WhatsApp",
    questions: [
      {
        q: "How do I connect WhatsApp?",
        a: "Follow the connection steps available in your account. Confirm the channel status and test sending and receiving before starting.",
      },
      {
        q: "Can I use my personal number?",
        a: "Check the supported channel requirements before connecting a number. A dedicated business number can help your team organise customer communication.",
      },
      {
        q: "What if the connection stops?",
        a: "Review the channel status and connection instructions. If the problem continues, contact support with a description of the issue.",
      },
    ],
  },
  {
    category: "Conversations",
    questions: [
      {
        q: "How does the AI reply?",
        a: "It uses your business knowledge and instructions to understand the request and help the customer with the next step.",
      },
      {
        q: "Can I customise the tone?",
        a: "Set the business information, preferred tone and handover instructions, then test typical customer questions.",
      },
      {
        q: "Are voice messages supported?",
        a: "Sary can process voice requests where the channel and service support them. Confirm ambiguous details before proceeding.",
      },
    ],
  },
  {
    category: "Marketing campaigns",
    questions: [
      {
        q: "How do I create a campaign?",
        a: "Choose an appropriate audience, write a clear message and review the timing and necessary permissions before sending through your account.",
      },
      {
        q: "How many messages can I send?",
        a: "Use the current plan and channel limits shown in your account. Availability also depends on provider requirements and connection status.",
      },
      {
        q: "Can I schedule a campaign?",
        a: "Use the scheduling options available in your campaign settings and review the result after the scheduled time.",
      },
    ],
  },
  {
    category: "Billing and payment",
    questions: [
      {
        q: "Which payment methods are available?",
        a: "The enabled payment provider shows the available methods when you continue to checkout. Review the amount and terms before proceeding.",
      },
      {
        q: "Can I change my plan?",
        a: "Review current plans and the subscription options in your account. The checkout displays the applicable amount and billing period.",
      },
      {
        q: "What happens at the usage limit?",
        a: "Check current usage and plan limits in your account. Contact support or choose an available plan that fits your needs.",
      },
    ],
  },
  {
    category: "Business settings",
    questions: [
      {
        q: "How do I add my products?",
        a: "Add products in your account or use data from an enabled store integration. Review names, prices, specifications and availability.",
      },
      {
        q: "Can I connect more than one number?",
        a: "Review the channel and account options available to your plan, then confirm each supported connection before use.",
      },
      {
        q: "How do I review performance?",
        a: "Use your account’s available conversation, order and campaign reports. Read the context behind a metric before deciding what to change.",
      },
    ],
  },
];
export function centralHelp(lang: CentralLanguage) {
  return lang === "ar" ? helpAr : helpEn;
}
