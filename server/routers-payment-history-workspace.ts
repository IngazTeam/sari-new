import { TRPCError } from "@trpc/server";
import { merchantProcedure, router } from "./_core/trpc";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
import {
  paymentHistoryInput,
  paymentHistoryDetailInput,
} from "../shared/payment-history-workspace";
import {
  readPaymentHistoryWorkspace,
  readPaymentHistoryDetail,
} from "./payment/payment-history-workspace";
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (e) {
    throw new TRPCError({
      code:
        e instanceof MerchantSettingsAuthorityError && e.reason === "forbidden"
          ? "FORBIDDEN"
          : "INTERNAL_SERVER_ERROR",
      message: "payment_history:unavailable",
    });
  }
}
export const paymentHistoryWorkspaceRouter = router({
  list: merchantProcedure
    .input(paymentHistoryInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readPaymentHistoryWorkspace(ctx.user.id, ctx.merchantId, input)
      )
    ),
  detail: merchantProcedure
    .input(paymentHistoryDetailInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readPaymentHistoryDetail(ctx.user.id, ctx.merchantId, input)
      )
    ),
});
