import { z } from "zod";
const id = z.number().int().min(1).max(2147483647);
export const competitorAnalysisStart = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    url: z.string().url().max(500),
  })
  .strict();
export const competitorAnalysisAttempt = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const competitorAnalysisExecution = z
  .object({
    merchantId: id,
    requestId: z.string().uuid(),
    token: z.string().uuid(),
  })
  .strict();
export type CompetitorAnalysisExecution = z.infer<
  typeof competitorAnalysisExecution
>;
const score = z.number().int().min(0).max(100);
const optionalText = (length: number) => z.string().max(length).nullable();
export const competitorAnalysisResult = z
  .object({
    scores: z
      .object({
        overall: score,
        seo: score,
        performance: score,
        ux: score,
        content: score,
      })
      .strict(),
    industry: optionalText(100),
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(500),
            description: optionalText(50000),
            price: z.number().finite().min(0).max(99999999.99).nullable(),
            currency: z
              .string()
              .regex(/^[A-Z]{3}$/)
              .nullable(),
            imageUrl: optionalText(500),
            productUrl: optionalText(500),
            category: optionalText(255),
          })
          .strict()
      )
      .max(500),
  })
  .strict();
export type CompetitorAnalysisResult = z.infer<typeof competitorAnalysisResult>;
