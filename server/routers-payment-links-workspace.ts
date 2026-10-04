import { paymentLinkDisableInput } from "../shared/payment-links-workspace";
import {
  disableReviewedPaymentLink,
  PaymentLinksActionError,
} from "./payment/payment-links-workspace";
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
    const reason =
      e instanceof PaymentLinksActionError ||
      e instanceof MerchantSettingsAuthorityError
        ? e.reason
        : "unavailable";
    throw new TRPCError({
      code:
        reason === "forbidden"
          ? "FORBIDDEN"
          : reason === "stale"
            ? "CONFLICT"
            : reason === "missing"
              ? "NOT_FOUND"
              : "INTERNAL_SERVER_ERROR",
      message: "payment_links:" + reason,
    });
  }
}
export const paymentLinksWorkspaceRouter = router({
  disableReviewed: merchantProcedure
    .input(paymentLinkDisableInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        disableReviewedPaymentLink(ctx.user.id, ctx.merchantId, input)
      )
    ),
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
