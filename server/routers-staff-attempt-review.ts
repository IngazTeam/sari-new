import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { staffAttemptListInput, staffAttemptCheckInput, staffAttemptPage, staffAttemptCheckResult } from '../shared/staff-attempt-review';
import { listStaffAttempts, checkStaffAttempt } from './ai/staff-attempt-review';

export const staffAttemptReviewProcedures = {
  listStaffAttempts: permissionProcedure('conversations.reply').input(staffAttemptListInput).query(async ({ ctx, input }) => {
    try { return staffAttemptPage.parse(await listStaffAttempts(ctx.merchantId, ctx.user.id, input)); }
    catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff attempts unavailable' }); }
  }),
  checkStaffAttempt: permissionProcedure('conversations.reply').input(staffAttemptCheckInput).mutation(async ({ ctx, input }) => {
    try { return staffAttemptCheckResult.parse(await checkStaffAttempt(ctx.merchantId, ctx.user.id, input)); }
    catch { throw new TRPCError({ code: 'CONFLICT', message: 'Staff attempt could not be checked' }); }
  }),
};
