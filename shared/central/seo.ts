import {
  CENTRAL_ORIGIN,
  centralCatalog,
  centralHref,
  centralLanguage,
  centralPath,
  getCentralPage,
  type CentralLanguage,
} from "./catalog";
import { escapeHtml as e, renderCentralMarkup } from "./render";

// A new asset URL lets social crawlers refresh the previous team photograph.
const SOCIAL_IMAGE = CENTRAL_ORIGIN + "/central/sary-sales-partner-social-v1.jpg";

export function centralSeo(path: string, lang: CentralLanguage) {
  const normalized = centralPath(path);
  const canonicalPath = /^\/reset-password\//.test(normalized)
    ? "/reset-password"
    : /^\/subscribe\//.test(normalized)
      ? "/subscribe"
      : /^\/pay\//.test(normalized)
        ? "/pay"
        : normalized;
  const page = getCentralPage(canonicalPath, lang);
  if (!page) return undefined;
  const canonical = CENTRAL_ORIGIN + centralHref(canonicalPath, lang);
  const topic =
    page.kind === "article"
      ? page.title
      : page.kind === "service" && lang === "ar" && page.parent
        ? `${page.label} – ${centralCatalog[lang][page.parent].label}`
        : page.label;
  const title =
    canonicalPath === "/"
      ? lang === "ar"
        ? "ساري | شريك مبيعاتك القوي على واتساب"
        : "Sary | Your powerful sales partner on WhatsApp"
      : `${topic} | ${lang === "ar" ? "ساري" : "Sary"}`;
  // Each language is self-canonical. Tracking parameters and account tokens never
  // enter canonical URLs, social metadata, JSON-LD or language alternatives.
  const alternates = [
    { lang: "ar", href: CENTRAL_ORIGIN + canonicalPath },
    { lang: "en", href: CENTRAL_ORIGIN + centralHref(canonicalPath, "en") },
    { lang: "x-default", href: CENTRAL_ORIGIN + canonicalPath },
  ];
  const organization = {
    "@type": "Organization",
    "@id": CENTRAL_ORIGIN + "/#organization",
    name: "Sary",
    alternateName: "ساري",
    url: CENTRAL_ORIGIN + "/",
    logo: CENTRAL_ORIGIN + "/sari-logo.png",
  };
  const website = {
    "@type": "WebSite",
    "@id": CENTRAL_ORIGIN + "/#website",
    name: "Sary",
    alternateName: "ساري",
    url: CENTRAL_ORIGIN + "/",
    inLanguage: ["ar", "en"],
    publisher: { "@id": organization["@id"] },
  };
  const main: Record<string, unknown> = {
    "@type": page.kind === "article" ? "Article" : "WebPage",
    "@id": canonical + "#page",
    url: canonical,
    name: title,
    description: page.description,
    inLanguage: lang,
    isPartOf: { "@id": website["@id"] },
    publisher: { "@id": organization["@id"] },
  };
  if (page.kind === "article") {
    main.headline = page.title;
    main.author = {
      "@type": "Organization",
      name: lang === "ar" ? "فريق ساري" : "Sary team",
    };
    main.datePublished = page.date;
    main.image = SOCIAL_IMAGE;
    main.mainEntityOfPage = canonical;
  }
  const graph: Record<string, unknown>[] = [organization, website, main];
  if (canonicalPath !== "/" && !page.noindex) {
    const trail = [
      {
        name: lang === "ar" ? "الرئيسية" : "Home",
        item: CENTRAL_ORIGIN + centralHref("/", lang),
      },
    ];
    if (page.parent)
      trail.push({
        name: centralCatalog[lang][page.parent].label,
        item: CENTRAL_ORIGIN + centralHref(page.parent, lang),
      });
    trail.push({ name: page.label, item: canonical });
    graph.push({
      "@type": "BreadcrumbList",
      "@id": canonical + "#breadcrumbs",
      itemListElement: trail.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        ...item,
      })),
    });
  }
  // Only mark up questions that are visibly rendered on this exact page.
  if (page.faq?.length)
    graph.push({
      "@type": "FAQPage",
      "@id": canonical + "#questions",
      inLanguage: lang,
      mainEntity: page.faq.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  return {
    title,
    description: page.description,
    canonical,
    alternates,
    noindex: !!page.noindex,
    locale: lang === "ar" ? "ar_SA" : "en_US",
    graph,
  };
}

export function renderCentralHead(path: string, lang: CentralLanguage): string {
  const seo = centralSeo(path, lang);
  if (!seo) return "";
  const imageAlt =
    lang === "ar"
      ? "ساري، شريك مبيعاتك بثوب سعودي وبطاقة تحمل شعار ساري"
      : "Sary, your sales partner in a Saudi thobe with a Sary ID badge";
  const meta = (name: string, content: string, property = false) =>
    `<meta ${property ? "property" : "name"}="${name}" content="${e(content)}">`;
  return (
    `<title>${e(seo.title)}</title>` +
    meta("description", seo.description) +
    meta(
      "robots",
      seo.noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large"
    ) +
    `<link rel="canonical" href="${e(seo.canonical)}">` +
    seo.alternates
      .map(
        a => `<link rel="alternate" hreflang="${a.lang}" href="${e(a.href)}">`
      )
      .join("") +
    meta("og:title", seo.title, true) +
    meta("og:description", seo.description, true) +
    meta("og:url", seo.canonical, true) +
    meta(
      "og:type",
      getCentralPage(path, lang)?.kind === "article" ? "article" : "website",
      true
    ) +
    meta("og:site_name", "Sary", true) +
    meta("og:locale", seo.locale, true) +
    meta("og:locale:alternate", lang === "ar" ? "en_US" : "ar_SA", true) +
    meta("og:image", SOCIAL_IMAGE, true) +
    meta("og:image:type", "image/jpeg", true) +
    meta("og:image:width", "1200", true) +
    meta("og:image:height", "630", true) +
    meta("og:image:alt", imageAlt, true) +
    meta("twitter:card", "summary_large_image") +
    meta("twitter:title", seo.title) +
    meta("twitter:description", seo.description) +
    meta("twitter:image", SOCIAL_IMAGE) +
    meta("twitter:image:alt", imageAlt) +
    meta("theme-color", "#174d3d") +
    (seo.noindex ? meta("referrer", "no-referrer") : "") +
    `<script type="application/ld+json" data-central-seo>${JSON.stringify({ "@context": "https://schema.org", "@graph": seo.graph }).replace(/</g, "\\u003c")}</script>`
  );
}

export function renderCentralDocument(
  template: string,
  rawUrl: string
): string {
  const url = new URL(rawUrl, "http://localhost");
  const lang = centralLanguage(url.search);
  if (!getCentralPage(url.pathname, lang)) return template;
  return template
    .replace(
      /<html\b[^>]*>/i,
      `<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}" class="central-page">`
    )
    .replace(/<body\b[^>]*>/i, '<body class="central-page">')
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(
      /<meta\s[^>]*(?:name=["'](?:description|keywords|robots|theme-color)["']|property=["']og:[^"']+["'])[^>]*>/gi,
      ""
    )
    .replace(
      "</head>",
      `${renderCentralHead(url.pathname, lang)}<link rel="stylesheet" href="/central/central.css?v=20260923-2"><link rel="stylesheet" href="/central/refinements.css?v=20260923-2"><link rel="stylesheet" href="/central/identity.css?v=20260924-2"></head>`
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderCentralMarkup(url.pathname, lang)}</div>`
    );
}
