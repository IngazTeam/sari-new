import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { listEscalationRelays, reviewEscalationRelay, relayReviewSchema } from './ai/escalation-reconciliation';

export const escalationReconciliationProcedures = {
  listEscalationRelays: permissionProcedure('conversations.read')
    .input(z.object({ conversationId: z.number().int().positive().safe(), beforeId: z.number().int().positive().safe().optional() }).strict())
    .query(async ({ ctx, input }) => {
      try { return { ...await listEscalationRelays(ctx.merchantId, input.conversationId, input.beforeId), canManage: hasPermission(ctx.merchantRole,'conversations.reply') }; }
      catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Escalation records unavailable' }); }
    }),
  reviewEscalationRelay: permissionProcedure('conversations.reply').input(relayReviewSchema).mutation(async ({ ctx,input }) => {
    try { return await reviewEscalationRelay({ ...input, merchantId: ctx.merchantId, actorUserId: ctx.user.id }); }
    catch { throw new TRPCError({ code: 'CONFLICT', message: 'Escalation evidence changed or is unavailable; refresh before reviewing' }); }
  }),
};
