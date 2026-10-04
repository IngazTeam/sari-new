import {
  paymentLinkCreateInput,
  paymentLinkRequestInput,
} from "../shared/payment-links-workspace";
import {
  createReviewedPaymentLink,
  readPaymentLinkRequest,
} from "./payment/payment-links-workspace";
import { paymentLinkDisableInput } from "../shared/payment-links-workspace";
import {
  disableReviewedPaymentLink,
  PaymentLinksActionError,
} from "./payment/payment-links-workspace";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
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
          : reason === "stale" || reason === "request_conflict"
            ? "CONFLICT"
            : reason === "expiry"
              ? "BAD_REQUEST"
              : reason === "missing"
                ? "NOT_FOUND"
                : "INTERNAL_SERVER_ERROR",
      message: "payment_links:" + reason,
    });
  }
}
export const paymentLinksWorkspaceRouter = router({
  createReviewed: merchantProcedure
    .input(paymentLinkCreateInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        createReviewedPaymentLink(ctx.user.id, ctx.merchantId, input)
      )
    ),
  creationRequest: merchantProcedure
    .input(paymentLinkRequestInput)
    .query(({ ctx, input }) =>
      guarded(() => readPaymentLinkRequest(ctx.user.id, ctx.merchantId, input))
    ),
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

// Stale clients must reload; none of these legacy routes may select a merchant,
// expose raw link metadata, or perform an unreviewed write.
const retired = (): never => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "payment_links:workspace_required",
  });
};
const legacyId = z.number().int().positive().max(2147483647);
export const retiredPaymentLinksProcedures = {
  createLink: protectedProcedure
    .input(
      z
        .object({
          title: z.string().trim().min(2).max(255),
          description: z.string().trim().max(1000).optional(),
          amount: z.number().int().min(100).max(100_000_000),
          currency: z.literal("SAR").default("SAR"),
          isFixedAmount: z.boolean().default(true),
          maxUsageCount: z.number().int().min(1).max(100_000).optional(),
          expiresAt: z.string().max(64).optional(),
          orderId: legacyId.optional(),
          bookingId: legacyId.optional(),
        })
        .strict()
        .refine(v => !(v.orderId && v.bookingId))
    )
    .mutation(retired),
  getLink: protectedProcedure
    .input(z.object({ linkId: z.string().min(1).max(100) }).strict())
    .query(retired),
  listLinks: protectedProcedure
    .input(
      z
        .object({
          status: z.string().max(30).optional(),
          isActive: z.boolean().optional(),
          limit: z.number().int().min(1).max(1000).default(50),
        })
        .strict()
    )
    .query(retired),
  disableLink: protectedProcedure
    .input(z.object({ id: legacyId }).strict())
    .mutation(retired),
};
