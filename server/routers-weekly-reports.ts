/**
 * Weekly Reports Router Module
 * Handles weekly sentiment reports
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const weeklyReportsRouter = router({
    // Get merchant's weekly reports
    list: protectedProcedure
        .input(z.object({
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.getWeeklySentimentReports(merchant.id, input.limit || 10);
        }),

    // Get specific report
    getById: protectedProcedure
        .input(z.object({
            reportId: z.number(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            const report = await db.getWeeklySentimentReportById(input.reportId);
            if (!report || report.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            return report;
        }),

    // Generate test report (for current week)
    generateTest: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const { generateWeeklyReport } = await import('./reports/sentiment-weekly');
            const reportId = await generateWeeklyReport(merchant.id);

            return { reportId, success: true };
        }),
});

export type WeeklyReportsRouter = typeof weeklyReportsRouter;
