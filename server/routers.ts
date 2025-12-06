import { z } from 'zod';
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import * as db from './db';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Merchant Management
  merchants: router({
    // Get current merchant for logged-in user
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      return merchant;
    }),

    // Create merchant profile
    create: protectedProcedure
      .input(z.object({
        businessName: z.string().min(1),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if merchant already exists
        const existing = await db.getMerchantByUserId(ctx.user.id);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Merchant profile already exists' });
        }

        const merchant = await db.createMerchant({
          userId: ctx.user.id,
          businessName: input.businessName,
          phone: input.phone || null,
          status: 'pending',
        });

        return merchant;
      }),

    // Update merchant profile
    update: protectedProcedure
      .input(z.object({
        businessName: z.string().optional(),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        await db.updateMerchant(merchant.id, input);
        return { success: true };
      }),

    // Get all merchants (Admin only)
    list: adminProcedure.query(async () => {
      return await db.getAllMerchants();
    }),

    // Update merchant status (Admin only)
    updateStatus: adminProcedure
      .input(z.object({
        merchantId: z.number(),
        status: z.enum(['active', 'suspended', 'pending']),
      }))
      .mutation(async ({ input }) => {
        await db.updateMerchant(input.merchantId, { status: input.status });
        return { success: true };
      }),
  }),

  // Campaign Management
  campaigns: router({
    // Get all campaigns for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return db.getCampaignsByMerchantId(merchant.id);
    }),

    // Get single campaign
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        return campaign;
      }),

    // Create new campaign
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        message: z.string().min(1),
        imageUrl: z.string().url().optional(),
        targetAudience: z.string().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check merchant status
        if (merchant.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
        }

        const campaign = await db.createCampaign({
          merchantId: merchant.id,
          name: input.name,
          message: input.message,
          imageUrl: input.imageUrl || null,
          targetAudience: input.targetAudience || null,
          status: input.scheduledAt ? 'scheduled' : 'draft',
          scheduledAt: input.scheduledAt || null,
          sentCount: 0,
          totalRecipients: 0,
        });

        return campaign;
      }),

    // Update campaign
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        message: z.string().optional(),
        imageUrl: z.string().url().optional(),
        targetAudience: z.string().optional(),
        scheduledAt: z.date().optional(),
        status: z.enum(['draft', 'scheduled', 'sending', 'completed', 'failed']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Can't edit completed or sending campaigns
        if (campaign.status === 'completed' || campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit campaign in current status' });
        }

        const { id, ...updateData } = input;
        await db.updateCampaign(id, updateData);

        return { success: true };
      }),

    // Delete campaign
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Can only delete draft campaigns
        if (campaign.status !== 'draft') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only delete draft campaigns' });
        }

        // Note: We don't have a delete function in db.ts, so we'll update status instead
        await db.updateCampaign(input.id, { status: 'failed' }); // Mark as failed to hide it

        return { success: true };
      }),

    // Get all campaigns (Admin only)
    listAll: adminProcedure.query(async () => {
      return db.getAllCampaigns();
    }),
  }),

  // Subscription & Plans
  plans: router({
    // Get all active plans
    list: publicProcedure.query(async () => {
      return db.getAllPlans();
    }),

    // Get plan by ID
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getPlanById(input.id);
      }),

    // Create plan (Admin only)
    create: adminProcedure
      .input(z.object({
        name: z.string(),
        nameAr: z.string(),
        priceMonthly: z.number(),
        conversationLimit: z.number(),
        voiceMessageLimit: z.number(),
        features: z.string(),
      }))
      .mutation(async ({ input }) => {
        return db.createPlan(input);
      }),

    // Update plan (Admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        priceMonthly: z.number().optional(),
        conversationLimit: z.number().optional(),
        voiceMessageLimit: z.number().optional(),
        features: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        await db.updatePlan(id, updateData);
        return { success: true };
      }),
  }),

  // Subscriptions
  subscriptions: router({
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        return null;
      }

      return db.getActiveSubscriptionByMerchantId(merchant.id);
    }),

    // Create subscription
    create: protectedProcedure
      .input(z.object({
        planId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const plan = await db.getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }

        // Check if there's already an active subscription
        const existing = await db.getActiveSubscriptionByMerchantId(merchant.id);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription already exists' });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        const subscription = await db.createSubscription({
          merchantId: merchant.id,
          planId: input.planId,
          status: 'pending',
          conversationsUsed: 0,
          voiceMessagesUsed: 0,
          startDate,
          endDate,
          autoRenew: true,
        });

        return subscription;
      }),
  }),

  // Conversations
  conversations: router({
    // Get all conversations for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return db.getConversationsByMerchantId(merchant.id);
    }),

    // Get messages for a conversation
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input, ctx }) => {
        const conversation = await db.getConversationById(input.conversationId);
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        return db.getMessagesByConversationId(input.conversationId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
