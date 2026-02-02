/**
 * Products Router Module
 * Handles product CRUD operations and CSV import
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const productsRouter = router({
    // List products for merchant
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await db.getProductsByMerchantId(merchant.id);
    }),

    // Create product
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(1),
            description: z.string().optional(),
            price: z.number().positive(),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().url().optional(),
            stock: z.number().int().min(0).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const productId = await db.createProduct({
                merchantId: merchant.id,
                ...input,
                currency: input.currency || merchant.currency || 'SAR',
            });
            return { success: true, productId };
        }),

    // Update product
    update: protectedProcedure
        .input(z.object({
            productId: z.number(),
            name: z.string().min(1).optional(),
            description: z.string().optional(),
            price: z.number().positive().optional(),
            currency: z.enum(['SAR', 'USD']).optional(),
            imageUrl: z.string().url().optional(),
            stock: z.number().int().min(0).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            const { productId, ...updates } = input;
            await db.updateProduct(productId, updates);
            return { success: true };
        }),

    // Delete product
    delete: protectedProcedure
        .input(z.object({ productId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            await db.deleteProduct(input.productId);
            return { success: true };
        }),

    // Upload CSV
    uploadCSV: protectedProcedure
        .input(z.object({
            csvData: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

            // Parse CSV data
            const lines = input.csvData.split('\n').filter(line => line.trim());
            if (lines.length < 2) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'CSV file is empty or invalid' });
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            let successCount = 0;
            let errorCount = 0;

            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = lines[i].split(',').map(v => v.trim());
                    const product: any = {};

                    headers.forEach((header, index) => {
                        if (values[index]) {
                            product[header] = values[index];
                        }
                    });

                    if (product.name && product.price) {
                        await db.createProduct({
                            merchantId: merchant.id,
                            name: product.name,
                            description: product.description || null,
                            price: parseFloat(product.price),
                            imageUrl: product.imageurl || product.image || null,
                            stock: product.stock ? parseInt(product.stock) : null,
                        });
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch (error) {
                    errorCount++;
                }
            }

            return {
                success: true,
                imported: successCount,
                failed: errorCount,
                total: lines.length - 1
            };
        }),
});

export type ProductsRouter = typeof productsRouter;
