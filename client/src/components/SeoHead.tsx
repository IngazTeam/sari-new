import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface SeoHeadProps {
  title: string;
  description: string;
  keywords?: string;
  author?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogLocale?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterCardType?: string;
  structuredData?: any;
  noindex?: boolean;
}

const BASE_URL = 'https://sary.live';

export function SeoHead({
  title,
  description,
  keywords,
  author = "ساري | Sari",
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogImage = `${BASE_URL}/og-image.png`,
  ogType = "website",
  ogLocale,
  twitterTitle,
  twitterDescription,
  twitterImage,
  twitterCardType = "summary_large_image",
  structuredData,
  noindex = false,
}: SeoHeadProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'ar';
  const isArabic = currentLang === 'ar';
  const resolvedLocale = ogLocale || (isArabic ? "ar_SA" : "en_US");
  const alternateLocale = isArabic ? "en_US" : "ar_SA";

  useEffect(() => {
    // Update html dir and lang
    document.documentElement.lang = currentLang;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';

    // Set page title
    document.title = title;

    // Build meta tags array
    const metaTags: { name?: string; property?: string; content: string }[] = [
      { name: "description", content: description },
      { name: "author", content: author },
      { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
      // Open Graph
      { property: "og:title", content: ogTitle || title },
      { property: "og:description", content: ogDescription || description },
      { property: "og:type", content: ogType },
      { property: "og:image", content: ogImage },
      { property: "og:url", content: canonicalUrl || window.location.href },
      { property: "og:site_name", content: "ساري | Sari" },
      { property: "og:locale", content: resolvedLocale },
      { property: "og:locale:alternate", content: alternateLocale },
      // Twitter Card
      { name: "twitter:card", content: twitterCardType },
      { name: "twitter:title", content: twitterTitle || ogTitle || title },
      { name: "twitter:description", content: twitterDescription || ogDescription || description },
      { name: "twitter:image", content: twitterImage || ogImage },
    ];

    // Add keywords only if provided
    if (keywords) {
      metaTags.push({ name: "keywords", content: keywords });
    }

    // Remove existing managed meta tags
    document.querySelectorAll(
      'meta[name="description"], meta[name="keywords"], meta[name="author"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"]'
    ).forEach(tag => tag.remove());

    // Add new meta tags
    metaTags.forEach(({ name, property, content }) => {
      if (!content) return;
      const meta = document.createElement("meta");
      if (name) meta.setAttribute("name", name);
      if (property) meta.setAttribute("property", property);
      meta.setAttribute("content", content);
      document.head.appendChild(meta);
    });

    // Set canonical URL (strip query params to avoid duplicate content)
    const resolvedCanonical = canonicalUrl || window.location.href.split('?')[0];
    let canonicalLink = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = resolvedCanonical;

    // Update hreflang tags
    document.querySelectorAll("link[hreflang]").forEach(tag => tag.remove());
    const hreflangs = [
      { lang: 'ar', href: resolvedCanonical },
      { lang: 'en', href: `${resolvedCanonical}${resolvedCanonical.includes('?') ? '&' : '?'}lang=en` },
      { lang: 'x-default', href: resolvedCanonical },
    ];
    hreflangs.forEach(({ lang, href }) => {
      const link = document.createElement("link");
      link.rel = "alternate";
      link.setAttribute("hreflang", lang);
      link.href = href;
      document.head.appendChild(link);
    });

    // Add structured data
    if (structuredData) {
      // Remove old LD+JSON to prevent stacking
      document.querySelectorAll("script[type='application/ld+json'][data-seo-head]").forEach(s => s.remove());
      const scriptTag = document.createElement("script");
      scriptTag.type = "application/ld+json";
      scriptTag.setAttribute("data-seo-head", "true");
      scriptTag.textContent = JSON.stringify(structuredData);
      document.head.appendChild(scriptTag);
    }

    return () => {
      // Cleanup managed LD+JSON on unmount
      document.querySelectorAll("script[type='application/ld+json'][data-seo-head]").forEach(s => s.remove());
    };
  }, [title, description, keywords, author, canonicalUrl, ogTitle, ogDescription, ogImage, ogType, resolvedLocale, alternateLocale, twitterTitle, twitterDescription, twitterImage, twitterCardType, structuredData, noindex, currentLang, isArabic]);

  return null;
}

// ─── Bilingual SEO Hook ─────────────────────────────
// Returns language-aware SEO config for a given page key
export function useSeoConfig(pageKey: keyof typeof seoConfigsAr) {
  const { i18n } = useTranslation();
  const isArabic = (i18n.language || 'ar') === 'ar';
  const configs = isArabic ? seoConfigsAr : seoConfigsEn;
  return configs[pageKey] || configs.home;
}

// ─── Arabic SEO Configurations ─────────────────────────────
const seoConfigsAr = {
  home: {
    title: "ساري - وكيل مبيعات ذكي بالذكاء الاصطناعي للواتساب | Sari AI",
    description: "ساري منصة ذكاء اصطناعي تُدير مبيعاتك عبر واتساب تلقائياً. رد ذكي، طلبات تلقائية، سلات متروكة، تتبع شحنات، وتقارير متقدمة.",
    keywords: "واتساب بوت, ذكاء اصطناعي, أتمتة مبيعات, شات بوت واتساب, WhatsApp AI, مبيعات واتساب, سلة, زد, ووكومرس, تسويق واتساب",
    canonicalUrl: `${BASE_URL}/`,
    ogImage: `${BASE_URL}/og-image.png`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "ما هو ساري؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ساري هو وكيل مبيعات ذكي يعمل بالذكاء الاصطناعي عبر واتساب. يرد على العملاء تلقائياً، يعالج الطلبات، يستعيد السلات المتروكة، ويرسل حملات تسويقية."
          }
        },
        {
          "@type": "Question",
          "name": "كيف يعمل ساري مع متجري الإلكتروني؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "ساري يتكامل مباشرة مع سلة وزد وووكومرس. يسحب منتجاتك تلقائياً ويستخدمها في المحادثات مع العملاء عبر واتساب."
          }
        },
        {
          "@type": "Question",
          "name": "هل توجد فترة تجريبية؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "نعم، يبدأ الحساب الجديد بفترة تجريبية مدتها 7 أيام. بعد ذلك تظهر الباقات والأسعار والحدود الحالية في صفحة التسعير."
          }
        }
      ]
    },
  },
  pricing: {
    title: "الأسعار والباقات | ساري - وكيل مبيعات ذكي",
    description: "اختر الباقة المناسبة لمتجرك من الأسعار والحدود الحالية المحمّلة مباشرة من النظام، مع فترة تجريبية مدتها 7 أيام.",
    keywords: "أسعار ساري, باقات واتساب, اشتراك شات بوت, تسعير أتمتة مبيعات",
    canonicalUrl: `${BASE_URL}/pricing`,
  },
  trySari: {
    title: "جرب ساري مجاناً | تجربة وكيل المبيعات الذكي",
    description: "جرب وكيل مبيعات ساري الذكي مباشرة. شاهد كيف يتعامل مع العملاء ويعالج الطلبات عبر واتساب.",
    keywords: "تجربة ساري, تجربة مجانية, شات بوت مجاني, واتساب بوت تجربة",
    canonicalUrl: `${BASE_URL}/try-sari`,
  },
  solutionsSales: {
    title: "حلول المبيعات | ساري - أتمتة مبيعات واتساب",
    description: "حوّل واتساب إلى قناة مبيعات قابلة للتتبع: رد آلي من بيانات متجرك، وطلبات لا تُؤكد قبل حفظها، وتوصيات منتجات بالذكاء الاصطناعي.",
    keywords: "مبيعات واتساب, أتمتة مبيعات, بوت مبيعات, قناة مبيعات واتساب",
    canonicalUrl: `${BASE_URL}/solutions/sales`,
  },
  solutionsMarketing: {
    title: "حلول التسويق | ساري - تسويق واتساب ذكي",
    description: "أطلق حملات تسويقية ذكية عبر واتساب. رسائل مخصصة، حملات مجدولة، وتحليلات متقدمة.",
    keywords: "تسويق واتساب, حملات واتساب, رسائل تسويقية, إعلانات واتساب",
    canonicalUrl: `${BASE_URL}/solutions/marketing`,
  },
  solutionsSupport: {
    title: "حلول الدعم عبر واتساب | ساري",
    description: "وفّر رداً آلياً عبر واتساب من قاعدة معرفة متجرك، مع التحويل إلى موظف بشري عند الحاجة.",
    keywords: "دعم عملاء واتساب, خدمة عملاء ذكية, بوت دعم فني, تحويل لموظف بشري",
    canonicalUrl: `${BASE_URL}/solutions/support`,
  },
  about: {
    title: "عن ساري | قصتنا ورؤيتنا",
    description: "تعرف على ساري — المنصة السعودية لأتمتة المبيعات عبر واتساب بالذكاء الاصطناعي.",
    keywords: "عن ساري, فريق ساري, رؤية ساري",
    canonicalUrl: `${BASE_URL}/company/about`,
  },
  contact: {
    title: "اتصل بنا | ساري",
    description: "تواصل مع فريق ساري للاستفسارات والدعم الفني. نحن هنا لمساعدتك.",
    keywords: "اتصل بساري, دعم فني, تواصل معنا",
    canonicalUrl: `${BASE_URL}/support`,
  },
  support: {
    title: "الدعم وحالة الخدمة | ساري",
    description: "افحص حالة خدمة ساري وافتح طلب دعم موثق أو تواصل عبر بريد الدعم الرسمي.",
    keywords: "دعم ساري, حالة خدمة ساري, تذكرة دعم",
    canonicalUrl: `${BASE_URL}/support`,
  },
  blog: {
    title: "المدونة | ساري - نصائح المبيعات والتسويق",
    description: "اقرأ أحدث المقالات والنصائح حول أتمتة المبيعات والتسويق عبر واتساب.",
    keywords: "مدونة ساري, نصائح مبيعات, تسويق واتساب, مقالات تجارة إلكترونية",
    canonicalUrl: `${BASE_URL}/resources/blog`,
  },
  signup: {
    title: "إنشاء حساب مجاني | ساري",
    description: "أنشئ حسابك في ساري واتبع حالة إعداد المتجر وقناة واتساب والتكاملات حتى تصبح جاهزة للاختبار.",
    canonicalUrl: `${BASE_URL}/signup`,
    noindex: true,
  },
  login: {
    title: "تسجيل الدخول | ساري",
    description: "سجل دخولك إلى لوحة تحكم ساري.",
    canonicalUrl: `${BASE_URL}/login`,
    noindex: true,
  },
  productChatbot: {
    title: "روبوت دردشة ذكي للواتساب | ساري",
    description: "أتمت المحادثات المؤهلة من معرفة متجرك عندما تكون الخدمة والقناة متاحتين، مع التحويل إلى موظف بشري عند الحاجة.",
    keywords: "شات بوت واتساب, روبوت دردشة, أتمتة واتساب",
    canonicalUrl: `${BASE_URL}/product/chatbot`,
  },
  productWhatsApp: {
    title: "ربط وتكامل واتساب بزنس | ساري",
    description: "اربط قناة واتساب بساري عبر المسار المتاح لحسابك، وتابع حالة التحقق ومزامنة بيانات المتجر من لوحة الإعداد.",
    keywords: "ربط واتساب, تكامل سلة واتساب, تكامل زد واتساب",
    canonicalUrl: `${BASE_URL}/product/whatsapp`,
  },
  productBroadcasts: {
    title: "رسائل البث الجماعي للواتساب | ساري",
    description: "أنشئ حملات واتساب لمستلمين لديهم موافقة، مع استهداف وتقارير وحدود إرسال مرتبطة بالقناة والباقة.",
    keywords: "بث جماعي واتساب, حملات واتساب, رسائل ترويجية",
    canonicalUrl: `${BASE_URL}/product/broadcasts`,
  },
  productAI: {
    title: "الذكاء الاصطناعي للمبيعات | ساري",
    description: "وكيل ذكاء اصطناعي متقدم يتحدث باللهجة السعودية، يفهم عملاءك، ويحول المحادثات إلى مبيعات.",
    keywords: "ذكاء اصطناعي, وكيل مبيعات ذكي, مساعد ذكي",
    canonicalUrl: `${BASE_URL}/product/ai-agent`,
  },
  companyTerms: {
    title: "الشروط والأحكام | ساري",
    description: "الشروط والأحكام الخاصة باستخدام منصة ساري.",
    canonicalUrl: `${BASE_URL}/company/terms`,
  },
  companyPrivacy: {
    title: "سياسة الخصوصية | ساري",
    description: "سياسة الخصوصية وحماية بيانات المستخدمين في منصة ساري.",
    canonicalUrl: `${BASE_URL}/company/privacy`,
  },
  resourcesHelpCenter: {
    title: "مركز المساعدة | ساري",
    description: "دليلك الشامل لاستخدام ساري وأتمتة مبيعاتك بنجاح.",
    canonicalUrl: `${BASE_URL}/resources/help-center`,
  },
  resourcesSuccessStories: {
    title: "نتائج البيتا ودراسات الحالة | ساري",
    description: "اطّلع على دليل الاستخدام الحالي لساري ومنهج توثيق التحويل والرضا والإيراد قبل نشر دراسات الحالة.",
    canonicalUrl: `${BASE_URL}/resources/success-stories`,
  },
};

