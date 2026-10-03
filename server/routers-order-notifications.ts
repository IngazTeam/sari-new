import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { permissionProcedure, router } from './_core/trpc';
import { orderNoticeSelection, orderNoticeDetailInput } from '../shared/order-notification-workspace';
import { readOrderNoticeWorkspace, readOrderNoticeDetail, OrderNoticeError } from './order-notification-workspace';
import { saveOrderNoticeTemplateInput, acknowledgeOrderNoticesInput } from '../shared/order-notification-actions';
import { saveReviewedOrderNoticeTemplate, acknowledgeReviewedOrderNotices } from './order-notification-actions';
import {
  getOrderNotificationsByMerchantId,
  getOrderNotificationsByOrderId,
} from './db';
import {
  getOrderNotificationTemplateSettings,
  ORDER_NOTIFICATION_STATUSES,
} from './notifications/order-notifications';
import { getMerchantOrder } from './orders/merchant-order-lifecycle';
import {
  getOrderStatusNotificationHealth,
} from './orders/order-status-notification-outbox';

const notificationStatusSchema = z.enum(ORDER_NOTIFICATION_STATUSES);
const templateSchema = z.string()
  .trim()
  .min(1)
  .max(3500)
  .refine(value => !value.includes('\0'), 'Invalid template');

export const orderNotificationsRouter = router({
  saveTemplate: permissionProcedure('whatsapp.manage').input(saveOrderNoticeTemplateInput).mutation(async ({ctx,input}) => {
    try { return await saveReviewedOrderNoticeTemplate(ctx.user.id,ctx.merchantId,input); } catch(e) { return noticeError(e); }
  }),
  acknowledgeReviewed: permissionProcedure('whatsapp.manage').input(acknowledgeOrderNoticesInput).mutation(async ({ctx,input}) => {
    try { return await acknowledgeReviewedOrderNotices(ctx.user.id,ctx.merchantId,input); } catch(e) { return noticeError(e); }
  }),
  workspace: permissionProcedure('analytics.read').input(orderNoticeSelection).query(async ({ ctx, input }) => {
    try { return await readOrderNoticeWorkspace(ctx.user.id, ctx.merchantId, input); } catch (e) { return noticeError(e); }
  }),
  detail: permissionProcedure('analytics.read').input(orderNoticeDetailInput).query(async ({ ctx, input }) => {
    try { return await readOrderNoticeDetail(ctx.user.id, ctx.merchantId, input); } catch (e) { return noticeError(e); }
  }),
  getTemplates: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    return getOrderNotificationTemplateSettings(ctx.merchantId);
  }),

  updateTemplate: permissionProcedure('whatsapp.manage')
    .input(z.object({
      status: notificationStatusSchema,
      template: templateSchema,
      enabled: z.boolean(),
    }).strict())
    .mutation(() => { throw new TRPCError({code:'PRECONDITION_FAILED',message:'order_notice:reload'}); }),

  getHealth: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    return getOrderStatusNotificationHealth(ctx.merchantId);
  }),

  acknowledgeIncidents: permissionProcedure('whatsapp.manage').mutation(() => { throw new TRPCError({code:'PRECONDITION_FAILED',message:'order_notice:reload'}); }),

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

function noticeError(e: unknown): never {
  throw new TRPCError({ code: e instanceof OrderNoticeError && e.reason === 'forbidden' ? 'FORBIDDEN'
    : e instanceof OrderNoticeError && e.reason === 'missing' ? 'NOT_FOUND' : e instanceof OrderNoticeError && e.reason === 'stale' ? 'CONFLICT'
    : e instanceof OrderNoticeError && e.reason === 'reference' ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR',
    message: e instanceof OrderNoticeError && ['stale','reference','unknown'].includes(e.reason) ? e.message : 'order_notice:unavailable' });
}
