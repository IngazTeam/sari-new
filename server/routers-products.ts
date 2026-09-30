/**
 * Products Router Module
 * Reviewed product writes/imports, variants/categories, and provider import tools
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { majorToMinor } from '../shared/product-money';
import { productCatalogInput } from '../shared/product-catalog';
import { readProductCatalog } from './product-catalog';
import { hasPermission } from './_core/permissions';
import { productEditorRouter } from './routers-product-editor';
import { productImportRouter } from './routers-product-import';
import { productFileAdviceRouter } from './routers-product-file-advice';
import { productSheetRouter } from './routers-product-sheet';
import { sheetInventoryRouter } from './routers-sheet-inventory';
const majorPriceSchema = z.number().refine(value => {
  try { majorToMinor(value); return true; } catch { return false; }
}, 'Price must be nonnegative with at most two decimal places');
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import {
  getMerchantById,
  getProductById,
  updateProduct,
} from './db';

export const productsRouter = router({
    editor: productEditorRouter,
    importReview: productImportRouter,
    fileAdvice: productFileAdviceRouter,
    sheetImport: productSheetRouter,
    sheetInventory: sheetInventoryRouter,
    // List products for merchant — PERF-03 FIX: server-side pagination + search
    list: merchantProcedure
        .input(productCatalogInput)
        .query(async ({ ctx, input }) => {
            try {
                return { ...(await readProductCatalog(ctx.merchantId, input)),
                    canManage: hasPermission(ctx.merchantRole, 'products.manage') };
            } catch {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Product catalog unavailable' });
            }
        }),

    // Get product with variants and options
    getById: merchantProcedure
        .input(z.object({ productId: z.number() }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            const variants = await prodDb.getVariantsByProductId(input.productId);
            const options = await prodDb.getOptionsByProductId(input.productId);

            return { ...product, variants, options };
        }),

    // ============================================
    // Variant CRUD
    // ============================================

    addVariant: permissionProcedure('products.manage')
        .input(z.object({
            productId: z.number(),
            name: z.string(),
            sku: z.string().optional(),
            price: majorPriceSchema.optional(),
            compareAtPrice: majorPriceSchema.optional(),
            costPrice: majorPriceSchema.optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            const variant = await prodDb.createVariant({
                ...input,
                merchantId: merchant.id,
                stock: input.stock ?? 0,
                sortOrder: 0,
            }, 'major');

            // Mark product as having variants
            if (!product.hasVariants) {
                await updateProduct(input.productId, { hasVariants: 1 } as any, 'major');
            }

            return variant;
        }),

    updateVariant: permissionProcedure('products.manage')
        .input(z.object({
            variantId: z.number(),
            productId: z.number(),
            name: z.string().optional(),
            sku: z.string().optional(),
            price: majorPriceSchema.nullable().optional(),
            compareAtPrice: majorPriceSchema.nullable().optional(),
            costPrice: majorPriceSchema.nullable().optional(),
            stock: z.number().optional(),
            barcode: z.string().optional(),
            weight: z.string().optional(),
            imageUrl: z.string().optional(),
            options: z.string().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify variant belongs to this product
            const variants = await prodDb.getVariantsByProductId(input.productId);
            const variant = variants.find(v => v.id === input.variantId);
            if (!variant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found for this product' });
            }
            const { variantId, productId, ...data } = input;
            if (variant.priceUnit !== 'minor' && data.price !== undefined) {
                data.compareAtPrice ??= null;
                data.costPrice ??= null;
            }
            await prodDb.updateVariant(variantId, data as any, 'major');
            return { success: true };
        }),

    deleteVariant: permissionProcedure('products.manage')
        .input(z.object({ variantId: z.number(), productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const product = await getProductById(input.productId);
            if (!product || product.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify variant belongs to this product
            const variants = await prodDb.getVariantsByProductId(input.productId);
            if (!variants.find(v => v.id === input.variantId)) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found for this product' });
            }
            await prodDb.deleteVariant(input.variantId);

            // Check if product still has variants
            const remaining = await prodDb.getVariantsByProductId(input.productId);
            if (remaining.length === 0) {
                await updateProduct(input.productId, { hasVariants: 0 } as any, 'major');
            }

            return { success: true };
        }),

    // ============================================
    // Category CRUD
    // ============================================

    listCategories: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        return await prodDb.getCategoriesByMerchantId(merchant.id);
    }),

    createCategory: permissionProcedure('products.manage')
        .input(z.object({
            name: z.string().min(1),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const prodDb = await import('./db/products');
            return await prodDb.createCategory({
                merchantId: merchant.id,
                ...input,
            });
        }),

    updateCategory: permissionProcedure('products.manage')
        .input(z.object({
            id: z.number(),
            name: z.string().optional(),
            nameEn: z.string().optional(),
            parentId: z.number().nullable().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify category belongs to this merchant
            const cats = await prodDb.getCategoriesByMerchantId(merchant.id);
            if (!cats.find(c => c.id === input.id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }
            const { id, ...data } = input;
            await prodDb.updateCategory(id, data as any);
            return { success: true };
        }),

    deleteCategory: permissionProcedure('products.manage')
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            const prodDb = await import('./db/products');
            // SEC-IDOR: Verify category belongs to this merchant
            const cats = await prodDb.getCategoriesByMerchantId(merchant.id);
            if (!cats.find(c => c.id === input.id)) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }
            await prodDb.deleteCategory(input.id);
            return { success: true };
        }),

    // ============================================
    // Low Stock Alerts
    // ============================================

    getLowStock: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const prodDb = await import('./db/products');
        const products = await prodDb.getLowStockProducts(merchant.id);
        const variants = await prodDb.getLowStockVariants(merchant.id);
        return { products, variants, total: products.length + variants.length };
    }),

});

export type ProductsRouter = typeof productsRouter;
