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

export const googleAnalyticsRouter = router({
  // Get GA config (masked service account)
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    assertAdmin(ctx.user.role);
    const { getAiSettings } = await import("./db_ai_settings");
    const settings = await getAiSettings();

    return {
      propertyId: settings?.gaPropertyId || "",
      hasCredentials: !!settings?.gaServiceAccountJson,
      isEnabled: settings?.gaEnabled ?? false,
      serviceAccountEmail: settings?.gaServiceAccountJson
        ? (() => {
            try {
              return JSON.parse(settings.gaServiceAccountJson).client_email || "";
            } catch { return ""; }
          })()
        : "",
    };
  }),

  // Update GA configuration
  updateConfig: protectedProcedure
    .input(z.object({
      propertyId: z.string().regex(/^\d+$/, "Property ID يجب أن يكون رقماً").optional(),
      serviceAccountJson: z.string().optional(),
      isEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const { upsertAiSettings } = await import("./db_ai_settings");

      const data: Record<string, any> = {};
      if (input.propertyId !== undefined) data.gaPropertyId = input.propertyId;
      if (input.isEnabled !== undefined) data.gaEnabled = input.isEnabled;

      if (input.serviceAccountJson) {
        // Validate JSON structure
        try {
          const parsed = JSON.parse(input.serviceAccountJson);
          if (!parsed.client_email || !parsed.private_key) {
            throw new Error("missing fields");
          }
          data.gaServiceAccountJson = input.serviceAccountJson;
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ملف Service Account JSON غير صالح. تأكد من وجود client_email و private_key",
          });
        }
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
    const { getAiSettings } = await import("./db_ai_settings");
    const settings = await getAiSettings();

    if (!settings?.gaPropertyId || !settings?.gaServiceAccountJson) {
      return { success: false, error: "أدخل Property ID و Service Account أولاً" };
    }

    const ga = await import("./services/google-analytics");
    return ga.testConnection({
      propertyId: settings.gaPropertyId,
      serviceAccountJson: settings.gaServiceAccountJson,
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
  const { getAiSettings } = await import("./db_ai_settings");
  const settings = await getAiSettings();
  if (!settings?.gaPropertyId || !settings?.gaServiceAccountJson || !settings?.gaEnabled) {
    return null;
  }
  return {
    propertyId: settings.gaPropertyId,
    serviceAccountJson: settings.gaServiceAccountJson,
  };
}

export type GoogleAnalyticsRouter = typeof googleAnalyticsRouter;
