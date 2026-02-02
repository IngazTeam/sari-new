/**
 * Trial Router Module
 * Handles trial management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const trialRouter = router({
    getStatus: protectedProcedure.query(async ({ ctx }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

        return {
            isTrialActive: user.isTrialActive === 1,
            trialStartDate: user.trialStartDate,
            trialEndDate: user.trialEndDate,
            whatsappConnected: user.whatsappConnected === 1,
        };
    }),

    checkExpiry: protectedProcedure.query(async ({ ctx }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

        if (user.isTrialActive === 1 && user.trialEndDate) {
            const now = new Date();
            const endDate = new Date(user.trialEndDate);
            const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            return {
                isExpired: daysRemaining <= 0,
                daysRemaining: Math.max(0, daysRemaining),
            };
        }

        return {
            isExpired: false,
            daysRemaining: 0,
        };
    }),
});

export type TrialRouter = typeof trialRouter;
