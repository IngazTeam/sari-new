/**
 * Merchant Payments Router Module
 * Handles merchant payment settings and Tap integration
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const merchantPaymentsRouter = router({
    // Get merchant's payment settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const settings = await db.getMerchantPaymentSettings(merchant.id);

        // Return settings with masked secret key
        if (settings?.tapSecretKey) {
            return {
                ...settings,
                tapSecretKey: settings.tapSecretKey.slice(0, 8) + '****' + settings.tapSecretKey.slice(-4),
            };
        }

        return settings;
    }),

    // Save/update payment settings
    saveSettings: protectedProcedure
        .input(z.object({
            tapEnabled: z.boolean(),
            tapPublicKey: z.string().optional(),
            tapSecretKey: z.string().optional(),
            tapTestMode: z.boolean().default(true),
            autoSendPaymentLink: z.boolean().default(true),
            paymentLinkMessage: z.string().optional(),
            defaultCurrency: z.string().default('SAR'),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const updateData: any = {
                tapEnabled: input.tapEnabled ? 1 : 0,
                tapTestMode: input.tapTestMode ? 1 : 0,
                autoSendPaymentLink: input.autoSendPaymentLink ? 1 : 0,
                defaultCurrency: input.defaultCurrency,
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

            await db.upsertMerchantPaymentSettings(merchant.id, updateData);

            return { success: true, message: 'تم حفظ الإعدادات بنجاح' };
        }),

    // Test Tap connection with merchant's keys
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const settings = await db.getMerchantPaymentSettings(merchant.id);
        if (!settings?.tapSecretKey) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم يتم إدخال مفاتيح Tap' });
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
                await db.setMerchantPaymentVerified(merchant.id, true);
                return { success: true, message: 'تم التحقق من الاتصال بنجاح' };
            } else {
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

    // Create payment link using merchant's Tap keys
    createPaymentLink: protectedProcedure
        .input(z.object({
            amount: z.number().min(1),
            customerPhone: z.string(),
            customerName: z.string().optional(),
            customerEmail: z.string().email().optional(),
            description: z.string().optional(),
            orderId: z.number().optional(),
            bookingId: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const settings = await db.getMerchantPaymentSettings(merchant.id);
            if (!settings?.tapEnabled || !settings?.tapSecretKey) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'الدفع الإلكتروني غير مفعل' });
            }

            try {
                const baseUrl = 'https://api.tap.company/v2';

                const chargeData = {
                    amount: input.amount / 100,
                    currency: settings.defaultCurrency || 'SAR',
                    customer: {
                        first_name: input.customerName || 'Customer',
                        phone: {
                            country_code: '966',
                            number: input.customerPhone.replace(/^\+?966/, '').replace(/^0/, ''),
                        },
                        email: input.customerEmail,
                    },
                    source: { id: 'src_all' },
                    redirect: {
                        url: `${process.env.VITE_APP_URL || 'https://sari.manus.space'}/payment/callback`,
                    },
                    description: input.description || `طلب من ${merchant.businessName}`,
                    metadata: {
                        merchantId: merchant.id,
                        orderId: input.orderId,
                        bookingId: input.bookingId,
                    },
                };

                const response = await fetch(`${baseUrl}/charges`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${settings.tapSecretKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(chargeData),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: result.message || 'فشل إنشاء رابط الدفع'
                    });
                }

                return {
                    success: true,
                    paymentUrl: result.transaction?.url || result.redirect?.url,
                    chargeId: result.id,
                };
            } catch (error: any) {
                if (error instanceof TRPCError) throw error;
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'حدث خطأ أثناء إنشاء رابط الدفع'
                });
            }
        }),
});

export type MerchantPaymentsRouter = typeof merchantPaymentsRouter;
