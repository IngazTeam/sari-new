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
});

export type BotSettingsRouter = typeof botSettingsRouter;
