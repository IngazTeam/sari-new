import { TRPCError } from "@trpc/server";
import { merchantProcedure } from "./_core/trpc";
import { currencySave } from "../shared/currency-workspace";
import {
  CurrencyWorkspaceError,
  readCurrencyWorkspace,
  saveCurrencyWorkspace,
} from "./currency-workspace";
function failure(error: unknown): never {
  const reason =
    error instanceof CurrencyWorkspaceError ? error.reason : "unavailable";
  throw new TRPCError({
    code:
      reason === "forbidden"
        ? "FORBIDDEN"
        : reason === "stale"
          ? "CONFLICT"
          : "INTERNAL_SERVER_ERROR",
    message: "currency_workspace:" + reason,
  });
}
export const currencyWorkspaceProcedures = {
  currencyWorkspace: merchantProcedure.query(async ({ ctx }) => {
    try {
      return await readCurrencyWorkspace(ctx.user.id, ctx.merchantId);
    } catch (e) {
      return failure(e);
    }
  }),
  currencySaveReviewed: merchantProcedure
    .input(currencySave)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveCurrencyWorkspace(ctx.user.id, ctx.merchantId, input);
      } catch (e) {
        return failure(e);
      }
    }),
};
