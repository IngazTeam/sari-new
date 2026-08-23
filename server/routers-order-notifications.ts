import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from './_core/trpc';
import {
  getMerchantByUserId,
  getOrderNotificationsByMerchantId,
  getOrderNotificationsByOrderId,
} from './db';
import {
  getOrderNotificationTemplateSettings,
  ORDER_NOTIFICATION_STATUSES,
  saveOrderNotificationTemplate,
} from './notifications/order-notifications';
import { getMerchantOrder } from './orders/merchant-order-lifecycle';
import {
  acknowledgeOrderStatusNotificationIncidents,
  getOrderStatusNotificationHealth,
} from './orders/order-status-notification-outbox';

const notificationStatusSchema = z.enum(ORDER_NOTIFICATION_STATUSES);
const templateSchema = z.string()
  .trim()
  .min(1)
  .max(3500)
  .refine(value => !value.includes('\0'), 'Invalid template');

export const orderNotificationsRouter = router({
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOrderNotificationTemplateSettings(merchant.id);
  }),

  updateTemplate: protectedProcedure
    .input(z.object({
      status: notificationStatusSchema,
      template: templateSchema,
      enabled: z.boolean(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return saveOrderNotificationTemplate({ merchantId: merchant.id, ...input });
    }),

  getHealth: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOrderStatusNotificationHealth(merchant.id);
  }),

  acknowledgeIncidents: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return acknowledgeOrderStatusNotificationIncidents(merchant.id, Number(ctx.user.id));
  }),

  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict())
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return getOrderNotificationsByMerchantId(merchant.id, input.limit);
    }),

  getByOrderId: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }).strict())
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      const order = await getMerchantOrder(merchant.id, input.orderId);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      return getOrderNotificationsByOrderId(order.id);
    }),
});

export type OrderNotificationsRouter = typeof orderNotificationsRouter;
