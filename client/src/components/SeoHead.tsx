import { useEffect } from "react";

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
  ogLocale = "ar_SA",
  twitterTitle,
  twitterDescription,
  twitterImage,
  twitterCardType = "summary_large_image",
  structuredData,
  noindex = false,
}: SeoHeadProps) {
  useEffect(() => {
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
      { property: "og:locale", content: ogLocale },
      { property: "og:locale:alternate", content: ogLocale === "ar_SA" ? "en_US" : "ar_SA" },
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

    // Set canonical URL
    const resolvedCanonical = canonicalUrl || window.location.href.split('?')[0];
    let canonicalLink = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
    if (!canonicalLink) {
      canonicalLink = document.createElement("link");
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = resolvedCanonical;

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
  }, [title, description, keywords, author, canonicalUrl, ogTitle, ogDescription, ogImage, ogType, ogLocale, twitterTitle, twitterDescription, twitterImage, twitterCardType, structuredData, noindex]);

  return null;
}

// ─── Predefined SEO Configurations ─────────────────────────────
export const seoConfigs = {
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
          "name": "هل ساري مجاني؟",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "نعم! ساري يوفر باقة مجانية للبدء. يمكنك الترقية لباقات مدفوعة للحصول على مزايا إضافية مثل الحملات التسويقية وبرامج الولاء."
          }
        }
      ]
    },
  },

  pricing: {
    title: "الأسعار والباقات | ساري - وكيل مبيعات ذكي",
    description: "اختر الباقة المناسبة لمتجرك. باقات مرنة تبدأ من المجاني حتى المتقدم. أتمتة مبيعات واتساب بأسعار تنافسية.",
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
    description: "حوّل واتساب إلى قناة مبيعات قوية. رد تلقائي ذكي، طلبات فورية، وتوصيات منتجات بالذكاء الاصطناعي.",
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
    title: "حلول الدعم | ساري - دعم عملاء واتساب 24/7",
    description: "وفر دعم عملاء على مدار الساعة عبر واتساب بدون تدخل بشري. ردود فورية وذكية على استفسارات العملاء.",
    keywords: "دعم عملاء واتساب, خدمة عملاء ذكية, بوت دعم فني, واتساب دعم 24/7",
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
    canonicalUrl: `${BASE_URL}/company/contact`,
  },

  blog: {
    title: "المدونة | ساري - نصائح المبيعات والتسويق",
    description: "اقرأ أحدث المقالات والنصائح حول أتمتة المبيعات والتسويق عبر واتساب.",
    keywords: "مدونة ساري, نصائح مبيعات, تسويق واتساب, مقالات تجارة إلكترونية",
    canonicalUrl: `${BASE_URL}/resources/blog`,
  },

  signup: {
    title: "إنشاء حساب مجاني | ساري",
    description: "أنشئ حسابك المجاني في ساري وابدأ أتمتة مبيعاتك عبر واتساب خلال دقائق.",
    canonicalUrl: `${BASE_URL}/signup`,
    noindex: true, // Don't index auth pages
  },

  login: {
    title: "تسجيل الدخول | ساري",
    description: "سجل دخولك إلى لوحة تحكم ساري.",
    canonicalUrl: `${BASE_URL}/login`,
    noindex: true,
  },
};
