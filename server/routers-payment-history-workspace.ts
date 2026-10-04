import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, protectedProcedure, router } from "./_core/trpc";
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

// Retain old route names for a deterministic client reload requirement. No raw
// payment row, cross-currency statistic, or ownership lookup is reached here.
const retired = (): never => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "payment_history:workspace_required",
  });
};
const legacyPeriod = {
  startDate: z.string().max(32).optional(),
  endDate: z.string().max(32).optional(),
};
export const retiredPaymentHistoryProcedures = {
  getById: protectedProcedure.input(paymentHistoryDetailInput).query(retired),
  list: protectedProcedure
    .input(
      z
        .object({
          ...legacyPeriod,
          status: z.string().max(30).optional(),
          limit: z.number().int().min(1).max(1000).default(50),
        })
        .strict()
    )
    .query(retired),
  getStats: protectedProcedure
    .input(z.object(legacyPeriod).strict())
    .query(retired),
};
