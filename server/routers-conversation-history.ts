import { TRPCError } from "@trpc/server";
import { permissionProcedure } from "./_core/trpc";
import {
  conversationHistoryInput,
  conversationMessagesInput,
  type ConversationHistoryInput,
} from "../shared/conversation-history";
import {
  readConversationHistory,
  ConversationHistoryNotFound,
} from "./conversation-history";

async function read(merchantId: number, input: ConversationHistoryInput) {
  try {
    return await readConversationHistory(merchantId, input);
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof ConversationHistoryNotFound
          ? "NOT_FOUND"
          : "INTERNAL_SERVER_ERROR",
      message: "Conversation history unavailable",
    });
  }
}
export const conversationHistoryProcedures = {
  messageHistory: permissionProcedure("conversations.read")
    .input(conversationHistoryInput)
    .query(({ ctx, input }) => read(ctx.merchantId, input)),
  getMessages: permissionProcedure("conversations.read")
    .input(conversationMessagesInput)
    .query(
      async ({ ctx, input }) =>
        (await read(ctx.merchantId, { ...input, limit: 500 })).items
    ),
};
