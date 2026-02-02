/**
 * Booking Reviews Router Module
 * Handles customer reviews for booking services
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const bookingReviewsRouter = router({
    // Create a review
    create: protectedProcedure
        .input(z.object({
            bookingId: z.number(),
            serviceId: z.number(),
            staffId: z.number().optional(),
            customerPhone: z.string(),
            customerName: z.string().optional(),
            overallRating: z.number().min(1).max(5),
            serviceQuality: z.number().min(1).max(5).optional(),
            professionalism: z.number().min(1).max(5).optional(),
            valueForMoney: z.number().min(1).max(5).optional(),
            comment: z.string().optional(),
            isPublic: z.boolean().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const reviewId = await db.createBookingReview({
                merchantId: merchant.id,
                ...input,
                isPublic: input.isPublic ? 1 : 0,
            });

            return { success: true, reviewId };
        }),

    // List reviews
    list: protectedProcedure
        .input(z.object({
            serviceId: z.number().optional(),
            staffId: z.number().optional(),
            minRating: z.number().optional(),
            isPublic: z.boolean().optional(),
            limit: z.number().optional(),
        }))
        .query(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const reviews = await db.getBookingReviews(merchant.id, {
                ...input,
                isPublic: input.isPublic !== undefined ? (input.isPublic ? 1 : 0) : undefined,
            });
            return { reviews };
        }),

    // Get reviews by service
    getByService: protectedProcedure
        .input(z.object({ serviceId: z.number() }))
        .query(async ({ input }) => {
            const reviews = await db.getReviewsByService(input.serviceId);
            return { reviews };
        }),

    // Reply to review
    reply: protectedProcedure
        .input(z.object({
            reviewId: z.number(),
            reply: z.string(),
        }))
        .mutation(async ({ ctx, input }) => {
            const merchant = await db.getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            await db.replyToReview(input.reviewId, input.reply);
            return { success: true };
        }),

    // Get rating statistics
    getStats: protectedProcedure
        .input(z.object({ serviceId: z.number() }))
        .query(async ({ input }) => {
            const stats = await db.getServiceRatingStats(input.serviceId);
            return { stats };
        }),
});

export type BookingReviewsRouter = typeof bookingReviewsRouter;
