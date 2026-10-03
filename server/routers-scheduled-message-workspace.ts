import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { scheduledMessageSelection } from '../shared/scheduled-message-workspace';
import { readScheduledMessageWorkspace, ScheduledMessageWorkspaceError } from './scheduled-message-workspace';
export const scheduledMessageWorkspaceProcedure = permissionProcedure('analytics.read').input(scheduledMessageSelection).query(async ({ ctx, input }) => {
  try { return await readScheduledMessageWorkspace(ctx.user.id, ctx.merchantId, input); }
  catch (error) { throw new TRPCError({ code: error instanceof ScheduledMessageWorkspaceError && error.reason === 'forbidden' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR', message: 'scheduled_workspace:unavailable' }); }
});
