/**
 * Bot Settings Router Module
 * Handles AI bot configuration and settings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { workingTimeSchema, workingDaysSchema, InvalidWorkingScheduleError } from '../shared/bot-working-schedule';
import { botSettingsFormRevision, assistantOptionRevision, AssistantSettingsConflictError } from './bot-settings-version';
import { assistantOptionInput } from '../shared/assistant-options';
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from './_core/permissions';
import { discountPolicyUpdateSchema, hasDiscountSettings } from '../shared/discount-policy';
import { getDiscountPolicy, updateDiscountPolicy } from './ai/discount-policy';
import { marginPolicyUpdateSchema } from '../shared/checkout-margin';
import { getMarginPolicy, updateMarginPolicy } from './ai/checkout-margin-policy';
import {
  getBotSettings,
  getConversationsByMerchantId,
  getMerchantById,
  getAssistantSettings,
  shouldBotRespond,
  updateBotSettings,
} from './db';

export const botSettingsRouter = router({
    takeoverWorkspace: permissionProcedure('conversations.read').input(z.object({ page: z.number().int().min(1).max(100000).default(1) })).query(async ({ctx,input}) => {
        try { const { readTakeoverWorkspace } = await import('./takeover-workspace'); return await readTakeoverWorkspace(ctx.merchantId,input.page); }
        catch { throw new TRPCError({ code:'INTERNAL_SERVER_ERROR',message:'Takeover conversations unavailable' }); }
    }),
    getMarginPolicy: merchantProcedure.query(async ({ctx}) => {
        try { return { ...await getMarginPolicy(ctx.merchantId), merchantId: ctx.merchantId, canManage: hasPermission(ctx.merchantRole,'bot_settings.manage') }; }
        catch { throw new TRPCError({code:'CONFLICT',message:'Margin policy unavailable'}); }
    }),
    updateMarginPolicy: permissionProcedure('bot_settings.manage').input(marginPolicyUpdateSchema).mutation(async ({ctx,input}) => {
        try { return { ...await updateMarginPolicy({...input,merchantId:ctx.merchantId,actorUserId:ctx.user.id}), merchantId: ctx.merchantId }; }
        catch { throw new TRPCError({code:'CONFLICT',message:'Margin policy changed or unavailable; refresh and review again'}); }
    }),
    getDiscountPolicy: merchantProcedure.query(async ({ ctx }) => {
        try { return { ...await getDiscountPolicy(ctx.merchantId), merchantId: ctx.merchantId, canManage: hasPermission(ctx.merchantRole, 'bot_settings.manage') }; }
        catch { throw new TRPCError({ code: 'CONFLICT', message: 'Discount settings unavailable' }); }
    }),
    updateDiscountPolicy: permissionProcedure('bot_settings.manage').input(discountPolicyUpdateSchema).mutation(async ({ ctx, input }) => {
        try { return { ...await updateDiscountPolicy({ ...input, merchantId: ctx.merchantId, actorUserId: ctx.user.id }), merchantId: ctx.merchantId }; }
        catch { throw new TRPCError({ code: 'CONFLICT', message: 'Discount settings changed or unavailable; refresh and review again' }); }
    }),
    // Get bot settings for current merchant
    get: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const settings = await getAssistantSettings(merchant.id);
        return { ...settings, formRevision: botSettingsFormRevision(settings), optionRevisions: { language: assistantOptionRevision(settings, 'language'), takeover: assistantOptionRevision(settings, 'takeover') }, canManage: hasPermission(ctx.merchantRole, 'bot_settings.manage') };
    }),

    updateOption: permissionProcedure('bot_settings.manage').input(assistantOptionInput).mutation(async ({ ctx, input }) => {
        try {
            const patch = input.kind === 'language' ? { language: input.language } : input.draft;
            const saved = await updateBotSettings(ctx.merchantId, patch as any, { option: input.kind, expectedOptionRevision: input.expectedRevision });
            return { ...saved, optionRevisions: { language: assistantOptionRevision(saved, 'language'), takeover: assistantOptionRevision(saved, 'takeover') } };
        } catch (error) {
            throw new TRPCError({ code: error instanceof AssistantSettingsConflictError ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR', message: error instanceof AssistantSettingsConflictError ? error.message : 'Unable to save assistant option' });
        }
    }),

    // Update bot settings
    update: permissionProcedure('bot_settings.manage')
        .input(z.object({
            expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
            autoReplyEnabled: z.boolean().optional(),
            workingHoursEnabled: z.boolean().optional(),
            workingHoursStart: workingTimeSchema.optional(),
            workingHoursEnd: workingTimeSchema.optional(),
            workingDays: workingDaysSchema.optional(),
            welcomeMessage: z.string().optional(),
            outOfHoursMessage: z.string().optional(),
            responseDelay: z.number().min(1).max(10).optional(),
            maxResponseLength: z.number().min(50).max(500).optional(),
            // Preserve all four supported tones; normalize unknown legacy values.
            tone: z.string().transform(v => {
                const valid = ['friendly', 'professional', 'casual', 'enthusiastic'] as const;
                return valid.includes(v as any) ? v as typeof valid[number] : 'friendly';
            }).optional(),
            style: z.enum(['saudi_dialect', 'formal_arabic', 'english', 'bilingual']).optional(),
            emojiUsage: z.enum(['none', 'minimal', 'moderate', 'frequent']).optional(),
            personalityInstructions: z.string().max(2000).optional(),
            brandVoice: z.string().max(2000).optional(),
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
            if (input.takeoverTimeoutMinutes !== undefined || input.takeoverResumeMessage !== undefined || input.takeoverCommandsEnabled !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Use the reviewed takeover settings' });
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // The store writes bot and personality settings in one transaction.
            const { expectedRevision, ...normalizedInput } = input;

            let result;
            try {
                // Boolean API flags are converted to tinyint by updateBotSettings.
                result = await updateBotSettings(merchant.id, normalizedInput as any, { expectedRevision });
            } catch (error) {
                throw new TRPCError({
                    code: error instanceof AssistantSettingsConflictError ? 'CONFLICT' : error instanceof InvalidWorkingScheduleError ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
                    message: error instanceof AssistantSettingsConflictError ? error.message : error instanceof InvalidWorkingScheduleError ? 'Review the working schedule' : 'Unable to save bot settings',
                });
            }

            return { ...result, formRevision: botSettingsFormRevision(result) };
        }),

    // Check if bot should respond
    shouldRespond: merchantProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const decision = await shouldBotRespond(merchant.id);
        // This checks saved reply flags and schedule, not provider delivery or AI quality.
        return { ...decision, merchantId: merchant.id, checkedAt: new Date().toISOString() };
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
