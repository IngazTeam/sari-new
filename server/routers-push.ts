/**
 * Push Notifications Router Module
 * Handles push notification subscriptions and sending
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const pushRouter = router({
    // Get VAPID public key
    getVapidPublicKey: publicProcedure.query(async () => {
        const { getVapidPublicKey } = await import('./_core/pushNotifications');
        return { publicKey: getVapidPublicKey() };
    }),

    // Subscribe to push notifications
    subscribe: protectedProcedure
        .input(
            z.object({
                endpoint: z.string(),
                p256dh: z.string(),
                auth: z.string(),
                userAgent: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const { createPushSubscription } = await import('./db_push');
            await createPushSubscription({
                merchantId: merchant.id,
                endpoint: input.endpoint,
                p256dh: input.p256dh,
                auth: input.auth,
                userAgent: input.userAgent,
            });
            return { success: true };
        }),

    // Unsubscribe from push notifications
    unsubscribe: protectedProcedure
        .input(
            z.object({
                endpoint: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const { getActivePushSubscriptions, deactivatePushSubscription } = await import('./db_push');
            const subscriptions = await getActivePushSubscriptions(merchant.id);
            const subscription = subscriptions.find((s) => s.endpoint === input.endpoint);
            if (subscription) {
                await deactivatePushSubscription(subscription.id);
            }
            return { success: true };
        }),

    // Send test notification
    sendTest: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const { sendPushNotification } = await import('./_core/pushNotifications');
        const result = await sendPushNotification(merchant.id, {
            title: 'اختبار الإشعارات - ساري',
            body: 'هذا إشعار تجريبي للتحقق من عمل الإشعارات الفورية',
            url: '/merchant/dashboard',
        });
        return result;
    }),

    // Get notification logs
    getLogs: protectedProcedure
        .input(
            z.object({
                limit: z.number().default(50),
            })
        )
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const { getPushNotificationLogs } = await import('./db_push');
            return await getPushNotificationLogs(merchant.id, input.limit);
        }),

    // Get notification stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const { getPushNotificationStats } = await import('./db_push');
        return await getPushNotificationStats(merchant.id);
    }),
});

export type PushRouter = typeof pushRouter;
