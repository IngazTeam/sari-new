import { z } from "zod";
import {
  productImportInput,
  productImportPreviewSchema,
} from "./product-import";
export const PRODUCT_SHEET_ROWS = 5001,
  PRODUCT_SHEET_COLUMNS = 60;
export const productSpreadsheetId = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/);
export const productSheet = z
  .object({
    id: z.number().int().min(0).max(2147483647),
    title: z
      .string()
      .min(1)
      .max(100)
      .refine(s => !/[\u0000-\u001f\u007f]/.test(s)),
    hidden: z.boolean(),
    rows: z.number().int().positive().max(10000000),
    columns: z.number().int().positive().max(18278),
  })
  .strict();
export const productSheetOptions = productImportInput.options[0]
  .omit({ format: true, csvData: true, delimiter: true, fileName: true })
  .extend({ sheetId: z.number().int().min(0).max(2147483647) })
  .strict();
export const productSheetSnapshot = z
  .object({
    kind: z.literal("google_sheets"),
    spreadsheetId: productSpreadsheetId,
    sheet: productSheet,
    range: z.string().min(1).max(150),
    readAt: z.string().datetime(),
    coveredRows: z.number().int().min(1).max(PRODUCT_SHEET_ROWS),
    coveredColumns: z.number().int().min(1).max(PRODUCT_SHEET_COLUMNS),
    limitedRange: z.boolean(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    preview: productImportPreviewSchema,
  })
  .strict()
  .refine(
    v =>
      v.coveredRows === Math.min(v.sheet.rows, PRODUCT_SHEET_ROWS) &&
      v.coveredColumns === Math.min(v.sheet.columns, PRODUCT_SHEET_COLUMNS) &&
      v.limitedRange ===
        (v.sheet.rows > v.coveredRows || v.sheet.columns > v.coveredColumns)
  );
export type ProductSheetSnapshot = z.infer<typeof productSheetSnapshot>;
