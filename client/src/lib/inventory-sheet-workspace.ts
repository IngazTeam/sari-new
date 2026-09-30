import { z } from "zod";
import {
  productSheetConnection,
  productSheet,
  productSheetSourceIdentity,
} from "@shared/product-sheet-import";
import {
  inventorySheetPrepareInput,
  inventorySheetCommitInput,
  inventorySheetReadInput,
  inventorySheetReview,
  inventorySheetReceipt,
} from "@shared/product-sheet-inventory-review";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const sheetAttemptSchema = z
  .object({
    input: inventorySheetPrepareInput,
    digest: digest.nullable(),
    attempt: inventorySheetCommitInput.nullable(),
    receipt: inventorySheetReceipt.nullable(),
  })
  .strict()
  .refine(
    v =>
      (!v.attempt ||
        (v.attempt.reviewId === v.input.reviewId &&
          v.attempt.expectedDigest === v.digest)) &&
      (!v.receipt ||
        (v.receipt.reviewId === v.input.reviewId &&
          v.receipt.digest === v.digest &&
          v.receipt.sourceDigest === v.input.selection.expectedSourceDigest &&
          v.receipt.requestId === v.attempt?.requestId))
  );
export type SheetAttempt = z.infer<typeof sheetAttemptSchema>;
function identity(scope: string) {
  if (!/^[1-9]\d*:[1-9]\d*:sheet-inventory$/.test(scope))
    throw Error("Invalid Sheet workspace scope");
  const [actorId, merchantId] = scope.split(":").map(Number);
  return { actorId, merchantId };
}
const key = (scope: string) => {
  identity(scope);
  return "sary:inventory-sheet:v1:" + scope;
};
function scoped<T extends { actorId: number; merchantId: number }>(
  scope: string,
  value: T
) {
  const i = identity(scope);
  if (i.actorId !== value.actorId || i.merchantId !== value.merchantId)
    throw Error("Sheet workspace scope mismatch");
  return value;
}
const cached = (scope: string, raw: unknown) => {
  const v = sheetAttemptSchema.parse(raw);
  if (v.receipt) scoped(scope, v.receipt);
  return v;
};
export function readSheetAttempt(scope: string) {
  const raw = sessionStorage.getItem(key(scope));
  if (!raw) return null;
  if (raw.length > 1024 * 1024) throw Error("Invalid Sheet recovery data");
  return cached(scope, JSON.parse(raw));
}
export function saveSheetAttempt(
  scope: string,
  value: SheetAttempt,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const name = key(scope),
    raw = JSON.stringify(cached(scope, value));
  if (raw.length > 1024 * 1024) throw Error("Invalid Sheet recovery data");
  sessionStorage.setItem(name, raw);
  if (sessionStorage.getItem(name) !== raw)
    throw Error("Sheet recovery unavailable");
}
export function clearSheetAttempt(scope: string, epoch: number) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const name = key(scope);
  sessionStorage.removeItem(name);
  if (sessionStorage.getItem(name) !== null)
    throw Error("Sheet recovery cleanup unavailable");
}
export const checkedSheetConnection = (raw: unknown, scope: string) =>
  scoped(scope, productSheetConnection.parse(raw));
const list = z
  .object({
    merchantId: z.number().int().positive(),
    actorId: z.number().int().positive(),
    source: productSheetSourceIdentity,
    sheets: z.array(productSheet).max(100),
  })
  .strict()
  .refine(v => new Set(v.sheets.map(s => s.id)).size === v.sheets.length);
export function checkedSheetList(
  raw: unknown,
  scope: string,
  expected: string
) {
  const r = scoped(scope, list.parse(raw));
  if (r.source.digest !== expected) throw Error("Sheet list source mismatch");
  return r;
}
export function checkedSheetReview(
  raw: unknown,
  scope: string,
  selection: z.infer<typeof inventorySheetReadInput>,
  saved: SheetAttempt
) {
  const r = scoped(scope, inventorySheetReview.parse(raw));
  if (
    JSON.stringify(r.selection) !== JSON.stringify(selection) ||
    r.reviewId !== saved.input.reviewId ||
    (saved.digest && r.digest !== saved.digest) ||
    JSON.stringify(r.options) !== JSON.stringify(saved.input.selection)
  )
    throw Error("Sheet review selection mismatch");
  if (
    saved.attempt &&
    r.receipt &&
    r.receipt.requestId !== saved.attempt.requestId
  )
    throw Error("Sheet review request mismatch");
  return r;
}
export function checkedSheetReceipt(
  raw: unknown,
  scope: string,
  saved: SheetAttempt
) {
  const r = scoped(scope, inventorySheetReceipt.parse(raw));
  if (
    !saved.attempt ||
    r.requestId !== saved.attempt.requestId ||
    r.reviewId !== saved.input.reviewId ||
    r.digest !== saved.digest ||
    r.sourceDigest !== saved.input.selection.expectedSourceDigest
  )
    throw Error("Sheet receipt mismatch");
  return r;
}
