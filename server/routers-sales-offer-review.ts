import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {salesOfferReviewSnapshot} from '../shared/sales-offer-review';
import {
  listSalesOfferAttempts,
  reviewSalesOffer,
  offerListSchema,
  offerReviewSchema,
} from "./ai/sales-offer-review";

export const salesOfferReviewProcedures = {
  salesOfferReviewSnapshot: permissionProcedure('conversations.read').input(offerListSchema).query(async({ctx,input})=>{
    try{return salesOfferReviewSnapshot.parse({merchantId:ctx.merchantId,actorUserId:ctx.user.id,conversationId:input.conversationId,beforeSourceId:input.beforeSourceId??null,
      canManage:hasPermission(ctx.merchantRole,'conversations.reply'),page:await listSalesOfferAttempts(ctx.merchantId,input.conversationId,input.beforeSourceId)});}
    catch{throw new TRPCError({code:'NOT_FOUND',message:'Sales offer records unavailable'});}
  }),
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
