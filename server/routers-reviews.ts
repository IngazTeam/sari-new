/**
 * Reviews Router Module
 * Handles customer reviews and ratings
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getCustomerReviewById,
  getCustomerReviewsByMerchantId,
  getMerchantById,
  getOrderById,
  updateCustomerReview,
} from './db';

export const reviewsRouter = router({
    // List all reviews for merchant
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await getCustomerReviewsByMerchantId(input.merchantId);
        }),

    // Get review statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const { getMerchantReviewStats } = await import('./automation/review-request');
            return await getMerchantReviewStats(input.merchantId);
        }),

    // Get review by ID
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            const review = await getCustomerReviewById(input.id);
            if (!review) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
            }

            const order = await getOrderById(review.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
            }

            const merchant = await getMerchantById(order.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return review;
        }),

    // Reply to a review
    reply: protectedProcedure
        .input(z.object({
            reviewId: z.number(),
            reply: z.string().min(1).max(1000), // PEN-NEW-4: Cap length to prevent WhatsApp abuse
        }))
        .mutation(async ({ input, ctx }) => {
            const review = await getCustomerReviewById(input.reviewId);
            if (!review) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
            }

            const order = await getOrderById(review.orderId);
            if (!order) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
            }

            const merchant = await getMerchantById(order.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await updateCustomerReview(input.reviewId, {
                merchantReply: input.reply,
                repliedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            });

            try {
                const { sendTextMessage } = await import('./whatsapp');
                const message = `شكراً لتقييمك! \n\nردنا:\n${input.reply}`;
                await sendTextMessage(review.customerPhone, message);
            } catch (error) {
                console.error('Failed to send WhatsApp reply:', error);
            }

            return { success: true };
        }),
});

export type ReviewsRouter = typeof reviewsRouter;
