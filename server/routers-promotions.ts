import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import {
  createPromotion,
  getPromotionById,
  getPromotionsByMerchant,
  countActivePromotions,
  updatePromotion,
  deletePromotion,
  createDiscountCode,
  getDiscountCodesByMerchantId,
  getMerchantByUserId,
  deactivateExpiredPromotions,
} from './db';

const MAX_ACTIVE_PROMOTIONS = 5;

/**
 * Get merchantId from auth context
 */
async function getMerchantId(ctx: any): Promise<number> {
  const merchant = await getMerchantByUserId(ctx.user.id);
  if (!merchant) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
  }
  return merchant.id;
}

export const promotionsRouter = router({
  // List all promotions for the merchant
  list: protectedProcedure
    .input(z.object({
      activeOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const all = await getPromotionsByMerchant(merchantId);

      if (input?.activeOnly) {
        const now = new Date();
        return all.filter(p =>
          p.isActive === 1 &&
          (!p.startsAt || new Date(p.startsAt) <= now) &&
          (!p.expiresAt || new Date(p.expiresAt) >= now)
        );
      }
      return all;
    }),

  // Get single promotion
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const promo = await getPromotionById(input.id);
      if (!promo || promo.merchantId !== merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Promotion not found' });
      }
      return promo;
    }),

  // Create promotion
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      // PEN-PROMO-02: Validate URL format to prevent SSRF/injection at storage time
      bannerImageUrl: z.string().url().max(500).optional(),
      type: z.enum(['percentage', 'fixed', 'bundle', 'free_shipping', 'custom']),
      // PEN-PROMO-06: Cap value to prevent financial abuse (100000 riyals or 100%)
      value: z.number().min(0).max(100000).optional(),
      scope: z.enum(['all', 'products', 'categories']).default('all'),
      productIds: z.string().max(2000).optional(), // PEN-PROMO-05: Limit size
      categoryIds: z.string().max(2000).optional(),
      minOrderAmount: z.number().min(0).max(1000000).optional(),
      minQuantity: z.number().min(1).max(10000).optional(),
      // PEN-PROMO-04: Validate date format (ISO 8601)
      startsAt: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
      expiresAt: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional()),
      // Auto discount code
      autoGenerateCode: z.boolean().optional(),
      // PEN-PROMO-06: Cap discount code value at 100 (% or fixed)
      autoCodeValue: z.number().min(0).max(100).optional(),
      autoCodeType: z.enum(['percentage', 'fixed']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);

      // PEN-PROMO-03: Auto-deactivate expired promotions before counting
      await deactivateExpiredPromotions(merchantId);

      // Enforce 5-promotion limit
      const activeCount = await countActivePromotions(merchantId);
      if (activeCount >= MAX_ACTIVE_PROMOTIONS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `الحد الأقصى ${MAX_ACTIVE_PROMOTIONS} عروض نشطة. عطّل عرض قديم أولاً.`,
        });
      }

      // Auto-generate discount code if requested
      let autoDiscountCodeId: number | undefined;
      if (input.autoGenerateCode && input.autoCodeValue) {
        const codePrefix = input.title.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').slice(0, 6).toUpperCase();
        const codeSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const generatedCode = `${codePrefix}${codeSuffix}`;

        const discountCode = await createDiscountCode({
          merchantId,
          code: generatedCode,
          type: input.autoCodeType || 'percentage',
          value: input.autoCodeValue,
          minOrderAmount: input.minOrderAmount || 0,
          expiresAt: input.expiresAt || undefined,
          isActive: 1,
        });
        if (discountCode) {
          autoDiscountCodeId = discountCode.id;
        }
      }

      return createPromotion({
        merchantId,
        title: input.title,
        description: input.description,
        bannerImageUrl: input.bannerImageUrl,
        type: input.type,
        value: input.value,
        scope: input.scope,
        productIds: input.productIds,
        categoryIds: input.categoryIds,
        minOrderAmount: input.minOrderAmount,
        minQuantity: input.minQuantity,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        autoDiscountCodeId,
        isActive: 1,
      });
    }),

  // Update promotion
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      // PEN-PROMO-02: Validate URL format on update too
      bannerImageUrl: z.string().url().max(500).optional().nullable(),
      type: z.enum(['percentage', 'fixed', 'bundle', 'free_shipping', 'custom']).optional(),
      value: z.number().min(0).max(100000).optional(),
      scope: z.enum(['all', 'products', 'categories']).optional(),
      productIds: z.string().max(2000).optional().nullable(),
      categoryIds: z.string().max(2000).optional().nullable(),
      minOrderAmount: z.number().min(0).max(1000000).optional().nullable(),
      minQuantity: z.number().min(1).max(10000).optional().nullable(),
      // PEN-PROMO-04: Validate date format on update
      startsAt: z.string().datetime({ offset: true }).optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable()),
      expiresAt: z.string().datetime({ offset: true }).optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable()),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const promo = await getPromotionById(input.id);
      if (!promo || promo.merchantId !== merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Promotion not found' });
      }

      const { id, ...data } = input;
      return updatePromotion(id, data as any);
    }),

  // Toggle active
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const promo = await getPromotionById(input.id);
      if (!promo || promo.merchantId !== merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Promotion not found' });
      }

      const newActive = promo.isActive === 1 ? 0 : 1;

      // If activating, check limit
      if (newActive === 1) {
        // PEN-PROMO-03: Auto-deactivate expired promotions before counting
        await deactivateExpiredPromotions(merchantId);
        const activeCount = await countActivePromotions(merchantId);
        if (activeCount >= MAX_ACTIVE_PROMOTIONS) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `الحد الأقصى ${MAX_ACTIVE_PROMOTIONS} عروض نشطة.`,
          });
        }
      }

      return updatePromotion(input.id, { isActive: newActive });
    }),

  // Delete promotion
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await getMerchantId(ctx);
      const promo = await getPromotionById(input.id);
      if (!promo || promo.merchantId !== merchantId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Promotion not found' });
      }

      await deletePromotion(input.id);
      return { success: true };
    }),

  // Get stats
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      const merchantId = await getMerchantId(ctx);
      const all = await getPromotionsByMerchant(merchantId);
      const activeCount = await countActivePromotions(merchantId);

      const totalViews = all.reduce((sum, p) => sum + p.viewCount, 0);
      const totalClicks = all.reduce((sum, p) => sum + p.clickCount, 0);

      return {
        total: all.length,
        active: activeCount,
        maxActive: MAX_ACTIVE_PROMOTIONS,
        totalViews,
        totalClicks,
        conversionRate: totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0,
      };
    }),
});
