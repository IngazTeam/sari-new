import { and, desc, eq, lt, or } from "drizzle-orm";
import { conversations, messages } from "../drizzle/schema";
import {
  conversationHistoryInput,
  type ConversationHistoryInput,
} from "../shared/conversation-history";
import { getDb } from "./db/connection";

export class ConversationHistoryNotFound extends Error {
  constructor() {
    super("Conversation history unavailable");
  }
}
export async function readConversationHistory(
  merchantId: number,
  input: ConversationHistoryInput
) {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid history context");
  const { conversationId, beforeId, limit } =
    conversationHistoryInput.parse(input);
  const db = await getDb();
  if (!db) throw Error("Conversation history unavailable");
  return db.transaction(
    async tx => {
      const [conversation] = await tx
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.merchantId, merchantId),
            eq(conversations.id, conversationId)
          )
        )
        .limit(1);
      if (!conversation) throw new ConversationHistoryNotFound();
      const conditions = [eq(messages.conversationId, conversationId)];
      if (beforeId !== undefined) {
        const [cursor] = await tx
          .select({ id: messages.id, at: messages.createdAt })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conversationId),
              eq(messages.id, beforeId)
            )
          )
          .limit(1);
        if (!cursor) throw new ConversationHistoryNotFound();
        conditions.push(
          or(
            lt(messages.createdAt, cursor.at),
            and(eq(messages.createdAt, cursor.at), lt(messages.id, cursor.id))
          )!
        );
      }
      const rows = await tx
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).reverse();
      return {
        merchantId,
        conversationId,
        conversation,
        items,
        hasMore,
        nextBeforeId: hasMore ? items[0].id : null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
