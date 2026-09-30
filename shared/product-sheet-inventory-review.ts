import { z } from "zod";
import {
  sheetInventorySelection,
  sheetInventoryPreview,
  sheetInventoryPlan,
  sheetInventorySourceRow,
  sheetInventoryPlanRow,
} from "./product-sheet-inventory";
import { productSheetSourceIdentity } from "./product-sheet-import";
import {
  productSheetCommitInput,
  productSheetDiscardInput,
  productSheetReceiptInput,
} from "./product-sheet-review";
const id = z.number().int().min(1).max(2147483647),
  digest = z.string().regex(/^[a-f0-9]{64}$/),
  uuid = z.string().uuid();
export const inventorySheetPrepareInput = z
  .object({ reviewId: uuid, selection: sheetInventorySelection })
  .strict();
export const inventorySheetReadInput = z
  .object({
    reviewId: uuid,
    page: z.number().int().min(1).max(5000).default(1),
    pageSize: z.number().int().min(1).max(20).default(20),
    filter: z.enum(["all", "update", "unchanged", "blocked"]).default("all"),
  })
  .strict();
export const inventorySheetCommitInput = productSheetCommitInput,
  inventorySheetDiscardInput = productSheetDiscardInput,
  inventorySheetReceiptInput = productSheetReceiptInput;
export const inventorySheetStoredPayload = z
  .object({
    input: inventorySheetPrepareInput,
    source: productSheetSourceIdentity,
    snapshot: sheetInventoryPreview,
    plan: sheetInventoryPlan,
  })
  .strict()
  .refine(
    v =>
      v.input.selection.expectedSourceDigest === v.source.digest &&
      v.source.spreadsheetId === v.snapshot.snapshot.spreadsheetId &&
      JSON.stringify(v.input.selection.sheet) ===
        JSON.stringify(v.snapshot.snapshot.sheet) &&
      v.plan.sourceDigest === v.snapshot.digest &&
      v.plan.rows.length === v.snapshot.rows.length &&
      v.plan.rows.every(
        (r, i) =>
          r.number === v.snapshot.rows[i].number &&
          r.productId === v.snapshot.rows[i].productId &&
          (r.action === "blocked" || r.after === v.snapshot.rows[i].stock) &&
          v.snapshot.rows[i].issues.every(issue => r.issues.includes(issue))
      )
  );
export const inventorySheetReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    reviewId: uuid,
    requestId: uuid,
    kind: z.literal("sheet_inventory"),
    digest,
    sourceDigest: digest,
    snapshotDigest: digest,
    createdAt: z.string().datetime(),
    rows: z
      .array(
        z
          .object({
            number: z.number().int().min(2).max(5001),
            action: z.enum(["update", "unchanged"]),
            productId: id,
            before: z.number().int().min(0).max(2147483647).nullable(),
            after: z.number().int().min(0).max(2147483647),
          })
          .strict()
          .refine(r =>
            r.action === "unchanged"
              ? r.before === r.after
              : r.before !== r.after
          )
      )
      .min(1)
      .max(5000),
    counts: z
      .object({
        update: z.number().int().min(0),
        unchanged: z.number().int().min(0),
      })
      .strict(),
  })
  .strict()
  .refine(
    v =>
      new Set(v.rows.map(r => r.number)).size === v.rows.length &&
      new Set(v.rows.map(r => r.productId)).size === v.rows.length &&
      Object.entries(v.counts).every(
        ([action, count]) =>
          v.rows.filter(r => r.action === action).length === count
      )
  );
export type InventorySheetReceipt = z.infer<typeof inventorySheetReceipt>;
export const inventorySheetReview = z
  .object({
    merchantId: id,
    actorId: id,
    reviewId: uuid,
    digest,
    selection: inventorySheetReadInput,
    source: productSheetSourceIdentity,
    options: sheetInventorySelection,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    expired: z.boolean(),
    canManage: z.boolean(),
    integrationSource: z.string().nullable(),
    sourceCurrent: z.boolean(),
    canCommit: z.boolean(),
    receipt: inventorySheetReceipt.nullable(),
    preview: z
      .object(sheetInventoryPreview.shape)
      .omit({ rows: true })
      .strict(),
    counts: sheetInventoryPlan.shape.counts,
    rows: z
      .array(
        z
          .object({
            source: sheetInventorySourceRow,
            change: sheetInventoryPlanRow,
          })
          .strict()
      )
      .max(20),
    filteredTotal: z.number().int().min(0).max(5000),
    totalPages: z.number().int().min(0).max(5000),
  })
  .strict()
  .refine(
    v =>
      v.reviewId === v.selection.reviewId &&
      Object.values(v.counts).reduce((a, b) => a + b, 0) <= 5000 &&
      v.options.expectedSourceDigest === v.source.digest &&
      v.source.spreadsheetId === v.preview.snapshot.spreadsheetId &&
      JSON.stringify(v.options.sheet) ===
        JSON.stringify(v.preview.snapshot.sheet) &&
      v.filteredTotal ===
        (v.selection.filter === "all"
          ? Object.values(v.counts).reduce((a, b) => a + b, 0)
          : v.counts[v.selection.filter]) &&
      v.totalPages === Math.ceil(v.filteredTotal / v.selection.pageSize) &&
      v.rows.length ===
        Math.max(
          0,
          Math.min(
            v.selection.pageSize,
            v.filteredTotal - (v.selection.page - 1) * v.selection.pageSize
          )
        ) &&
      new Set(v.rows.map(r => r.source.number)).size === v.rows.length &&
      v.rows.every(
        r =>
          r.source.number === r.change.number &&
          r.source.productId === r.change.productId &&
          (r.change.action === "blocked" ||
            r.source.stock === r.change.after) &&
          r.source.issues.every(issue => r.change.issues.includes(issue)) &&
          (v.selection.filter === "all" ||
            r.change.action === v.selection.filter)
      ) &&
      (!v.canCommit ||
        (v.canManage &&
          v.integrationSource === "none" &&
          v.sourceCurrent &&
          !v.expired &&
          !v.receipt &&
          v.counts.blocked === 0)) &&
      (!v.receipt ||
        (v.receipt.merchantId === v.merchantId &&
          v.receipt.actorId === v.actorId &&
          v.receipt.reviewId === v.reviewId &&
          v.receipt.digest === v.digest &&
          v.receipt.sourceDigest === v.source.digest &&
          v.receipt.snapshotDigest === v.preview.digest &&
          v.counts.blocked === 0 &&
          v.receipt.counts.update === v.counts.update &&
          v.receipt.counts.unchanged === v.counts.unchanged &&
          v.rows.every(({ change }) => {
            const saved = v.receipt!.rows.find(r => r.number === change.number);
            return (
              saved?.action === change.action &&
              saved.productId === change.productId &&
              saved.before === change.before &&
              saved.after === change.after
            );
          })))
  );
