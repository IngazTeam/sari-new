import { z } from "zod";
import { productImportField, productImportInput } from "./product-import";

export const productFileAdviceInput = z
  .object({
    file: productImportInput,
    intent: z.enum(["auto", "products", "services"]).default("auto"),
    language: z.enum(["ar", "en"]).default("ar"),
  })
  .strict();
const citation = z
  .object({
    // Zero denotes the header; positive numbers are physical source row numbers.
    row: z.number().int().min(0).max(100000),
    column: z.number().int().min(0).max(59),
    quote: z.string().trim().min(1).max(300),
  })
  .strict();
const suggestion = z
  .object({
    text: z.string().trim().min(1).max(1000),
    evidence: z.array(citation).min(1).max(5),
  })
  .strict();
export const productFileAdviceProposal = z
  .object({
    businessType: z.enum(["products", "services", "unknown"]),
    mapping: z
      .array(
        z
          .object({
            column: z.number().int().min(0).max(59),
            field: productImportField.nullable(),
          })
          .strict()
      )
      .max(60),
    summary: suggestion.nullable(),
    sellingTips: z.array(suggestion).max(5),
    crossSellSuggestions: z.array(suggestion).max(5),
  })
  .strict()
  .superRefine((value, ctx) => {
    const columns = new Set<number>(),
      fields = new Set<string>();
    for (const item of value.mapping) {
      if (columns.has(item.column) || (item.field && fields.has(item.field)))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate mapping",
        });
      columns.add(item.column);
      if (item.field) fields.add(item.field);
    }
  });
export type ProductFileAdviceProposal = z.infer<
  typeof productFileAdviceProposal
>;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const productFileAdviceResult = z
  .object({
    fileName: z.string().min(1).max(255),
    fileDigest: digest,
    sampleDigest: digest,
    totalRows: z.number().int().min(1).max(5000),
    sampledRows: z.number().int().min(1).max(100),
    omittedRows: z.number().int().min(0).max(5000),
    truncatedCells: z.number().int().min(0).max(6060),
    advisoryOnly: z.literal(true),
    productsCreated: z.literal(0),
    knowledgeChanged: z.literal(false),
    proposal: productFileAdviceProposal,
  })
  .strict()
  .refine(v => v.sampledRows + v.omittedRows === v.totalRows);
export const productFileAdviceStart = productFileAdviceInput.extend({
  requestId: z.string().uuid(),
  reviewed: z.literal(true),
});
export const productFileAdviceRead = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const productFileAdviceReceipt = z
  .object({
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    requestId: z.string().uuid(),
    fileName: z.string().min(1).max(255),
    fileDigest: digest,
    sampleDigest: digest,
    state: z.enum(["processing", "completed", "failed", "uncertain"]),
    failure: z.enum(["invalid_result", "provider_unknown"]).nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    result: productFileAdviceResult.nullable(),
  })
  .strict()
  .refine(
    v =>
      (v.state === "completed") === (v.result !== null) &&
      (!v.result ||
        (v.fileDigest === v.result.fileDigest &&
          v.sampleDigest === v.result.sampleDigest &&
          v.fileName === v.result.fileName)) &&
      (v.state === "completed"
        ? v.failure === null && !!v.finishedAt
        : v.state === "failed"
          ? v.failure === "invalid_result" && !!v.finishedAt
          : v.state === "processing"
            ? v.failure === null && v.finishedAt === null
            : v.failure === null || v.failure === "provider_unknown")
  );
