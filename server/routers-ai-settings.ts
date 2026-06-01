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

// AI-02 FIX: Whitelist allowed models
const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] as const;
const ALLOWED_WHISPER_MODELS = ["whisper-1"] as const;

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
      // AI-05 FIX: Validate API key format (must start with sk-)
      openaiApiKey: z.string().regex(/^sk-/, "المفتاح يجب أن يبدأ بـ sk-").optional(),
      // AI-02 FIX: Whitelist models
      model: z.enum(ALLOWED_MODELS).optional(),
      whisperModel: z.enum(ALLOWED_WHISPER_MODELS).optional(),
      isActive: z.boolean().optional(),
      monthlyBudgetLimit: z.string().nullable().optional(),
      alertEmail: z.string().email("إيميل غير صالح").nullable().optional(),
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
      if (input.alertEmail !== undefined) data.alertEmail = input.alertEmail;

      await upsertAiSettings(data);

      // Clear LLM cache so new key takes effect immediately
      try {
        const llm = await import("./_core/llm");
        if ('_clearCache' in llm) (llm as any)._clearCache();
      } catch { /* ignore */ }

      return { success: true };
    }),

  // AI-01 FIX: Test connection using stored key OR new key
  testConnection: protectedProcedure
    .input(z.object({
      apiKey: z.string().regex(/^sk-/).optional(), // Optional — if empty, test stored key
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);

      // Determine which key to test
      let keyToTest = input.apiKey;
      if (!keyToTest) {
        // Use stored key from DB
        const { getOpenAiApiKey } = await import("./db_ai_settings");
        keyToTest = await getOpenAiApiKey();
      }

      if (!keyToTest) {
        return { success: false, error: "لا يوجد مفتاح API مُعرّف" };
      }

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${keyToTest}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        });

        if (!response.ok) {
          return {
            success: false,
            error: `فشل الاتصال (${response.status}): ${response.statusText}`,
          };
        }

        return {
          success: true,
          message: "تم الاتصال بنجاح ✓",
        };
      } catch (error: any) {
        // AI-04 FIX: Don't expose raw error messages
        console.error("[AI Settings] Test connection error:", error);
        return {
          success: false,
          error: "فشل الاتصال بـ OpenAI. تحقق من المفتاح.",
        };
      }
    }),

  // Manual health check trigger
  runHealthCheck: protectedProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { checkOpenAiHealth } = await import("./cron/ai-health-monitor");
    return await checkOpenAiHealth();
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
  // AI-03 FIX: Cap days at 365
  getDailyUsage: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
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
  // AI-03 FIX: Cap limit at 200
  getRecentLogs: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { getRecentLogs } = await import("./db_ai_settings");
      return await getRecentLogs(input.limit);
    }),
});

export type AiSettingsRouter = typeof aiSettingsRouter;
