import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { permissionProcedure, router } from "./_core/trpc";
import {
  readProductSheetConnection,
  listProductSheetSource,
  ProductSheetDisconnected,
} from "./product-sheet-source";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
} from "./product-editor";
import { ProductSheetProviderError } from "./product-sheet-provider";
import { ProductSheetReadError } from "./product-sheet-preview";
import { productSheetListInput } from "../shared/product-sheet-import";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
import {
  productSheetPrepareInput,
  productSheetReadInput,
  productSheetCommitInput,
  productSheetReceiptInput,
  productSheetDiscardInput,
} from "../shared/product-sheet-review";
import {
  prepareProductSheetReview,
  readProductSheetReview,
  commitProductSheetReview,
  readProductSheetReceipt,
  discardProductSheetReview,
  ProductSheetReviewExpired,
  ProductSheetReviewLimit,
  ProductSheetReviewSize,
} from "./product-sheet-review";
import { ProductSheetCatalogLimit } from "./product-sheet-catalog";
import { ProductEditorInvalid } from "./product-editor";
import { ProductImportFileError } from "./product-import-preview";
class SheetReadLimit extends Error {}
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ProductEditorForbidden
        ? "FORBIDDEN"
        : error instanceof ProductEditorMissing
          ? "NOT_FOUND"
          : error instanceof ProductEditorConflict
            ? "CONFLICT"
            : error instanceof ProductEditorLocked ||
                error instanceof ProductSheetDisconnected ||
                error instanceof ProductSheetReviewExpired
              ? "PRECONDITION_FAILED"
              : error instanceof SheetReadLimit ||
                  error instanceof ProductSheetReviewLimit
                ? "TOO_MANY_REQUESTS"
                : error instanceof ZodError ||
                    error instanceof ProductEditorInvalid ||
                    error instanceof ProductSheetReviewSize ||
                    error instanceof ProductSheetCatalogLimit ||
                    error instanceof ProductImportFileError
                  ? "BAD_REQUEST"
                  : error instanceof ProductSheetProviderError ||
                      error instanceof ProductSheetReadError
                    ? "BAD_GATEWAY"
                    : "INTERNAL_SERVER_ERROR";
    const reason =
      error instanceof ProductSheetReviewExpired
        ? "expired"
        : error instanceof ProductSheetReviewLimit
          ? "review_limit"
          : error instanceof ProductSheetReviewSize
            ? "review_size"
            : error instanceof ProductSheetCatalogLimit
              ? "catalog_limit"
              : error instanceof ProductImportFileError
                ? error.reason
                : "unavailable";
    throw new TRPCError({ code, message: `product_sheet:${reason}` });
  }
}
export const productSheetRouter = router({
  prepare: permissionProcedure("products.manage")
    .input(productSheetPrepareInput)
    .mutation(({ ctx, input }) =>
      guarded(async () => {
        const limit = await reserveApiRateLimit({
          namespace: "merchant_product_sheet_prepare",
          identity: String(ctx.merchantId),
          maxRequests: 30,
          windowMs: 60 * 60 * 1000,
        });
        if (!limit.allowed) throw new SheetReadLimit();
        return prepareProductSheetReview(ctx.merchantId, ctx.user.id, input);
      })
    ),
  read: permissionProcedure("products.manage")
    .input(productSheetReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readProductSheetReview(ctx.merchantId, ctx.user.id, input))
    ),
  commit: permissionProcedure("products.manage")
    .input(productSheetCommitInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        commitProductSheetReview(ctx.merchantId, ctx.user.id, input)
      )
    ),
  receipt: permissionProcedure("products.manage")
    .input(productSheetReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() => readProductSheetReceipt(ctx.merchantId, ctx.user.id, input))
    ),
  discard: permissionProcedure("products.manage")
    .input(productSheetDiscardInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        discardProductSheetReview(ctx.merchantId, ctx.user.id, input)
      )
    ),
  connection: permissionProcedure("products.manage").query(({ ctx }) =>
    guarded(() => readProductSheetConnection(ctx.merchantId, ctx.user.id))
  ),
  list: permissionProcedure("products.manage")
    .input(productSheetListInput)
    .query(({ ctx, input }) =>
      guarded(async () => {
        const limit = await reserveApiRateLimit({
          namespace: "merchant_product_sheet_read",
          identity: String(ctx.merchantId),
          maxRequests: 30,
          windowMs: 60 * 60 * 1000,
        });
        if (!limit.allowed) throw new SheetReadLimit();
        return listProductSheetSource(ctx.merchantId, ctx.user.id, input);
      })
    ),
});
