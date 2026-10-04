import { z } from "zod";
const spreadsheetId = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
export const sheetsConversationExportInput = z
  .object({
    conversationIds: z
      .array(z.number().int().positive().max(2147483647))
      .min(1)
      .max(100)
      .refine(
        ids => new Set(ids).size === ids.length,
        "Duplicate conversations"
      ),
    reviewed: z.literal(true),
    expectedSpreadsheetId: spreadsheetId,
  })
  .strict();
export const SHEETS_CONVERSATION_MESSAGE_LIMIT = 10000;
export const sheetsConversationExportReceipt = z
  .object({
    success: z.literal(true),
    actorId: z.number().int().positive(),
    merchantId: z.number().int().positive(),
    spreadsheetId,
    conversationCount: z.number().int().min(1).max(100),
    messageCount: z
      .number()
      .int()
      .min(1)
      .max(SHEETS_CONVERSATION_MESSAGE_LIMIT),
    message: z.string(),
  })
  .strict();
