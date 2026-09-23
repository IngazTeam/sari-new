import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { permissionProcedure } from './_core/trpc';
import { hasPermission } from './_core/permissions';
import { conversationHandoffSummary, conversationHandoffSource, ownershipInputSchema, transitionConversationOwnership } from './ai/conversation-handoff';

export const conversationHandoffProcedures = {
  getHandoffSource: permissionProcedure('conversations.read').input(z.object({ conversationId: z.number().int().positive(), messageId: z.number().int().positive() }).strict())
    .query(async ({ ctx, input }) => {
      try { return await conversationHandoffSource(ctx.merchantId, input.conversationId, input.messageId); }
      catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation source unavailable' }); }
    }),
  getHandoff: permissionProcedure('conversations.read').input(z.object({ conversationId: z.number().int().positive() }).strict())
    .query(async ({ ctx, input }) => {
      try { return { ...await conversationHandoffSummary(ctx.merchantId, input.conversationId), canManage: hasPermission(ctx.merchantRole, 'conversations.reply') }; }
      catch { throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation unavailable' }); }
    }),
  setOwnership: permissionProcedure('conversations.reply').input(ownershipInputSchema).mutation(async ({ ctx, input }) => {
    try { return await transitionConversationOwnership(input.conversationId, { humanTakeover: input.action === 'takeover' ? 1 : 0,
      humanTakeoverAt: new Date(), agentHistory: input.action === 'takeover' ? JSON.stringify({ permanentSilence: true }) : undefined },
    { merchantId: ctx.merchantId, expectedVersion: input.expectedVersion, expectedLastMessageId: input.expectedLastMessageId, reason: 'manual' }); }
    catch { throw new TRPCError({ code: 'CONFLICT', message: 'Conversation changed; refresh and review it before retrying' }); }
  }),
};
