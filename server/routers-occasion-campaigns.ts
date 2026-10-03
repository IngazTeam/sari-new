import {occasionWorkspaceInput} from '../shared/occasion-workspace';
import {readOccasionWorkspace,OccasionWorkspaceError} from './occasion-workspace-store';
/** Occasion marketing with session-derived tenant scope and explicit opt-in. */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { permissionProcedure, protectedProcedure, router } from './_core/trpc';
import {
  createOccasionCampaign,
  getMerchantById,
  getOccasionCampaignById,
  getOccasionCampaignByTypeAndYear,
  getOccasionCampaignsByMerchantId,
  getOccasionCampaignsStats,
  setPendingOccasionEnabled,
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
  workspace:permissionProcedure('analytics.read').input(occasionWorkspaceInput).query(async({ctx,input})=>{try{return await readOccasionWorkspace(ctx.user.id,ctx.merchantId,input);}catch(error){throw new TRPCError({code:error instanceof OccasionWorkspaceError&&error.reason==='forbidden'?'FORBIDDEN':'INTERNAL_SERVER_ERROR',message:'تعذر قراءة حملات المناسبات لهذا المتجر. حدّث الصفحة وحاول مجددًا.'});}}),
  list: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOccasionCampaignsByMerchantId(merchant.id);
  }),

  getStats: permissionProcedure('analytics.read').query(async ({ ctx }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return getOccasionCampaignsStats(merchant.id);
  }),

  getUpcoming: protectedProcedure.query(() => getUpcomingOccasions()),

  toggle: permissionProcedure('campaigns.manage')
    .input(z.object({
      campaignId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      enabled: z.boolean(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantById(ctx.merchantId);
      const campaign = await getOccasionCampaignById(input.campaignId);
      if (!merchant || !campaign || campaign.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      if (campaign.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A campaign in progress or completed cannot be changed' });
      }
      if (!await setPendingOccasionEnabled(campaign.id, merchant.id, input.enabled)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت حالة الحملة. حدّث الصفحة قبل تغيير تفعيلها.' });
      }
      return { success: true };
    }),

  create: permissionProcedure('campaigns.manage')
    .input(z.object({
      occasionType: occasionTypeSchema,
      year: z.number().int(),
    }).strict())
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantById(ctx.merchantId);
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
