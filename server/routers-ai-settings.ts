/**
 * AI Settings Router Module
 * Handles OpenAI API configuration and usage statistics (Admin only)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";

function assertAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export const aiSettingsRouter = router({
  // Get AI settings (masked API key)
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getAiSettings } = await import("./db_ai_settings");
    const settings = await getAiSettings();
    if (!settings) return null;

    // Mask API key — show only last 4 chars
    const maskedKey = settings.openaiApiKey
      ? `sk-****${settings.openaiApiKey.slice(-4)}`
      : null;

    return {
      ...settings,
      openaiApiKey: maskedKey,
      hasKey: !!settings.openaiApiKey,
    };
  }),

  // Update AI settings
  updateSettings: protectedProcedure
    .input(z.object({
      openaiApiKey: z.string().optional(),
      model: z.string().optional(),
      whisperModel: z.string().optional(),
      isActive: z.boolean().optional(),
      monthlyBudgetLimit: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { upsertAiSettings } = await import("./db_ai_settings");

      const data: Record<string, any> = {};
      if (input.openaiApiKey !== undefined) data.openaiApiKey = input.openaiApiKey;
      if (input.model !== undefined) data.model = input.model;
      if (input.whisperModel !== undefined) data.whisperModel = input.whisperModel;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.monthlyBudgetLimit !== undefined) data.monthlyBudgetLimit = input.monthlyBudgetLimit;

      await upsertAiSettings(data);

      // Clear LLM cache so new key takes effect immediately
      try {
        // Dynamic import to avoid circular deps
        const llm = await import("./_core/llm");
        if ('_clearCache' in llm) (llm as any)._clearCache();
      } catch { /* ignore */ }

      return { success: true };
    }),

  // Test OpenAI connection
  testConnection: protectedProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);

      try {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { authorization: `Bearer ${input.apiKey}` },
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: `فشل الاتصال (${response.status}): ${response.statusText}`,
          };
        }

        const data = await response.json();
        const models = data.data?.map((m: any) => m.id).filter((id: string) =>
          id.includes("gpt") || id.includes("whisper")
        ) || [];

        return {
          success: true,
          message: "تم الاتصال بنجاح ✅",
          availableModels: models.slice(0, 20),
        };
      } catch (error: any) {
        return {
          success: false,
          error: `خطأ في الاتصال: ${error.message}`,
        };
      }
    }),

  // Get usage statistics
  getUsageStats: protectedProcedure
    .input(z.object({
      period: z.enum(["today", "month", "all"]).default("month"),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { getUsageStats } = await import("./db_ai_settings");
      return await getUsageStats(input.period);
    }),

  // Get daily usage for chart
  getDailyUsage: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { getDailyUsage } = await import("./db_ai_settings");
      return await getDailyUsage(input.days);
    }),

  // Get top merchants by usage
  getTopMerchants: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getTopMerchantUsage } = await import("./db_ai_settings");
    return await getTopMerchantUsage(5);
  }),

  // Get recent logs
  getRecentLogs: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { getRecentLogs } = await import("./db_ai_settings");
      return await getRecentLogs(input.limit);
    }),
});

export type AiSettingsRouter = typeof aiSettingsRouter;
