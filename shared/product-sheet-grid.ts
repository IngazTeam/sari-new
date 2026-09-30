import { z } from "zod";
import {
  productSheet,
  productSpreadsheetId,
  PRODUCT_SHEET_ROWS,
  PRODUCT_SHEET_COLUMNS,
} from "./product-sheet-import";
export const productSheetCell = z
  .object({
    text: z.string().max(16000),
    issue: z.enum(["formula", "unsupported_cell"]).optional(),
    boolean: z.literal(true).optional(),
  })
  .strict();
export const productSheetGridRow = z
  .object({
    number: z.number().int().min(1).max(PRODUCT_SHEET_ROWS),
    cells: z.array(productSheetCell).max(PRODUCT_SHEET_COLUMNS),
  })
  .strict();
export const productSheetGrid = z
  .object({
    spreadsheetId: productSpreadsheetId,
    sheet: productSheet,
    range: z.string().min(1).max(150),
    readAt: z.string().datetime(),
    coveredRows: z.number().int().min(1).max(PRODUCT_SHEET_ROWS),
    coveredColumns: z.number().int().min(1).max(PRODUCT_SHEET_COLUMNS),
    limitedRange: z.boolean(),
    rows: z.array(productSheetGridRow).max(PRODUCT_SHEET_ROWS),
  })
  .strict()
  .refine(
    v =>
      v.coveredRows === Math.min(v.sheet.rows, PRODUCT_SHEET_ROWS) &&
      v.coveredColumns === Math.min(v.sheet.columns, PRODUCT_SHEET_COLUMNS) &&
      v.limitedRange ===
        (v.sheet.rows > v.coveredRows || v.sheet.columns > v.coveredColumns) &&
      v.rows.length <= v.coveredRows &&
      v.rows.every(
        (r, i) => r.number === i + 1 && r.cells.length <= v.coveredColumns
      )
  );
