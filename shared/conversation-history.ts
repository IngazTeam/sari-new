import { z } from "zod";
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const conversationMessagesInput = z
  .object({ conversationId: id })
  .strict();
export const conversationHistoryInput = conversationMessagesInput
  .extend({
    beforeId: id.optional(),
    limit: z.number().int().min(1).max(500).default(50),
  })
  .strict();
export type ConversationHistoryInput = z.input<typeof conversationHistoryInput>;