// ─── English SEO Configurations ─────────────────────────────
const seoConfigsEn = {
  home: {
    title: "Sari AI - Smart WhatsApp Sales Agent | Sales Automation",
    description: "Sari is an AI-powered platform that automates your WhatsApp sales. Smart replies, automatic orders, abandoned cart recovery, shipment tracking, and advanced reports. Start free!",
    keywords: "WhatsApp bot, AI chatbot, sales automation, WhatsApp sales, Salla integration, Zid integration, WooCommerce, WhatsApp marketing, CRM, chatbot, e-commerce automation",
    canonicalUrl: `${BASE_URL}/`,
    ogImage: `${BASE_URL}/og-image.png`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is Sari?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Sari is an AI-powered smart sales agent for WhatsApp. It automatically responds to customers, processes orders, recovers abandoned carts, and sends marketing campaigns."
          }
        },
        {
          "@type": "Question",
          "name": "How does Sari work with my online store?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Sari integrates directly with Salla, Zid, and WooCommerce. It automatically pulls your products and uses them in WhatsApp conversations with customers."
          }
        },
        {
          "@type": "Question",
          "name": "Is there a free trial?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes. New accounts start with a 7-day trial. Current plans, prices and limits are then shown on the pricing page."
          }
        }
      ]
    },
  },
  pricing: {
    title: "Pricing & Plans | Sari - Smart Sales Agent",
    description: "Choose from current plans and limits loaded directly from the system, with a 7-day trial for new accounts.",
    keywords: "Sari pricing, WhatsApp plans, chatbot subscription, sales automation pricing, WhatsApp bot cost",
    canonicalUrl: `${BASE_URL}/pricing`,
  },
  trySari: {
    title: "Try Sari Free | AI Sales Agent Demo",
    description: "Try Sari's smart sales agent live. See how it handles customers and processes orders via WhatsApp in real-time.",
    keywords: "try Sari, free trial, free chatbot, WhatsApp bot demo, AI sales demo",
    canonicalUrl: `${BASE_URL}/try-sari`,
  },
  solutionsSales: {
    title: "Sales Solutions | Sari - WhatsApp Sales Automation",
    description: "Turn WhatsApp into a traceable sales channel with store-grounded replies, orders confirmed only after persistence, and AI product recommendations.",
    keywords: "WhatsApp sales, sales automation, sales bot, WhatsApp sales channel, AI sales agent",
    canonicalUrl: `${BASE_URL}/solutions/sales`,
  },
  solutionsMarketing: {
    title: "Marketing Solutions | Sari - Smart WhatsApp Marketing",
    description: "Launch smart marketing campaigns via WhatsApp. Personalized messages, scheduled campaigns, and advanced analytics.",
    keywords: "WhatsApp marketing, WhatsApp campaigns, marketing messages, WhatsApp ads, marketing automation",
    canonicalUrl: `${BASE_URL}/solutions/marketing`,
  },
  solutionsSupport: {
    title: "WhatsApp Support Solutions | Sari",
    description: "Provide automated WhatsApp answers from your store knowledge, with human handoff when needed.",
    keywords: "WhatsApp customer support, smart customer service, support bot, human handoff, AI support",
    canonicalUrl: `${BASE_URL}/solutions/support`,
  },
  about: {
    title: "About Sari | Our Story & Vision",
    description: "Learn about Sari — the Saudi platform for WhatsApp sales automation powered by artificial intelligence.",
    keywords: "about Sari, Sari team, Sari vision, AI sales platform",
    canonicalUrl: `${BASE_URL}/company/about`,
  },
  contact: {
    title: "Contact Us | Sari",
    description: "Get in touch with the Sari team for inquiries and technical support. We're here to help.",
    keywords: "contact Sari, technical support, get in touch, customer service",
    canonicalUrl: `${BASE_URL}/support`,
  },
  support: {
    title: "Support and Service Status | Sari",
    description: "Check Sari's live service status, open a traceable support request, or use the official support email.",
    keywords: "Sari support, Sari service status, support ticket",
    canonicalUrl: `${BASE_URL}/support`,
  },
  blog: {
    title: "Blog | Sari - Sales & Marketing Tips",
    description: "Read the latest articles and tips about WhatsApp sales automation and digital marketing.",
    keywords: "Sari blog, sales tips, WhatsApp marketing, e-commerce articles, business automation",
    canonicalUrl: `${BASE_URL}/resources/blog`,
  },
  signup: {
    title: "Create Free Account | Sari",
    description: "Create a Sari account and follow store, WhatsApp channel, and integration readiness until the setup is ready to test.",
    canonicalUrl: `${BASE_URL}/signup`,
    noindex: true,
  },
  login: {
    title: "Login | Sari",
    description: "Log in to your Sari dashboard.",
    canonicalUrl: `${BASE_URL}/login`,
    noindex: true,
  },
  productChatbot: {
    title: "Smart WhatsApp Chatbot | Sari",
    description: "Automate eligible customer conversations from your store knowledge while the service and channel are available, with human handoff when needed.",
    keywords: "WhatsApp chatbot, smart auto reply, WhatsApp automation",
    canonicalUrl: `${BASE_URL}/product/chatbot`,
  },
  productWhatsApp: {
    title: "WhatsApp Business Integration | Sari",
    description: "Connect WhatsApp through the path available to your account and follow channel verification and store-data synchronization status.",
    keywords: "WhatsApp integration, Salla integration, Zid integration",
    canonicalUrl: `${BASE_URL}/product/whatsapp`,
  },
  productBroadcasts: {
    title: "WhatsApp Broadcast Campaigns | Sari",
    description: "Create WhatsApp campaigns for consented recipients with targeting, reporting, and delivery limits tied to the channel and plan.",
    keywords: "WhatsApp broadcast, WhatsApp campaigns, promotional messages",
    canonicalUrl: `${BASE_URL}/product/broadcasts`,
  },
  productAI: {
    title: "AI Sales Agent | Sari",
    description: "Advanced AI agent that speaks local dialects, understands your customers, and converts conversations into sales.",
    keywords: "Artificial intelligence, smart sales agent, AI assistant",
    canonicalUrl: `${BASE_URL}/product/ai-agent`,
  },
  companyTerms: {
    title: "Terms and Conditions | Sari",
    description: "Terms and conditions for using the Sari platform.",
    canonicalUrl: `${BASE_URL}/company/terms`,
  },
  companyPrivacy: {
    title: "Privacy Policy | Sari",
    description: "Privacy policy and user data protection at Sari.",
    canonicalUrl: `${BASE_URL}/company/privacy`,
  },
  resourcesHelpCenter: {
    title: "Help Center | Sari",
    description: "Your comprehensive guide to using Sari and successfully automating your sales.",
    canonicalUrl: `${BASE_URL}/resources/help-center`,
  },
  resourcesSuccessStories: {
    title: "Beta Evidence and Case Studies | Sari",
    description: "See Sari's current usage evidence and the method for verifying conversion, satisfaction and revenue before publishing case studies.",
    canonicalUrl: `${BASE_URL}/resources/success-stories`,
  },
};

// Legacy export for backward compatibility
export const seoConfigs = seoConfigsAr;
