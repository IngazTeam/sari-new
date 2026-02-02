/**
 * Message Analytics Router Module
 * Handles message statistics and analytics
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const messageAnalyticsRouter = router({
    // Message statistics
    getMessageStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const startDate = input.startDate ? new Date(input.startDate) : undefined;
            const endDate = input.endDate ? new Date(input.endDate) : undefined;

            return db.getMessageStats(merchant.id, startDate, endDate);
        }),

    // Peak hours
    getPeakHours: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const startDate = input.startDate ? new Date(input.startDate) : undefined;
            const endDate = input.endDate ? new Date(input.endDate) : undefined;

            return db.getPeakHours(merchant.id, startDate, endDate);
        }),

    // Top products by inquiries
    getTopProducts: protectedProcedure
        .input(z.object({
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            return db.getTopProducts(merchant.id, input.limit || 10);
        }),
});

export type MessageAnalyticsRouter = typeof messageAnalyticsRouter;
