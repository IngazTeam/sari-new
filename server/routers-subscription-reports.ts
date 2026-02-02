/**
 * Subscription Reports Router Module
 * Handles subscription reporting (Admin)
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const subscriptionReportsRouter = router({
    getOverview: adminProcedure.query(async () => {
        return await db.getSubscriptionOverview();
    }),

    getConversionRate: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await db.getSubscriptionConversionRate(input?.period || 'month');
        }),

    getUpgradeDowngrade: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await db.getUpgradeDowngradeStats(input?.period || 'month');
        }),

    getCancellations: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await db.getCancellationStats(input?.period || 'month');
        }),

    getRevenue: adminProcedure
        .input(z.object({ period: z.enum(['week', 'month', 'year']).optional() }).optional())
        .query(async ({ input }) => {
            return await db.getRevenueStats(input?.period || 'month');
        }),

    getMonthlyRevenue: adminProcedure.query(async () => {
        return await db.getMonthlyRevenueStats();
    }),

    getDistributionByPlan: adminProcedure.query(async () => {
        return await db.getSubscriptionDistributionByPlan();
    }),
});

export type SubscriptionReportsRouter = typeof subscriptionReportsRouter;
