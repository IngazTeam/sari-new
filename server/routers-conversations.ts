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
    // Get all conversations for current merchant (with optional pipeline filters)
    list: protectedProcedure
        .input(z.object({
            page: z.number().min(1).default(1),
            pageSize: z.number().min(1).max(100).default(50),
            // Pipeline filters (from SalesPipeline deep-links)
            stage: z.string().optional(),
            needsHuman: z.boolean().optional(),
        }).optional())
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const page = input?.page ?? 1;
            const pageSize = input?.pageSize ?? 50;
            const stage = input?.stage;
            const needsHuman = input?.needsHuman;

            // If pipeline filters are active, use targeted SQL query
            if (stage || needsHuman) {
                const { getPool } = await import('./db');
                const pool = await getPool();
                if (!pool) return { items: [], total: 0, page, pageSize, totalPages: 0 };

                let where = 'c.merchantId = ?';
                const params: any[] = [merchant.id];

                if (needsHuman) {
                    // Conversations with pending escalations
                    where += ` AND c.id IN (SELECT DISTINCT conversation_id FROM sari_escalation_queue WHERE merchant_id = ? AND status IN ('pending', 'notified'))`;
                    params.push(merchant.id);
                } else if (stage === 'stalled') {
                    // Stalled = interested/qualified + no activity 48h + not lost
                    where += ` AND c.deal_stage IN ('interested', 'qualified') AND c.lastMessageAt < DATE_SUB(NOW(), INTERVAL 48 HOUR) AND c.loss_reason IS NULL`;
                } else if (stage) {
                    // Whitelist valid stages to prevent SQL injection
                    const VALID_STAGES = ['new', 'interested', 'qualified', 'ready', 'payment_link_sent', 'purchased', 'paid', 'lost', 'payment_failed'];
                    if (VALID_STAGES.includes(stage)) {
                        where += ` AND c.deal_stage = ?`;
                        params.push(stage);
                    }
                }

                const [countRows] = await pool.execute(
                    `SELECT COUNT(*) as total FROM conversations c WHERE ${where}`, params
                );
                const total = (countRows as any[])[0]?.total || 0;

                const offset = (page - 1) * pageSize;
                const [rows] = await pool.execute(
                    `SELECT c.* FROM conversations c WHERE ${where} ORDER BY c.lastMessageAt DESC LIMIT ? OFFSET ?`,
                    [...params, pageSize, offset]
                );

                return { items: rows as any[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
            }

            // Default: no filter
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
