import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { router, permissionProcedure } from "./_core/trpc";
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
    .query(({ ctx, input }) =>
      guarded(() => readQuotationWorkspace(ctx.merchantId, input))
    ),
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
