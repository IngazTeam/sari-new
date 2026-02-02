/**
 * Occasion Campaigns Router Module
 * Handles holiday/occasion marketing campaigns
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const occasionCampaignsRouter = router({
    // List occasion campaigns for merchant
    list: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getOccasionCampaignsByMerchantId(input.merchantId);
        }),

    // Get statistics
    getStats: protectedProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            return await db.getOccasionCampaignsStats(input.merchantId);
        }),

    // Get upcoming occasions
    getUpcoming: protectedProcedure.query(async () => {
        const { getUpcomingOccasions } = await import('./automation/occasion-campaigns');
        return getUpcomingOccasions();
    }),

    // Toggle campaign enabled status
    toggle: protectedProcedure
        .input(z.object({ campaignId: z.number(), enabled: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
            const campaign = await db.getOccasionCampaignById(input.campaignId);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await db.getMerchantById(campaign.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            await db.updateOccasionCampaign(input.campaignId, {
                enabled: input.enabled,
            });

            return { success: true };
        }),

    // Create occasion campaign manually
    create: protectedProcedure
        .input(
            z.object({
                merchantId: z.number(),
                occasionType: z.enum(['ramadan', 'eid_fitr', 'eid_adha', 'national_day', 'new_year', 'hijri_new_year']),
                discountPercentage: z.number().min(5).max(50),
            })
        )
        .mutation(async ({ input, ctx }) => {
            const merchant = await db.getMerchantById(input.merchantId);
            if (!merchant || merchant.userId !== ctx.user.id) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
            }

            const year = new Date().getFullYear();

            const existing = await db.getOccasionCampaignByTypeAndYear(
                input.merchantId,
                input.occasionType,
                year
            );

            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already exists for this occasion' });
            }

            const campaign = await db.createOccasionCampaign({
                merchantId: input.merchantId,
                occasionType: input.occasionType,
                year,
                enabled: true,
                discountPercentage: input.discountPercentage,
                status: 'pending',
            });

            return campaign;
        }),
});

export type OccasionCampaignsRouter = typeof occasionCampaignsRouter;
