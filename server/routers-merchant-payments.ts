/**
 * Merchant Payments Router Module
 * Handles merchant payment settings and Tap integration
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getMerchantByUserId,
  getMerchantPaymentSettings,
  setMerchantPaymentVerified,
  upsertMerchantPaymentSettings,
} from './db';

export const merchantPaymentsRouter = router({
    // Get merchant's payment settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const settings = await getMerchantPaymentSettings(merchant.id);

        if (!settings) return null;

        const { toMerchantPaymentSettingsView } = await import('./payment/payment-link-policy');
        return toMerchantPaymentSettingsView(settings);
    }),

    // Save/update payment settings
    saveSettings: protectedProcedure
        .input(z.object({
            tapEnabled: z.boolean(),
            tapPublicKey: z.string().trim().max(500).optional(),
            tapSecretKey: z.string().trim().max(500).optional(),
            tapTestMode: z.boolean().default(true),
            autoSendPaymentLink: z.boolean().default(true),
            paymentLinkMessage: z.string().max(1000).optional(),
            defaultCurrency: z.enum(['SAR']).default('SAR'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const existingSettings = await getMerchantPaymentSettings(merchant.id);
            const secretWasSupplied = Boolean(input.tapSecretKey && !input.tapSecretKey.includes('****'));
            const effectiveSecret = secretWasSupplied ? input.tapSecretKey! : existingSettings?.tapSecretKey;
            const effectivePublicKey = input.tapPublicKey || existingSettings?.tapPublicKey;
            const { tapKeyMatchesMode, tapPublicKeyMatchesMode } = await import('./payment/payment-link-policy');
            if (input.tapEnabled && (!effectiveSecret || !effectivePublicKey)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'أدخل مفتاحي Tap العام والسري قبل التفعيل' });
            }
            if (effectiveSecret && !tapKeyMatchesMode(effectiveSecret, input.tapTestMode)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع مفتاح Tap لا يطابق وضع الاختبار/الإنتاج المحدد' });
            }
            if (effectivePublicKey && !tapPublicKeyMatchesMode(effectivePublicKey, input.tapTestMode)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع مفتاح Tap العام لا يطابق وضع الاختبار/الإنتاج المحدد' });
            }
            const credentialsChanged = secretWasSupplied
                || (input.tapPublicKey != null && input.tapPublicKey !== existingSettings?.tapPublicKey)
                || Boolean(existingSettings && Boolean(existingSettings.tapTestMode) !== input.tapTestMode);
            const updateData: any = {
                tapEnabled: input.tapEnabled ? 1 : 0,
                tapTestMode: input.tapTestMode ? 1 : 0,
                autoSendPaymentLink: input.autoSendPaymentLink ? 1 : 0,
                defaultCurrency: input.defaultCurrency,
                ...(credentialsChanged || !input.tapEnabled ? { isVerified: 0, lastVerifiedAt: null } : {}),
            };

            if (input.tapPublicKey) {
                updateData.tapPublicKey = input.tapPublicKey;
            }

            if (input.tapSecretKey && !input.tapSecretKey.includes('****')) {
                updateData.tapSecretKey = input.tapSecretKey;
            }

            if (input.paymentLinkMessage !== undefined) {
                updateData.paymentLinkMessage = input.paymentLinkMessage;
            }

            await upsertMerchantPaymentSettings(merchant.id, updateData);

            return { success: true, message: 'تم حفظ الإعدادات بنجاح' };
        }),

    // Test Tap connection with merchant's keys
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const settings = await getMerchantPaymentSettings(merchant.id);
        if (!settings?.tapPublicKey || !settings.tapSecretKey) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم يتم إدخال مفاتيح Tap' });
        }
        const { tapKeyMatchesMode, tapPublicKeyMatchesMode } = await import('./payment/payment-link-policy');
        const testMode = Boolean(settings.tapTestMode);
        if (!tapKeyMatchesMode(settings.tapSecretKey, testMode)
            || !tapPublicKeyMatchesMode(settings.tapPublicKey, testMode)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع المفتاح لا يطابق وضع الاختبار/الإنتاج' });
        }

        try {
            const baseUrl = settings.tapTestMode ? 'https://api.tap.company/v2' : 'https://api.tap.company/v2';
            const response = await fetch(`${baseUrl}/charges`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${settings.tapSecretKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok || response.status === 200) {
                await setMerchantPaymentVerified(merchant.id, true);
                return { success: true, message: 'تم التحقق من الاتصال بنجاح' };
            } else {
                await setMerchantPaymentVerified(merchant.id, false);
                const error = await response.json().catch(() => ({}));
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: error.message || 'فشل التحقق من مفاتيح Tap'
                });
            }
        } catch (error: any) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'حدث خطأ أثناء الاتصال بـ Tap'
            });
        }
    }),

});

export type MerchantPaymentsRouter = typeof merchantPaymentsRouter;
