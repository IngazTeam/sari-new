import { z } from "zod";

export const testConversationId = z.number().int().positive().max(2147483647);
export const testSessionInput = z.object({ requestId: z.uuid() }).strict();
export const testMessageInput = z
  .object({
    conversationId: testConversationId,
    clientMessageId: z.uuid(),
    sender: z.enum(["user", "sari"]),
    content: z.string().trim().min(1).max(5000),
    responseTime: z.number().int().min(0).max(3600000).optional(),
    replySource: z.enum(["model", "guardrail"]).optional(),
  })
  .strict()
  .refine(
    input => input.sender === "sari" || input.replySource === undefined,
    "Only replies have a reply source"
  );
export const testChatInput = z
  .object({
    conversationId: testConversationId,
    clientMessageId: z.uuid(),
    message: z.string().trim().min(1).max(2000),
  })
  .strict();
export const quickPreviewInput = z
  .object({ message: z.string().trim().min(1).max(2000) })
  .strict();
export interface PreviewReply {
  response: string;
  source: "model" | "guardrail";
  historyMessageCount: number;
  historyTruncated: boolean;
}
export const previewReplyResult = z.object({
  response: z.string().trim().min(1).max(5000),
  source: z.enum(["model", "guardrail"]),
  historyMessageCount: z.number().int().min(0),
  historyTruncated: z.boolean(),
});
export const testDealValue = z
  .number()
  .finite()
  .positive()
  .max(9999999999.99)
  .refine(
    value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001,
    "Use at most two decimal places"
  );
export const testDealInput = z
  .object({
    conversationId: testConversationId,
    dealValue: testDealValue,
  })
  .strict();
