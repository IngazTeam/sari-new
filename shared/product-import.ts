import { z } from "zod";
import { productEditableFields } from "./product-editor";
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
  "existing_sku",
]);
export type ProductImportIssue = {
  code: z.infer<typeof productImportIssueCode>;
  field: ProductImportField | null;
  column: number | null;
};

const id = z.number().int().positive().max(2147483647);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
export const productImportIssueSchema = z
  .object({
    code: productImportIssueCode,
    field: productImportField.nullable(),
    column: z.number().int().min(0).max(59).nullable(),
  })
  .strict();
export const productImportRowSchema = z
  .object({
    number: z.number().int().positive(),
    values: z.array(z.string().max(16000)).max(60),
    fields: productEditableFields.nullable(),
    issues: z.array(productImportIssueSchema).max(100),
  })
  .strict();
const previewShape = z
  .object({
    fileName: z.string().min(1).max(255),
    format: z.enum(["csv", "xlsx"]),
    digest,
    currency: z.enum(["SAR", "USD"]),
    productType: z.enum(["physical", "digital", "service"]),
    status: z.enum(["active", "draft", "archived"]),
    sheets: z
      .array(
        z
          .object({
            index: z.number().int().min(0).max(19),
            name: z.string(),
            hidden: z.boolean(),
            rows: z.number().int().min(0),
          })
          .strict()
      )
      .max(20),
    sheet: z.number().int().min(0).max(19).nullable(),
    headers: z
      .array(
        z
          .object({
            column: z.number().int().min(0).max(59),
            label: z.string().max(16000),
            field: productImportField.nullable(),
          })
          .strict()
      )
      .max(60),
    issues: z.array(productImportIssueSchema).max(125),
    rows: z.array(productImportRowSchema).min(1).max(PRODUCT_IMPORT_MAX_ROWS),
    total: z.number().int().positive().max(PRODUCT_IMPORT_MAX_ROWS),
    valid: z.number().int().min(0),
    invalid: z.number().int().min(0),
  })
  .strict();
export const productImportPreviewSchema = previewShape.refine(
  value =>
    value.total === value.rows.length &&
    value.valid === value.rows.filter(row => row.fields !== null).length &&
    value.invalid === value.total - value.valid
);
export const productImportPrepareInput = z
  .object({ reviewId: uuid, file: productImportInput })
  .strict();
export const productImportReadInput = z
  .object({
    reviewId: uuid,
    page: z.number().int().min(1).max(5000).default(1),
    pageSize: z.number().int().min(1).max(20).default(20),
    filter: z.enum(["all", "errors"]).default("all"),
  })
  .strict();
export const productImportCommitInput = z
  .object({
    reviewId: uuid,
    requestId: uuid,
    expectedDigest: digest,
    reviewed: z.literal(true),
  })
  .strict();
export const productImportDiscardInput = z
  .object({ reviewId: uuid, expectedDigest: digest })
  .strict();
export const productImportReceiptInput = z.object({ requestId: uuid }).strict();
export const productImportReceiptSchema = z
  .object({
    merchantId: id,
    actorId: id,
    requestId: uuid,
    reviewId: uuid,
    kind: z.literal("import"),
    digest,
    productIds: z.array(id).min(1).max(PRODUCT_IMPORT_MAX_ROWS),
    count: z.number().int().min(1).max(PRODUCT_IMPORT_MAX_ROWS),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine(
    value =>
      value.count === value.productIds.length &&
      new Set(value.productIds).size === value.count
  );
export const productImportReviewSchema = z
  .object({
    merchantId: id,
    actorId: id,
    reviewId: uuid,
    selection: productImportReadInput,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    expired: z.boolean(),
    canManage: z.boolean(),
    integrationSource: z.string().nullable(),
    canCommit: z.boolean(),
    receipt: productImportReceiptSchema.nullable(),
    preview: previewShape
      .omit({ rows: true })
      .extend({
        rows: z.array(productImportRowSchema).max(20),
        filteredTotal: z.number().int().min(0).max(PRODUCT_IMPORT_MAX_ROWS),
        totalPages: z.number().int().min(0).max(PRODUCT_IMPORT_MAX_ROWS),
      })
      .strict(),
  })
  .strict();
export type ProductImportReceipt = z.infer<typeof productImportReceiptSchema>;
