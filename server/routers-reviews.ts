import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { reviewReadProcedures } from './routers-review-workspace';
import { readReviewWorkspace, ReviewWorkspaceError } from './review-workspace';
const id = z.number().int().positive().max(2147483647);
const reload = (): never => { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'review_workspace:reload' }); };
export const reviewsRouter = router({
  ...reviewReadProcedures('order'),
  // Compatibility for the dashboard tile: same selected-tenant evidence as the review page.
  getStats: permissionProcedure('analytics.read').input(z.object({ merchantId: id }).strict()).query(async ({ ctx, input }) => {
    if (input.merchantId !== ctx.merchantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'review_workspace:unavailable' });
    try {
      const { stats } = await readReviewWorkspace(ctx.user.id, ctx.merchantId, 'order', {});
      return { totalReviews: stats.rated, averageRating: stats.average ?? 0, ratingDistribution: stats.distribution };
    } catch (e) { throw new TRPCError({ code: e instanceof ReviewWorkspaceError && e.reason === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', message: 'review_workspace:unavailable' }); }
  }),
  list: permissionProcedure('analytics.read').input(z.object({ merchantId: id }).strict()).query(reload),
  getById: permissionProcedure('analytics.read').input(z.object({ id }).strict()).query(reload),
  reply: permissionProcedure('conversations.reply').input(z.object({ reviewId: id, reply: z.string().trim().min(1).max(1000) }).strict()).mutation(reload),
});
export type ReviewsRouter = typeof reviewsRouter;
