/**
 * AI Router Module
 * Handles Sari AI interactions and product intelligence
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const aiRouter = router({
  // Chat with Sari AI
  chat: protectedProcedure
    .input(z.object({
      message: z.string(),
      conversationId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { chatWithSari } = await import('./ai/sari-personality');
      
      const response = await chatWithSari({
        merchantId: merchant.id,
        customerPhone: 'test',
        message: input.message,
        conversationId: input.conversationId,
      });

      return { response };
    }),

  // Search products with AI
  searchProducts: protectedProcedure
    .input(z.object({
      query: z.string(),
      limit: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { searchProducts } = await import('./ai/product-intelligence');
      
      const products = await searchProducts({
        merchantId: merchant.id,
        query: input.query,
        limit: input.limit,
      });

      return { products };
    }),

  // Suggest products based on context
  suggestProducts: protectedProcedure
    .input(z.object({
      context: z.string(),
      limit: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { suggestProducts } = await import('./ai/product-intelligence');
      
      const result = await suggestProducts({
        merchantId: merchant.id,
        conversationContext: input.context,
        limit: input.limit,
      });

      return result;
    }),

  // Process voice message
  processVoice: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      audioUrl: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { hasReachedVoiceLimit, processVoiceMessage, incrementVoiceMessageUsage } = await import('./ai/voice-handler');
      
      const limitReached = await hasReachedVoiceLimit(merchant.id);
      if (limitReached) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: 'لقد وصلت لحد الرسائل الصوتية في باقتك. يرجى الترقية للاستمرار.' 
        });
      }

      const conversation = await db.getConversationById(input.conversationId);
      if (!conversation || conversation.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const result = await processVoiceMessage({
        merchantId: merchant.id,
        conversationId: input.conversationId,
        customerPhone: conversation.customerPhone,
        customerName: conversation.customerName || undefined,
        audioUrl: input.audioUrl,
      });

      await incrementVoiceMessageUsage(merchant.id);

      return result;
    }),

  // Test OpenAI connection
  testConnection: protectedProcedure.query(async () => {
    const { testOpenAIConnection } = await import('./ai/openai');
    const isConnected = await testOpenAIConnection();
    return { connected: isConnected };
  }),

  // Generate welcome message
  generateWelcome: protectedProcedure
    .input(z.object({
      customerName: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { generateWelcomeMessage } = await import('./ai/sari-personality');
      
      const message = await generateWelcomeMessage({
        merchantId: merchant.id,
        customerName: input.customerName,
      });

      return { message };
    }),
});

export type AIRouter = typeof aiRouter;
