import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import { quotationGuard } from "./routers-quotations";
import {
  templateListInput,
  templateReadInput,
  templateWriteInput,
  templateReceiptInput,
} from "../shared/quotation-templates";
import {
  readTemplateWorkspace,
  readTemplateDetail,
  writeQuotationTemplate,
  readTemplateReceipt,
  QuotationTemplateLimit,
} from "./quotation-template-workspace";
const guarded = quotationGuard;
// Limit is a reviewed precondition rather than a lost-response failure.
async function write(merchantId: number, actorId: number, input: unknown) {
  let limit = false;
  try {
    return await quotationGuard(async () => {
      try {
        return await writeQuotationTemplate(merchantId, actorId, input);
      } catch (error) {
        limit = error instanceof QuotationTemplateLimit;
        throw error;
      }
    });
  } catch (error) {
    if (limit)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Quotation template limit reached",
      });
    throw error;
  }
}
export const quotationTemplatesRouter = router({
  workspace: permissionProcedure("analytics.read")
    .input(templateListInput)
    .query(async ({ ctx, input }) => ({
      ...(await guarded(() => readTemplateWorkspace(ctx.merchantId, input))),
      canManage: hasPermission(ctx.merchantRole, "orders.manage"),
    })),
  detail: permissionProcedure("analytics.read")
    .input(templateReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readTemplateDetail(ctx.merchantId, input.id))
    ),
  write: permissionProcedure("orders.manage")
    .input(templateWriteInput)
    .mutation(({ ctx, input }) => write(ctx.merchantId, ctx.user.id, input)),
  receipt: permissionProcedure("orders.manage")
    .input(templateReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() => readTemplateReceipt(ctx.merchantId, ctx.user.id, input))
    ),
});
