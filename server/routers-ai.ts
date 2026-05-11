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
  // Chat with Sari AI — SEC-PT-4: Rate limited (20/min per merchant) to prevent LLM quota abuse
  chat: protectedProcedure
    .input(z.object({
      message: z.string().max(2000),
      conversationId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { checkRateLimit } = await import('./_core/rateLimiter');
      const rlCheck = checkRateLimit(`ai_chat:${ctx.user.id}`, 20, 60000); // 20/min
      if (!rlCheck.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول بعد قليل.' });
      }

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

  // Search products with AI — PEN-NEW-3: Rate limited
  searchProducts: protectedProcedure
    .input(z.object({
      query: z.string().max(500),
      limit: z.number().min(1).max(50).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { checkRateLimit } = await import('./_core/rateLimiter');
      const rlCheck = checkRateLimit(`ai_search:${ctx.user.id}`, 30, 60000);
      if (!rlCheck.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول بعد قليل.' });
      }

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

  // Suggest products based on context — PEN-NEW-3: Rate limited
  suggestProducts: protectedProcedure
    .input(z.object({
      context: z.string().max(2000),
      limit: z.number().min(1).max(50).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { checkRateLimit } = await import('./_core/rateLimiter');
      const rlCheck = checkRateLimit(`ai_suggest:${ctx.user.id}`, 30, 60000);
      if (!rlCheck.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول بعد قليل.' });
      }

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

  // Process voice message — SEC-PT-4: Rate limited (10/min)
  processVoice: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      audioUrl: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { checkRateLimit } = await import('./_core/rateLimiter');
      const rlCheck = checkRateLimit(`ai_voice:${ctx.user.id}`, 10, 60000);
      if (!rlCheck.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول بعد قليل.' });
      }

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
