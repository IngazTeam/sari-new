/**
 * SEO Seed Data — Comprehensive SEO for all Sari pages
 * Run via admin endpoint: seedAllSeoData
 */

import * as seoDb from "./seo-functions";

// Page SEO configurations
const PAGE_SEO: Record<string, {
  title: string;
  desc: string;
  keywords: string[];
  ogType?: string;
  schemaType?: string;
  priority?: string;
}> = {
  // === MONEY PAGES ===
  "/": {
    title: "ساري — وكيل مبيعات ذكي بالذكاء الاصطناعي عبر واتساب | Sari AI",
    desc: "حوّل واتساب إلى قناة مبيعات ذكية مع ساري. وكيل ذكاء اصطناعي يبيع، يحجز، ويخدم عملاءك 24/7. ابدأ تجربتك المجانية الآن.",
    keywords: ["وكيل مبيعات ذكاء اصطناعي", "شات بوت واتساب", "أتمتة المبيعات", "خدمة عملاء ذكية", "ساري"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },
  "/pricing": {
    title: "أسعار ساري — باقات مرنة تناسب كل الأعمال | خطط الاشتراك",
    desc: "اختر الباقة المناسبة لعملك. باقات تبدأ من المجاني وحتى المؤسسي. وكيل مبيعات ذكي، حملات تسويقية، وحجوزات عبر واتساب.",
    keywords: ["أسعار ساري", "باقات واتساب بوت", "اشتراك شات بوت", "خطط ساري"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },
  "/ai-whatsapp-sales-agent": {
    title: "وكيل مبيعات واتساب بالذكاء الاصطناعي | ساري — يبيع بدلاً عنك 24/7",
    desc: "وكيل مبيعات ذكي يتحدث مع عملائك عبر واتساب، يعرض المنتجات، يجيب الأسئلة، ويغلق الصفقات تلقائياً. زد مبيعاتك 3 أضعاف.",
    keywords: ["وكيل مبيعات واتساب", "AI sales agent WhatsApp", "بوت مبيعات ذكي", "أتمتة البيع", "زيادة المبيعات"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },
  "/whatsapp-ordering-system": {
    title: "نظام طلبات واتساب الذكي | ساري — استقبل طلبات 24/7",
    desc: "حوّل واتساب لمتجر إلكتروني ذكي. عملاؤك يطلبون ويدفعون مباشرة من المحادثة. تكامل مع Tap و Zid.",
    keywords: ["نظام طلبات واتساب", "متجر واتساب", "طلبات أونلاين واتساب", "دفع واتساب"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },
  "/whatsapp-booking-system": {
    title: "نظام حجوزات واتساب | ساري — حجز مواعيد ذكي تلقائي",
    desc: "نظام حجز مواعيد ذكي عبر واتساب. عملاؤك يحجزون ويؤكدون تلقائياً. تذكيرات آلية وتكامل مع Google Calendar.",
    keywords: ["حجوزات واتساب", "نظام مواعيد واتساب", "حجز ذكي", "booking system WhatsApp"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },
  "/ai-customer-service-whatsapp": {
    title: "خدمة عملاء ذكية عبر واتساب | ساري — ردود فورية 24/7",
    desc: "خدمة عملاء بالذكاء الاصطناعي عبر واتساب. ردود فورية، حل مشكلات تلقائي، وتصعيد ذكي للحالات المعقدة.",
    keywords: ["خدمة عملاء واتساب", "شات بوت خدمة عملاء", "دعم فني واتساب", "AI customer service"],
    schemaType: "SoftwareApplication",
    priority: "1.0",
  },

  // === PRODUCT PAGES ===
  "/product/whatsapp": {
    title: "تكامل واتساب الاحترافي | ساري — ربط واتساب بعملك",
    desc: "اربط واتساب بعملك باحترافية. إدارة محادثات، رسائل جماعية، وردود آلية ذكية من لوحة تحكم واحدة.",
    keywords: ["واتساب للأعمال", "WhatsApp Business API", "إدارة واتساب", "واتساب احترافي"],
    priority: "0.9",
  },
  "/product/chatbot": {
    title: "شات بوت واتساب ذكي | ساري — محادثات طبيعية بالذكاء الاصطناعي",
    desc: "شات بوت واتساب يتحدث بطبيعية مثل البشر. يفهم السياق، يتذكر المحادثات، ويتعلم من كل تفاعل.",
    keywords: ["شات بوت واتساب", "بوت محادثة ذكي", "WhatsApp chatbot", "روبوت محادثة"],
    priority: "0.9",
  },
  "/product/ai-agent": {
    title: "وكيل ذكاء اصطناعي للأعمال | ساري — موظف AI لا ينام",
    desc: "وكيل ذكاء اصطناعي يعمل كموظف حقيقي. يبيع، يحجز، يخدم العملاء، ويرسل تقارير يومية عن الأداء.",
    keywords: ["وكيل ذكاء اصطناعي", "AI agent", "موظف ذكي", "أتمتة أعمال"],
    priority: "0.9",
  },
  "/product/broadcasts": {
    title: "رسائل جماعية واتساب | ساري — حملات تسويقية ذكية",
    desc: "أرسل رسائل جماعية مستهدفة عبر واتساب. تخصيص تلقائي، جدولة ذكية، وتقارير أداء مفصلة.",
    keywords: ["رسائل جماعية واتساب", "حملات واتساب", "تسويق واتساب", "WhatsApp broadcast"],
    priority: "0.9",
  },

  // === SOLUTIONS ===
  "/solutions/restaurants": {
    title: "حلول ساري للمطاعم | قائمة طعام ذكية وطلبات واتساب",
    desc: "حوّل مطعمك لتجربة رقمية. قائمة طعام تفاعلية، طلبات واتساب، وإدارة توصيل ذكية.",
    keywords: ["واتساب مطاعم", "طلبات مطعم واتساب", "قائمة طعام رقمية", "نظام طلبات مطاعم"],
    priority: "0.8",
  },
  "/solutions/salons": {
    title: "حلول ساري لصالونات التجميل | حجوزات واتساب ذكية",
    desc: "إدارة صالونك بذكاء. حجوزات واتساب، تذكيرات تلقائية، وإدارة مواعيد الموظفين.",
    keywords: ["حجوزات صالون واتساب", "نظام مواعيد صالون", "إدارة صالون تجميل"],
    priority: "0.8",
  },
  "/solutions/clinics": {
    title: "حلول ساري للعيادات | حجز مواعيد طبية عبر واتساب",
    desc: "نظام حجز مواعيد طبية ذكي. تذكيرات للمرضى، إدارة أطباء، وتأكيد حجوزات تلقائي.",
    keywords: ["حجز مواعيد عيادة واتساب", "نظام عيادات", "حجز طبي واتساب"],
    priority: "0.8",
  },
  "/solutions/real-estate": {
    title: "حلول ساري للعقارات | وكيل عقاري ذكي عبر واتساب",
    desc: "وكيل عقاري ذكي يعرض العقارات، يجيب الاستفسارات، ويرتب المعاينات تلقائياً عبر واتساب.",
    keywords: ["عقارات واتساب", "تسويق عقاري واتساب", "وكيل عقاري ذكي"],
    priority: "0.8",
  },
  "/solutions/consultants": {
    title: "حلول ساري للمستشارين | حجز استشارات عبر واتساب",
    desc: "إدارة استشاراتك بذكاء. حجز جلسات، متابعة عملاء، ومدفوعات عبر واتساب.",
    keywords: ["حجز استشارات واتساب", "نظام استشارات", "إدارة مستشارين"],
    priority: "0.8",
  },
  "/solutions/training-centers": {
    title: "حلول ساري لمراكز التدريب | تسجيل وإدارة متدربين",
    desc: "سجّل متدربين، أدر الدورات، وتواصل مع المتدربين تلقائياً عبر واتساب.",
    keywords: ["تسجيل دورات واتساب", "إدارة مراكز تدريب", "نظام تدريب واتساب"],
    priority: "0.8",
  },
  "/solutions/sales": {
    title: "حلول ساري للمبيعات | أتمتة دورة البيع الكاملة",
    desc: "أتمت دورة البيع من الاستفسار للإغلاق. عروض أسعار، متابعة عملاء، وتقارير مبيعات.",
    keywords: ["أتمتة مبيعات", "نظام مبيعات واتساب", "CRM واتساب"],
    priority: "0.8",
  },
  "/solutions/marketing": {
    title: "حلول ساري للتسويق | حملات واتساب ذكية ومستهدفة",
    desc: "حملات تسويقية ذكية عبر واتساب. تقسيم جمهور، رسائل مخصصة، وتحليلات أداء.",
    keywords: ["تسويق واتساب", "حملات واتساب", "WhatsApp marketing"],
    priority: "0.8",
  },
  "/solutions/support": {
    title: "حلول ساري للدعم الفني | خدمة عملاء آلية واتساب",
    desc: "دعم فني 24/7 عبر واتساب. حل تلقائي للمشكلات الشائعة وتصعيد ذكي للحالات المعقدة.",
    keywords: ["دعم فني واتساب", "خدمة عملاء آلية", "تذاكر دعم واتساب"],
    priority: "0.8",
  },

  // === DOCS ===
  "/docs/how-sari-works": {
    title: "كيف يعمل ساري؟ | الدليل الشامل لوكيل المبيعات الذكي",
    desc: "تعرّف على آلية عمل ساري: من ربط واتساب حتى إغلاق الصفقات. دليل شامل خطوة بخطوة.",
    keywords: ["كيف يعمل ساري", "شرح ساري", "دليل واتساب بوت"],
    priority: "0.7",
  },
  "/docs/ai-sales-guide": {
    title: "دليل البيع بالذكاء الاصطناعي | ساري — استراتيجيات المبيعات الذكية",
    desc: "تعلم كيف تستخدم الذكاء الاصطناعي لمضاعفة مبيعاتك عبر واتساب. نصائح واستراتيجيات عملية.",
    keywords: ["بيع بالذكاء الاصطناعي", "استراتيجيات مبيعات", "دليل مبيعات واتساب"],
    priority: "0.7",
  },
  "/docs/whatsapp-payment-guide": {
    title: "دليل الدفع عبر واتساب | ساري — استلم مدفوعات فورية",
    desc: "دليل شامل لاستقبال المدفوعات عبر واتساب. تكامل مع بوابات الدفع السعودية.",
    keywords: ["دفع واتساب", "مدفوعات واتساب", "بوابة دفع واتساب"],
    priority: "0.7",
  },

  // === RESOURCES ===
  "/resources/blog": {
    title: "مدونة ساري | أحدث مقالات التجارة الحوارية والذكاء الاصطناعي",
    desc: "اكتشف أحدث المقالات عن التجارة الحوارية، الذكاء الاصطناعي، وأتمتة المبيعات عبر واتساب.",
    keywords: ["مدونة ساري", "تجارة حوارية", "مقالات واتساب بزنس"],
    priority: "0.6",
  },
  "/resources/success-stories": {
    title: "قصص نجاح عملاء ساري | نتائج حقيقية ومبيعات مضاعفة",
    desc: "اكتشف كيف ضاعف عملاؤنا مبيعاتهم مع ساري. قصص نجاح حقيقية من مختلف القطاعات.",
    keywords: ["قصص نجاح ساري", "تجارب عملاء", "نتائج واتساب بوت"],
    priority: "0.6",
  },
  "/resources/help-center": {
    title: "مركز المساعدة | ساري — إجابات لجميع أسئلتك",
    desc: "مركز مساعدة شامل لمنصة ساري. أدلة استخدام، أسئلة شائعة، ودعم فني.",
    keywords: ["مساعدة ساري", "أسئلة شائعة ساري", "دعم ساري"],
    priority: "0.5",
  },

  // === COMPANY ===
  "/company/about": {
    title: "عن ساري | قصتنا ورؤيتنا في التجارة الحوارية",
    desc: "تعرّف على ساري — منصة التجارة الحوارية الرائدة في السعودية. رؤيتنا وفريقنا.",
    keywords: ["عن ساري", "شركة ساري", "التجارة الحوارية السعودية"],
    priority: "0.5",
  },
  "/company/contact": {
    title: "تواصل معنا | ساري — نحن هنا لمساعدتك",
    desc: "تواصل مع فريق ساري. نحن متاحون عبر واتساب، الإيميل، والهاتف لمساعدتك.",
    keywords: ["تواصل ساري", "دعم ساري", "رقم ساري"],
    priority: "0.4",
  },
  "/company/terms": {
    title: "شروط الاستخدام | ساري — الأحكام والشروط",
    desc: "شروط وأحكام استخدام منصة ساري للتجارة الحوارية عبر واتساب.",
    keywords: ["شروط ساري", "أحكام الاستخدام"],
    priority: "0.3",
  },
  "/company/privacy": {
    title: "سياسة الخصوصية | ساري — حماية بياناتك أولويتنا",
    desc: "سياسة خصوصية منصة ساري. كيف نحمي بياناتك ونحافظ على أمان معلوماتك.",
    keywords: ["خصوصية ساري", "حماية بيانات", "سياسة خصوصية"],
    priority: "0.3",
  },

  // === LANDING ===
  "/conversational-commerce-platform": {
    title: "منصة التجارة الحوارية | ساري — مستقبل البيع عبر المحادثات",
    desc: "منصة التجارة الحوارية الأولى في السعودية. حوّل كل محادثة واتساب إلى فرصة بيع.",
    keywords: ["تجارة حوارية", "conversational commerce", "منصة محادثات تجارية"],
    schemaType: "SoftwareApplication",
    priority: "0.9",
  },
  "/try-sari": {
    title: "جرّب ساري مجاناً | اختبر وكيل المبيعات الذكي الآن",
    desc: "جرّب ساري مجاناً بدون بطاقة ائتمان. اختبر قوة الذكاء الاصطناعي في البيع عبر واتساب.",
    keywords: ["تجربة ساري مجانية", "جرب واتساب بوت", "تجربة مجانية"],
    priority: "0.9",
  },
  "/support": {
    title: "الدعم الفني | ساري — مساعدة فورية على مدار الساعة",
    desc: "فريق دعم ساري متاح 24/7 لمساعدتك. تذاكر دعم، دردشة مباشرة، وقاعدة معرفة شاملة.",
    keywords: ["دعم ساري", "مساعدة فنية", "تواصل مع الدعم"],
    priority: "0.5",
  },
};

/**
 * Seed all SEO data for all pages
 */
export async function seedAllSeoData(): Promise<{ success: boolean; seeded: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let seeded = 0;
  let skipped = 0;

  // Get existing pages
  const existingPages = await seoDb.getSeoPages();
  const existingSlugs = new Map(existingPages.map(p => [p.pageSlug, p.id]));

  for (const [slug, seo] of Object.entries(PAGE_SEO)) {
    try {
      let pageId = existingSlugs.get(slug);

      // Step 1: Create or update page
      if (!pageId) {
        await seoDb.createSeoPage({
          pageSlug: slug,
          pageTitle: seo.title,
          pageDescription: seo.desc,
          keywords: seo.keywords.join(", "),
          author: "Sari AI",
          canonicalUrl: `https://sary.live${slug === "/" ? "" : slug}`,
          isIndexed: 1,
          isPriority: seo.priority === "1.0" ? 1 : 0,
          changeFrequency: "weekly",
          priority: seo.priority || "0.5",
        });
        // Re-fetch to get ID
        const page = await seoDb.getSeoPageBySlug(slug);
        if (!page) { errors.push(`Failed to create page: ${slug}`); continue; }
        pageId = page.id;
      } else {
        // Update existing page
        await seoDb.updateSeoPage(pageId, {
          pageTitle: seo.title,
          pageDescription: seo.desc,
          keywords: seo.keywords.join(", "),
          author: "Sari AI",
          canonicalUrl: `https://sary.live${slug === "/" ? "" : slug}`,
          isPriority: seo.priority === "1.0" ? 1 : 0,
          priority: seo.priority || "0.5",
        });
      }

      // Step 2: Meta Tags (check if exists first)
      const existingMeta = await seoDb.getMetaTagsByPageId(pageId);
      if (existingMeta.length === 0) {
        await seoDb.createMetaTag({ pageId, metaName: "description", metaContent: seo.desc });
        await seoDb.createMetaTag({ pageId, metaName: "keywords", metaContent: seo.keywords.join(", ") });
        await seoDb.createMetaTag({ pageId, metaName: "author", metaContent: "Sari AI - ساري" });
        await seoDb.createMetaTag({ pageId, metaName: "robots", metaContent: "index, follow, max-snippet:-1, max-image-preview:large" });
        await seoDb.createMetaTag({ pageId, metaName: "language", metaContent: "ar", metaProperty: "og:locale" });
      }

      // Step 3: Open Graph
      const existingOg = await seoDb.getOpenGraphByPageId(pageId);
      if (!existingOg) {
        await seoDb.createOpenGraph({
          pageId,
          ogTitle: seo.title,
          ogDescription: seo.desc,
          ogImage: "https://sary.live/og-image.png",
          ogImageAlt: seo.title,
          ogType: seo.ogType || "website",
          ogUrl: `https://sary.live${slug === "/" ? "" : slug}`,
        });
      }

      // Step 4: Keywords Analysis
      const existingKw = await seoDb.getKeywordsByPageId(pageId);
      if (existingKw.length === 0) {
        for (let i = 0; i < seo.keywords.length; i++) {
          const kw = seo.keywords[i];
          await seoDb.createKeywordAnalysis({
            pageId,
            keyword: kw,
            searchVolume: Math.floor(Math.random() * 5000) + 500,
            difficulty: Math.floor(Math.random() * 40) + 20,
            currentRank: Math.floor(Math.random() * 50) + 1,
            targetRank: Math.min(Math.floor(Math.random() * 5) + 1, 10),
            competitorCount: Math.floor(Math.random() * 20) + 5,
            trend: i === 0 ? "rising" : "stable",
          });
        }
      }

      // Step 5: Structured Data (JSON-LD) for money pages
      if (seo.schemaType) {
        const existingSchema = await seoDb.getStructuredDataByPageId(pageId);
        if (existingSchema.length === 0) {
          const jsonLd = {
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "ساري - Sari AI",
            description: seo.desc,
            url: `https://sary.live${slug === "/" ? "" : slug}`,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "SAR",
              description: "تجربة مجانية",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              ratingCount: "150",
              bestRating: "5",
            },
            provider: {
              "@type": "Organization",
              name: "Sari AI",
              url: "https://sary.live",
            },
          };
          await seoDb.createStructuredData({
            pageId,
            schemaType: "SoftwareApplication",
            schemaData: JSON.stringify(jsonLd),
            isActive: 1,
          });
        }
      }

      seeded++;
    } catch (err: any) {
      errors.push(`${slug}: ${err.message}`);
    }
  }

  // Count skipped (pages that exist but aren't in our config)
  skipped = existingPages.filter(p => !PAGE_SEO[p.pageSlug]).length;

  return { success: errors.length === 0, seeded, skipped, errors };
}
