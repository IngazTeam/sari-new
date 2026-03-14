/**
 * tRPC routers للوحة التحكم التحليلية
 * 
 * SEC-01 FIX: All endpoints now verify merchant ownership instead of
 * blindly accepting client-supplied merchantId.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as dbInsights from "./db-insights";
import * as db from "./db";

export const insightsRouter = router({
  /**
   * الحصول على إحصائيات الكلمات المفتاحية
   */
  getKeywordStats: protectedProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d']).default('30d')
    }))
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return await dbInsights.getKeywordInsights(merchant.id, input.period);
    }),

  /**
   * الحصول على التقارير الأسبوعية
   */
  getWeeklyReports: protectedProcedure
    .input(z.object({
      limit: z.number().default(4)
    }))
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return await dbInsights.getWeeklyReportsList(merchant.id, input.limit);
    }),

  /**
   * الحصول على اختبارات A/B النشطة
   */
  getActiveABTests: protectedProcedure
    .query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return await dbInsights.getActiveABTests(merchant.id);
    }),
});
