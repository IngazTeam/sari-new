import { z } from "zod";
export const setupProgressInput = z
  .object({
    currentStep: z.number().int().min(1).max(10),
    completedSteps: z
      .array(z.number().int().min(1).max(10))
      .max(10)
      .transform(value => Array.from(new Set(value)).sort((a, b) => a - b)),
    wizardData: z
      .record(z.string(), z.unknown())
      .refine(
        value =>
          new TextEncoder().encode(JSON.stringify(value)).byteLength <=
          1_000_000,
        "SETUP_DRAFT_TOO_LARGE"
      ),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const setupResetInput = z
  .object({
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewed: z.literal(true),
  })
  .strict();
