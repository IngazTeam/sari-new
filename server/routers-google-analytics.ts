/**
 * Google Analytics Router — Admin-only endpoints for GA4 data
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";

function assertAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

const MAX_SERVICE_ACCOUNT_JSON_BYTES = 64 * 1024;
const serviceAccountJsonSchema = z.string()
  .trim()
  .min(1, "ملف Service Account JSON مطلوب")
  .max(MAX_SERVICE_ACCOUNT_JSON_BYTES, "ملف Service Account JSON أكبر من الحد المسموح")
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(value, "utf8") > MAX_SERVICE_ACCOUNT_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: MAX_SERVICE_ACCOUNT_JSON_BYTES,
        inclusive: true,
        origin: "string",
        message: "ملف Service Account JSON أكبر من الحد المسموح",
      });
      return;
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const validEmail = typeof parsed.client_email === "string"
        && /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(parsed.client_email);
      const validPrivateKey = typeof parsed.private_key === "string"
        && parsed.private_key.startsWith("-----BEGIN PRIVATE KEY-----")
        && parsed.private_key.includes("-----END PRIVATE KEY-----");

      if (parsed.type !== "service_account" || !validEmail || !validPrivateKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ملف Service Account JSON غير صالح",
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ملف Service Account JSON غير صالح",
      });
    }
  });

export const googleAnalyticsRouter = router({
  // Get GA config (masked service account)
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getGoogleAnalyticsSettings } = await import("./db_ai_settings");
    const settings = await getGoogleAnalyticsSettings();

    return {
      propertyId: settings?.propertyId || "",
      hasCredentials: !!settings?.serviceAccountJson,
      isEnabled: settings?.isEnabled ?? false,
      serviceAccountEmail: settings?.serviceAccountJson
        ? (() => {
            try {
              return JSON.parse(settings.serviceAccountJson).client_email || "";
            } catch { return ""; }
          })()
        : "",
    };
  }),

  // Update GA configuration
  updateConfig: protectedProcedure
    .input(z.object({
      propertyId: z.string().regex(/^\d{1,15}$/, "Property ID يجب أن يكون من 1 إلى 15 رقماً").optional(),
      serviceAccountJson: serviceAccountJsonSchema.optional(),
      isEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { upsertAiSettings } = await import("./db_ai_settings");

      const data: Record<string, any> = {};
      if (input.propertyId !== undefined) data.gaPropertyId = input.propertyId;
      if (input.isEnabled !== undefined) data.gaEnabled = input.isEnabled;

      if (input.serviceAccountJson !== undefined) {
        data.gaServiceAccountJson = input.serviceAccountJson;
      }

      await upsertAiSettings(data);

      // Clear token cache
      try {
        const ga = await import("./services/google-analytics");
        ga.clearTokenCache();
      } catch { /* ignore */ }

      return { success: true };
    }),

  // Test GA connection
  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getGoogleAnalyticsSettings } = await import("./db_ai_settings");
    const settings = await getGoogleAnalyticsSettings();

    if (!settings?.propertyId || !settings?.serviceAccountJson) {
      return { success: false, error: "أدخل Property ID و Service Account أولاً" };
    }

    const ga = await import("./services/google-analytics");
    return ga.testConnection({
      propertyId: settings.propertyId,
      serviceAccountJson: settings.serviceAccountJson,
    });
  }),

  // Overview stats (KPIs)
  getOverview: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return null;

      const ga = await import("./services/google-analytics");
      return ga.getOverviewStats(credentials, input.days);
    }),

  // Traffic chart data
  getTrafficChart: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return [];

      const ga = await import("./services/google-analytics");
      return ga.getTrafficByDate(credentials, input.days);
    }),

  // Traffic sources
  getTrafficSources: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return [];

      const ga = await import("./services/google-analytics");
      return ga.getTrafficSources(credentials, input.days);
    }),

  // Device breakdown
  getDevices: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return [];

      const ga = await import("./services/google-analytics");
      return ga.getDeviceBreakdown(credentials, input.days);
    }),

  // Top countries
  getCountries: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return [];

      const ga = await import("./services/google-analytics");
      return ga.getTopCountries(credentials, input.days);
    }),

  // Top pages
  getTopPages: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const credentials = await getCredentials();
      if (!credentials) return [];

      const ga = await import("./services/google-analytics");
      return ga.getTopPages(credentials, input.days);
    }),
});

/** Helper to get GA credentials from DB */
async function getCredentials() {
  const { getGoogleAnalyticsSettings } = await import("./db_ai_settings");
  const settings = await getGoogleAnalyticsSettings();
  if (!settings?.propertyId || !settings?.serviceAccountJson || !settings?.isEnabled) {
    return null;
  }
  return {
    propertyId: settings.propertyId,
    serviceAccountJson: settings.serviceAccountJson,
  };
}

export type GoogleAnalyticsRouter = typeof googleAnalyticsRouter;
