/**
 * Discounts Router Module
 * Handles discount code management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const discountsRouter = router({
    // Create discount code
    create: protectedProcedure
        .input(z.object({
            merchantId: z.number(),
            code: z.string().min(4).max(50),
            type: z.enum(['percentage', 'fixed']),
            value: z.number().positive(),
            minOrderAmount: z.number().optional(),
            maxUses: z.number().optional(),
            expiresAt: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const discountCode = await db.createDiscountCode({
                merchantId: input.merchantId,
                code: input.code.toUpperCase(),
                type: input.type,
                value: input.value,
                minOrderAmount: input.minOrderAmount || null,
                maxUses: input.maxUses || null,
                usedCount: 0,
                isActive: true,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            });

            return { success: true, discountCode };
        }),

    // List all discount codes
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getDiscountCodesByMerchantId(input.merchantId);
        }),

    // Get discount code by ID
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            const discountCode = await db.getDiscountCodeById(input.id);
            if (!discountCode) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const merchant = await db.getMerchantById(discountCode.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return discountCode;
        }),

    // Update discount code
    update: protectedProcedure
        .input(z.object({
            id: z.number(),
            isActive: z.boolean().optional(),
            maxUses: z.number().optional(),
            expiresAt: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const discountCode = await db.getDiscountCodeById(input.id);
            if (!discountCode) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const merchant = await db.getMerchantById(discountCode.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await db.updateDiscountCode(input.id, {
                isActive: input.isActive,
                maxUses: input.maxUses,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            });

            return { success: true, message: 'تم تحديث كود الخصم' };
        }),

    // Delete discount code
    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const discountCode = await db.getDiscountCodeById(input.id);
            if (!discountCode) {
                throw new TRPCError({ code: 'NOT_FOUND' });
            }

            const merchant = await db.getMerchantById(discountCode.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await db.deleteDiscountCode(input.id);
            return { success: true, message: 'تم حذف كود الخصم' };
        }),

    // Get statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const codes = await db.getDiscountCodesByMerchantId(input.merchantId);
            const active = codes.filter(c => c.isActive).length;
            const used = codes.reduce((sum, c) => sum + c.usedCount, 0);

            return {
                total: codes.length,
                active,
                used,
            };
        }),
});

export type DiscountsRouter = typeof discountsRouter;
