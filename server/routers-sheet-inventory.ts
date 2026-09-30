import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { permissionProcedure, router } from "./_core/trpc";
import { reserveApiRateLimit } from "./api/distributed-rate-limit";
import {
  readProductSheetConnection,
  listProductSheetSource,
  ProductSheetDisconnected,
} from "./product-sheet-source";
import { productSheetListInput } from "../shared/product-sheet-import";
import {
  inventorySheetPrepareInput,
  inventorySheetReadInput,
  inventorySheetCommitInput,
  inventorySheetDiscardInput,
  inventorySheetReceiptInput,
} from "../shared/product-sheet-inventory-review";
import {
  prepareInventorySheetReview,
  readInventorySheetReview,
  commitInventorySheetReview,
  readInventorySheetReceipt,
  discardInventorySheetReview,
  InventorySheetReviewExpired,
  InventorySheetReviewLimit,
  InventorySheetReviewSize,
} from "./product-sheet-inventory-review";
import {
  ProductEditorMissing,
  ProductEditorForbidden,
  ProductEditorConflict,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
import { ProductSheetProviderError } from "./product-sheet-provider";
import { ProductSheetReadError } from "./product-sheet-preview";
import { SheetInventoryEmpty } from "./product-sheet-inventory";
class InventoryReadLimit extends Error {}
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ProductEditorMissing
        ? "NOT_FOUND"
        : error instanceof ProductEditorForbidden
          ? "FORBIDDEN"
          : error instanceof ProductEditorConflict
            ? "CONFLICT"
            : error instanceof ProductEditorLocked ||
                error instanceof ProductSheetDisconnected ||
                error instanceof InventorySheetReviewExpired
              ? "PRECONDITION_FAILED"
              : error instanceof InventorySheetReviewLimit ||
                  error instanceof InventoryReadLimit
                ? "TOO_MANY_REQUESTS"
                : error instanceof ProductEditorInvalid ||
                    error instanceof ZodError ||
                    error instanceof InventorySheetReviewSize ||
                    error instanceof SheetInventoryEmpty
                  ? "BAD_REQUEST"
                  : error instanceof ProductSheetProviderError ||
                      error instanceof ProductSheetReadError
                    ? "BAD_GATEWAY"
                    : "INTERNAL_SERVER_ERROR";
    const reason =
      error instanceof InventorySheetReviewExpired
        ? "expired"
        : error instanceof InventorySheetReviewLimit
          ? "review_limit"
          : error instanceof InventorySheetReviewSize
            ? "review_size"
            : error instanceof SheetInventoryEmpty
              ? "empty_file"
              : "unavailable";
    throw new TRPCError({ code, message: `inventory_sheet:${reason}` });
  }
}
async function limit(merchantId: number, namespace: string) {
  if (
    !(
      await reserveApiRateLimit({
        namespace,
        identity: String(merchantId),
        maxRequests: 30,
        windowMs: 60 * 60 * 1000,
      })
    ).allowed
  )
    throw new InventoryReadLimit();
}
export const sheetInventoryRouter = router({
  connection: permissionProcedure("products.manage").query(({ ctx }) =>
    guarded(() => readProductSheetConnection(ctx.merchantId, ctx.user.id))
  ),
  list: permissionProcedure("products.manage")
    .input(productSheetListInput)
    .query(({ ctx, input }) =>
      guarded(async () => {
        await limit(ctx.merchantId, "merchant_inventory_sheet_read");
        return listProductSheetSource(ctx.merchantId, ctx.user.id, input);
      })
    ),
  prepare: permissionProcedure("products.manage")
    .input(inventorySheetPrepareInput)
    .mutation(({ ctx, input }) =>
      guarded(async () => {
        await limit(ctx.merchantId, "merchant_inventory_sheet_prepare");
        return prepareInventorySheetReview(ctx.merchantId, ctx.user.id, input);
      })
    ),
  read: permissionProcedure("products.manage")
    .input(inventorySheetReadInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readInventorySheetReview(ctx.merchantId, ctx.user.id, input)
      )
    ),
  commit: permissionProcedure("products.manage")
    .input(inventorySheetCommitInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        commitInventorySheetReview(ctx.merchantId, ctx.user.id, input)
      )
    ),
  receipt: permissionProcedure("products.manage")
    .input(inventorySheetReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readInventorySheetReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
  discard: permissionProcedure("products.manage")
    .input(inventorySheetDiscardInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        discardInventorySheetReview(ctx.merchantId, ctx.user.id, input)
      )
    ),
});
