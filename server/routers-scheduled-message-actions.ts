import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { scheduledActionTarget, scheduledActionApply, scheduledReceiptInput } from '../shared/scheduled-message-actions';
import { reviewScheduledAction, applyScheduledAction, readScheduledActionReceipt, resolveScheduledActionReceipt, ScheduledActionError } from './scheduled-message-actions';
const error = (e: unknown) => new TRPCError({ code: e instanceof ScheduledActionError ? e.reason === 'forbidden' ? 'FORBIDDEN' : e.reason === 'missing' ? 'NOT_FOUND'
  : ['stale', 'reused', 'cancelled'].includes(e.reason) ? 'CONFLICT' : ['invalid', 'timezone', 'channel', 'schedule'].includes(e.reason) ? 'PRECONDITION_FAILED' : 'INTERNAL_SERVER_ERROR' : 'INTERNAL_SERVER_ERROR',
  message: e instanceof ScheduledActionError ? e.message : 'scheduled_action:unavailable' });
export const scheduledActionProcedures = {
  reviewAction: permissionProcedure('campaigns.manage').input(scheduledActionTarget).mutation(async ({ ctx, input }) => { try { return await reviewScheduledAction(ctx.user.id, ctx.merchantId, input); } catch (e) { throw error(e); } }),
  applyAction: permissionProcedure('campaigns.manage').input(scheduledActionApply).mutation(async ({ ctx, input }) => { try { return await applyScheduledAction(ctx.user.id, ctx.merchantId, input); } catch (e) { throw error(e); } }),
  actionReceipt: permissionProcedure('analytics.read').input(scheduledReceiptInput).query(async ({ ctx, input }) => { try { return await readScheduledActionReceipt(ctx.user.id, ctx.merchantId, input); } catch (e) { throw error(e); } }),
  resolveActionReceipt: permissionProcedure('analytics.read').input(scheduledReceiptInput).mutation(async ({ ctx, input }) => { try { return await resolveScheduledActionReceipt(ctx.user.id, ctx.merchantId, input); } catch (e) { throw error(e); } }),
};
