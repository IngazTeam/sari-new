import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "./_core/trpc";
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
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  }
}
export const quotationWorkspaceRouter = router({
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
