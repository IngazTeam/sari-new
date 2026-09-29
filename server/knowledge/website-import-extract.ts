import { TRPCError } from "@trpc/server";
import * as analyzer from "../_core/websiteAnalyzer";
import { checkRateLimit } from "../_core/rateLimiter";

/** Extraction does not change merchant settings, products, FAQ, pages or active knowledge. */
export async function extractImportPreview(
  merchantId: number,
  websiteUrl: string
) {
  if (!analyzer.isUrlSafe(websiteUrl))
    throw new TRPCError({ code: "BAD_REQUEST", message: "IMPORT_URL_INVALID" });
  if (!checkRateLimit(`analysis_preview:${merchantId}`, 5, 3600000).allowed)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "IMPORT_RATE_LIMIT",
    });
  const { html, dom, text } = await analyzer.scrapeWebsite(websiteUrl);
  try {
    const platform = analyzer.detectPlatform(websiteUrl, html),
      siteType = analyzer.detectSiteType(websiteUrl, html, text);
    const crawl = await analyzer.smartCrawl(websiteUrl, dom, 30),
      allText = text + "\n" + crawl.allText;
    let products: Awaited<ReturnType<typeof analyzer.extractProducts>> = [],
      faqs: analyzer.ExtractedFAQ[] = [];
    let companyInfo = {
      name:
        dom.window.document.querySelector("title")?.textContent?.trim() || "",
      description: "",
      industry: "",
    };
    if (siteType === "ecommerce")
      products = await analyzer.extractProducts(
        websiteUrl,
        html,
        text,
        merchantId
      );
    if (
      siteType !== "ecommerce" ||
      (products.length === 0 && allText.length >= 100)
    ) {
      const extracted = await analyzer.extractAllWithAI(
        allText,
        websiteUrl,
        siteType,
        merchantId
      );
      products = extracted.products;
      faqs = extracted.faqs;
      companyInfo = extracted.companyInfo;
    }
    const warnings = ["IMPORT_ESTIMATES"];
    const knownTypes = [
      "about",
      "shipping",
      "returns",
      "faq",
      "contact",
      "privacy",
      "terms",
      "other",
    ];
    const pages = analyzer.discoverPages(dom, websiteUrl).map(page => {
      const fetched = crawl.pages.find(p => p.url === page.url);
      const content = fetched?.text;
      if (content && content.length > 15000)
        warnings.push(`IMPORT_PAGE_LINK_ONLY|${page.url}`);
      return {
        pageType: knownTypes.includes(page.pageType) ? page.pageType : "other",
        title: page.title,
        url: page.url,
        ...(content && content.length <= 15000 ? { content } : {}),
      };
    });
    return {
      success: true,
      websiteUrl,
      platform,
      siteType,
      companyInfo,
      products: products.map(p => ({
        name: p.name,
        description: p.description || "",
        price: p.price ?? 0,
        currency: p.currency || "SAR",
        imageUrl: p.imageUrl || "",
        productUrl: p.productUrl || "",
        category: p.category || "",
        inStock: p.inStock,
      })),
      pages,
      faqs: faqs.map(f => ({
        question: f.question,
        answer: f.answer,
        category: f.category || "",
      })),
      contactInfo: analyzer.extractContactInfo(dom, text, html),
      crawlStats: {
        totalPages: crawl.pages.length + 1,
        totalChars: allText.length,
        siteType,
      },
      warnings,
    };
  } finally {
    dom.window.close();
  }
}
