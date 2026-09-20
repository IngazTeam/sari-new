import { router, merchantProcedure, permissionProcedure } from "../_core/trpc";
import { z } from "zod";
import { formatProductPrice } from '../../shared/product-money';
import { analysisSnapshotSchema, AnalysisSnapshotValidationError, applyAnalysisSnapshot } from '../catalog/analysis-snapshot';
import { TRPCError } from "@trpc/server";
import {
  deleteDiscoveredPage,
  deleteExtractedFaq,
  getActiveFaqsForBot,
  getAnalysisStats,
  getDiscoveredPagesByMerchantId,
  getDiscoveredPagesByType,
  getExtractedFaqsByCategory,
  getExtractedFaqsByMerchantId,
  getMerchantById,
  getMerchantWebsiteInfo,
  getProductsByMerchantId,
  searchFaqsByQuestion,
  updateDiscoveredPage,
  updateExtractedFaq,
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

/** Resolve the merchant selected and authorized by the procedure middleware. */
async function getMerchantOrThrow(merchantId: number) {
  const merchant = await getMerchantById(merchantId);
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
  previewAnalysis: permissionProcedure('bot_settings.manage')
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

        const merchant = await getMerchantOrThrow(ctx.merchantId);

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
          products = await extractProducts(input.websiteUrl, html, homeText, merchant.id);
          // If API/HTML found nothing, fall back to AI
          if (products.length === 0 && allText.length >= 100) {
            const aiResult = await extractAllWithAI(allText, input.websiteUrl, siteType, merchant.id);
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
          const aiResult = await extractAllWithAI(allText, input.websiteUrl, siteType, merchant.id);
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
        if (error instanceof TRPCError) throw error;
        // Reset status on failure
        const merchant = await getMerchantById(ctx.merchantId);
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
  applyAnalysis: permissionProcedure('bot_settings.manage')
    .input(analysisSnapshotSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const merchant = await getMerchantOrThrow(ctx.merchantId);
        const merchantId = merchant.id;
        const result = await applyAnalysisSnapshot(merchantId, input);
        // ── GAP-1 FIX: Feed saved data into Knowledge Engine ──
        try {
          const savedContent: string[] = [];
          if (result.savedProducts > 0) {
            savedContent.push('--- المنتجات ---');
            for (const p of (await getProductsByMerchantId(merchantId)).filter(p => p.isActive === 1 && p.status === 'active')) {
              savedContent.push(`• ${p.name}: ${p.description || ''} — ${formatProductPrice(p)}`);
            }
          }
          if (result.savedFaqs > 0) {
            savedContent.push('--- الأسئلة الشائعة ---');
            for (const f of await getActiveFaqsForBot(merchantId)) {
              savedContent.push(`س: ${f.question}\nج: ${f.answer}`);
            }
          }
          const fullText = savedContent.join('\n');
          if (fullText.length > 100) {
            const { ingestContent } = await import('../ai/knowledge-engine');
            const { embedAllSections } = await import('../ai/rag-engine');
            const knowledgeDb = await import('../db/knowledge');

            await ingestContent(merchantId, fullText, 'website', { businessName: merchant.businessName || '' }, input.websiteUrl);
            await embedAllSections(merchantId, true);
            await knowledgeDb.invalidateCache(merchantId);
          }
        } catch { /* non-blocking */ }
        // Even short content or a failed embedding must invalidate the previous bot context.
        try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchantId); } catch { /* non-blocking */ }

        return result;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof AnalysisSnapshotValidationError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'بيانات التحليل غير صالحة. راجع المنتجات والروابط.' });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "فشل حفظ بيانات التحليل",
        });
      }
    }),

  /**
   * Get existing data for comparison
   */
  getExistingData: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.merchantId);
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
  analyzeWebsite: permissionProcedure('bot_settings.manage')
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

        const merchant = await getMerchantOrThrow(ctx.merchantId);
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
          text,
          merchantId,
        );

        // 3. Discover Pages (from homepage links)
        const pages = discoverPages(dom, input.websiteUrl);

        const pageContents = new Map<string, string>();
        let contactPhone: string | undefined;

        // 4. Extract FAQs from each FAQ/shipping/returns page — and save page content for bot
        let allFaqs: ExtractedFAQ[] = [];

        const faqPages = pages.filter(p => ['faq', 'shipping', 'returns'].includes(p.pageType));
        for (const page of faqPages.slice(0, 5)) {
          try {
            const pageScrape = await scrapeWebsite(page.url);
            const pageDoc = pageScrape.dom.window.document;
            const pageText = pageScrape.text;

            // Save page content for bot context (truncated to 2000 chars)
            if (pageText.length > 20) pageContents.set(page.url, pageText.substring(0, 2000));

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
            if (pageScrape.text.length > 20) pageContents.set(page.url, pageScrape.text.substring(0, 2000));
            if (contactInfoData.phones.length) contactPhone = contactInfoData.phones[0];
          } catch (error) {
            console.error(`Error extracting contact from ${page.url}:`, error);
          }
        }

        // Crawl first; persist the complete local result with the same atomic writer.
        const saved = await applyAnalysisSnapshot(merchantId, {
          websiteUrl: input.websiteUrl, platform,
          productsAction: 'merge', products: products.map(product => ({ ...product, currency: product.currency as 'SAR' | 'USD' })),
          faqsAction: 'replace', faqs: allFaqs,
          pagesAction: 'replace', pages: pages.map(page => ({ ...page, content: pageContents.get(page.url) })),
          applyContactInfo: Boolean(contactPhone), contactInfo: { phones: contactPhone ? [contactPhone] : [] },
        });
        try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchantId); } catch { /* non-blocking */ }

        return {
          success: true,
          platform,
          productsCount: saved.savedProducts,
          pagesCount: saved.savedPages,
          faqsCount: saved.savedFaqs,
        };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        // Update status to failed
        const merchant = await getMerchantById(ctx.merchantId);
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
  getStatus: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
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
  getDiscoveredPages: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.merchantId);
    return await getDiscoveredPagesByMerchantId(merchant.id);
  }),

  /**
   * Get Discovered Pages by Type
   */
  getPagesByType: merchantProcedure
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
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      return await getDiscoveredPagesByType(merchant.id, input.pageType);
    }),

  /**
   * Update Discovered Page
   */
  updatePage: permissionProcedure('bot_settings.manage')
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
      // IDOR FIX: Verify ownership before update
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      const pages = await getDiscoveredPagesByMerchantId(merchant.id);
      const owned = pages.find((p: any) => p.id === input.pageId);
      if (!owned) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      }
      const { pageId, ...data } = input;
      await updateDiscoveredPage(pageId, data);
      // Invalidate cache so bot sees changes immediately
      try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      return { success: true };
    }),

  /**
   * Delete Discovered Page
   */
  deletePage: permissionProcedure('bot_settings.manage')
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // IDOR FIX: Verify ownership before delete
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      const pages = await getDiscoveredPagesByMerchantId(merchant.id);
      const owned = pages.find((p: any) => p.id === input.pageId);
      if (!owned) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'الصفحة غير موجودة' });
      }
      await deleteDiscoveredPage(input.pageId);
      // Invalidate cache so bot stops using deleted page
      try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      return { success: true };
    }),

  /**
   * Get Extracted FAQs
   */
  getExtractedFaqs: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.merchantId);
    return await getExtractedFaqsByMerchantId(merchant.id);
  }),

  /**
   * Get FAQs by Category
   */
  getFaqsByCategory: merchantProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      return await getExtractedFaqsByCategory(merchant.id, input.category);
    }),

  /**
   * Get Active FAQs for Bot
   */
  getActiveFaqsForBot: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.merchantId);
    return await getActiveFaqsForBot(merchant.id);
  }),

  /**
   * Update FAQ
   */
  updateFaq: permissionProcedure('bot_settings.manage')
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
      // IDOR FIX: Verify ownership before update
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      const faqs = await getExtractedFaqsByMerchantId(merchant.id);
      const owned = faqs.find((f: any) => f.id === input.faqId);
      if (!owned) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'السؤال غير موجود' });
      }
      const { faqId, ...data } = input;
      await updateExtractedFaq(faqId, data);
      // Invalidate cache so bot sees FAQ changes
      try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      return { success: true };
    }),

  /**
   * Delete FAQ
   */
  deleteFaq: permissionProcedure('bot_settings.manage')
    .input(z.object({ faqId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // IDOR FIX: Verify ownership before delete
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      const faqs = await getExtractedFaqsByMerchantId(merchant.id);
      const owned = faqs.find((f: any) => f.id === input.faqId);
      if (!owned) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'السؤال غير موجود' });
      }
      await deleteExtractedFaq(input.faqId);
      // Invalidate cache so bot stops using deleted FAQ
      try { const kDb = await import('../db/knowledge'); await kDb.invalidateCache(merchant.id); } catch { /* non-blocking */ }
      return { success: true };
    }),

  /**
   * Search FAQs
   */
  searchFaqs: merchantProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.merchantId);
      return await searchFaqsByQuestion(merchant.id, input.query);
    }),

  /**
   * Get Analysis Statistics
   */
  getStats: merchantProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.merchantId);
    return await getAnalysisStats(merchant.id);
  }),
});
