/**
 * Payments Router Module
 * Handles Tap Payments integration and payment management
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * 
 * FIX #1: All endpoints now use proper merchant lookup via getMerchantByUserId()
 * instead of the nonexistent ctx.merchant (which caused runtime crashes).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getMerchantByUserId } from './db';

// Helper: get merchant or throw
async function requireMerchant(userId: number) {
    const merchant = await getMerchantByUserId(userId);
    if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    }
    return merchant;
}

export const paymentsRouter = router({
    // Create payment charge
    createCharge: protectedProcedure
        .input(z.object({
            amount: z.number().int().min(100).max(100_000_000),
            currency: z.enum(['SAR']).default('SAR'),
            customerName: z.string(),
            customerEmail: z.string().email().optional(),
            customerPhone: z.string(),
            description: z.string().optional(),
            orderId: z.number().optional(),
            bookingId: z.number().optional(),
            redirectUrl: z.string().url(),
            // @ts-ignore
            metadata: z.record(z.any()).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const tapPayments = await import('./_core/tapPayments');

            const charge = await tapPayments.createCharge({
                ...input,
                redirectUrl: (await import('./utils/public-url')).publicPaymentUrls.return(),
                webhookUrl: (await import('./utils/public-url')).publicPaymentUrls.webhook(),
            });

            const payment = await dbPayments.createOrderPayment({
                merchantId: merchant.id,
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
            const merchant = await requireMerchant(ctx.user.id);
            const tapPayments = await import('./_core/tapPayments');
            const dbPayments = await import('./db_payments');

            // Verify ownership: payment must belong to this merchant
            const payment = await dbPayments.getOrderPaymentByTapChargeId(input.chargeId);
            if (payment && payment.merchantId !== merchant.id) {
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
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const payment = await dbPayments.getOrderPaymentById(input.id);
            if (!payment || payment.merchantId !== merchant.id) {
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
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const filters: any = { status: input.status, limit: input.limit };
            if (input.startDate) filters.startDate = new Date(input.startDate);
            if (input.endDate) filters.endDate = new Date(input.endDate);
            return await dbPayments.getOrderPaymentsByMerchant(merchant.id, filters);
        }),

    getStats: protectedProcedure
        .input(z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const startDate = input.startDate ? new Date(input.startDate) : undefined;
            const endDate = input.endDate ? new Date(input.endDate) : undefined;
            return await dbPayments.getPaymentStats(merchant.id, startDate, endDate);
        }),

    createRefund: protectedProcedure
        .input(z.object({
            paymentId: z.number(),
            amount: z.number().int().min(100).max(100_000_000),
            reason: z.string().trim().min(3).max(500),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const tapPayments = await import('./_core/tapPayments');

            const payment = await dbPayments.getOrderPaymentById(input.paymentId);
            if (!payment || payment.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
            }
            if (!payment.tapChargeId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment has no Tap charge ID' });
            }
            if (payment.status !== 'captured' || input.amount > payment.amount) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid refund amount or payment status' });
            }
            const existingRefunds = await dbPayments.getPaymentRefundsByPaymentId(payment.id);
            const alreadyRefunded = existingRefunds
                .filter(refund => refund.status === 'pending' || refund.status === 'completed')
                .reduce((sum, refund) => sum + refund.amount, 0);
            if (input.amount > payment.amount - alreadyRefunded) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Refund exceeds the remaining captured amount' });
            }

            const refund = await tapPayments.createRefund({
                chargeId: payment.tapChargeId,
                amount: input.amount,
                currency: payment.currency,
                reason: input.reason,
            });

            const dbRefund = await dbPayments.createPaymentRefund({
                paymentId: payment.id,
                merchantId: merchant.id,
                amount: input.amount,
                currency: payment.currency,
                reason: input.reason,
                tapRefundId: refund.id,
                status: 'pending',
                processedBy: ctx.user.id,
            });

            if (input.amount === payment.amount - alreadyRefunded) {
                await dbPayments.updateOrderPaymentStatus(payment.id, 'refunded');
            }
            return { refundId: dbRefund?.id, tapRefundId: refund.id, status: refund.status };
        }),

    listRefunds: protectedProcedure
        .input(z.object({
            paymentId: z.number().optional(),
            status: z.string().optional(),
            limit: z.number().default(50),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            if (input.paymentId) {
                // Verify ownership: payment must belong to this merchant
                const payment = await dbPayments.getOrderPaymentById(input.paymentId);
                if (!payment || payment.merchantId !== merchant.id) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
                }
                return await dbPayments.getPaymentRefundsByPaymentId(input.paymentId);
            }
            return await dbPayments.getPaymentRefundsByMerchant(merchant.id, { status: input.status, limit: input.limit });
        }),

    createLink: protectedProcedure
        .input(z.object({
            title: z.string().trim().min(2).max(255),
            description: z.string().trim().max(1000).optional(),
            amount: z.number().int().min(100).max(100_000_000),
            currency: z.enum(['SAR']).default('SAR'),
            isFixedAmount: z.boolean().default(true),
            maxUsageCount: z.number().int().min(1).max(100_000).optional(),
            expiresAt: z.string().optional(),
            orderId: z.number().optional(),
            bookingId: z.number().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const crypto = await import('node:crypto');
            const linkId = `link_${crypto.randomBytes(16).toString('hex')}`;
            const { publicPaymentUrls } = await import('./utils/public-url');
            const tapPaymentUrl = publicPaymentUrls.link(linkId);

            const link = await dbPayments.createPaymentLink({
                merchantId: merchant.id,
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
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
            if (!link || link.merchantId !== merchant.id) {
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
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            return await dbPayments.getPaymentLinksByMerchant(merchant.id, { status: input.status, isActive: input.isActive, limit: input.limit });
        }),

    disableLink: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await requireMerchant(ctx.user.id);
            const dbPayments = await import('./db_payments');
            const link = await dbPayments.getPaymentLinkById(input.id);
            if (!link || link.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
            }
            await dbPayments.disablePaymentLink(input.id);
            return { success: true };
        }),

});

export type PaymentsRouter = typeof paymentsRouter;
