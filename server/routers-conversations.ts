import { conversationImportProcedures } from './routers-conversation-import';
import { conversationConnectionProcedures } from './routers-conversation-connection';
import { conversationHistoryProcedures } from "./routers-conversation-history";
import { conversationInboxProcedure } from "./routers-conversation-inbox";
/**
 * Conversations Router Module
 * Handles conversation and message listing operations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { staffDashboardReplyInput } from '../shared/staff-dashboard-reply';
import { routeDashboardStaffReply } from './staff-dashboard-reply-route';
import { conversationHandoffProcedures } from './routers-conversation-handoff';
import { escalationReconciliationProcedures } from './routers-escalation-reconciliation';
import { salesOfferReviewProcedures } from './routers-sales-offer-review';
import { staffAttemptReviewProcedures } from './routers-staff-attempt-review';
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import {
  getConversationCountByMerchantId,
  getConversationsByMerchantId,
  getMerchantById,
} from './db';

export const conversationsRouter = router({
    ...conversationConnectionProcedures,
    ...staffAttemptReviewProcedures,
    ...conversationHandoffProcedures,
    ...escalationReconciliationProcedures,
    ...salesOfferReviewProcedures,
    list: conversationInboxProcedure,

    // Lightweight: get only recent conversations (for Dashboard)
    listRecent: permissionProcedure('conversations.read')
        .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            return getConversationsByMerchantId(merchant.id, { limit: input.limit });
        }),

    // Lightweight: get count only (for Dashboard stats)
    count: permissionProcedure('conversations.read').query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getConversationCountByMerchantId(merchant.id);
    }),

    ...conversationHistoryProcedures,

    // Send reply from merchant dashboard
    sendReply: permissionProcedure('conversations.reply')
        .input(staffDashboardReplyInput)
        .mutation(async ({ input, ctx }) => {
            return routeDashboardStaffReply(ctx.merchantId,ctx.user.id,input);
        }),

    ...conversationImportProcedures,

});

export type ConversationsRouter = typeof conversationsRouter;
