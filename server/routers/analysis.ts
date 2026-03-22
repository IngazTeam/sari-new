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
        const merchantId = ctx.user.id;

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

        // Save discovered pages
        for (const page of pages) {
          await db.createDiscoveredPage({
            merchantId,
            pageType: page.pageType,
            title: page.title,
            url: page.url,
          });
        }

        // 4. Extract FAQs from each FAQ/shipping/returns page
        let allFaqs: ExtractedFAQ[] = [];

        const faqPages = pages.filter(p => ['faq', 'shipping', 'returns'].includes(p.pageType));
        for (const page of faqPages.slice(0, 5)) {
          try {
            const pageScrape = await scrapeWebsite(page.url);
            const pageDoc = pageScrape.dom.window.document;

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

        // Also extract contact info from contact/about pages
        const contactPages = pages.filter(p => ['contact', 'about'].includes(p.pageType));
        for (const page of contactPages.slice(0, 2)) {
          try {
            const pageScrape = await scrapeWebsite(page.url);
            const contactInfo = extractContactInfo(pageScrape.dom, pageScrape.text, pageScrape.html);
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

        // Save extracted FAQs
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
        await db.updateMerchantWebsiteInfo({
          merchantId: ctx.user.id,
          analysisStatus: "failed",
        });

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
    const info = await db.getMerchantWebsiteInfo(ctx.user.id);
    if (!info) {
      return {
        hasWebsite: false,
        analysisStatus: "pending",
      };
    }

    const stats = await db.getAnalysisStats(ctx.user.id);

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
    return await db.getDiscoveredPagesByMerchantId(ctx.user.id);
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
      return await db.getDiscoveredPagesByType(ctx.user.id, input.pageType);
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
    return await db.getExtractedFaqsByMerchantId(ctx.user.id);
  }),

  /**
   * Get FAQs by Category
   */
  getFaqsByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      return await db.getExtractedFaqsByCategory(ctx.user.id, input.category);
    }),

  /**
   * Get Active FAQs for Bot
   */
  getActiveFaqsForBot: protectedProcedure.query(async ({ ctx }) => {
    return await db.getActiveFaqsForBot(ctx.user.id);
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
      return await db.searchFaqsByQuestion(ctx.user.id, input.query);
    }),

  /**
   * Get Analysis Statistics
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    return await db.getAnalysisStats(ctx.user.id);
  }),
});
