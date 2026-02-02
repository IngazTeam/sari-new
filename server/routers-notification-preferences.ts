/**
 * Notification Preferences Router Module
 * Handles user notification preferences
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const notificationPreferencesRouter = router({
    get: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        return await db.getNotificationPreferences(merchant.id);
    }),

    update: protectedProcedure
        .input(z.object({
            merchantId: z.number(),
            newOrdersEnabled: z.boolean().optional(),
            newMessagesEnabled: z.boolean().optional(),
            appointmentsEnabled: z.boolean().optional(),
            orderStatusEnabled: z.boolean().optional(),
            missedMessagesEnabled: z.boolean().optional(),
            whatsappDisconnectEnabled: z.boolean().optional(),
            preferredMethod: z.enum(['push', 'email', 'both']).optional(),
            quietHoursEnabled: z.boolean().optional(),
            quietHoursStart: z.string().optional(),
            quietHoursEnd: z.string().optional(),
            instantNotifications: z.boolean().optional(),
            batchNotifications: z.boolean().optional(),
            batchInterval: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant || merchant.id !== input.merchantId) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await db.updateNotificationPreferences(input.merchantId, input);
            return { success: true };
        }),
});

export type NotificationPreferencesRouter = typeof notificationPreferencesRouter;
