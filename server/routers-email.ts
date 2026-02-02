/**
 * Email Router Module
 * Handles email notifications
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";

export const emailRouter = router({
    sendWelcome: protectedProcedure
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            trialEndDate: z.string(),
        }))
        .mutation(async ({ input }) => {
            const { sendWelcomeEmail } = await import('./_core/email');
            const success = await sendWelcomeEmail(input);
            return { success };
        }),

    sendSubscriptionConfirmation: protectedProcedure
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            planName: z.string(),
            startDate: z.string(),
            endDate: z.string(),
        }))
        .mutation(async ({ input }) => {
            const { sendSubscriptionConfirmationEmail } = await import('./_core/email');
            const success = await sendSubscriptionConfirmationEmail(input);
            return { success };
        }),

    sendTrialExpiry: protectedProcedure
        .input(z.object({
            name: z.string(),
            email: z.string().email(),
            daysRemaining: z.number(),
        }))
        .mutation(async ({ input }) => {
            const { sendTrialExpiryEmail } = await import('./_core/email');
            const success = await sendTrialExpiryEmail(input);
            return { success };
        }),
});

export type EmailRouter = typeof emailRouter;
