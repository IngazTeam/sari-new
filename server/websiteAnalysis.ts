/**
 * @deprecated This module has been superseded by `_core/websiteAnalyzer.ts`.
 * All consumers have been migrated to the new unified engine.
 * This file is kept temporarily for reference and can be safely deleted.
 * Migration date: March 2026
 */
import { invokeLLM } from "./_core/llm";
import * as cheerio from "cheerio";

/**
 * Platform Detection Patterns
 */
const PLATFORM_PATTERNS = {
  salla: [
    /salla\.sa/i,
    /cdn\.salla\.network/i,
    /<meta[^>]*name="salla-store"/i,
    /salla-theme/i,
  ],
  zid: [
    /zid\.sa/i,
    /cdn\.zid\.sa/i,
    /<meta[^>]*name="zid-store"/i,
    /zid-theme/i,
  ],
  shopify: [
    /shopify\.com/i,
    /cdn\.shopify\.com/i,
    /Shopify\.theme/i,
    /<meta[^>]*name="shopify-checkout-api-token"/i,
  ],
  woocommerce: [
    /wp-content\/plugins\/woocommerce/i,
    /woocommerce/i,
    /class="woocommerce"/i,
  ],
};

/**
 * Page Type Detection Keywords
 */
const PAGE_TYPE_KEYWORDS = {
  about: ["about", "من نحن", "عن", "عنا", "من-نحن", "about-us"],
  shipping: [
    "shipping",
    "delivery",
    "شحن",
    "توصيل",
    "الشحن",
    "التوصيل",
  ],
  returns: [
    "return",
    "refund",
    "استرجاع",
    "استبدال",
    "الاسترجاع",
    "الاستبدال",
  ],
  faq: ["faq", "questions", "أسئلة", "الأسئلة", "شائعة"],
  contact: ["contact", "اتصل", "تواصل", "الاتصال", "التواصل"],
  privacy: ["privacy", "خصوصية", "الخصوصية"],
  terms: ["terms", "conditions", "شروط", "الشروط", "أحكام"],
};

/**
 * Detect E-commerce Platform
 */
export async function detectPlatform(
  url: string,
  htmlContent: string
): Promise<"salla" | "zid" | "shopify" | "woocommerce" | "custom" | "unknown"> {
  try {
    // Check URL and HTML content against patterns
    for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(url) || pattern.test(htmlContent)) {
          return platform as any;
        }
      }
    }

    // Use LLM for advanced detection
    const llmResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert in detecting e-commerce platforms. Analyze the HTML and determine the platform.",
        },
        {
          role: "user",
          content: `Analyze this website and detect the e-commerce platform:
URL: ${url}
HTML snippet: ${htmlContent.substring(0, 2000)}

Respond with ONLY ONE of these: salla, zid, shopify, woocommerce, custom, unknown`,
        },
      ],
    });

    const detectedPlatform = llmResponse.choices[0].message.content
      .trim()
      .toLowerCase();
    if (
      ["salla", "zid", "shopify", "woocommerce", "custom"].includes(
        detectedPlatform
      )
    ) {
      return detectedPlatform as any;
    }

    return "unknown";
  } catch (error) {
    console.error("Error detecting platform:", error);
    return "unknown";
  }
}

/**
 * Extract Products from Store
 */
export async function extractProducts(
  url: string,
  htmlContent: string,
  platform: string
): Promise<
  Array<{
    name: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    productUrl?: string;
  }>
> {
  try {
    const $ = cheerio.load(htmlContent);
    const products: Array<{
      name: string;
      description?: string;
      price?: number;
      imageUrl?: string;
      productUrl?: string;
    }> = [];

    // Platform-specific extraction
    if (platform === "salla") {
      $(".product-item, .product-card, [data-product-id]").each((_, el) => {
        const name =
          $(el).find(".product-title, .product-name, h3, h4").text().trim() ||
          "";
        const priceText =
          $(el).find(".product-price, .price").text().trim() || "";
        const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;
        const imageUrl =
          $(el).find("img").attr("src") ||
          $(el).find("img").attr("data-src") ||
          "";
        const productUrl = $(el).find("a").attr("href") || "";

        if (name) {
          products.push({ name, price, imageUrl, productUrl });
        }
      });
    } else if (platform === "shopify") {
      $(".product-item, .grid-product, [data-product-id]").each((_, el) => {
        const name =
          $(el).find(".product-title, .product__title, h3").text().trim() ||
          "";
        const priceText = $(el).find(".price, .product-price").text().trim();
        const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;
        const imageUrl = $(el).find("img").attr("src") || "";
        const productUrl = $(el).find("a").attr("href") || "";

        if (name) {
          products.push({ name, price, imageUrl, productUrl });
        }
      });
    } else if (platform === "woocommerce") {
      $(".product, .woocommerce-loop-product").each((_, el) => {
        const name =
          $(el).find(".woocommerce-loop-product__title, h2").text().trim() ||
          "";
        const priceText = $(el).find(".price, .amount").text().trim();
        const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;
        const imageUrl = $(el).find("img").attr("src") || "";
        const productUrl = $(el).find("a").attr("href") || "";

        if (name) {
          products.push({ name, price, imageUrl, productUrl });
        }
      });
    } else {
      // Generic extraction for unknown platforms
      $("article, .product, [class*='product'], [data-product]").each(
        (_, el) => {
          const name =
            $(el)
              .find("h1, h2, h3, h4, [class*='title'], [class*='name']")
              .first()
              .text()
              .trim() || "";
          const priceText = $(el)
            .find("[class*='price'], [class*='cost']")
            .first()
            .text()
            .trim();
          const price = parseFloat(priceText.replace(/[^\d.]/g, "")) || 0;
          const imageUrl = $(el).find("img").first().attr("src") || "";
          const productUrl = $(el).find("a").first().attr("href") || "";

          if (name && name.length > 3) {
            products.push({ name, price, imageUrl, productUrl });
          }
        }
      );
    }

    // If no products found, use LLM
    if (products.length === 0) {
      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are an expert in extracting product information from HTML. Extract product names, prices, and URLs.",
          },
          {
            role: "user",
            content: `Extract products from this HTML:
${htmlContent.substring(0, 3000)}

Return a JSON array of products with: name, price (number), imageUrl, productUrl`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "products",
            strict: true,
            schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      price: { type: "number" },
                      imageUrl: { type: "string" },
                      productUrl: { type: "string" },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["products"],
              additionalProperties: false,
            },
          },
        },
      });

      const extracted = JSON.parse(
        llmResponse.choices[0].message.content || "{}"
      );
      return extracted.products || [];
    }

    return products.slice(0, 50); // Limit to 50 products
  } catch (error) {
    console.error("Error extracting products:", error);
    return [];
  }
}

