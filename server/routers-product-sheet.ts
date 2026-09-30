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
                error instanceof ProductSheetDisconnected
              ? "PRECONDITION_FAILED"
              : error instanceof SheetReadLimit
                ? "TOO_MANY_REQUESTS"
                : error instanceof ZodError
                  ? "BAD_REQUEST"
                  : error instanceof ProductSheetProviderError ||
                      error instanceof ProductSheetReadError
                    ? "BAD_GATEWAY"
                    : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: "product_sheet:unavailable" });
  }
}
export const productSheetRouter = router({
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
