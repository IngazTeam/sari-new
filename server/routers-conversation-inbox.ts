import { TRPCError } from "@trpc/server";
import { conversationInboxInput } from "../shared/conversation-inbox";
import { permissionProcedure } from "./_core/trpc";
import { readConversationInbox } from "./conversation-inbox";
import { getMerchantById } from "./db";

export const conversationInboxProcedure = permissionProcedure(
  "conversations.read"
)
  .input(conversationInboxInput.optional())
  .query(async ({ ctx, input }) => {
    const merchant = await getMerchantById(ctx.merchantId);
    if (!merchant)
      throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
    try {
      return await readConversationInbox(ctx.merchantId, input ?? {});
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Conversation data is temporarily unavailable",
      });
    }
  });
