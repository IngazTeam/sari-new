import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { readScheduledMessageWorkspace, readScheduledMessageHistory, ScheduledMessageWorkspaceError } from './scheduled-message-workspace';
import { scheduledHistoryInput } from '../shared/scheduled-message-evidence';
export const scheduledMessageWorkspaceProcedure = permissionProcedure('analytics.read').input(scheduledMessageSelection).query(async ({ ctx, input }) => {
  try { return await readScheduledMessageWorkspace(ctx.user.id, ctx.merchantId, input); }
  catch (error) { throw new TRPCError({ code: error instanceof ScheduledMessageWorkspaceError && error.reason === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', message: 'scheduled_workspace:unavailable' }); }
});
export const scheduledMessageHistoryProcedure = permissionProcedure('analytics.read').input(scheduledHistoryInput).query(async ({ ctx, input }) => {
  try { return await readScheduledMessageHistory(ctx.user.id, ctx.merchantId, input); }
  catch (e) { throw new TRPCError({ code: e instanceof ScheduledMessageWorkspaceError ? e.reason === 'forbidden' ? 'FORBIDDEN' : e.reason === 'missing' ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR' : 'INTERNAL_SERVER_ERROR', message: 'scheduled_workspace:unavailable' }); }
});
