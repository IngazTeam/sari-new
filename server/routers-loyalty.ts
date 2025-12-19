import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as loyaltyDb from "./db_loyalty";
import * as db from "./db";

export const loyaltyRouter = router({
  // ==================== Settings ====================
  
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }

    let settings = await loyaltyDb.getLoyaltySettings(merchant.id);
    if (!settings) {
      settings = await loyaltyDb.initializeLoyaltySettings(merchant.id);
    }

    return settings;
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        isEnabled: z.number().optional(),
        pointsPerCurrency: z.number().optional(),
        currencyPerPoint: z.number().optional(),
        enableReferralBonus: z.number().optional(),
        referralBonusPoints: z.number().optional(),
        enableReviewBonus: z.number().optional(),
        reviewBonusPoints: z.number().optional(),
        enableBirthdayBonus: z.number().optional(),
        birthdayBonusPoints: z.number().optional(),
        pointsExpiryDays: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.updateLoyaltySettings(merchant.id, input);
    }),

  // ==================== Tiers ====================

  getTiers: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }

    return loyaltyDb.getLoyaltyTiers(merchant.id);
  }),

  updateTier: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        minPoints: z.number().optional(),
        discountPercentage: z.number().optional(),
        freeShipping: z.number().optional(),
        priority: z.number().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        benefits: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return loyaltyDb.updateLoyaltyTier(id, data);
    }),

  // ==================== Customer Points ====================

  getCustomerPoints: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      let points = await loyaltyDb.getCustomerPoints(merchant.id, input.customerPhone);
      if (!points) {
        points = await loyaltyDb.initializeCustomerPoints(merchant.id, input.customerPhone);
      }

      // جلب معلومات المستوى
      let tier = null;
      if (points?.currentTierId) {
        tier = await loyaltyDb.getLoyaltyTierById(points.currentTierId);
      }

      return { ...points, tier };
    }),

  addPoints: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string(),
        points: z.number().positive(),
        reason: z.string(),
        reasonAr: z.string(),
        orderId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.addPointsToCustomer(
        merchant.id,
        input.customerPhone,
        input.points,
        input.reason,
        input.reasonAr,
        input.orderId
      );
    }),

  deductPoints: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string(),
        points: z.number().positive(),
        reason: z.string(),
        reasonAr: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.deductPointsFromCustomer(
        merchant.id,
        input.customerPhone,
        input.points,
        input.reason,
        input.reasonAr
      );
    }),

  getAllCustomersPoints: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(100),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      const customers = await loyaltyDb.getAllCustomersPoints(
        merchant.id,
        input.limit,
        input.offset
      );

      // جلب معلومات المستويات
      const customersWithTiers = await Promise.all(
        customers.map(async (customer) => {
          let tier = null;
          if (customer.currentTierId) {
            tier = await loyaltyDb.getLoyaltyTierById(customer.currentTierId);
          }
          return { ...customer, tier };
        })
      );

      return customersWithTiers;
    }),

  // ==================== Transactions ====================

  getTransactions: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      if (input.customerPhone) {
        return loyaltyDb.getCustomerTransactions(
          merchant.id,
          input.customerPhone,
          input.limit,
          input.offset
        );
      }

      return loyaltyDb.getAllTransactions(merchant.id, input.limit, input.offset);
    }),

  // ==================== Rewards ====================

  getRewards: protectedProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.getLoyaltyRewards(merchant.id, input.activeOnly);
    }),

  createReward: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        titleAr: z.string(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        type: z.enum(["discount", "free_product", "free_shipping", "gift"]),
        pointsCost: z.number().positive(),
        discountAmount: z.number().optional(),
        discountType: z.enum(["fixed", "percentage"]).optional(),
        productId: z.number().optional(),
        maxRedemptions: z.number().optional(),
        isActive: z.number().default(1),
        validFrom: z.string().optional(),
        validUntil: z.string().optional(),
        imageUrl: z.string().optional(),
        termsAndConditions: z.string().optional(),
        termsAndConditionsAr: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.createLoyaltyReward({
        merchantId: merchant.id,
        ...input,
        currentRedemptions: 0,
      });
    }),

  updateReward: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        titleAr: z.string().optional(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        type: z.enum(["discount", "free_product", "free_shipping", "gift"]).optional(),
        pointsCost: z.number().positive().optional(),
        discountAmount: z.number().optional(),
        discountType: z.enum(["fixed", "percentage"]).optional(),
        productId: z.number().optional(),
        maxRedemptions: z.number().optional(),
        isActive: z.number().optional(),
        validFrom: z.string().optional(),
        validUntil: z.string().optional(),
        imageUrl: z.string().optional(),
        termsAndConditions: z.string().optional(),
        termsAndConditionsAr: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return loyaltyDb.updateLoyaltyReward(id, data);
    }),

  deleteReward: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await loyaltyDb.deleteLoyaltyReward(input.id);
      return { success: true };
    }),

  // ==================== Redemptions ====================

  redeemReward: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string(),
        customerName: z.string(),
        rewardId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      return loyaltyDb.redeemReward(
        merchant.id,
        input.customerPhone,
        input.customerName,
        input.rewardId
      );
    }),

  getRedemptions: protectedProcedure
    .input(
      z.object({
        customerPhone: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      }

      if (input.customerPhone) {
        return loyaltyDb.getCustomerRedemptions(
          merchant.id,
          input.customerPhone,
          input.limit,
          input.offset
        );
      }

      return loyaltyDb.getAllRedemptions(merchant.id, input.limit, input.offset);
    }),

  updateRedemption: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "used", "cancelled", "expired"]).optional(),
        orderId: z.number().optional(),
        usedAt: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return loyaltyDb.updateLoyaltyRedemption(id, data);
    }),

  // ==================== Statistics ====================

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await db.getMerchantByUserId(ctx.user.id);
    if (!merchant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    }

    return loyaltyDb.getLoyaltyStats(merchant.id);
  }),
});
