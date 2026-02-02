/**
 * Coupons Router Module
 * Handles discount coupons management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const couponsRouter = router({
    list: adminProcedure.query(async () => {
        return await db.getAllDiscountCoupons();
    }),

    create: adminProcedure
        .input(z.object({
            code: z.string(),
            description: z.string().optional(),
            discountType: z.enum(['percentage', 'fixed']),
            discountValue: z.number(),
            minPurchaseAmount: z.number().optional(),
            maxDiscountAmount: z.number().optional(),
            validFrom: z.date(),
            validUntil: z.date(),
            maxUsageCount: z.number().optional(),
            maxUsagePerMerchant: z.number(),
        }))
        .mutation(async ({ input, ctx }) => {
            const id = await db.createDiscountCoupon({
                ...input,
                createdBy: ctx.user.id,
            });
            return { id };
        }),

    update: adminProcedure
        .input(z.object({
            id: z.number(),
            description: z.string().optional(),
            discountType: z.enum(['percentage', 'fixed']).optional(),
            discountValue: z.number().optional(),
            minPurchaseAmount: z.number().optional(),
            maxDiscountAmount: z.number().optional(),
            validFrom: z.date().optional(),
            validUntil: z.date().optional(),
            maxUsageCount: z.number().optional(),
            maxUsagePerMerchant: z.number().optional(),
            isActive: z.number().optional(),
        }))
        .mutation(async ({ input }) => {
            const { id, ...data } = input;
            await db.updateDiscountCoupon(id, data);
            return { success: true };
        }),

    deactivate: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
            await db.deactivateDiscountCoupon(input.id);
            return { success: true };
        }),

    validate: protectedProcedure
        .input(z.object({ code: z.string(), planId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

            const coupon = await db.getDiscountCouponByCode(input.code);
            if (!coupon) throw new TRPCError({ code: 'NOT_FOUND', message: 'الكوبون غير موجود' });

            if (!coupon.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون غير نشط' });

            const now = new Date();
            if (new Date(coupon.validFrom) > now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون لم يبدأ بعد' });
            if (new Date(coupon.validUntil) < now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون منتهي' });

            if (coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون مستنفذ' });
            }

            const merchantUsage = await db.getCouponUsageCountByMerchant(coupon.id, merchant.id);
            if (merchantUsage >= coupon.maxUsagePerMerchant) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لقد استخدمت هذا الكوبون من قبل' });
            }

            return coupon;
        }),
});

export type CouponsRouter = typeof couponsRouter;
