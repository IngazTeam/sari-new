import { z } from 'zod';
import { adminProcedure, router } from './_core/trpc';
import { inboundHealth, listInboundReviews, resolveInboundReview } from './messaging/operations';

export const inboundOperationsRouter = router({
  health: adminProcedure.query(() => inboundHealth()),
  reviews: adminProcedure.input(z.object({ merchantId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => listInboundReviews(input?.merchantId)),
  resolve: adminProcedure.input(z.object({ id: z.number().int().positive(), merchantId: z.number().int().positive(),
    outcome: z.enum(['completed', 'dismissed']), note: z.string().trim().min(20).max(1000), confirmed: z.literal(true) }))
    .mutation(({ ctx, input }) => resolveInboundReview({ ...input, actorId: ctx.user.id })),
});
