import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure, router } from './_core/trpc';
import { scheduledMessageWorkspaceProcedure, scheduledMessageHistoryProcedure } from './routers-scheduled-message-workspace';
import { scheduledActionProcedures } from './routers-scheduled-message-actions';
const reload = (): never => { throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'scheduled_action:reload_reviewed_workspace' }); };
const id = z.number().int().positive().max(2147483647);
const legacyFields = z.object({ title: z.string().min(1).max(255), message: z.string().min(1), dayOfWeek: z.number().min(0).max(6), time: z.string().regex(/^\d{2}:\d{2}$/), isActive: z.boolean().optional() }).strict();
export const scheduledMessagesRouter = router({
  workspace: scheduledMessageWorkspaceProcedure,
  history: scheduledMessageHistoryProcedure,
  ...scheduledActionProcedures,
  // Old clients reload into the reviewed workspace; no legacy call grants sending authority.
  list: permissionProcedure('analytics.read').query(reload),
  create: permissionProcedure('campaigns.manage').input(legacyFields).mutation(reload),
  update: permissionProcedure('campaigns.manage').input(legacyFields.partial().extend({ id }).strict()).mutation(reload),
  toggle: permissionProcedure('campaigns.manage').input(z.object({ id, isActive: z.boolean() }).strict()).mutation(reload),
  delete: permissionProcedure('campaigns.manage').input(z.object({ id }).strict()).mutation(reload),
});
export type ScheduledMessagesRouter = typeof scheduledMessagesRouter;
