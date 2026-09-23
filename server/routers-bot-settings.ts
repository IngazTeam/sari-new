/**
 * Bot Settings Router Module
 * Handles AI bot configuration and settings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from './_core/permissions';
import { discountPolicyUpdateSchema, hasDiscountSettings } from '../shared/discount-policy';
import { getDiscountPolicy, updateDiscountPolicy } from './ai/discount-policy';
import {
  getBotSettings,
  getConversationsByMerchantId,
  getMerchantById,
  getOrCreatePersonalitySettings,
  shouldBotRespond,
  updateBotSettings,
  updateSariPersonalitySettings,
} from './db';

export const botSettingsRouter = router({
    getDiscountPolicy: merchantProcedure.query(async ({ ctx }) => {
        try { return { ...await getDiscountPolicy(ctx.merchantId), canManage: hasPermission(ctx.merchantRole, 'bot_settings.manage') }; }
        catch { throw new TRPCError({ code: 'CONFLICT', message: 'Discount settings unavailable' }); }
    }),
    updateDiscountPolicy: permissionProcedure('bot_settings.manage').input(discountPolicyUpdateSchema).mutation(async ({ ctx, input }) => {
        try { return await updateDiscountPolicy({ ...input, merchantId: ctx.merchantId, actorUserId: ctx.user.id }); }
        catch { throw new TRPCError({ code: 'CONFLICT', message: 'Discount settings changed or unavailable; refresh and review again' }); }
    }),
    // Get bot settings for current merchant
    get: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getBotSettings(merchant.id);
    }),

    // Update bot settings
    update: permissionProcedure('bot_settings.manage')
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
            // TONE-FIX: Accept ANY string, normalize to valid DB enum before save
            // Legacy data may contain 'enthusiastic', empty strings, or other invalid values
            tone: z.string().transform(v => {
                const valid = ['friendly', 'professional', 'casual'] as const;
                return valid.includes(v as any) ? v as typeof valid[number] : 'friendly';
            }).optional(),
            language: z.enum(['ar', 'en', 'fr', 'tr', 'es', 'it', 'both']).optional(),
            // Human Takeover settings
            takeoverTimeoutMinutes: z.number().min(5).max(120).optional(),
            takeoverResumeMessage: z.string().max(500).optional(),
            takeoverCommandsEnabled: z.boolean().optional(),
            // Group settings
            groupMode: z.enum(['disabled', 'mention_only', 'keyword_only', 'private_redirect']).optional(),
            groupKeywords: z.string().max(5000).optional(), // JSON string of keywords array
            groupRedirectMessage: z.string().max(500).optional(),
            customInstructions: z.string().max(10000).nullable().optional(),
            // Legacy clients receive a validation error; monetary authority requires the versioned endpoint.
            autoDiscountEnabled: z.boolean().optional(),
            autoDiscountMaxPercent: z.number().int().min(1).max(50).optional(),
            autoDiscountExpireHours: z.number().int().min(1).max(168).optional(),
        }).strict().superRefine((input, context) => {
            if (hasDiscountSettings(input)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Use the reviewed discount policy settings' });
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // Normalize tone: bot_settings MySQL enum only accepts 3 values
            const normalizedInput = { ...input };
            if (normalizedInput.tone && !['friendly', 'professional', 'casual'].includes(normalizedInput.tone)) {
                normalizedInput.tone = 'friendly';
            }

            // @ts-ignore
            const result = await updateBotSettings(merchant.id, normalizedInput);

            // Sync tone to personality settings so AI engine uses it
            if (input.tone) {
                try {
                    await getOrCreatePersonalitySettings(merchant.id);
                    await updateSariPersonalitySettings(merchant.id, { tone: input.tone as any });
                } catch (e) {
                    console.error('[BotSettings] Failed to sync tone to personality:', e);
                }
            }

            return result;
        }),

    // Check if bot should respond
    shouldRespond: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await shouldBotRespond(merchant.id);
    }),

    // Send test message
    sendTestMessage: permissionProcedure('bot_settings.manage').mutation(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // FIX: Use merchant's WhatsApp instance instead of legacy env-based connection
        const { getWhatsAppInstancesByMerchantId } = await import('./db');
        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstance = instances.find((i: any) => i.status === 'active');

        if (!activeInstance) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'يجب ربط حساب WhatsApp أولاً'
            });
        }

        const settings = await getBotSettings(merchant.id);
        if (!settings) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Bot settings not found' });
        }

        if (!merchant.phone) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message: 'يجب إضافة رقم هاتف في الإعدادات'
            });
        }

        const { sendMessageWithCredentials } = await import('./whatsapp');
        const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
        const result = await sendMessageWithCredentials(
            activeInstance.instanceId,
            activeInstance.token,
            apiUrl,
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
    getTakeoverConversations: permissionProcedure('conversations.read').query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const allConversations = await getConversationsByMerchantId(merchant.id);
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
