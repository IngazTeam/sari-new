/**
 * AI Settings Router Module
 * Handles OpenAI API configuration and usage statistics (Admin only)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  clearZahyPiRuntimeConfigCache,
  requestZahyPiCompletion,
  resolveZahyPiRuntimeConfig,
  validateZahyPiBaseUrl,
} from "./ai/zahypi-client";

function assertAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

// AI-02 FIX: Whitelist allowed models
const ALLOWED_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] as const;
const ALLOWED_WHISPER_MODELS = ["whisper-1"] as const;
const openAiApiKeySchema = z.string()
  .max(512)
  .regex(/^sk-[A-Za-z0-9_-]+$/, "صيغة المفتاح غير صالحة");
const zahyPiApiKeySchema = z.string()
  .min(1, "مفتاح ZahyPi مطلوب")
  .max(512)
  .regex(/^[\x21-\x7e]+$/, "صيغة مفتاح ZahyPi غير صالحة");
const zahyPiBaseUrlSchema = z.string().max(500).superRefine((value, ctx) => {
  try {
    validateZahyPiBaseUrl(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
  }
});
const zahyPiIdentifierSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "القيمة تحتوي على محارف غير صالحة");
const zahyPiModelSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, "اسم النموذج غير صالح");

export const aiSettingsRouter = router({
  // Get AI settings (masked API key)
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getAiSettings, getOpenAiApiKey } = await import("./db_ai_settings");
    const settings = await getAiSettings();
    const effectiveOpenAiKey = await getOpenAiApiKey();
    const zahyPiConfig = await resolveZahyPiRuntimeConfig();

    // Mask API key — show only last 4 chars
    const maskedKey = effectiveOpenAiKey
      ? `sk-****${effectiveOpenAiKey.slice(-4)}`
      : null;
    const maskedZahyPiKey = zahyPiConfig.apiKey
      ? `****${zahyPiConfig.apiKey.slice(-4)}`
      : null;
    const usesZahyPi = zahyPiConfig.provider === "zahypi";

    return {
      // Explicit response DTO: never spread the database record because it
      // also contains the Google service-account private key.
      model: settings?.model || "gpt-4o-mini",
      whisperModel: settings?.whisperModel || "whisper-1",
      isActive: settings?.isActive ?? true,
      monthlyBudgetLimit: settings?.monthlyBudgetLimit ?? null,
      alertEmail: settings?.alertEmail ?? null,
      healthStatus: settings?.healthStatus || "ok",
      lastHealthCheck: settings?.lastHealthCheck ?? null,
      lastAlertSentAt: settings?.lastAlertSentAt ?? null,
      openaiApiKey: maskedKey,
      hasKey: Boolean(effectiveOpenAiKey),
      textGenerationProvider: zahyPiConfig.provider,
      textGenerationModel: usesZahyPi
        ? zahyPiConfig.model
        : settings?.model || "gpt-4o-mini",
      textGenerationManagedByEnvironment: zahyPiConfig.source === "environment",
      zahyPiApiKey: maskedZahyPiKey,
      hasZahyPiKey: Boolean(zahyPiConfig.apiKey),
      zahyPiBaseUrl: zahyPiConfig.baseUrl,
      zahyPiProjectId: zahyPiConfig.projectId,
      zahyPiModel: zahyPiConfig.model,
    };
  }),

  // Update AI settings
  updateSettings: protectedProcedure
    .input(z.object({
      // AI-05 FIX: Validate API key format (must start with sk-)
      openaiApiKey: openAiApiKeySchema.optional(),
      textGenerationProvider: z.enum(["openai", "zahypi"]).optional(),
      zahyPiApiKey: zahyPiApiKeySchema.optional(),
      zahyPiBaseUrl: zahyPiBaseUrlSchema.optional(),
      zahyPiProjectId: zahyPiIdentifierSchema.optional(),
      zahyPiModel: zahyPiModelSchema.optional(),
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
      if (input.textGenerationProvider !== undefined) data.textGenerationProvider = input.textGenerationProvider;
      if (input.zahyPiApiKey !== undefined) data.zahyPiApiKey = input.zahyPiApiKey;
      if (input.zahyPiBaseUrl !== undefined) data.zahyPiBaseUrl = input.zahyPiBaseUrl;
      if (input.zahyPiProjectId !== undefined) data.zahyPiProjectId = input.zahyPiProjectId;
      if (input.zahyPiModel !== undefined) data.zahyPiModel = input.zahyPiModel;
      if (input.model !== undefined) data.model = input.model;
      if (input.whisperModel !== undefined) data.whisperModel = input.whisperModel;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.monthlyBudgetLimit !== undefined) data.monthlyBudgetLimit = input.monthlyBudgetLimit;
      if (input.alertEmail !== undefined) data.alertEmail = input.alertEmail;

      if (input.textGenerationProvider === "zahypi" && input.zahyPiApiKey === undefined) {
        const existing = await resolveZahyPiRuntimeConfig();
        if (!existing.apiKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "أضف مفتاح ZahyPi قبل تفعيل مزوّد توليد النص",
          });
        }
      }

      await upsertAiSettings(data);

      // Clear LLM cache so new key takes effect immediately
      try {
        const llm = await import("./_core/llm");
        if ('_clearCache' in llm) (llm as any)._clearCache();
      } catch { /* ignore */ }
      clearZahyPiRuntimeConfigCache();

      return { success: true };
    }),

  testZahyPiConnection: protectedProcedure
    .input(z.object({
      apiKey: zahyPiApiKeySchema.optional(),
      baseUrl: zahyPiBaseUrlSchema.optional(),
      projectId: zahyPiIdentifierSchema.optional(),
      model: zahyPiModelSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const stored = await resolveZahyPiRuntimeConfig();
      const runtimeConfig = {
        provider: "zahypi" as const,
        apiKey: input.apiKey || stored.apiKey,
        baseUrl: input.baseUrl || stored.baseUrl,
        projectId: input.projectId || stored.projectId,
        model: input.model || stored.model,
      };
      if (!runtimeConfig.apiKey) {
        return { success: false, error: "لا يوجد مفتاح ZahyPi مُعرّف" };
      }

      try {
        const response = await requestZahyPiCompletion({
          messages: [{ role: "user", content: "Reply with OK only." }],
          max_tokens: 8,
          temperature: 0,
        }, {
          merchantId: "platform-health",
          userId: ctx.user.id,
          taskType: "admin.health",
        }, 15_000, 1, runtimeConfig);
        return {
          success: true,
          message: "تم الاتصال بـ ZahyPi بنجاح ✓",
          model: response.model,
        };
      } catch (error) {
        console.error("[AI Settings] ZahyPi connection test failed:",
          error instanceof Error ? error.name : "UnknownError");
        return {
          success: false,
          error: "فشل الاتصال بـ ZahyPi. تحقق من الرابط والمفتاح والنموذج.",
        };
      }
    }),

  // AI-01 FIX: Test connection using stored key OR new key
  testConnection: protectedProcedure
    .input(z.object({
      apiKey: openAiApiKeySchema.optional(), // Optional — if empty, test stored key
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
        const { testOpenAIConnection } = await import("./ai/openai");
        const connected = await testOpenAIConnection(keyToTest);
        if (!connected) {
          return {
            success: false,
            error: "فشل الاتصال بـ OpenAI. تحقق من المفتاح.",
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

  // Send test daily report email
  sendTestReport: protectedProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { sendDailyAiReport } = await import("./cron/ai-daily-report");
    await sendDailyAiReport();
    return { success: true };
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
