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
  getBotSettings,
  getMerchantByUserId,
  getMessagesByConversationId,
  getWhatsAppConnectionRequestByMerchantId,
  createMessage,
  updateConversation,
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

            // Whitelist of valid deal stages — invalid values fall through to unfiltered default
            const { isValidDealStage } = await import('@shared/const');
            const isValidFilter = needsHuman || (stage && isValidDealStage(stage));

            // If pipeline filters are active, use targeted SQL query
            if (isValidFilter) {
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
                } else if (stage === 'ready') {
                    // Match pipeline card: only show ready leads active in last 48h
                    where += ` AND c.deal_stage = 'ready' AND c.lastMessageAt > DATE_SUB(NOW(), INTERVAL 48 HOUR)`;
                } else if (stage) {
                    where += ` AND c.deal_stage = ?`;
                    params.push(stage);
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

    // Send reply from merchant dashboard
    sendReply: protectedProcedure
        .input(z.object({
            conversationId: z.number(),
            message: z.string().min(1).max(5000),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // Check ownership
            const conversation = await getConversationById(input.conversationId);
            if (!conversation || conversation.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
            }

            // FIX-3: Fallback chain — try new whatsapp_instances first, then legacy connection_requests
            const { getPrimaryWhatsAppInstance, getWhatsAppConnectionRequestByMerchantId: getLegacyConn } = await import('./db');
            const instance = await getPrimaryWhatsAppInstance(merchant.id);
            let waInstanceId: string, waToken: string, waApiUrl: string;

            if (instance && instance.status === 'active' && instance.instanceId && instance.token) {
                waInstanceId = instance.instanceId;
                waToken = instance.token;
                waApiUrl = (instance as any).apiUrl || 'https://api.green-api.com';
            } else {
                // Fallback to legacy connection_requests
                const waRequest = await getLegacyConn(merchant.id);
                if (!waRequest || !waRequest.instanceId || !waRequest.apiToken) {
                    throw new TRPCError({
                        code: 'PRECONDITION_FAILED',
                        message: 'يجب ربط حساب WhatsApp أولاً',
                    });
                }
                waInstanceId = waRequest.instanceId;
                waToken = waRequest.apiToken;
                waApiUrl = waRequest.apiUrl || 'https://api.green-api.com';
            }

            // Send via WhatsApp
            const { sendMessageWithCredentials } = await import('./whatsapp');
            const result = await sendMessageWithCredentials(
                waInstanceId,
                waToken,
                waApiUrl,
                conversation.customerPhone,
                input.message,
            );

            if (!result.success) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `فشل إرسال الرسالة: ${result.error}`,
                });
            }

            // Save to DB
            await createMessage({
                conversationId: input.conversationId,
                direction: 'outgoing',
                messageType: 'text',
                content: input.message,
                externalId: result.messageId || null,
            });

            // ── FIX: Activate humanTakeover so bot stays silent ──
            // Without this, the bot would reply immediately after the merchant's dashboard reply
            try {
                const botSettings = await getBotSettings(merchant.id);
                const timeoutMin = botSettings.takeoverTimeoutMinutes || 15;
                await updateConversation(input.conversationId, {
                    humanTakeover: 1,
                    humanTakeoverAt: new Date(),
                    humanExpiresAt: new Date(Date.now() + timeoutMin * 60 * 1000),
                } as any);
                console.log(`[Dashboard] Human takeover activated on conv ${input.conversationId} for ${timeoutMin} min (merchant replied from dashboard)`);
            } catch (takeoverErr) {
                console.warn('[Dashboard] Failed to activate takeover:', takeoverErr);
            }

            return { success: true, messageId: result.messageId };
        }),

    // ── Sync conversations from Green API (recover missed data) ──
    syncFromWhatsApp: protectedProcedure
        .mutation(async ({ ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            console.log(`[Sync] 🔄 Starting WhatsApp sync for merchant ${merchant.id}...`);

            const {
                getWhatsAppInstancesByMerchantId,
                getConversationByMerchantAndPhone,
                createConversation,
                getPool,
            } = await import('./db');
            const axios = (await import('axios')).default;

            const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
            const activeInstance = instances.find((i: any) => i.status === 'active' && i.instanceId && i.token);

            if (!activeInstance) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد اتصال واتساب نشط' });
            }

            const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
            const baseURL = `${apiUrl}/waInstance${activeInstance.instanceId}`;

            let chatsImported = 0;
            let messagesImported = 0;
            const errors: string[] = [];

            try {
                // 1. Fetch all chats from Green API
                const chatsResponse = await axios.post(
                    `${baseURL}/getChats/${activeInstance.token}`,
                    {},
                    { timeout: 30000 }
                );

                const chats: any[] = chatsResponse.data || [];
                console.log(`[Sync] Found ${chats.length} chats from Green API`);

                // Filter personal chats only (not groups)
                const personalChats = chats.filter((c: any) => c.id?.endsWith('@c.us'));

                for (const chat of personalChats) {
                    try {
                        const phoneNumber = chat.id.replace('@c.us', '');
                        const customerName = chat.name || chat.contact?.name || phoneNumber;

                        // Find or create conversation
                        let conversation = await getConversationByMerchantAndPhone(merchant.id, phoneNumber);

                        if (!conversation) {
                            conversation = await createConversation({
                                merchantId: merchant.id,
                                customerPhone: phoneNumber,
                                customerName: customerName,
                                status: 'active',
                                lastMessageAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                            });
                            chatsImported++;
                        }

                        if (!conversation) continue;

                        // 2. Fetch recent messages for this chat
                        try {
                            const historyResponse = await axios.post(
                                `${baseURL}/getChatHistory/${activeInstance.token}`,
                                { chatId: chat.id, count: 50 },
                                { timeout: 15000 }
                            );

                            const chatMessages: any[] = historyResponse.data || [];

                            const pool = await getPool();
                            if (!pool) continue;

                            for (const msg of chatMessages) {
                                if (!msg.idMessage) continue;

                                // Check if message already exists (by externalId)
                                const [existing] = await pool.execute(
                                    'SELECT id FROM messages WHERE externalId = ? LIMIT 1',
                                    [msg.idMessage]
                                );

                                if ((existing as any[])?.length > 0) continue;

                                // Determine message content and type
                                let content = '';
                                let messageType: 'text' | 'image' | 'voice' | 'document' = 'text';

                                if (msg.typeMessage === 'textMessage') {
                                    content = msg.textMessage || '';
                                } else if (msg.typeMessage === 'extendedTextMessage') {
                                    content = msg.extendedTextMessage?.text || msg.textMessage || '';
                                } else if (msg.typeMessage === 'imageMessage') {
                                    content = msg.caption || '[صورة]';
                                    messageType = 'image';
                                } else if (msg.typeMessage === 'audioMessage' || msg.typeMessage === 'voiceMessage') {
                                    content = '[رسالة صوتية]';
                                    messageType = 'voice';
                                } else if (msg.typeMessage === 'documentMessage') {
                                    content = msg.caption || `[ملف: ${msg.fileName || 'مستند'}]`;
                                    messageType = 'document';
                                } else if (msg.typeMessage === 'videoMessage') {
                                    content = msg.caption || '[فيديو]';
                                } else if (msg.typeMessage === 'contactMessage') {
                                    content = '[جهة اتصال]';
                                } else if (msg.typeMessage === 'locationMessage') {
                                    content = '[موقع]';
                                } else {
                                    content = `[${msg.typeMessage || 'رسالة'}]`;
                                }

                                if (!content) continue;

                                // Determine direction
                                const isOutgoing = msg.type === 'outgoing';
                                const msgTimestamp = msg.timestamp
                                    ? new Date(msg.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ')
                                    : new Date().toISOString().slice(0, 19).replace('T', ' ');

                                // Insert message
                                try {
                                    await pool.execute(
                                        `INSERT INTO messages (conversationId, direction, messageType, content, externalId, isProcessed, createdAt)
                                         VALUES (?, ?, ?, ?, ?, 1, ?)`,
                                        [
                                            conversation.id,
                                            isOutgoing ? 'outgoing' : 'incoming',
                                            messageType,
                                            content.substring(0, 5000),
                                            msg.idMessage,
                                            msgTimestamp,
                                        ]
                                    );
                                    messagesImported++;
                                } catch (insertErr: any) {
                                    // Skip duplicates silently
                                    if (!insertErr.message?.includes('Duplicate')) {
                                        console.warn(`[Sync] Message insert error:`, insertErr.message);
                                    }
                                }
                            }

                            // Update conversation's lastMessageAt to the most recent message
                            if (chatMessages.length > 0) {
                                const latestTimestamp = Math.max(...chatMessages.map((m: any) => m.timestamp || 0));
                                if (latestTimestamp > 0) {
                                    const latestDate = new Date(latestTimestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
                                    await updateConversation(conversation.id, {
                                        lastMessageAt: latestDate,
                                        customerName: customerName !== phoneNumber ? customerName : undefined,
                                    } as any);
                                }
                            }
                        } catch (historyErr: any) {
                            errors.push(`Chat ${phoneNumber}: ${historyErr.message}`);
                        }

                        // Rate limit: avoid hammering Green API
                        await new Promise(r => setTimeout(r, 200));
                    } catch (chatErr: any) {
                        errors.push(`Chat error: ${chatErr.message}`);
                    }
                }
            } catch (apiErr: any) {
                console.error('[Sync] Green API error:', apiErr.message);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: `فشل الاتصال بـ Green API: ${apiErr.message}`,
                });
            }

            console.log(`[Sync] ✅ Sync complete: ${chatsImported} new chats, ${messagesImported} messages imported`);

            return {
                success: true,
                chatsImported,
                messagesImported,
                totalChats: chatsImported,
                errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
            };
        }),
});

export type ConversationsRouter = typeof conversationsRouter;

