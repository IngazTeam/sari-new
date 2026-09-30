import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import {
  quotationDeliveryInput,
  quotationDeliveryIdentity,
  quotationSendWorkspaceInput,
} from "../shared/quotation-delivery";
import {
  sendReviewedQuotation,
  readQuotationDelivery,
  readQuotationSendWorkspace,
} from "./quotation-delivery";
import {
  quotationReviewInput,
  quotationReviewReadInput,
} from "../shared/quotation-review";
import {
  prepareQuotationReview,
  readQuotationReview,
} from "./quotation-review";
import { router, permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  quotationDraftInput,
  quotationChangeInput,
  quotationTargetInput,
  quotationReceiptInput,
} from "../shared/quotation-mutations";
import {
  createManualQuotation,
  changeManualQuotation,
  changeQuotationTarget,
  readQuotationReceipt,
  QuotationConflict,
  QuotationUnavailable,
} from "./quotation-mutations";
import {
  quotationListInput,
  quotationReadInput,
} from "../shared/quotation-workspace";
import {
  readQuotationWorkspace,
  readQuotationDetail,
} from "./quotation-workspace";

async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof ZodError)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid quotation fields",
      });
    if (error instanceof QuotationConflict)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Quotation review changed",
      });
    if (error instanceof QuotationUnavailable)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Quotation unavailable",
      });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  }
}
export { guarded as quotationGuard };
export const quotationWorkspaceRouter = router({
  sendWorkspace: permissionProcedure("orders.manage")
    .input(quotationSendWorkspaceInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readQuotationSendWorkspace(ctx.merchantId, ctx.user.id, input)
      )
    ),
  sendReviewed: permissionProcedure("orders.manage")
    .input(quotationDeliveryInput)
    .mutation(({ ctx, input }) =>
      guarded(() => sendReviewedQuotation(ctx.merchantId, ctx.user.id, input))
    ),
  delivery: permissionProcedure("orders.manage")
    .input(quotationDeliveryIdentity)
    .query(({ ctx, input }) =>
      guarded(() => readQuotationDelivery(ctx.merchantId, ctx.user.id, input))
    ),
  prepareReview: permissionProcedure("orders.manage")
    .input(quotationReviewInput)
    .mutation(({ ctx, input }) =>
      guarded(() => prepareQuotationReview(ctx.merchantId, ctx.user.id, input))
    ),
  review: permissionProcedure("orders.manage")
    .input(quotationReviewReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readQuotationReview(ctx.merchantId, ctx.user.id, input))
    ),
  create: permissionProcedure("orders.manage")
    .input(quotationDraftInput)
    .mutation(({ ctx, input }) =>
      guarded(() => createManualQuotation(ctx.merchantId, ctx.user.id, input))
    ),
  change: permissionProcedure("orders.manage")
    .input(quotationChangeInput)
    .mutation(({ ctx, input }) =>
      guarded(() => changeManualQuotation(ctx.merchantId, ctx.user.id, input))
    ),
  target: permissionProcedure("settings.manage")
    .input(quotationTargetInput)
    .mutation(({ ctx, input }) =>
      guarded(() => changeQuotationTarget(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: permissionProcedure("analytics.read")
    .input(quotationReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() => readQuotationReceipt(ctx.merchantId, input))
    ),
  workspace: permissionProcedure("analytics.read")
    .input(quotationListInput)
    .query(async ({ ctx, input }) => ({
      ...(await guarded(() => readQuotationWorkspace(ctx.merchantId, input))),
      canManage: hasPermission(ctx.merchantRole, "orders.manage"),
      canSetTarget: hasPermission(ctx.merchantRole, "settings.manage"),
    })),
  detail: permissionProcedure("analytics.read")
    .input(quotationReadInput)
    .query(async ({ ctx, input }) => {
      const detail = await guarded(() =>
        readQuotationDetail(ctx.merchantId, input.id)
      );
      if (!detail)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Quotation unavailable",
        });
      return detail;
    }),
});
