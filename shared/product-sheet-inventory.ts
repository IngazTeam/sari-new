import { z } from "zod";
import { productSheetGrid, productSheetCell } from "./product-sheet-grid";
import {
  PRODUCT_SHEET_ROWS,
  PRODUCT_SHEET_COLUMNS,
  productSheet,
  productSheetListInput,
} from "./product-sheet-import";
const id = z.number().int().min(1).max(2147483647),
  stock = z.number().int().min(0).max(2147483647),
  digest = z.string().regex(/^[a-f0-9]{64}$/),
  column = z.number().int().min(0).max(59);
export const sheetInventoryMapping = z
  .object({ productId: column, stock: column })
  .strict()
  .refine(v => v.productId !== v.stock);
export const sheetInventoryOptions = z
  .object({ mapping: sheetInventoryMapping.optional() })
  .strict();
export const sheetInventorySelection = productSheetListInput
  .extend({
    sheet: productSheet,
    options: sheetInventoryOptions,
  })
  .strict();
export const sheetInventoryIssue = z.enum([
  "missing_mapping",
  "ambiguous_mapping",
  "missing_id",
  "invalid_id",
  "missing_stock",
  "invalid_stock",
  "formula",
  "unsupported_cell",
  "duplicate_product",
  "product_missing",
  "source_locked",
  "current_stock_invalid",
]);
export const sheetInventorySourceRow = z
  .object({
    number: z.number().int().min(2).max(5001),
    cells: z.array(productSheetCell).max(60),
    productId: id.nullable(),
    stock: stock.nullable(),
    issues: z.array(sheetInventoryIssue).max(12),
  })
  .strict()
  .refine(
    v =>
      new Set(v.issues).size === v.issues.length &&
      (v.issues.length > 0 || (v.productId !== null && v.stock !== null))
  );
export const sheetInventoryPreview = z
  .object({
    kind: z.literal("sheet_inventory"),
    snapshot: z
      .object(productSheetGrid.shape)
      .omit({ rows: true })
      .strict()
      .refine(
        v =>
          v.coveredRows === Math.min(v.sheet.rows, PRODUCT_SHEET_ROWS) &&
          v.coveredColumns ===
            Math.min(v.sheet.columns, PRODUCT_SHEET_COLUMNS) &&
          v.limitedRange ===
            (v.sheet.rows > v.coveredRows || v.sheet.columns > v.coveredColumns)
      ),
    digest,
    mapping: z
      .object({ productId: column.nullable(), stock: column.nullable() })
      .strict(),
    headers: z.array(productSheetCell).max(60),
    issues: z.array(z.enum(["missing_mapping", "ambiguous_mapping"])).max(2),
    rows: z.array(sheetInventorySourceRow).min(1).max(5000),
  })
  .strict()
  .refine(
    v =>
      new Set(v.rows.map(r => r.number)).size === v.rows.length &&
      v.headers.length <= v.snapshot.coveredColumns &&
      v.rows.every(
        (r, i) =>
          (i === 0 || r.number > v.rows[i - 1].number) &&
          r.number <= v.snapshot.coveredRows &&
          r.cells.length <= v.snapshot.coveredColumns &&
          v.issues.every(issue => r.issues.includes(issue))
      ) &&
      (v.issues.length > 0 ||
        (v.mapping.productId !== null &&
          v.mapping.stock !== null &&
          v.mapping.productId !== v.mapping.stock))
  );
export const sheetInventoryCatalogItem = z
  .object({
    id,
    name: z.string().max(255),
    stock: stock.nullable(),
    stockValid: z.boolean(),
    locked: z.boolean(),
    digest,
  })
  .strict();
export const sheetInventoryPlanRow = z
  .object({
    number: z.number().int().min(2).max(5001),
    productId: id.nullable(),
    name: z.string().max(255).nullable(),
    before: stock.nullable(),
    after: stock.nullable(),
    expectedDigest: digest.nullable(),
    action: z.enum(["update", "unchanged", "blocked"]),
    issues: z.array(sheetInventoryIssue).max(12),
  })
  .strict()
  .refine(
    v =>
      new Set(v.issues).size === v.issues.length &&
      (v.action === "blocked"
        ? v.issues.length > 0 && v.after === null
        : v.productId !== null &&
          v.name !== null &&
          v.expectedDigest !== null &&
          v.after !== null &&
          v.issues.length === 0 &&
          (v.action === "unchanged"
            ? v.before === v.after
            : v.before !== v.after))
  );
export const sheetInventoryPlan = z
  .object({
    sourceDigest: digest,
    digest,
    rows: z.array(sheetInventoryPlanRow).min(1).max(5000),
    counts: z
      .object({
        update: z.number().int().min(0),
        unchanged: z.number().int().min(0),
        blocked: z.number().int().min(0),
      })
      .strict(),
  })
  .strict()
  .refine(
    v =>
      new Set(v.rows.map(r => r.number)).size === v.rows.length &&
      Object.entries(v.counts).every(
        ([action, count]) =>
          v.rows.filter(r => r.action === action).length === count
      ) &&
      new Set(v.rows.filter(r => r.action !== "blocked").map(r => r.productId))
        .size === v.rows.filter(r => r.action !== "blocked").length
  );
