import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createDiscoveredPage,
  createExtractedFaq,
  createProduct,
  deleteAllDiscoveredPages,
  deleteAllExtractedFaqs,
  deleteAllProductsByMerchantId,
  deleteDiscoveredPage,
  deleteExtractedFaq,
  getActiveFaqsForBot,
  getAnalysisStats,
  getDiscoveredPagesByMerchantId,
  getDiscoveredPagesByType,
  getExtractedFaqsByCategory,
  getExtractedFaqsByMerchantId,
  getMerchantByUserId,
  getMerchantWebsiteInfo,
  getProductsByMerchantId,
  searchFaqsByQuestion,
  updateDiscoveredPage,
  updateExtractedFaq,
  updateMerchant,
  updateMerchantWebsiteInfo,
} from '../db';
import {
  scrapeWebsite,
  detectPlatform,
  extractProducts,
  discoverPages,
  extractContactInfo,
  isUrlSafe,
  detectSiteType,
  smartCrawl,
  extractAllWithAI,
  type ExtractedFAQ,
  type SiteType,
} from "../_core/websiteAnalyzer";
import { checkRateLimit } from "../_core/rateLimiter";

/**
 * Helper: Get merchant or throw
 * FIX: ctx.user.id is the USER id, not the MERCHANT id.
 * All DB functions expect merchant.id, so we must look it up first.
 */
async function getMerchantOrThrow(userId: number) {
  const merchant = await getMerchantByUserId(userId);
  if (!merchant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
  }
  return merchant;
}

