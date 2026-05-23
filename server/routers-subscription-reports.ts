/**
 * Subscription Reports Router Module
 * Handles subscription reporting (Admin)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  getCancellationStats,
  getMonthlyRevenueStats,
  getRevenueStats,
  getSubscriptionConversionRate,
  getSubscriptionDistributionByPlan,
  getSubscriptionOverview,
  getUpgradeDowngradeStats,
} from './db';

export const subscriptionReportsRouter = router({
    getOverview: adminProcedure.query(async () => {
        return await getSubscriptionOverview();
    }),

    getConversionRate: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await (getSubscriptionConversionRate as any)(input?.period || 'month');
        }),

    getUpgradeDowngrade: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await (getUpgradeDowngradeStats as any)(input?.period || 'month');
        }),

    getCancellations: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await (getCancellationStats as any)(input?.period || 'month');
        }),

    getRevenue: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await getRevenueStats(input?.period || 'month');
        }),

    getMonthlyRevenue: adminProcedure.query(async () => {
        return await getMonthlyRevenueStats();
    }),

    getDistributionByPlan: adminProcedure.query(async () => {
        return await getSubscriptionDistributionByPlan();
    }),
});

export type SubscriptionReportsRouter = typeof subscriptionReportsRouter;
