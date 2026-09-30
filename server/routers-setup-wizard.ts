/** Owner-scoped setup drafts, review and atomic approval. */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { setupTemplatePreview } from "../shared/setup-template";
import {
  setupReviewInput,
  setupCompletionInput,
  setupReceiptInput,
} from "../shared/setup-completion";
import { setupProgressInput, setupResetInput } from "../shared/setup-progress";
import {
  reviewSetupCompletion,
  completeReviewedSetup,
  readSetupCompletionReceipt,
} from "./setup-completion";
import {
  readSetupProgress,
  saveSetupProgress,
  resetSetupProgress,
} from "./setup-progress";
import {
  SetupConflict,
  SetupForbidden,
  SetupReviewRequired,
} from "./setup-store";
import {
  getBusinessTemplateByIdWithTranslations,
  getBusinessTemplatesWithTranslations,
  getMerchantByUserId,
} from "./db";

async function scoped<T>(
  actorId: number,
  action: (merchantId: number) => Promise<T>
) {
  try {
    const merchant = await getMerchantByUserId(actorId);
    if (!merchant) throw new SetupForbidden();
    return await action(merchant.id);
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof SetupConflict
          ? "CONFLICT"
          : error instanceof SetupForbidden
            ? "FORBIDDEN"
            : error instanceof SetupReviewRequired
              ? "PRECONDITION_FAILED"
              : "INTERNAL_SERVER_ERROR",
      message: "SETUP_REVIEW_UNAVAILABLE",
    });
  }
}
export const setupWizardRouter = router({
  getProgress: protectedProcedure.query(({ ctx }) =>
    scoped(ctx.user.id, id => readSetupProgress(id, ctx.user.id))
  ),
  saveProgress: protectedProcedure
    .input(setupProgressInput)
    .mutation(({ ctx, input }) =>
      scoped(ctx.user.id, id => saveSetupProgress(id, ctx.user.id, input))
    ),
  reviewSetup: protectedProcedure
    .input(setupReviewInput)
    .mutation(({ ctx, input }) =>
      scoped(ctx.user.id, id => reviewSetupCompletion(id, ctx.user.id, input))
    ),
  completeSetup: protectedProcedure
    .input(setupCompletionInput)
    .mutation(({ ctx, input }) =>
      scoped(ctx.user.id, id => completeReviewedSetup(id, ctx.user.id, input))
    ),
  completionReceipt: protectedProcedure
    .input(setupReceiptInput)
    .query(({ ctx, input }) =>
      scoped(ctx.user.id, id =>
        readSetupCompletionReceipt(id, ctx.user.id, input)
      )
    ),
  resetWizard: protectedProcedure
    .input(setupResetInput)
    .mutation(({ ctx, input }) =>
      scoped(ctx.user.id, id => resetSetupProgress(id, ctx.user.id, input))
    ),
  getTemplates: publicProcedure
    .input(
      z.object({
        businessType: z.enum(["store", "services", "both"]).optional(),
        language: z.enum(["ar", "en"]).optional(),
      })
    )
    .query(async ({ input }) =>
      getBusinessTemplatesWithTranslations(input.language, input.businessType)
    ),
  previewTemplate: protectedProcedure
    .input(
      z
        .object({
          templateId: z.number().int().positive(),
          language: z.enum(["ar", "en"]),
        })
        .strict()
    )
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Merchant not found",
        });
      const template = await getBusinessTemplateByIdWithTranslations(
        input.templateId,
        input.language
      );
      if (!template || template.is_active !== 1)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      try {
        return setupTemplatePreview(template);
      } catch {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "SETUP_TEMPLATE_INVALID",
        });
      }
    }),
});
export type SetupWizardRouter = typeof setupWizardRouter;
