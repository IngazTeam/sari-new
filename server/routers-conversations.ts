/**
 * Conversations Router Module
 * Handles conversation and message listing operations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const conversationsRouter = router({
    // Get all conversations for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return db.getConversationsByMerchantId(merchant.id);
    }),

    // Get messages for a conversation
    getMessages: protectedProcedure
        .input(z.object({ conversationId: z.number() }))
        .query(async ({ input, ctx }) => {
            const conversation = await db.getConversationById(input.conversationId);
            if (!conversation) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
            }

            // Check ownership
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant || conversation.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            return db.getMessagesByConversationId(input.conversationId);
        }),
});

export type ConversationsRouter = typeof conversationsRouter;
