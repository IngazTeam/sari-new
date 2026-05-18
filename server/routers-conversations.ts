/**
 * Conversations Router Module
 * Handles conversation and message listing operations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getConversationById,
  getConversationCountByMerchantId,
  getConversationsByMerchantId,
  getMerchantByUserId,
  getMessagesByConversationId,
} from './db';

export const conversationsRouter = router({
    // Get all conversations for current merchant
    list: protectedProcedure
        .input(z.object({
            page: z.number().min(1).default(1),
            pageSize: z.number().min(1).max(100).default(50),
        }).optional())
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const page = input?.page ?? 1;
            const pageSize = input?.pageSize ?? 50;
            const [items, total] = await Promise.all([
                getConversationsByMerchantId(merchant.id, { limit: pageSize, offset: (page - 1) * pageSize }),
                getConversationCountByMerchantId(merchant.id),
            ]);
            return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
        }),

    // Lightweight: get only recent conversations (for Dashboard)
    listRecent: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            return getConversationsByMerchantId(merchant.id, { limit: input.limit });
        }),

    // Lightweight: get count only (for Dashboard stats)
    count: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getConversationCountByMerchantId(merchant.id);
    }),

    // Get messages for a conversation
    getMessages: protectedProcedure
        .input(z.object({ conversationId: z.number() }))
        .query(async ({ input, ctx }) => {
            const conversation = await getConversationById(input.conversationId);
            if (!conversation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
            }

            // Check ownership
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || conversation.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            return getMessagesByConversationId(input.conversationId);
        }),
});

export type ConversationsRouter = typeof conversationsRouter;
