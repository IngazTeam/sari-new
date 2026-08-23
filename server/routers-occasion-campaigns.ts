/** Occasion marketing with session-derived tenant scope and explicit opt-in. */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { protectedProcedure, router } from './_core/trpc';
import {
  createOccasionCampaign,
  getMerchantByUserId,
  getOccasionCampaignById,
  getOccasionCampaignByTypeAndYear,
  getOccasionCampaignsByMerchantId,
  getOccasionCampaignsStats,
  updateOccasionCampaign,
} from './db';
import {
  getOccasionDiscountPercentage,
  getUpcomingOccasions,
  type OccasionType,
} from './automation/occasion-campaigns';

const occasionTypeSchema = z.enum([
  'ramadan',
  'eid_fitr',
  'eid_adha',
  'national_day',
  'new_year',
  'hijri_new_year',
]);

function isDuplicateDefinition(error: unknown): boolean {
  return (error as { code?: string }).code === 'ER_DUP_ENTRY';
}

export const occasionCampaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOccasionCampaignsByMerchantId(merchant.id);
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOccasionCampaignsStats(merchant.id);
  }),

  getUpcoming: protectedProcedure.query(() => getUpcomingOccasions()),

  toggle: protectedProcedure
    .input(z.object({
      campaignId: z.number().int().positive(),
      enabled: z.boolean(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      const campaign = await getOccasionCampaignById(input.campaignId);
      if (!merchant || !campaign || campaign.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      if (campaign.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A campaign in progress or completed cannot be changed' });
      }
      await updateOccasionCampaign(campaign.id, { enabled: input.enabled ? 1 : 0 });
      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      occasionType: occasionTypeSchema,
      year: z.number().int(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      if (merchant.status !== 'active') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
      }

      const upcoming = getUpcomingOccasions();
      const isOfferedOccasion = upcoming.some(occasion => (
        occasion.type === input.occasionType && occasion.year === input.year
      ));
      if (!isOfferedOccasion) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Select an occasion from the current upcoming list' });
      }
      const existing = await getOccasionCampaignByTypeAndYear(
        merchant.id,
        input.occasionType,
        input.year,
      );
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Campaign already exists for this occasion' });
      }

      try {
        return await createOccasionCampaign({
          merchantId: merchant.id,
          occasionType: input.occasionType as OccasionType,
          year: input.year,
          enabled: 1,
          discountPercentage: getOccasionDiscountPercentage(input.occasionType),
          status: 'pending',
        });
      } catch (error) {
        if (isDuplicateDefinition(error)) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Campaign already exists for this occasion' });
        }
        throw error;
      }
    }),
});

export type OccasionCampaignsRouter = typeof occasionCampaignsRouter;
