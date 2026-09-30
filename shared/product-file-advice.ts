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
