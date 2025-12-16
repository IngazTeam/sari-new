import { z } from 'zod';
import { publicProcedure, router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import * as db from './db';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const offersRouter = router({
  // Limited Time Offers
  offers: router({
    // Get active limited time offers
    getActive: publicProcedure.query(async () => {
      return await db.getActiveLimitedTimeOffers();
    }),
    
    // Create new offer (admin only)
    create: adminProcedure
      .input(z.object({
        title: z.string(),
        titleAr: z.string(),
        description: z.string(),
        descriptionAr: z.string(),
        discountPercentage: z.number().optional(),
        discountAmount: z.number().optional(),
        durationMinutes: z.number().min(1),
      }))
      .mutation(async ({ input }) => {
        return await db.createLimitedTimeOffer(input);
      }),
    
    // Update offer (admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        titleAr: z.string().optional(),
        description: z.string().optional(),
        descriptionAr: z.string().optional(),
        discountPercentage: z.number().optional(),
        discountAmount: z.number().optional(),
        durationMinutes: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateLimitedTimeOffer(id, data);
      }),
  }),
  
  // Signup Prompt AB Testing
  signupPrompt: router({
    // Get active variants
    getVariants: publicProcedure.query(async () => {
      return await db.getActiveSignupPromptVariants();
    }),
    
    // Get random variant for AB test
    getRandomVariant: publicProcedure.query(async () => {
      return await db.getRandomSignupPromptVariant();
    }),
    
    // Record test result
    recordResult: publicProcedure
      .input(z.object({
        sessionId: z.string(),
        variantId: z.string(),
        shown: z.boolean().optional(),
        clicked: z.boolean().optional(),
        converted: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        return await db.recordSignupPromptTestResult(input);
      }),
    
    // Update test result
    updateResult: publicProcedure
      .input(z.object({
        id: z.number(),
        shown: z.boolean().optional(),
        clicked: z.boolean().optional(),
        converted: z.boolean().optional(),
        dismissedAt: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateSignupPromptTestResult(id, data);
      }),
    
    // Get test stats (admin only)
    getStats: adminProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getSignupPromptTestStats(input.days || 30);
      }),
    
    // Create variant (admin only)
    createVariant: adminProcedure
      .input(z.object({
        variantId: z.string(),
        title: z.string(),
        description: z.string(),
        ctaText: z.string(),
        offerText: z.string().optional(),
        showOffer: z.boolean().optional(),
        messageThreshold: z.number().min(1),
      }))
      .mutation(async ({ input }) => {
        return await db.createSignupPromptVariant(input);
      }),
    
    // Update variant (admin only)
    updateVariant: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        ctaText: z.string().optional(),
        offerText: z.string().optional(),
        showOffer: z.boolean().optional(),
        messageThreshold: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return await db.updateSignupPromptVariant(id, data);
      }),
  }),
});
