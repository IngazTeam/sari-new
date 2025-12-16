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
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterCardType?: string;
  structuredData?: any;
}

export function SeoHead({
  title,
  description,
  keywords,
  author,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogImage,
  ogType = "website",
  twitterTitle,
  twitterDescription,
  twitterImage,
  twitterCardType = "summary_large_image",
  structuredData,
}: SeoHeadProps) {
  useEffect(() => {
    // Set page title
    document.title = title;

    // Set meta tags
    const metaTags = [
      { name: "description", content: description },
      { name: "keywords", content: keywords || "" },
      { name: "author", content: author || "" },
      { property: "og:title", content: ogTitle || title },
      { property: "og:description", content: ogDescription || description },
      { property: "og:type", content: ogType },
      { property: "og:image", content: ogImage || "" },
      { property: "og:url", content: canonicalUrl || window.location.href },
      { name: "twitter:card", content: twitterCardType },
      { name: "twitter:title", content: twitterTitle || title },
      { name: "twitter:description", content: twitterDescription || description },
      { name: "twitter:image", content: twitterImage || ogImage || "" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { httpEquiv: "X-UA-Compatible", content: "ie=edge" },
    ];

    // Remove existing meta tags
    document.querySelectorAll('meta[name="description"], meta[name="keywords"], meta[name="author"], meta[property^="og:"], meta[name^="twitter:"]').forEach(tag => tag.remove());

    // Add new meta tags
    metaTags.forEach(({ name, property, content, httpEquiv }) => {
      if (!content) return;

      const meta = document.createElement("meta");
      if (name) meta.setAttribute("name", name);
      if (property) meta.setAttribute("property", property);
      if (httpEquiv) meta.setAttribute("http-equiv", httpEquiv);
      meta.setAttribute("content", content);
      document.head.appendChild(meta);
    });

    // Set canonical URL
    if (canonicalUrl) {
      let canonicalLink = document.querySelector("link[rel='canonical']") as HTMLLinkElement;
      if (!canonicalLink) {
        canonicalLink = document.createElement("link");
        canonicalLink.rel = "canonical";
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.href = canonicalUrl;
    }

    // Add structured data
    if (structuredData) {
      let scriptTag = document.querySelector("script[type='application/ld+json']") as HTMLScriptElement;
      if (!scriptTag) {
        scriptTag = document.createElement("script");
        scriptTag.type = "application/ld+json";
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(structuredData);
    }

    return () => {
      // Cleanup is optional - you may want to keep meta tags
    };
  }, [title, description, keywords, author, canonicalUrl, ogTitle, ogDescription, ogImage, ogType, twitterTitle, twitterDescription, twitterImage, twitterCardType, structuredData]);

  return null;
}

// Predefined SEO configurations for common pages
export const seoConfigs = {
  home: {
    title: "ساري - وكيل مبيعات ذكي للواتساب | أتمتة المبيعات",
    description: "منصة ساري تساعدك في إدارة مبيعاتك عبر الواتساب بذكاء اصطناعي. زيادة المبيعات وتقليل الوقت المهدور.",
    keywords: "واتساب، مبيعات، ذكاء اصطناعي، أتمتة، تسويق، CRM",
    author: "Sari Team",
    ogTitle: "ساري - وكيل مبيعات ذكي للواتساب",
    ogDescription: "أتمتة مبيعاتك عبر الواتساب باستخدام الذكاء الاصطناعي",
    ogImage: "https://sari.app/og-image.jpg",
    twitterTitle: "ساري - وكيل مبيعات ذكي",
    twitterDescription: "أتمتة مبيعاتك عبر الواتساب",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Sari",
      url: "https://sari.app",
      logo: "https://sari.app/logo.png",
      description: "منصة أتمتة المبيعات عبر الواتساب",
      sameAs: [
        "https://twitter.com/sari",
        "https://facebook.com/sari",
        "https://linkedin.com/company/sari",
      ],
    },
  },

  pricing: {
    title: "الأسعار والباقات | ساري",
    description: "اختر الباقة المناسبة لعملك. باقات مرنة تناسب جميع أحجام الأعمال.",
    keywords: "أسعار، باقات، اشتراك، تسعير",
    ogTitle: "الأسعار والباقات",
    ogDescription: "اختر الباقة المناسبة لعملك",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "PricingTable",
      name: "Sari Pricing",
    },
  },

  features: {
    title: "المميزات | ساري - وكيل مبيعات ذكي",
    description: "اكتشف جميع مميزات ساري: إدارة العملاء، الأتمتة، التحليلات وأكثر.",
    keywords: "مميزات، إمكانيات، أدوات، تحليلات",
    ogTitle: "مميزات ساري",
    ogDescription: "اكتشف جميع مميزات ساري الرائعة",
  },

  blog: {
    title: "المدونة | ساري",
    description: "اقرأ أحدث المقالات والنصائح حول المبيعات والتسويق الرقمي.",
    keywords: "مدونة، مقالات، نصائح، تسويق",
    ogTitle: "مدونة ساري",
    ogDescription: "أحدث المقالات والنصائح حول المبيعات",
  },

  contact: {
    title: "اتصل بنا | ساري",
    description: "تواصل معنا للحصول على الدعم والمساعدة. نحن هنا لمساعدتك.",
    keywords: "اتصال، دعم، مساعدة، تواصل",
    ogTitle: "اتصل بنا",
    ogDescription: "تواصل معنا للحصول على الدعم",
  },

  about: {
    title: "عن ساري | وكيل مبيعات ذكي",
    description: "تعرف على قصة ساري ورؤيتنا لتحويل المبيعات الرقمية.",
    keywords: "عن، فريق، رؤية، رسالة",
    ogTitle: "عن ساري",
    ogDescription: "تعرف على قصة ساري",
  },
};

// Hook for easy usage
export function useSeoHead(config: typeof seoConfigs.home) {
  return <SeoHead {...config} />;
}
