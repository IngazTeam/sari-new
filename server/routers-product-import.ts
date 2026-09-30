import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  productImportPrepareInput,
  productImportReadInput,
  productImportCommitInput,
  productImportDiscardInput,
  productImportReceiptInput,
} from "../shared/product-import";
import {
  prepareProductImport,
  readProductImport,
  commitProductImport,
  readProductImportReceipt,
  discardProductImport,
  ProductImportExpired,
  ProductImportLimit,
  ProductImportSize,
} from "./product-import";
import { ProductImportFileError } from "./product-import-preview";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ProductEditorConflict
        ? "CONFLICT"
        : error instanceof ProductEditorForbidden
          ? "FORBIDDEN"
          : error instanceof ProductEditorMissing
            ? "NOT_FOUND"
            : error instanceof ProductEditorLocked ||
                error instanceof ProductImportExpired
              ? "PRECONDITION_FAILED"
              : error instanceof ProductImportLimit
                ? "TOO_MANY_REQUESTS"
                : error instanceof ProductImportFileError ||
                    error instanceof ProductEditorInvalid ||
                    error instanceof ProductImportSize ||
                    error instanceof ZodError
                  ? "BAD_REQUEST"
                  : "INTERNAL_SERVER_ERROR";
    const reason =
      error instanceof ProductImportFileError
        ? error.reason
        : error instanceof ProductImportExpired
          ? "expired"
          : error instanceof ProductImportLimit
            ? "review_limit"
            : error instanceof ProductImportSize
              ? "preview_size"
              : error instanceof ProductEditorLocked
                ? "source_locked"
                : "unavailable";
    throw new TRPCError({ code, message: `product_import:${reason}` });
  }
}
export const productImportRouter = router({
  prepare: permissionProcedure("products.manage")
    .input(productImportPrepareInput)
    .mutation(({ ctx, input }) =>
      guarded(async () => {
        const decision = await reserveApiRateLimit({
          namespace: "merchant_product_import_review",
          identity: String(ctx.merchantId),
          maxRequests: 30,
          windowMs: 60 * 60 * 1000,
        });
        if (!decision.allowed) throw new ProductImportLimit();
        return prepareProductImport(ctx.merchantId, ctx.user.id, input);
      })
    ),
  read: merchantProcedure
    .input(productImportReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readProductImport(ctx.merchantId, ctx.user.id, input))
    ),
  commit: permissionProcedure("products.manage")
    .input(productImportCommitInput)
    .mutation(({ ctx, input }) =>
      guarded(() => commitProductImport(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: merchantProcedure
    .input(productImportReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readProductImportReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
  discard: permissionProcedure("products.manage")
    .input(productImportDiscardInput)
    .mutation(({ ctx, input }) =>
      guarded(() => discardProductImport(ctx.merchantId, ctx.user.id, input))
    ),
});
