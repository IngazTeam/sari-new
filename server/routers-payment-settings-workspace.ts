import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import {
  paymentSettingsSave,
  paymentSettingsReview,
} from "../shared/payment-settings-workspace";
import {
  readPaymentSettingsWorkspace,
  savePaymentSettingsWorkspace,
  probePaymentSettingsWorkspace,
} from "./payment/payment-settings-workspace";
import { PaymentSettingsError } from "./payment/payment-settings-authority";
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (e) {
    const reason = e instanceof PaymentSettingsError ? e.reason : "unavailable";
    throw new TRPCError({
      code:
        reason === "forbidden"
          ? "FORBIDDEN"
          : reason === "stale"
            ? "CONFLICT"
            : reason === "keys_required"
              ? "BAD_REQUEST"
              : reason === "duplicate"
                ? "PRECONDITION_FAILED"
                : reason === "provider_unavailable"
                  ? "BAD_GATEWAY"
                  : "INTERNAL_SERVER_ERROR",
      message: "payment_settings:" + reason,
    });
  }
}
export const paymentSettingsWorkspaceProcedures = {
  workspace: merchantProcedure.query(({ ctx }) =>
    guarded(() => readPaymentSettingsWorkspace(ctx.user.id, ctx.merchantId))
  ),
  saveReviewed: merchantProcedure
    .input(paymentSettingsSave)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        savePaymentSettingsWorkspace(ctx.user.id, ctx.merchantId, input)
      )
    ),
  probeReviewed: merchantProcedure
    .input(paymentSettingsReview)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        probePaymentSettingsWorkspace(ctx.user.id, ctx.merchantId, input)
      )
    ),
};
