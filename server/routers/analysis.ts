import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
import {
  scrapeWebsite,
  detectPlatform,
  extractProducts,
  discoverPages,
  extractContactInfo,
  type ExtractedFAQ,
} from "../_core/websiteAnalyzer";

/**
 * Helper: Get merchant or throw
 * FIX: ctx.user.id is the USER id, not the MERCHANT id.
 * All DB functions expect merchant.id, so we must look it up first.
 */
async function getMerchantOrThrow(userId: number) {
  const merchant = await db.getMerchantByUserId(userId);
  if (!merchant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
  }
  return merchant;
}

export const analysisRouter = router({
  /**
   * Analyze Website - Full Analysis
   */
  analyzeWebsite: protectedProcedure
    .input(
      z.object({
        websiteUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const merchant = await getMerchantOrThrow(ctx.user.id);
        const merchantId = merchant.id;

        // Update status to analyzing
        await db.updateMerchantWebsiteInfo({
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
          await db.createProduct({
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
        await db.deleteAllDiscoveredPages(merchantId);

        // Save discovered pages (initially without content — content added during crawl)
        const savedPageIds: Map<string, number> = new Map();
        for (const page of pages) {
          const pageId = await db.createDiscoveredPage({
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
              await db.updateDiscoveredPage(pageId, {
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
            const contactInfo = extractContactInfo(pageScrape.dom, pageScrape.text, pageScrape.html);

            // Save page content for bot context
            const pageId = savedPageIds.get(page.url);
            if (pageId && pageScrape.text.length > 20) {
              await db.updateDiscoveredPage(pageId, {
                content: pageScrape.text.substring(0, 2000),
              });
            }

            // Save phone/whatsapp to merchant if not already set
            const updateData: Record<string, any> = {};
            if (contactInfo.phones.length > 0) updateData.phone = contactInfo.phones[0];
            if (contactInfo.whatsappNumber) updateData.whatsappNumber = contactInfo.whatsappNumber;
            if (Object.keys(updateData).length > 0) {
              await db.updateMerchant(merchantId, updateData).catch(() => {});
            }
          } catch (error) {
            console.error(`Error extracting contact from ${page.url}:`, error);
          }
        }

        // Delete old FAQs
        await db.deleteAllExtractedFaqs(merchantId);

        // Save extracted FAQs — auto-enable for bot usage
        for (const faq of allFaqs) {
          await db.createExtractedFaq({
            merchantId,
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
          });
        }

        // Update merchant info
        await db.updateMerchantWebsiteInfo({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (merchant) {
          await db.updateMerchantWebsiteInfo({
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
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      return {
        hasWebsite: false,
        analysisStatus: "pending",
      };
    }

    const info = await db.getMerchantWebsiteInfo(merchant.id);
    if (!info) {
      return {
        hasWebsite: false,
        analysisStatus: "pending",
      };
    }

    const stats = await db.getAnalysisStats(merchant.id);

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
    return await db.getDiscoveredPagesByMerchantId(merchant.id);
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
      return await db.getDiscoveredPagesByType(merchant.id, input.pageType);
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
      await db.updateDiscoveredPage(pageId, data);
      return { success: true };
    }),

  /**
   * Delete Discovered Page
   */
  deletePage: protectedProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteDiscoveredPage(input.pageId);
      return { success: true };
    }),

  /**
   * Get Extracted FAQs
   */
  getExtractedFaqs: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await db.getExtractedFaqsByMerchantId(merchant.id);
  }),

  /**
   * Get FAQs by Category
   */
  getFaqsByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.user.id);
      return await db.getExtractedFaqsByCategory(merchant.id, input.category);
    }),

  /**
   * Get Active FAQs for Bot
   */
  getActiveFaqsForBot: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await db.getActiveFaqsForBot(merchant.id);
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
      await db.updateExtractedFaq(faqId, data);
      return { success: true };
    }),

  /**
   * Delete FAQ
   */
  deleteFaq: protectedProcedure
    .input(z.object({ faqId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteExtractedFaq(input.faqId);
      return { success: true };
    }),

  /**
   * Search FAQs
   */
  searchFaqs: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantOrThrow(ctx.user.id);
      return await db.searchFaqsByQuestion(merchant.id, input.query);
    }),

  /**
   * Get Analysis Statistics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantOrThrow(ctx.user.id);
    return await db.getAnalysisStats(merchant.id);
  }),
});
