import { hasPermission } from "../_core/permissions";
import { router, merchantProcedure, permissionProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
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
} from "../db";
import {
  importPreviewInput,
  importReadInput,
  importApplyInput,
} from "../../shared/website-import";
import { extractImportPreview } from "../knowledge/website-import-extract";
import {
  storeImportReview,
  readImportReview,
  refreshImportReview,
  applyReviewedImport,
} from "../knowledge/website-import";
async function importOperation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[WebsiteImport]", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Website import unavailable",
    });
  }
}

/** Resolve the merchant selected and authorized by the procedure middleware. */
async function getMerchantOrThrow(merchantId: number) {
  const merchant = await getMerchantById(merchantId);
  if (!merchant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
  }
  return merchant;
}

export const analysisRouter = router({
  importAccess: merchantProcedure.query(({ ctx }) => ({
    canManage: hasPermission(ctx.merchantRole, "bot_settings.manage"),
  })),
  // Kept for the setup wizard: extraction only; no active data or merchant settings change.
  previewAnalysis: permissionProcedure("bot_settings.manage")
    .input(z.object({ websiteUrl: z.string().url().max(500) }))
    .mutation(({ ctx, input }) =>
      importOperation(() =>
        extractImportPreview(ctx.merchantId, input.websiteUrl)
      )
    ),
  previewImport: permissionProcedure("bot_settings.manage")
    .input(importPreviewInput)
    .mutation(({ ctx, input }) =>
      importOperation(async () => {
        const proposal = await extractImportPreview(
          ctx.merchantId,
          input.websiteUrl
        );
        return storeImportReview(
          ctx.merchantId,
          {
            ...proposal,
            productsAction: "skip",
            pagesAction: "skip",
            faqsAction: "skip",
            applyContactInfo: false,
          },
          proposal.warnings
        );
      })
    ),
  importReview: merchantProcedure
    .input(importReadInput)
    .query(({ ctx, input }) =>
      importOperation(() => readImportReview(ctx.merchantId, input.previewId))
    ),
  refreshImport: permissionProcedure("bot_settings.manage")
    .input(importReadInput)
    .mutation(({ ctx, input }) =>
      importOperation(() =>
        refreshImportReview(ctx.merchantId, input.previewId)
      )
    ),
  applyImport: permissionProcedure("bot_settings.manage")
    .input(importApplyInput)
    .mutation(({ ctx, input }) =>
      importOperation(() => applyReviewedImport(ctx.merchantId, input))
    ),
  applyAnalysis: permissionProcedure("bot_settings.manage")
    .input(z.unknown())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open the saved import review before applying changes.",
      });
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
        description: p.description || "",
        price: p.price || 0,
        imageUrl: p.imageUrl || "",
        category: p.category || "",
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
        category: f.category || "",
      })),
    };
  }),

  analyzeWebsite: permissionProcedure("bot_settings.manage")
    .input(z.unknown())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Use the reviewed website import.",
      });
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
  updatePage: permissionProcedure("bot_settings.manage")
    .input(z.unknown().optional())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open the reviewed page workspace before changing knowledge.",
      });
    }),

  /**
   * Delete Discovered Page
   */
  deletePage: permissionProcedure("bot_settings.manage")
    .input(z.unknown().optional())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open the reviewed page workspace before changing knowledge.",
      });
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
  updateFaq: permissionProcedure("bot_settings.manage")
    .input(z.unknown().optional())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open the reviewed FAQ workspace before changing knowledge.",
      });
    }),

  /**
   * Delete FAQ
   */
  deleteFaq: permissionProcedure("bot_settings.manage")
    .input(z.unknown().optional())
    .mutation(() => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Open the reviewed FAQ workspace before changing knowledge.",
      });
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
