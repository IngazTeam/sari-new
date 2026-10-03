import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { reviewSelection, reviewDetailInput, type ReviewKind } from '../shared/review-workspace';
import { readReviewWorkspace, readReviewDetail, ReviewWorkspaceError } from './review-workspace';
const mapped = (error: unknown): never => { throw new TRPCError({
  code: error instanceof ReviewWorkspaceError ? error.reason === 'forbidden' ? 'FORBIDDEN' : error.reason === 'missing' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR' : 'INTERNAL_SERVER_ERROR',
  message: 'review_workspace:unavailable',
}); };
export function reviewReadProcedures(kind: ReviewKind) {
  return {
    workspace: permissionProcedure('analytics.read').input(reviewSelection).query(async ({ ctx, input }) => {
      try { return await readReviewWorkspace(ctx.user.id, ctx.merchantId, kind, input); } catch (e) { return mapped(e); }
    }),
    detail: permissionProcedure('analytics.read').input(reviewDetailInput).query(async ({ ctx, input }) => {
      try { return await readReviewDetail(ctx.user.id, ctx.merchantId, kind, input); } catch (e) { return mapped(e); }
    }),
  };
}
