import { z } from "zod";

export const quotationReviewInput = z
  .object({
    requestId: z.string().uuid(),
    quotationId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    instanceRecordId: z.number().int().positive(),
    // A template is chosen explicitly; historical default terms are not silently added.
    templateId: z.number().int().positive().nullable().default(null),
  })
  .strict();
export const quotationReviewReadInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export type QuotationReviewInput = z.infer<typeof quotationReviewInput>;
