/**
 * Usage Router Module
 * Handles usage and statistics
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getMerchantByUserId, getMerchantCurrentUsage, getMerchantUsageHistory } from './db';

export const usageRouter = router({
    getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        const usage = await getMerchantCurrentUsage(merchant.id);
        if (!usage) throw new TRPCError({ code: 'NOT_FOUND', message: 'لا يوجد بيانات استخدام' });

        return usage;
    }),

    getUsageHistory: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        return await getMerchantUsageHistory(merchant.id);
    }),
});

export type UsageRouter = typeof usageRouter;
