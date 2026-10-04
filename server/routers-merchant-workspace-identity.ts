import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import {
  readMerchantWorkspaceIdentity,
  MerchantWorkspaceIdentityError,
} from "./accounts/merchant-workspace-identity";
export const merchantWorkspaceIdentityProcedure = merchantProcedure.query(
  async ({ ctx }) => {
    try {
      return await readMerchantWorkspaceIdentity(ctx.user.id, ctx.merchantId);
    } catch (error) {
      throw new TRPCError({
        code:
          error instanceof MerchantWorkspaceIdentityError &&
          error.reason === "forbidden"
            ? "FORBIDDEN"
            : "INTERNAL_SERVER_ERROR",
        message: "merchant_identity:unavailable",
      });
    }
  }
);
