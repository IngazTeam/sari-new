import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { adminProcedure, router } from './_core/trpc';
import { inboundHealth, listInboundReviews, resolveInboundReview } from './messaging/operations';

export const inboundOperationsRouter = router({
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