/**
 * Discover Important Pages
 */
export async function discoverPages(
  baseUrl: string,
  htmlContent: string
): Promise<
  Array<{
    pageType:
      | "about"
      | "shipping"
      | "returns"
      | "faq"
      | "contact"
      | "privacy"
      | "terms"
      | "other";
    title: string;
    url: string;
  }>
> {
  try {
    const $ = cheerio.load(htmlContent);
    const pages: Array<{
      pageType:
        | "about"
        | "shipping"
        | "returns"
        | "faq"
        | "contact"
        | "privacy"
        | "terms"
        | "other";
      title: string;
      url: string;
    }> = [];

    // Extract all links
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim().toLowerCase();

      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;

      // Normalize URL
      let fullUrl = href;
      if (href.startsWith("/")) {
        const base = new URL(baseUrl);
        fullUrl = `${base.protocol}//${base.host}${href}`;
      } else if (!href.startsWith("http")) {
        fullUrl = new URL(href, baseUrl).toString();
      }

      // Detect page type
      for (const [type, keywords] of Object.entries(PAGE_TYPE_KEYWORDS)) {
        for (const keyword of keywords) {
          if (
            text.includes(keyword) ||
            href.toLowerCase().includes(keyword)
          ) {
            pages.push({
              pageType: type as any,
              title: $(el).text().trim() || type,
              url: fullUrl,
            });
            return;
          }
        }
      }
    });

    // Remove duplicates
    const uniquePages = pages.filter(
      (page, index, self) =>
        index === self.findIndex((p) => p.url === page.url)
    );

    return uniquePages;
  } catch (error) {
    console.error("Error discovering pages:", error);
    return [];
  }
}

/**
 * Extract FAQs from Page Content
 */
export async function extractFAQs(
  htmlContent: string
): Promise<
  Array<{ question: string; answer: string; category?: string }>
> {
  try {
    const $ = cheerio.load(htmlContent);
    const faqs: Array<{ question: string; answer: string; category?: string }> =
      [];

    // Try to find FAQ sections
    $(
      ".faq, .faqs, [class*='faq'], [class*='question'], .accordion, details"
    ).each((_, el) => {
      const question =
        $(el)
          .find("h1, h2, h3, h4, h5, summary, [class*='question']")
          .first()
          .text()
          .trim() || "";
      const answer =
        $(el)
          .find("p, [class*='answer'], .content")
          .first()
          .text()
          .trim() || "";

      if (question && answer) {
        faqs.push({ question, answer });
      }
    });

    // If no FAQs found using selectors, use LLM
    if (faqs.length === 0) {
      const textContent = $("body").text().substring(0, 5000);

      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are an expert in extracting FAQ (Frequently Asked Questions) from website content. Extract questions and answers in Arabic or English.",
          },
          {
            role: "user",
            content: `Extract FAQs from this content:
${textContent}

Return a JSON array with: question, answer, category (optional: shipping, returns, payment, general)`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "faqs",
            strict: true,
            schema: {
              type: "object",
              properties: {
                faqs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      question: { type: "string" },
                      answer: { type: "string" },
                      category: { type: "string" },
                    },
                    required: ["question", "answer"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["faqs"],
              additionalProperties: false,
            },
          },
        },
      });

      const extracted = JSON.parse(
        llmResponse.choices[0].message.content || "{}"
      );
      return extracted.faqs || [];
    }

    return faqs;
  } catch (error) {
    console.error("Error extracting FAQs:", error);
    return [];
  }
}

/**
 * Fetch Page Content
 */
export async function fetchPageContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}
