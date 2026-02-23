/**
 * Payments Router Module
 * Handles Tap Payments integration and payment management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";

export const paymentsRouter = router({
    // Create payment charge
    createCharge: protectedProcedure
        .input(z.object({
            amount: z.number().positive(),
            currency: z.string().default('SAR'),
            customerName: z.string(),
            customerEmail: z.string().email().optional(),
            customerPhone: z.string(),
            description: z.string().optional(),
            orderId: z.number().optional(),
            bookingId: z.number().optional(),
            redirectUrl: z.string().url(),
            metadata: z.record(z.any()).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const tapPayments = await import('./_core/tapPayments');

            const charge = await tapPayments.createCharge({
                ...input,
                webhookUrl: `${process.env.VITE_FRONTEND_FORGE_API_URL}/api/webhooks/tap`,
            });

            const payment = await dbPayments.createOrderPayment({
                merchantId: ctx.merchant.id,
                orderId: input.orderId || null,
                bookingId: input.bookingId || null,
                customerPhone: input.customerPhone,
                customerName: input.customerName,
                customerEmail: input.customerEmail || null,
                amount: input.amount,
                currency: input.currency,
                tapChargeId: charge.id,
                tapPaymentUrl: charge.transaction.url,
                status: 'pending',
                description: input.description || null,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                expiresAt: new Date(Date.now() + charge.transaction.expiry.period * 60 * 60 * 1000).toISOString(),
            });

            return {
                paymentId: payment?.id,
                chargeId: charge.id,
                paymentUrl: charge.transaction.url,
                expiresAt: charge.transaction.expiry,
            };
        }),

    verifyPayment: protectedProcedure
        .input(z.object({ chargeId: z.string() }))
        .query(async ({ ctx, input }) => {
            const tapPayments = await import('./_core/tapPayments');
            const dbPayments = await import('./db_payments');

            // Verify ownership: payment must belong to this merchant
            const payment = await dbPayments.getOrderPaymentByTapChargeId(input.chargeId);
            if (payment && payment.merchantId !== ctx.merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const verification = await tapPayments.verifyPayment(input.chargeId);
            if (payment) {
                await dbPayments.updateOrderPaymentStatus(payment.id, verification.status.toLowerCase() as any);
            }
            return verification;
        }),

    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const payment = await dbPayments.getOrderPaymentById(input.id);
            if (!payment || payment.merchantId !== ctx.merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
            }
            return payment;
        }),

    list: protectedProcedure
        .input(z.object({
            status: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            limit: z.number().default(50),
        }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const filters: any = { status: input.status, limit: input.limit };
            if (input.startDate) filters.startDate = new Date(input.startDate);
            if (input.endDate) filters.endDate = new Date(input.endDate);
            return await dbPayments.getOrderPaymentsByMerchant(ctx.merchant.id, filters);
        }),

    getStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const startDate = input.startDate ? new Date(input.startDate) : undefined;
            const endDate = input.endDate ? new Date(input.endDate) : undefined;
            return await dbPayments.getPaymentStats(ctx.merchant.id, startDate, endDate);
        }),

    createRefund: protectedProcedure
        .input(z.object({
            paymentId: z.number(),
            amount: z.number().positive(),
            reason: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const tapPayments = await import('./_core/tapPayments');

            const payment = await dbPayments.getOrderPaymentById(input.paymentId);
            if (!payment || payment.merchantId !== ctx.merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
            }
            if (!payment.tapChargeId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment has no Tap charge ID' });
            }

            const refund = await tapPayments.createRefund({
                chargeId: payment.tapChargeId,
                amount: input.amount,
                currency: payment.currency,
                reason: input.reason,
            });

            const dbRefund = await dbPayments.createPaymentRefund({
                paymentId: payment.id,
                merchantId: ctx.merchant.id,
                amount: input.amount,
                currency: payment.currency,
                reason: input.reason,
                tapRefundId: refund.id,
                status: 'pending',
                processedBy: ctx.user.id,
            });

            await dbPayments.updateOrderPaymentStatus(payment.id, 'refunded');
            return { refundId: dbRefund?.id, tapRefundId: refund.id, status: refund.status };
        }),

    listRefunds: protectedProcedure
        .input(z.object({
            paymentId: z.number().optional(),
            status: z.string().optional(),
            limit: z.number().default(50),
        }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            if (input.paymentId) {
                // Verify ownership: payment must belong to this merchant
                const payment = await dbPayments.getOrderPaymentById(input.paymentId);
                if (!payment || payment.merchantId !== ctx.merchant.id) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
                }
                return await dbPayments.getPaymentRefundsByPaymentId(input.paymentId);
            }
            return await dbPayments.getPaymentRefundsByMerchant(ctx.merchant.id, { status: input.status, limit: input.limit });
        }),

    createLink: protectedProcedure
        .input(z.object({
            title: z.string(),
            description: z.string().optional(),
            amount: z.number().positive(),
            currency: z.string().default('SAR'),
            isFixedAmount: z.boolean().default(true),
            maxUsageCount: z.number().optional(),
            expiresAt: z.string().optional(),
            orderId: z.number().optional(),
            bookingId: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const crypto = await import('crypto');
            const linkId = `link_${crypto.randomBytes(16).toString('hex')}`;
            const tapPaymentUrl = `${process.env.VITE_FRONTEND_FORGE_API_URL}/pay/${linkId}`;

            const link = await dbPayments.createPaymentLink({
                merchantId: ctx.merchant.id,
                linkId,
                title: input.title,
                description: input.description || null,
                amount: input.amount,
                currency: input.currency,
                isFixedAmount: input.isFixedAmount ? 1 : 0,
                minAmount: null,
                maxAmount: null,
                tapPaymentUrl,
                maxUsageCount: input.maxUsageCount || null,
                expiresAt: input.expiresAt || null,
                status: 'active',
                isActive: 1,
                orderId: input.orderId || null,
                bookingId: input.bookingId || null,
            });

            return { linkId: link?.linkId, paymentUrl: tapPaymentUrl, link };
        }),

    getLink: protectedProcedure
        .input(z.object({ linkId: z.string() }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
            if (!link || link.merchantId !== ctx.merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
            }
            return link;
        }),

    listLinks: protectedProcedure
        .input(z.object({
            status: z.string().optional(),
            isActive: z.boolean().optional(),
            limit: z.number().default(50),
        }))
        .query(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            return await dbPayments.getPaymentLinksByMerchant(ctx.merchant.id, { status: input.status, isActive: input.isActive, limit: input.limit });
        }),

    disableLink: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const dbPayments = await import('./db_payments');
            const link = await dbPayments.getPaymentLinkById(input.id);
            if (!link || link.merchantId !== ctx.merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
            }
            await dbPayments.disablePaymentLink(input.id);
            return { success: true };
        }),

    // Webhook handler for Tap Payments
    handleWebhook: publicProcedure
        .input(z.object({
            payload: z.any(),
            signature: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
            const tapWebhook = await import('./webhooks/tap-webhook');

            // SECURITY: Webhook signature verification is MANDATORY
            if (!process.env.TAP_WEBHOOK_SECRET) {
                console.error('[Webhook] TAP_WEBHOOK_SECRET not configured — rejecting webhook');
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Webhook not configured' });
            }

            if (!input.signature) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing webhook signature' });
            }

            const isValid = tapWebhook.verifyTapSignature(
                JSON.stringify(input.payload),
                input.signature,
                process.env.TAP_WEBHOOK_SECRET
            );

            if (!isValid) {
                throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid webhook signature' });
            }

            const result = await tapWebhook.processTapWebhook(input.payload);
            return result;
        }),
});

export type PaymentsRouter = typeof paymentsRouter;
