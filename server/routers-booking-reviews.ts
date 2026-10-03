import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { reviewReadProcedures } from './routers-review-workspace';
const id = z.number().int().positive().max(2147483647);
const reload = (): never => { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'review_workspace:reload' }); };
export const bookingReviewsRouter = router({
  ...reviewReadProcedures('booking'),
  // Customer reviews are not manufactured by a merchant-side create operation.
  create: permissionProcedure('conversations.reply').input(z.unknown()).mutation(reload),
  list: permissionProcedure('analytics.read').input(z.unknown()).query(reload),
  getByService: permissionProcedure('analytics.read').input(z.object({ serviceId: id }).strict()).query(reload),
  getStats: permissionProcedure('analytics.read').input(z.object({ serviceId: id }).strict()).query(reload),
  reply: permissionProcedure('conversations.reply').input(z.object({ reviewId: id, reply: z.string().trim().min(1).max(1000) }).strict()).mutation(reload),
});
export type BookingReviewsRouter = typeof bookingReviewsRouter;
