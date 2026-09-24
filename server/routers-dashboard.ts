/**
 * Dashboard Router Module
 * Handles dashboard analytics and statistics
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { getMerchantById } from './db';

const reportDays = z.number().int().min(1).max(366).default(30);
const productLimit = z.number().int().min(1).max(50).default(5);

export const dashboardRouter = router({
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
            return await getOrdersTrend(merchant.id, input.days);
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
            return await getRevenueTrend(merchant.id, input.days);
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
            return await getComparisonStats(merchant.id, input.days);
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
            return await getTopProducts(merchant.id, input.limit);
        }),

    // Main dashboard stats
    getStats: permissionProcedure('analytics.read')
        .query(async ({ ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getDashboardStats } = await import('./dashboard-analytics');
            return await getDashboardStats(merchant.id);
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
        .query(async ({ ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { generateMerchantInsights } = await import('./ai/insights');
            return await generateMerchantInsights(merchant.id);
        }),
});

export type DashboardRouter = typeof dashboardRouter;
