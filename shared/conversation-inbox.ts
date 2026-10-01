import { z } from "zod";
import { isValidDealStage } from "./const";

export const conversationInboxInput = z
  .object({
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(200).optional(),
    stage: z
      .string()
      .refine(isValidDealStage, "Invalid conversation stage")
      .optional(),
    needsHuman: z.boolean().optional(),
  })
  .strict();
export type ConversationInboxInput = z.input<typeof conversationInboxInput>;
