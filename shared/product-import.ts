import { z } from "zod";
export const PRODUCT_IMPORT_MAX_ROWS = 5000;
export const PRODUCT_IMPORT_MAX_COLUMNS = 60;
export const productImportFields = [
  "name",
  "description",
  "price",
  "currency",
  "imageUrl",
  "stock",
  "sku",
  "barcode",
  "compareAtPrice",
  "costPrice",
  "weight",
  "category",
  "tags",
  "productType",
  "status",
  "lowStockAlert",
  "trackInventory",
] as const;
export const productImportField = z.enum(productImportFields);
export type ProductImportField = z.infer<typeof productImportField>;
const mapping = z
  .array(
    z
      .object({
        column: z
          .number()
          .int()
          .min(0)
          .max(PRODUCT_IMPORT_MAX_COLUMNS - 1),
        field: productImportField.nullable(),
      })
      .strict()
  )
  .max(PRODUCT_IMPORT_MAX_COLUMNS)
  .refine(
    values => new Set(values.map(value => value.column)).size === values.length
  );
const options = {
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  currency: z.enum(["SAR", "USD"]),
  productType: z.enum(["physical", "digital", "service"]).default("physical"),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  mapping: mapping.optional(),
};
export const productImportInput = z.discriminatedUnion("format", [
  z
    .object({
      ...options,
      format: z.literal("csv"),
      csvData: z
        .string()
        .min(1)
        .max(5 * 1024 * 1024),
      delimiter: z.enum([",", ";", "\t"]).default(","),
    })
    .strict(),
  z
    .object({
      ...options,
      format: z.literal("xlsx"),
      fileBase64: z
        .string()
        .min(1)
        .max(Math.ceil((10 * 1024 * 1024) / 3) * 4),
      sheet: z.number().int().min(0).max(19).default(0),
    })
    .strict(),
]);
export type ProductImportInput = z.infer<typeof productImportInput>;
export const productImportIssueCode = z.enum([
  "missing_name",
  "missing_price",
  "invalid_value",
  "formula",
  "unsupported_cell",
  "duplicate_mapping",
  "missing_mapping",
  "unknown_column",
  "duplicate_sku",
]);
export type ProductImportIssue = {
  code: z.infer<typeof productImportIssueCode>;
  field: ProductImportField | null;
  column: number | null;
};
