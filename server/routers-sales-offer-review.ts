import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  listSalesOfferAttempts,
  reviewSalesOffer,
  offerListSchema,
  offerReviewSchema,
} from "./ai/sales-offer-review";

export const salesOfferReviewProcedures = {
  listSalesOfferAttempts: permissionProcedure("conversations.read")
    .input(offerListSchema)
    .query(async ({ ctx, input }) => {
      try {
        return {
          ...(await listSalesOfferAttempts(
            ctx.merchantId,
            input.conversationId,
            input.beforeSourceId
          )),
          canManage: hasPermission(ctx.merchantRole, "conversations.reply"),
        };
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sales offer records unavailable",
        });
      }
    }),
  reviewSalesOffer: permissionProcedure("conversations.reply")
    .input(offerReviewSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await reviewSalesOffer({
          ...input,
          merchantId: ctx.merchantId,
          actorUserId: ctx.user.id,
        });
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Sales offer evidence changed or is unavailable; refresh before reviewing",
        });
      }
    }),
};
