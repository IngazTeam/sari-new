/**
 * Products Router Module
 * Reviewed product writes/imports, variants/categories, and provider import tools
 *
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { productCatalogInput } from "../shared/product-catalog";
import { readProductCatalog } from "./product-catalog";
import { hasPermission } from "./_core/permissions";
import { productEditorRouter } from "./routers-product-editor";
import { productImportRouter } from "./routers-product-import";
import { productFileAdviceRouter } from "./routers-product-file-advice";
import { productSheetRouter } from "./routers-product-sheet";
import { sheetInventoryRouter } from "./routers-sheet-inventory";
import { productCategoryRouter } from "./routers-product-categories";
import { productDetailsRouter } from "./routers-product-details";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, router } from "./_core/trpc";
import { readProductStock } from "./product-stock";
import { productStockInput } from "../shared/product-stock";

export const productsRouter = router({
  editor: productEditorRouter,
  importReview: productImportRouter,
  fileAdvice: productFileAdviceRouter,
  sheetImport: productSheetRouter,
  sheetInventory: sheetInventoryRouter,
  categories: productCategoryRouter,
  details: productDetailsRouter,
  // List products for merchant — PERF-03 FIX: server-side pagination + search
  list: merchantProcedure
    .input(productCatalogInput)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await readProductCatalog(ctx.merchantId, input)),
          canManage: hasPermission(ctx.merchantRole, "products.manage"),
        };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Product catalog unavailable",
        });
      }
    }),

  // Low Stock Alerts
  // ============================================

  getLowStock: merchantProcedure
    .input(productStockInput)
    .query(async ({ ctx, input }) => {
      try {
        return await readProductStock(ctx.merchantId, input);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Product stock unavailable",
        });
      }
    }),
});

export type ProductsRouter = typeof productsRouter;
