import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, router } from "./_core/trpc";
import { getMerchantCurrentUsage, getMerchantUsageHistory } from "./db";

const unavailable = () =>
  new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Usage data unavailable",
  });

// Shared by the mounted subscription router and the legacy module, so their
// tenant selection and error boundary cannot silently diverge again.
export const subscriptionUsageProcedure = merchantProcedure
  .input(z.void())
  .query(async ({ ctx }) => {
    let stats;
    try {
      const { getUsageStats } = await import("./usage-tracking");
      stats = await getUsageStats(ctx.merchantId);
    } catch {
      throw unavailable();
    }
    if (!stats)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active subscription found",
      });
    return stats;
  });

export const usageRouter = router({
  getCurrentUsage: merchantProcedure.input(z.void()).query(async ({ ctx }) => {
    let usage;
    try {
      usage = await getMerchantCurrentUsage(ctx.merchantId);
    } catch {
      throw unavailable();
    }
    if (!usage)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No usage subscription found",
      });
    return usage;
  }),
  getUsageHistory: merchantProcedure.input(z.void()).query(async ({ ctx }) => {
    try {
      return await getMerchantUsageHistory(ctx.merchantId);
    } catch {
      throw unavailable();
    }
  }),
});
export type UsageRouter = typeof usageRouter;
