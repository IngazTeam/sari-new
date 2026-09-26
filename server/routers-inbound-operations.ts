import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { adminProcedure, router } from './_core/trpc';
import { inboundHealth, listInboundReviews, resolveInboundReview } from './messaging/operations';
import { inspectSalesPaymentTimelineInput, SalesPaymentTimelineLimitExceeded } from './ai/sales-payment-timeline-contract';
import { inspectSalesOrderSettlementInput, SalesOrderSettlementLimitExceeded } from './ai/sales-order-settlement-contract';

export const inboundOperationsRouter = router({
  salesOrderSettlement: adminProcedure.input(inspectSalesOrderSettlementInput).query(async ({ctx,input}) => {
    const {inspectSalesOrderSettlement,SalesOrderSettlementAccessDenied,SalesOrderSettlementNotReady} = await import('./ai/sales-order-settlement');
    try { return await inspectSalesOrderSettlement(ctx.user.id,input); }
    catch(error) { throw new TRPCError({code:error instanceof SalesOrderSettlementAccessDenied ? 'FORBIDDEN'
      : error instanceof SalesOrderSettlementNotReady || error instanceof SalesOrderSettlementLimitExceeded ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR',
      message:'تعذر فحص أدلة الطلب والدفع'}); }
  }),
  salesOrderAttributionHealth: adminProcedure.query(async ({ctx}) => {
    const {salesOrderAttributionHealth,SalesOrderHealthAccessDenied} = await import('./ai/sales-order-attribution');
    try { return await salesOrderAttributionHealth(ctx.user.id); }
    catch(error) { throw new TRPCError({code:error instanceof SalesOrderHealthAccessDenied ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',message:'تعذر قراءة حالة إسناد الطلبات'}); }
  }),
  salesPaymentTimeline: adminProcedure.input(inspectSalesPaymentTimelineInput).query(async ({ctx,input}) => {
    const {inspectSalesPaymentTimeline,SalesPaymentTimelineAccessDenied,SalesPaymentTimelineNotReady} = await import('./ai/sales-payment-timeline');
    try { return await inspectSalesPaymentTimeline(ctx.user.id,input); }
    catch(error) { throw new TRPCError({code:error instanceof SalesPaymentTimelineAccessDenied ? 'FORBIDDEN'
      : error instanceof SalesPaymentTimelineNotReady || error instanceof SalesPaymentTimelineLimitExceeded ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR',
      message:'تعذر فحص التسلسل الزمني للرد والدفع'}); }
  }),
  salesPaymentAttributionHealth: adminProcedure.query(async ({ctx}) => {
    const {salesPaymentAttributionHealth,SalesPaymentHealthAccessDenied} = await import('./ai/sales-payment-attribution');
    try { return await salesPaymentAttributionHealth(ctx.user.id); }
    catch(error) { throw new TRPCError({code:error instanceof SalesPaymentHealthAccessDenied ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',message:'تعذر قراءة حالة إسناد المدفوعات'}); }
  }),
  health: adminProcedure.query(() => inboundHealth()),
  salesReplyRecoveryHealth: adminProcedure.query(async ({ctx}) => {
    const {salesReplyRecoveryHealth,SalesReplyRecoveryAccessDenied} = await import('./ai/sales-reply-recovery');
    try { return await salesReplyRecoveryHealth(ctx.user.id); }
    catch(error) { throw new TRPCError({code:error instanceof SalesReplyRecoveryAccessDenied ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',message:'تعذر قراءة حالة استرجاع الردود'}); }
  }),
  reviews: adminProcedure.input(z.object({ merchantId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => listInboundReviews(input?.merchantId)),
  resolve: adminProcedure.input(z.object({ id: z.number().int().positive(), merchantId: z.number().int().positive(),
    outcome: z.enum(['completed', 'dismissed']), note: z.string().trim().min(20).max(1000), confirmed: z.literal(true) }))
    .mutation(({ ctx, input }) => resolveInboundReview({ ...input, actorId: ctx.user.id })),
});
