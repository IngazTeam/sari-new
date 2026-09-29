import { z } from "zod";
import { testConversationId } from "./test-sari-workspace";
export const testSessionListInput = z
  .object({
    beforeId: testConversationId.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const testTranscriptInput = testSessionListInput.extend({
  conversationId: testConversationId,
});
export const testFeedbackInput = z
  .object({
    conversationId: testConversationId,
    messageId: testConversationId,
    requestId: z.uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    rating: z.enum(["positive", "negative"]).nullable(),
  })
  .strict();
export type TestRating = "positive" | "negative" | null;
export const testFeedbackReadInput = z
  .object({ conversationId: testConversationId, messageId: testConversationId })
  .strict();
export type TestFeedbackResult = {
  messageId: number;
  rating: TestRating;
  revision: number;
  replayed: boolean;
  superseded: boolean;
};
export type SavedTestMessage = {
  id: number;
  clientMessageId: string | null;
  sender: "user" | "sari";
  content: string;
  sentAt: string;
  replySource: "model" | "guardrail" | null;
  responseTime: number | null;
  rating: TestRating;
  ratingRevision: number;
  ratedAt: string | null;
};
export type SavedTestTranscript = {
  merchantId: number;
  conversationId: number;
  startedAt: string;
  items: SavedTestMessage[];
  nextCursor: number | null;
  totalMessages: number;
  feedback: { replies: number; positive: number; negative: number };
  deal: { id: number; value: number } | null;
};
export type SavedTestSessionList = {
  merchantId: number;
  items: {
    id: number;
    startedAt: string;
    messageCount: number;
    hasDeal: boolean;
  }[];
  nextCursor: number | null;
};
