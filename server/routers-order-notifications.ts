/**
 * Order Notifications Router Module
 * Handles notification templates and order notification history
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getMerchantByUserId,
  getNotificationTemplateById,
  getNotificationTemplatesByMerchantId,
  getOrderById,
  getOrderNotificationsByMerchantId,
  getOrderNotificationsByOrderId,
  updateNotificationTemplate,
} from './db';

export const orderNotificationsRouter = router({
    // Get notification templates (merchant)
    getTemplates: protectedProcedure
        .query(async ({ ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return getNotificationTemplatesByMerchantId(merchant.id);
        }),

    // Update notification template (merchant)
    updateTemplate: protectedProcedure
        .input(z.object({
            id: z.number(),
            template: z.string().optional(),
            enabled: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const template = await getNotificationTemplateById(input.id);
            if (!template || template.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return updateNotificationTemplate(input.id, {
                template: input.template,
                enabled: input.enabled,
            });
        }),

    // Get notification history (merchant)
    getHistory: protectedProcedure
        .input(z.object({ limit: z.number().optional() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return getOrderNotificationsByMerchantId(merchant.id, input.limit);
        }),

    // Get notifications for specific order (merchant)
    getByOrderId: protectedProcedure
        .input(z.object({ orderId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const order = await getOrderById(input.orderId);
            if (!order || order.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return getOrderNotificationsByOrderId(input.orderId);
        }),
});

export type OrderNotificationsRouter = typeof orderNotificationsRouter;
