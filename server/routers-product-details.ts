import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  productDetailsRead,
  productDetailWrite,
  productDetailReceiptInput,
  ProductDetailPlanFailure,
} from "../shared/product-details";
import {
  readProductDetails,
  writeProductDetail,
  readProductDetailReceipt,
} from "./product-details";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
} from "./product-editor";
async function guard<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ProductEditorConflict
        ? "CONFLICT"
        : error instanceof ProductEditorForbidden
          ? "FORBIDDEN"
          : error instanceof ProductEditorLocked
            ? "PRECONDITION_FAILED"
            : error instanceof ProductEditorMissing
              ? "NOT_FOUND"
              : error instanceof ProductDetailPlanFailure
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({
      code,
      message:
        error instanceof ProductDetailPlanFailure
          ? `product-detail:${error.reason}`
          : "Product details unavailable",
    });
  }
}
export const productDetailsRouter = router({
  read: merchantProcedure
    .input(productDetailsRead)
    .query(({ ctx, input }) =>
      guard(() => readProductDetails(ctx.merchantId, ctx.user.id, input))
    ),
  write: permissionProcedure("products.manage")
    .input(productDetailWrite)
    .mutation(({ ctx, input }) =>
      guard(() => writeProductDetail(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: merchantProcedure
    .input(productDetailReceiptInput)
    .query(({ ctx, input }) =>
      guard(() => readProductDetailReceipt(ctx.merchantId, ctx.user.id, input))
    ),
});
