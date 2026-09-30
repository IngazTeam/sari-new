import { z } from "zod";
import {
  productImportPreviewSchema,
  productImportRowSchema,
} from "./product-import";
import {
  productSheetSelection,
  productSheetSourceIdentity,
  productSheetSnapshot,
  productSheetPlan,
  productSheetPlanRow,
  productSheetMatchMode,
} from "./product-sheet-import";
const id = z.number().int().positive().max(2147483647),
  digest = z.string().regex(/^[a-f0-9]{64}$/),
  uuid = z.string().uuid();
export const productSheetPrepareInput = z
  .object({
    reviewId: uuid,
    selection: productSheetSelection,
    mode: productSheetMatchMode,
  })
  .strict();
export const productSheetReadInput = z
  .object({
    reviewId: uuid,
    page: z.number().int().min(1).max(5000).default(1),
    pageSize: z.number().int().min(1).max(20).default(20),
    filter: z
      .enum(["all", "create", "update", "unchanged", "blocked"])
      .default("all"),
  })
  .strict();
export const productSheetCommitInput = z
  .object({
    reviewId: uuid,
    requestId: uuid,
    expectedDigest: digest,
    reviewed: z.literal(true),
  })
  .strict();
export const productSheetDiscardInput = z
  .object({ reviewId: uuid, expectedDigest: digest })
  .strict();
export const productSheetReceiptInput = z.object({ requestId: uuid }).strict();
export const productSheetStoredPayload = z
  .object({
    input: productSheetPrepareInput,
    source: productSheetSourceIdentity,
    snapshot: productSheetSnapshot,
    plan: productSheetPlan,
  })
  .strict()
  .refine(
    v =>
      v.input.selection.expectedSourceDigest === v.source.digest &&
      v.source.spreadsheetId === v.snapshot.spreadsheetId &&
      v.input.selection.sheet.id === v.snapshot.sheet.id &&
      v.plan.sourceDigest === v.snapshot.digest &&
      v.plan.mode === v.input.mode &&
      v.plan.rows.length === v.snapshot.preview.rows.length &&
      v.plan.rows.every(
        (r, i) => r.number === v.snapshot.preview.rows[i].number
      )
  );
export const productSheetReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    reviewId: uuid,
    requestId: uuid,
    kind: z.literal("sheet_import"),
    digest,
    sourceDigest: digest,
    snapshotDigest: digest,
    createdAt: z.string().datetime(),
    rows: z
      .array(
        z
          .object({
            number: z.number().int().min(2).max(5001),
            action: z.enum(["create", "update", "unchanged"]),
            productId: id,
          })
          .strict()
      )
      .min(1)
      .max(5000),
    counts: z
      .object({
        create: z.number().int().min(0),
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
        ([k, count]) => v.rows.filter(r => r.action === k).length === count
      )
  );
export const productSheetReview = z
  .object({
    merchantId: id,
    actorId: id,
    reviewId: uuid,
    digest,
    selection: productSheetReadInput,
    source: productSheetSourceIdentity,
    options: productSheetSelection,
    mode: productSheetMatchMode,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    expired: z.boolean(),
    canManage: z.boolean(),
    integrationSource: z.string().nullable(),
    canCommit: z.boolean(),
    receipt: productSheetReceipt.nullable(),
    sourceCurrent: z.boolean(),
    snapshot: z
      .object(productSheetSnapshot.shape)
      .omit({ preview: true })
      .strict(),
    preview: z
      .object(productImportPreviewSchema.shape)
      .omit({ rows: true })
      .strict(),
    counts: productSheetPlan.shape.counts,
    rows: z
      .array(
        z
          .object({
            source: productImportRowSchema,
            change: productSheetPlanRow,
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
      v.source.spreadsheetId === v.snapshot.spreadsheetId &&
      v.options.expectedSourceDigest === v.source.digest &&
      v.options.sheet.id === v.snapshot.sheet.id &&
      Object.values(v.counts).reduce((a, b) => a + b, 0) === v.preview.total &&
      v.preview.valid + v.preview.invalid === v.preview.total &&
      v.filteredTotal ===
        (v.selection.filter === "all"
          ? v.preview.total
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
          (v.selection.filter === "all" ||
            r.change.action === v.selection.filter)
      ) &&
      (!v.canCommit ||
        (v.canManage &&
          v.integrationSource === "none" &&
          v.sourceCurrent &&
          !v.expired &&
          !v.receipt &&
          !v.counts.blocked)) &&
      (!v.receipt ||
        (v.receipt.merchantId === v.merchantId &&
          v.receipt.actorId === v.actorId &&
          v.receipt.reviewId === v.reviewId &&
          v.receipt.digest === v.digest &&
          v.receipt.sourceDigest === v.source.digest &&
          v.receipt.snapshotDigest === v.snapshot.digest &&
          v.counts.blocked === 0 &&
          v.receipt.counts.create === v.counts.create &&
          v.receipt.counts.update === v.counts.update &&
          v.receipt.counts.unchanged === v.counts.unchanged &&
          v.rows.every(r =>
            v.receipt!.rows.some(
              saved =>
                saved.number === r.change.number &&
                saved.action === r.change.action &&
                (r.change.action === "create" ||
                  saved.productId === r.change.productId)
            )
          )))
  );
export type ProductSheetReview = z.infer<typeof productSheetReview>;
export type ProductSheetReceipt = z.infer<typeof productSheetReceipt>;