export const analysisRouter = router({
  /**
   * Phase 1: Preview Analysis — Extract data WITHOUT saving to DB
   * Returns all extracted data for comparison in the frontend
   */
  previewAnalysis: protectedProcedure
    .input(
      z.object({
        websiteUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // SEC-A1: SSRF guard
        if (!isUrlSafe(input.websiteUrl)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط غير مسموح به.' });
        }

        const merchant = await getMerchantOrThrow(ctx.user.id);

        // SEC-A2: Rate limit (5 per hour per merchant)
        const rl = checkRateLimit(`analysis_preview:${merchant.id}`, 5, 3600000);
        if (!rl.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التحليل. حاول بعد قليل.' });
        }

        // Update status to analyzing
        await updateMerchantWebsiteInfo({
          merchantId: merchant.id,
          analysisStatus: "analyzing",
        });

        // ═══ Phase 1: Scrape homepage ═══
        console.log(`[SmartAnalysis] Starting analysis for ${input.websiteUrl}`);
        const { html, dom, text: homeText } = await scrapeWebsite(input.websiteUrl);
        const platform = detectPlatform(input.websiteUrl, html);
        const siteType = detectSiteType(input.websiteUrl, html, homeText);
        console.log(`[SmartAnalysis] Site type: ${siteType}, Platform: ${platform}`);

        // ═══ Phase 2: Smart crawl (up to 30 pages) ═══
        const crawlResult = await smartCrawl(input.websiteUrl, dom, 30);
        // Combine homepage text + crawled text
        const allText = `--- الصفحة الرئيسية ---\n${homeText}` + crawlResult.allText;
        console.log(`[SmartAnalysis] Total crawled text: ${allText.length} chars from ${crawlResult.pages.length + 1} pages`);

        // ═══ Phase 3: Extract products/services ═══
        let products: any[] = [];
        let faqs: ExtractedFAQ[] = [];
        let companyInfo = { name: '', description: '', industry: '' };

        if (siteType === 'ecommerce') {
          // E-commerce: use existing multi-strategy extraction (API → JSON-LD → HTML → AI)
          products = await extractProducts(input.websiteUrl, html, homeText);
          // If API/HTML found nothing, fall back to AI
          if (products.length === 0 && allText.length >= 100) {
            const aiResult = await extractAllWithAI(allText, input.websiteUrl, siteType);
            products = aiResult.products;
            faqs = aiResult.faqs;
            companyInfo = aiResult.companyInfo;
          } else {
            // For e-commerce with API products, derive basic info from DOM
            const doc = dom.window.document;
            companyInfo.name = doc.querySelector('title')?.textContent?.trim() || '';
            companyInfo.description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
          }
        } else {
          // Non-ecommerce: always use AI extraction from all crawled content
          const aiResult = await extractAllWithAI(allText, input.websiteUrl, siteType);
          products = aiResult.products;
          faqs = aiResult.faqs;
          companyInfo = aiResult.companyInfo;
        }

        // ═══ Phase 4: Extract pages + contact info ═══
        const discoveredPages = discoverPages(dom, input.websiteUrl);
        let contactInfo = extractContactInfo(dom, homeText, html);

        // Enrich contact from crawled contact/about pages
        for (const page of crawlResult.pages.filter(p => p.type === 'contact' || p.type === 'about').slice(0, 2)) {
          try {
            const { dom: pageDom, text: pageText, html: pageHtml } = await scrapeWebsite(page.url);
            const pageContact = extractContactInfo(pageDom, pageText, pageHtml);
            contactInfo.phones = Array.from(new Set([...contactInfo.phones, ...pageContact.phones]));
            contactInfo.emails = Array.from(new Set([...contactInfo.emails, ...pageContact.emails]));
            if (!contactInfo.whatsappNumber && pageContact.whatsappNumber) contactInfo.whatsappNumber = pageContact.whatsappNumber;
            if (!contactInfo.address && pageContact.address) contactInfo.address = pageContact.address;
          } catch {} // silently skip failed pages — already crawled above
        }

        // ═══ Phase 5: Save scraped content for bot knowledge ═══
        try {
          await updateMerchantWebsiteInfo({
            merchantId: merchant.id,
            analysisStatus: "pending",
            websiteUrl: input.websiteUrl,
          });
        } catch (err) {
          console.warn('[SmartAnalysis] Failed to save website info:', err);
        }

        console.log(`[SmartAnalysis] Complete: ${products.length} items, ${faqs.length} FAQs, ${discoveredPages.length} pages, siteType=${siteType}`);

        return {
          success: true,
          websiteUrl: input.websiteUrl,
          platform,
          siteType,
          companyInfo,
          products: products.map(p => ({
            name: p.name,
            description: p.description || '',
            price: p.price || 0,
            currency: p.currency || 'SAR',
            imageUrl: p.imageUrl || '',
            productUrl: p.productUrl || '',
            category: p.category || '',
            inStock: p.inStock ?? true,
          })),
          pages: discoveredPages.map(p => ({
            pageType: p.pageType,
            title: p.title,
            url: p.url,
          })),
          faqs: faqs.map(f => ({
            question: f.question,
            answer: f.answer,
            category: f.category || '',
          })),
          contactInfo: contactInfo || { phones: [], emails: [], whatsappNumber: null, address: null },
          crawlStats: {
            totalPages: crawlResult.pages.length + 1,
            totalChars: allText.length,
            siteType,
          },
        };
      } catch (error: any) {
        // Reset status on failure
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (merchant) {
          await updateMerchantWebsiteInfo({
            merchantId: merchant.id,
            analysisStatus: "failed",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "فشل تحليل الموقع",
        });
      }
    }),

  /**
   * Phase 2: Apply Analysis — Save chosen data to DB based on merchant decisions
   */
  applyAnalysis: protectedProcedure
    .input(
      z.object({
        websiteUrl: z.string().url(),
        platform: z.enum(['salla', 'zid', 'shopify', 'woocommerce', 'custom', 'unknown']),
        // Products
        productsAction: z.enum(['replace', 'merge', 'skip']),
        products: z.array(z.object({
          name: z.string(),
          description: z.string().default(''),
          price: z.number().default(0),
          currency: z.string().default('SAR'),
          imageUrl: z.string().default(''),
          productUrl: z.string().default(''),
          category: z.string().default(''),
        })).default([]),
        // FAQs
        faqsAction: z.enum(['replace', 'merge', 'skip']),
        faqs: z.array(z.object({
          question: z.string(),
          answer: z.string(),
          category: z.string().default(''),
        })).default([]),
        // Pages
        pagesAction: z.enum(['replace', 'merge', 'skip']),
        pages: z.array(z.object({
          pageType: z.string(),
          title: z.string(),
          url: z.string(),
        })).default([]),
        // Contact info
        applyContactInfo: z.boolean().default(false),
        contactInfo: z.object({
          phones: z.array(z.string()).default([]),
          emails: z.array(z.string()).default([]),
          whatsappNumber: z.string().nullable().default(null),
          address: z.string().nullable().default(null),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const merchant = await getMerchantOrThrow(ctx.user.id);
        const merchantId = merchant.id;
        let savedProducts = 0, savedFaqs = 0, savedPages = 0;

        // ── Products ──
        if (input.productsAction !== 'skip' && input.products.length > 0) {
          if (input.productsAction === 'replace') {
            await deleteAllProductsByMerchantId(merchantId);
          }

          // For merge: get existing product names to skip duplicates
          let existingNames: Set<string> = new Set();
          if (input.productsAction === 'merge') {
            const existing = await getProductsByMerchantId(merchantId);
            existingNames = new Set((existing || []).map((p: any) => p.name?.toLowerCase().trim()));
          }

          for (const product of input.products) {
            // Skip duplicates in merge mode
            if (input.productsAction === 'merge' && existingNames.has(product.name.toLowerCase().trim())) {
              continue;
            }
            await createProduct({
              merchantId,
              name: product.name,
              description: product.description,
              price: product.price || 0,
              imageUrl: product.imageUrl || null,
              productUrl: product.productUrl || null,
              category: product.category || null,
              isActive: true,
            });
            savedProducts++;
          }
        }

        // ── FAQs ──
        if (input.faqsAction !== 'skip' && input.faqs.length > 0) {
          if (input.faqsAction === 'replace') {
            await deleteAllExtractedFaqs(merchantId);
          }

          // For merge: get existing questions to skip duplicates
          let existingQuestions: Set<string> = new Set();
          if (input.faqsAction === 'merge') {
            const existing = await getExtractedFaqsByMerchantId(merchantId);
            existingQuestions = new Set((existing || []).map((f: any) => f.question?.toLowerCase().trim()));
          }

          for (const faq of input.faqs) {
            if (input.faqsAction === 'merge' && existingQuestions.has(faq.question.toLowerCase().trim())) {
              continue;
            }
            await createExtractedFaq({
              merchantId,
              question: faq.question,
              answer: faq.answer,
              category: faq.category || null,
            });
            savedFaqs++;
          }
        }

        // ── Pages ──
        if (input.pagesAction !== 'skip' && input.pages.length > 0) {
          if (input.pagesAction === 'replace') {
            await deleteAllDiscoveredPages(merchantId);
          }

          // For merge: get existing page URLs to skip duplicates
          let existingUrls: Set<string> = new Set();
          if (input.pagesAction === 'merge') {
            const existing = await getDiscoveredPagesByMerchantId(merchantId);
            existingUrls = new Set((existing || []).map((p: any) => p.url?.toLowerCase().trim()));
          }

          for (const page of input.pages) {
            if (input.pagesAction === 'merge' && existingUrls.has(page.url.toLowerCase().trim())) {
              continue;
            }
            await createDiscoveredPage({
              merchantId,
              pageType: page.pageType as any,
              title: page.title,
              url: page.url,
            });
            savedPages++;
          }
        }

        // ── Contact Info ──
        if (input.applyContactInfo && input.contactInfo) {
          const updateData: Record<string, any> = {};
          if (input.contactInfo.phones.length > 0) updateData.phone = input.contactInfo.phones[0];
          if (input.contactInfo.address) updateData.address = input.contactInfo.address;
          if (Object.keys(updateData).length > 0) {
            await updateMerchant(merchantId, updateData).catch(() => {});
          }
        }

        // ── Update merchant website info ──
        await updateMerchantWebsiteInfo({
          merchantId,
          websiteUrl: input.websiteUrl,
          platformType: input.platform,
          analysisStatus: "completed",
          lastAnalysisDate: new Date(),
        });

        return {
          success: true,
          savedProducts,
          savedFaqs,
          savedPages,
        };
      } catch (error: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "فشل حفظ بيانات التحليل",
        });
      }
    }),

  /**
   * Get existing data for comparison
   */
  getExistingData: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    const merchantId = merchant.id;

    const products = await getProductsByMerchantId(merchantId);
    const pages = await getDiscoveredPagesByMerchantId(merchantId);
    const faqs = await getExtractedFaqsByMerchantId(merchantId);

    return {
      products: (products || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        price: p.price || 0,
        imageUrl: p.imageUrl || '',
        category: p.category || '',
      })),
      pages: (pages || []).map((p: any) => ({
        id: p.id,
        pageType: p.pageType,
        title: p.title,
        url: p.url,
      })),
      faqs: (faqs || []).map((f: any) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category || '',
      })),
    };
  }),

  // =============================================
  // Legacy mutation — kept for backward compat
  // =============================================

  /**
   * Analyze Website — Full Analysis (legacy — does everything in one shot)
   */
  analyzeWebsite: protectedProcedure
    .input(
      z.object({
        websiteUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // SEC-A1: SSRF guard
        if (!isUrlSafe(input.websiteUrl)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط غير مسموح به.' });
        }

        const merchant = await getMerchantOrThrow(ctx.user.id);
        const merchantId = merchant.id;

        // SEC-A2: Rate limit (5 per hour per merchant)
        const rl = checkRateLimit(`analysis_legacy:${merchantId}`, 5, 3600000);
        if (!rl.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز عدد محاولات التحليل. حاول بعد قليل.' });
        }

        // Update status to analyzing
        await updateMerchantWebsiteInfo({
          merchantId,
          websiteUrl: input.websiteUrl,
          analysisStatus: "analyzing",
        });

        // Fetch website content using the new engine (with curl fallback)
        const { html, dom, text } = await scrapeWebsite(input.websiteUrl);

        // 1. Detect Platform
        const platform = detectPlatform(input.websiteUrl, html);

        // 2. Extract Products (multi-strategy: JSON-LD → API → HTML → AI)
        const products = await extractProducts(
          input.websiteUrl,
          html,
          text
        );

        // Save products to database
        for (const product of products) {
          await createProduct({
            merchantId,
            name: product.name,
            description: product.description,
            price: product.price || 0,
            imageUrl: product.imageUrl,
            isActive: true,
          });
        }

        // 3. Discover Pages (from homepage links)
        const pages = discoverPages(dom, input.websiteUrl);

        // Delete old pages
        await deleteAllDiscoveredPages(merchantId);

        // Save discovered pages (initially without content — content added during crawl)
        const savedPageIds: Map<string, number> = new Map();
        for (const page of pages) {
          const pageId = await createDiscoveredPage({
            merchantId,
            pageType: page.pageType,
            title: page.title,
            url: page.url,
          });
          savedPageIds.set(page.url, pageId);
        }

        // 4. Extract FAQs from each FAQ/shipping/returns page — and save page content for bot
        let allFaqs: ExtractedFAQ[] = [];

        const faqPages = pages.filter(p => ['faq', 'shipping', 'returns'].includes(p.pageType));
        for (const page of faqPages.slice(0, 5)) {
          try {
            const pageScrape = await scrapeWebsite(page.url);
            const pageDoc = pageScrape.dom.window.document;
            const pageText = pageScrape.text;

            // Save page content for bot context (truncated to 2000 chars)
            const pageId = savedPageIds.get(page.url);
            if (pageId && pageText.length > 20) {
              await updateDiscoveredPage(pageId, {
                content: pageText.substring(0, 2000),
              });
            }

            // Extract FAQs using common selectors
            pageDoc.querySelectorAll('.faq, .faqs, [class*="faq"], [class*="question"], .accordion, details, [class*="accordion"]').forEach((el: any) => {
              const question = (el.querySelector('h1, h2, h3, h4, h5, summary, [class*="question"], button')?.textContent || '').trim();
              const answer = (el.querySelector('p, [class*="answer"], .content, .panel, dd')?.textContent || '').trim();
              if (question && answer && question.length > 5 && answer.length > 10) {
                allFaqs.push({ question, answer: answer.substring(0, 500), category: page.pageType });
              }
            });

            // Also try <dt>/<dd> FAQ patterns
            pageDoc.querySelectorAll('dt').forEach((dt: any) => {
              const question = (dt.textContent || '').trim();
              const dd = dt.nextElementSibling;
              if (dd && dd.tagName === 'DD') {
                const answer = (dd.textContent || '').trim();
                if (question && answer) {
                  allFaqs.push({ question, answer: answer.substring(0, 500), category: page.pageType });
                }
              }
            });
          } catch (error) {
            console.error(`Error extracting FAQs from ${page.url}:`, error);
          }
        }

        // Also extract contact info and save content from contact/about pages
        const contactPages = pages.filter(p => ['contact', 'about'].includes(p.pageType));
        for (const page of contactPages.slice(0, 2)) {
          try {
            const pageScrape = await scrapeWebsite(page.url);
            const contactInfoData = extractContactInfo(pageScrape.dom, pageScrape.text, pageScrape.html);

            // Save page content for bot context
            const pageId = savedPageIds.get(page.url);
            if (pageId && pageScrape.text.length > 20) {
              await updateDiscoveredPage(pageId, {
                content: pageScrape.text.substring(0, 2000),
              });
            }

            // Save phone/whatsapp to merchant if not already set
            const updateData: Record<string, any> = {};
            if (contactInfoData.phones.length > 0) updateData.phone = contactInfoData.phones[0];
            if (contactInfoData.whatsappNumber) updateData.whatsappNumber = contactInfoData.whatsappNumber;
            if (Object.keys(updateData).length > 0) {
              await updateMerchant(merchantId, updateData).catch(() => {});
            }
          } catch (error) {
            console.error(`Error extracting contact from ${page.url}:`, error);
          }
        }

        // Delete old FAQs
        await deleteAllExtractedFaqs(merchantId);

        // Save extracted FAQs — auto-enable for bot usage
        for (const faq of allFaqs) {
          await createExtractedFaq({
            merchantId,
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
          });
        }

        // Update merchant info
        await updateMerchantWebsiteInfo({
          merchantId,
          platformType: platform,
          analysisStatus: "completed",
          lastAnalysisDate: new Date(),
        });

        return {
          success: true,
          platform,
          productsCount: products.length,
          pagesCount: pages.length,
          faqsCount: allFaqs.length,
        };
      } catch (error: any) {
        // Update status to failed
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (merchant) {
          await updateMerchantWebsiteInfo({
            merchantId: merchant.id,
            analysisStatus: "failed",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message || "فشل تحليل الموقع",
        });
      }
    }),

  /**
   * Get Analysis Status
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      return {
        hasWebsite: false,
        analysisStatus: "pending",
      };
    }

    const info = await getMerchantWebsiteInfo(merchant.id);
    if (!info) {
      return {
        hasWebsite: false,
        analysisStatus: "pending",
      };
    }

    const stats = await getAnalysisStats(merchant.id);

    return {
      hasWebsite: !!info.websiteUrl,
      websiteUrl: info.websiteUrl,
      platformType: info.platformType,
      analysisStatus: info.analysisStatus,
      lastAnalysisDate: info.lastAnalysisDate,
      ...stats,
    };
  }),

  /**
   * Get Discovered Pages
   */
  getDiscoveredPages: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await getDiscoveredPagesByMerchantId(merchant.id);
  }),

  /**
   * Get Discovered Pages by Type
   */
  getPagesByType: protectedProcedure
    .input(
      z.object({
        pageType: z.enum([
          "about",
          "shipping",
          "returns",
          "faq",
          "contact",
          "privacy",
          "terms",
          "other",
        ]),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.user.id);
      return await getDiscoveredPagesByType(merchant.id, input.pageType);
    }),

  /**
   * Update Discovered Page
   */
  updatePage: protectedProcedure
    .input(
      z.object({
        pageId: z.number(),
        title: z.string().optional(),
        url: z.string().url().optional(),
        content: z.string().optional(),
        isActive: z.boolean().optional(),
        useInBot: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { pageId, ...data } = input;
      await updateDiscoveredPage(pageId, data);
      return { success: true };
    }),

  /**
   * Delete Discovered Page
   */
  deletePage: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteDiscoveredPage(input.pageId);
      return { success: true };
    }),

  /**
   * Get Extracted FAQs
   */
  getExtractedFaqs: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await getExtractedFaqsByMerchantId(merchant.id);
  }),

  /**
   * Get FAQs by Category
   */
  getFaqsByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.user.id);
      return await getExtractedFaqsByCategory(merchant.id, input.category);
    }),

  /**
   * Get Active FAQs for Bot
   */
  getActiveFaqsForBot: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await getActiveFaqsForBot(merchant.id);
  }),

  /**
   * Update FAQ
   */
  updateFaq: protectedProcedure
    .input(
      z.object({
        faqId: z.number(),
        question: z.string().optional(),
        answer: z.string().optional(),
        category: z.string().optional(),
        isActive: z.boolean().optional(),
        useInBot: z.boolean().optional(),
        priority: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { faqId, ...data } = input;
      await updateExtractedFaq(faqId, data);
      return { success: true };
    }),

  /**
   * Delete FAQ
   */
  deleteFaq: protectedProcedure
    .input(z.object({ faqId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteExtractedFaq(input.faqId);
      return { success: true };
    }),

  /**
   * Search FAQs
   */
  searchFaqs: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.user.id);
      return await searchFaqsByQuestion(merchant.id, input.query);
    }),

  /**
   * Get Analysis Statistics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await getAnalysisStats(merchant.id);
  }),
});
