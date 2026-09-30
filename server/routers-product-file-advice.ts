import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  productFileAdviceStart,
  productFileAdviceRead,
  productFileAdviceReceipt,
} from "../shared/product-file-advice";
import {
  startProductFileAdvice,
  readProductFileAdvice,
  ProductFileAdviceLimit,
} from "./product-file-advice-requests";
import { ProductFileAdviceError } from "./product-file-advice";
import { ProductImportFileError } from "./product-import-preview";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
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
            : error instanceof ProductFileAdviceLimit
              ? "TOO_MANY_REQUESTS"
              : error instanceof ProductFileAdviceError ||
                  error instanceof ProductImportFileError ||
                  error instanceof ZodError
                ? "BAD_REQUEST"
                : "INTERNAL_SERVER_ERROR";
    const reason =
      error instanceof ProductFileAdviceError ||
      error instanceof ProductImportFileError
        ? error.reason
        : error instanceof ProductFileAdviceLimit
          ? "limit"
          : "unavailable";
    throw new TRPCError({ code, message: `product_file_advice:${reason}` });
  }
}
export const productFileAdviceRouter = router({
  start: permissionProcedure("products.manage")
    .input(productFileAdviceStart)
    .output(productFileAdviceReceipt)
    .mutation(({ ctx, input }) =>
      guarded(() => startProductFileAdvice(ctx.merchantId, ctx.user.id, input))
    ),
  read: merchantProcedure
    .input(productFileAdviceRead)
    .output(productFileAdviceReceipt)
    .query(({ ctx, input }) =>
      guarded(() => readProductFileAdvice(ctx.merchantId, ctx.user.id, input))
    ),
});
