import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, protectedProcedure, router } from "./_core/trpc";
import { readUsageWorkspace } from "./accounts/usage-workspace";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";

const unavailable = () =>
  new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Usage data unavailable",
  });

// Keep old clients explicit: no selected-tenant resolution or legacy data reads.
const retiredUsage = () => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "usage:workspace_required",
  });
};
export const subscriptionUsageProcedure = protectedProcedure
  .input(z.void())
  .query(retiredUsage);

export const usageRouter = router({
  workspace: merchantProcedure.input(z.void()).query(async ({ ctx }) => {
    try {
      return await readUsageWorkspace(ctx.user.id, ctx.merchantId);
    } catch (error) {
      if (
        error instanceof MerchantSettingsAuthorityError &&
        error.reason === "forbidden"
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Usage access unavailable",
        });
      throw unavailable();
    }
  }),
  getCurrentUsage: protectedProcedure.input(z.void()).query(retiredUsage),
  getUsageHistory: protectedProcedure.input(z.void()).query(retiredUsage),
});
export type UsageRouter = typeof usageRouter;
