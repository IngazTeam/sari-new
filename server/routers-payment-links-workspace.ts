import { TRPCError } from "@trpc/server";
import { merchantProcedure, router } from "./_core/trpc";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
import {
  paymentLinksInput,
  paymentLinkDetailInput,
} from "../shared/payment-links-workspace";
import {
  readPaymentLinksWorkspace,
  readPaymentLinkDetail,
} from "./payment/payment-links-workspace";
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (e) {
    throw new TRPCError({
      code:
        e instanceof MerchantSettingsAuthorityError && e.reason === "forbidden"
          ? "FORBIDDEN"
          : "INTERNAL_SERVER_ERROR",
      message: "payment_links:unavailable",
    });
  }
}
export const paymentLinksWorkspaceRouter = router({
  list: merchantProcedure
    .input(paymentLinksInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readPaymentLinksWorkspace(ctx.user.id, ctx.merchantId, input)
      )
    ),
  detail: merchantProcedure
    .input(paymentLinkDetailInput)
    .query(({ ctx, input }) =>
      guarded(() => readPaymentLinkDetail(ctx.user.id, ctx.merchantId, input))
    ),
});
