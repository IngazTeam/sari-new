/**
 * Dashboard Router Module
 * Handles dashboard analytics and statistics
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, merchantProcedure, router } from "./_core/trpc";
import { getMerchantById } from './db';
import { dashboardWorkspaceInput } from '../shared/dashboard-workspace';

const reportDays = z.number().int().min(1).max(366).default(30);
const productLimit = z.number().int().min(1).max(50).default(5);

export const dashboardRouter = router({
    sources: merchantProcedure.query(async ({ ctx }) => {
        try {
            const { readDashboardSources } = await import('./dashboard-sources');
            return await readDashboardSources(ctx.merchantId);
        } catch {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Source summary unavailable' });
        }
    }),
    workspace: permissionProcedure('analytics.read')
        .input(dashboardWorkspaceInput)
        .query(async ({ ctx, input }) => {
            try {
                const { readDashboardWorkspace } = await import('./dashboard-workspace');
                return await readDashboardWorkspace(ctx.merchantId, input);
            } catch {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Dashboard unavailable' });
            }
        }),
    // Orders trend
    getOrdersTrend: permissionProcedure('analytics.read')
        .input(z.object({
            days: reportDays,
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getOrdersTrend } = await import('./dashboard-analytics');
            return await getOrdersTrend(merchant.id, input.days, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // Revenue trend
    getRevenueTrend: permissionProcedure('analytics.read')
        .input(z.object({
            days: reportDays,
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getRevenueTrend } = await import('./dashboard-analytics');
            return await getRevenueTrend(merchant.id, input.days, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // Comparison with previous period
    getComparisonStats: permissionProcedure('analytics.read')
        .input(z.object({
            days: reportDays,
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getComparisonStats } = await import('./dashboard-analytics');
            return await getComparisonStats(merchant.id, input.days, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // Top products
    getTopProducts: permissionProcedure('analytics.read')
        .input(z.object({
            limit: productLimit,
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getTopProducts } = await import('./dashboard-analytics');
            return await getTopProducts(merchant.id, input.limit, 90, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // Main dashboard stats
    getStats: permissionProcedure('analytics.read')
        .query(async ({ ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getDashboardStats } = await import('./dashboard-analytics');
            return await getDashboardStats(merchant.id, 30, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // Combined dashboard summary - reduces 5 requests to 1
    getSummary: permissionProcedure('analytics.read')
        .input(z.object({
            days: reportDays,
            topProductsLimit: productLimit,
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getDashboardSummary } = await import('./dashboard-analytics');
            return await getDashboardSummary(merchant.id, input.days, input.topProductsLimit, merchant.currency === 'USD' ? 'USD' : 'SAR');
        }),

    // AI Opportunity Engine — "ساري يقترح"
    getAiInsights: permissionProcedure('analytics.read')
        .input(z.object({ language: z.enum(['ar', 'en']).default('ar') }).strict().optional())
        .query(async ({ ctx, input }) => {
            try {
                const { generateMerchantInsights } = await import('./ai/insights');
                return await generateMerchantInsights(ctx.merchantId, input?.language ?? 'ar');
            } catch {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Suggestions unavailable' });
            }
        }),
});

export type DashboardRouter = typeof dashboardRouter;
