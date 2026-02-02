/**
 * Try Sari Analytics Router Module
 * Handles analytics for the public demo
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const trySariAnalyticsRouter = router({
    // Get analytics stats
    getStats: adminProcedure
        .input(z.object({
            days: z.number().min(1).max(365).optional(),
        }))
        .query(async ({ input }) => {
            return await db.getTrySariAnalyticsStats(input.days || 30);
        }),

    // Get daily data for charts
    getDailyData: adminProcedure
        .input(z.object({
            days: z.number().min(1).max(365).optional(),
        }))
        .query(async ({ input }) => {
            return await db.getTrySariDailyData(input.days || 30);
        }),
});

export type TrySariAnalyticsRouter = typeof trySariAnalyticsRouter;
