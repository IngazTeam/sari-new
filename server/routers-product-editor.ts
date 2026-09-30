import { TRPCError } from "@trpc/server";
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
