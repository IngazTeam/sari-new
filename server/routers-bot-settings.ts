/**
 * Bot Settings Router Module
 * Handles AI bot configuration and settings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const botSettingsRouter = router({
    // Get bot settings for current merchant
    get: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getBotSettings(merchant.id);
    }),

    // Update bot settings
    update: protectedProcedure
        .input(z.object({
            autoReplyEnabled: z.boolean().optional(),
            workingHoursEnabled: z.boolean().optional(),
            workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
            workingDays: z.string().optional(),
            welcomeMessage: z.string().optional(),
            outOfHoursMessage: z.string().optional(),
            responseDelay: z.number().min(1).max(10).optional(),
            maxResponseLength: z.number().min(50).max(500).optional(),
            tone: z.enum(['friendly', 'professional', 'casual']).optional(),
            language: z.enum(['ar', 'en', 'both']).optional(),
            // Human Takeover settings
            takeoverTimeoutMinutes: z.number().min(5).max(120).optional(),
            takeoverResumeMessage: z.string().max(500).optional(),
            takeoverCommandsEnabled: z.boolean().optional(),
            // Group settings
            groupMode: z.enum(['disabled', 'mention_only', 'keyword_only', 'private_redirect']).optional(),
            groupKeywords: z.string().max(5000).optional(), // JSON string of keywords array
            groupRedirectMessage: z.string().max(500).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return await db.updateBotSettings(merchant.id, input);
        }),

    // Check if bot should respond
    shouldRespond: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.shouldBotRespond(merchant.id);
    }),

    // Send test message
    sendTestMessage: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const connection = await db.getWhatsappConnectionByMerchantId(merchant.id);
        if (!connection || connection.status !== 'connected') {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'يجب ربط حساب WhatsApp أولاً'
            });
        }

        const settings = await db.getBotSettings(merchant.id);
        if (!settings) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Bot settings not found' });
        }

        const { sendTextMessage } = await import('./whatsapp');

        if (!merchant.phone) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'يجب إضافة رقم هاتف في الإعدادات'
            });
        }

        const result = await sendTextMessage(
            merchant.phone,
            settings.welcomeMessage || 'مرحباً! هذه رسالة تجريبية من ساري.'
        );

        if (!result.success) {
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `فشل إرسال الرسالة: ${result.error}`
            });
        }

        return { success: true, message: 'تم إرسال الرسالة التجريبية بنجاح!' };
    }),

    // Get conversations currently under human takeover
    getTakeoverConversations: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const allConversations = await db.getConversationsByMerchantId(merchant.id);
        return allConversations
            .filter((c: any) => c.humanTakeover === 1)
            .map((c: any) => ({
                id: c.id,
                customerPhone: c.customerPhone,
                customerName: c.customerName,
                humanTakeoverAt: c.humanTakeoverAt,
                humanExpiresAt: c.humanExpiresAt,
                isPermanent: !c.humanExpiresAt,
            }));
    }),
});

export type BotSettingsRouter = typeof botSettingsRouter;
