import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { paymentSettingsWorkspaceProcedures } from "./routers-payment-settings-workspace";

// Old clients receive a deterministic reload requirement before any settings read,
// membership lookup, database write, or provider request.
const retired = (): never => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "payment_settings:reviewed_workspace_required",
  });
};
const legacySave = z
  .object({
    tapEnabled: z.boolean(),
    tapPublicKey: z.string().trim().max(500).optional(),
    tapSecretKey: z.string().trim().max(500).optional(),
    tapTestMode: z.boolean().default(true),
    autoSendPaymentLink: z.boolean().default(true),
    paymentLinkMessage: z.string().max(1000).optional(),
    defaultCurrency: z.enum(["SAR"]).default("SAR"),
  })
  .strict();
export const merchantPaymentsRouter = router({
  ...paymentSettingsWorkspaceProcedures,
  getSettings: protectedProcedure.query(retired),
  saveSettings: protectedProcedure.input(legacySave).mutation(retired),
  testConnection: protectedProcedure.mutation(retired),
});
export type MerchantPaymentsRouter = typeof merchantPaymentsRouter;
