import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  categoryWrite,
  categoryReceiptInput,
  CategoryPlanFailure,
} from "../shared/product-categories";
import {
  readProductCategories,
  writeProductCategory,
  readProductCategoryReceipt,
} from "./product-categories";
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
              : error instanceof CategoryPlanFailure
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({
      code,
      message:
        error instanceof CategoryPlanFailure
          ? `category:${error.reason}`
          : "Category operation unavailable",
    });
  }
}
export const productCategoryRouter = router({
  read: merchantProcedure.query(({ ctx }) =>
    guard(() => readProductCategories(ctx.merchantId, ctx.user.id))
  ),
  write: permissionProcedure("products.manage")
    .input(categoryWrite)
    .mutation(({ ctx, input }) =>
      guard(() => writeProductCategory(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: merchantProcedure
    .input(categoryReceiptInput)
    .query(({ ctx, input }) =>
      guard(() =>
        readProductCategoryReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
});
