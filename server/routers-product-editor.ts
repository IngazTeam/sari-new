import { TRPCError } from "@trpc/server";
import {
  productDeleteReviewInput,
  productDeleteWriteInput,
  productDeleteReceiptInput,
} from "../shared/product-delete";
import {
  reviewProductDeletion,
  deleteReviewedProducts,
  readProductDeletionReceipt,
} from "./product-delete";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  productEditorReadInput,
  productEditorWrite,
  productEditorReceiptInput,
} from "../shared/product-editor";
import {
  readProductEditor,
  writeProductEditor,
  readProductEditorReceipt,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
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
            : error instanceof ProductEditorLocked
              ? "PRECONDITION_FAILED"
              : error instanceof ProductEditorInvalid
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: "Product editor unavailable" });
  }
}
export const productEditorRouter = router({
  deleteReview: merchantProcedure
    .input(productDeleteReviewInput)
    .query(({ ctx, input }) =>
      guarded(() => reviewProductDeletion(ctx.merchantId, ctx.user.id, input))
    ),
  deleteWrite: permissionProcedure("products.manage")
    .input(productDeleteWriteInput)
    .mutation(({ ctx, input }) =>
      guarded(() => deleteReviewedProducts(ctx.merchantId, ctx.user.id, input))
    ),
  deleteReceipt: merchantProcedure
    .input(productDeleteReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readProductDeletionReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
  read: merchantProcedure
    .input(productEditorReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readProductEditor(ctx.merchantId, ctx.user.id, input))
    ),
  write: permissionProcedure("products.manage")
    .input(productEditorWrite)
    .mutation(({ ctx, input }) =>
      guarded(() => writeProductEditor(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: merchantProcedure
    .input(productEditorReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readProductEditorReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
});
