import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { permissionProcedure, router } from './_core/trpc';
import {
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
  getTemplates: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    return getOrderNotificationTemplateSettings(ctx.merchantId);
  }),

  updateTemplate: permissionProcedure('whatsapp.manage')
    .input(z.object({
      status: notificationStatusSchema,
      template: templateSchema,
      enabled: z.boolean(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      return saveOrderNotificationTemplate({ merchantId: ctx.merchantId, ...input });
    }),

  getHealth: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    return getOrderStatusNotificationHealth(ctx.merchantId);
  }),

  acknowledgeIncidents: permissionProcedure('whatsapp.manage').mutation(async ({ ctx }) => {
    return acknowledgeOrderStatusNotificationIncidents(ctx.merchantId, ctx.user.id);
  }),

  getHistory: permissionProcedure('analytics.read')
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict())
    .query(async ({ input, ctx }) => {
      return getOrderNotificationsByMerchantId(ctx.merchantId, input.limit);
    }),

  getByOrderId: permissionProcedure('analytics.read')
    .input(z.object({ orderId: z.number().int().positive() }).strict())
    .query(async ({ input, ctx }) => {
      const order = await getMerchantOrder(ctx.merchantId, input.orderId);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      return getOrderNotificationsByOrderId(ctx.merchantId, order.id);
    }),
});

export type OrderNotificationsRouter = typeof orderNotificationsRouter;
