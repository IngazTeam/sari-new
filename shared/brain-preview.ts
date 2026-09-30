import { z } from "zod";

export const brainPreviewInput = z
  .object({
    question: z.string().trim().min(1).max(500),
  })
  .strict();

export const brainPreviewResult = z.object({
  success: z.literal(true),
  question: z.string().min(1).max(500),
  answer: z.string().trim().min(1).max(5000),
  source: z.enum(["model", "guardrail"]),
});
export type BrainPreviewResult = z.infer<typeof brainPreviewResult>;
