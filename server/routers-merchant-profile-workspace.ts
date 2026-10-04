import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import { merchantProfileSave } from "../shared/merchant-profile-workspace";
import {
  readMerchantProfileWorkspace,
  saveMerchantProfileWorkspace,
} from "./accounts/merchant-profile-workspace";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
function failure(error: unknown): never {
  const reason =
    error instanceof MerchantSettingsAuthorityError
      ? error.reason
      : "unavailable";
  throw new TRPCError({
    code:
      reason === "forbidden"
        ? "FORBIDDEN"
        : reason === "stale"
          ? "CONFLICT"
          : "INTERNAL_SERVER_ERROR",
    message: "merchant_profile:" + reason,
  });
}
export const merchantProfileWorkspaceProcedures = {
  profileWorkspace: merchantProcedure.query(async ({ ctx }) => {
    try {
      return await readMerchantProfileWorkspace(ctx.user.id, ctx.merchantId);
    } catch (e) {
      return failure(e);
    }
  }),
  profileSaveReviewed: merchantProcedure
    .input(merchantProfileSave)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveMerchantProfileWorkspace(
          ctx.user.id,
          ctx.merchantId,
          input
        );
      } catch (e) {
        return failure(e);
      }
    }),
};
