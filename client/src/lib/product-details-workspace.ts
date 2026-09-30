import { z } from "zod";
import {
  productDetailWrite,
  readOptionValues,
  readVariantSelections,
  type ProductOptionRow,
  type ProductVariantRow,
} from "@shared/product-details";
import { knowledgeCacheEpoch } from "./knowledge-workspace-cache";

const optionForm = z
  .object({
    type: z.literal("option"),
    name: z.string().max(200),
    nameEn: z.string().max(200),
    values: z.string().max(16000),
    sortOrder: z.string().max(12),
  })
  .strict();
const variantForm = z
  .object({
    type: z.literal("variant"),
    name: z.string().max(300),
    sku: z.string().max(150),
    priceMode: z.enum(["unverified", "inherit", "custom"]),
    price: z.string().max(32),
    compareAtPrice: z.string().max(32),
    costPrice: z.string().max(32),
    stock: z.string().max(20),
    barcode: z.string().max(150),
    weight: z.string().max(40),
    imageUrl: z.string().max(600),
    selections: z.string().max(16000),
    isActive: z.boolean(),
    sortOrder: z.string().max(12),
  })
  .strict();
export const detailForm = z.discriminatedUnion("type", [
  optionForm,
  variantForm,
]);
export type DetailForm = z.infer<typeof detailForm>;
export const detailDraftBase = z
  .object({
    productId: z.number().int().positive(),
    mode: z.enum(["create", "update", "delete"]),
    id: z.number().int().positive().nullable(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    form: detailForm,
    baseline: detailForm,
    attempt: productDetailWrite.optional(),
  })
  .strict();
type DraftBase = z.infer<typeof detailDraftBase>;
export const detailDraft = detailDraftBase.superRefine((value, ctx) => {
  if (
    value.form.type !== value.baseline.type ||
    (value.mode === "create") !== (value.id === null)
  )
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Product detail target mismatch",
    });
  if (value.attempt) {
    const intended = detailFormRequest(value, value.attempt.requestId);
    if (
      !intended.success ||
      JSON.stringify(intended.data) !== JSON.stringify(value.attempt)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Product detail attempt mismatch",
      });
  }
});
export type DetailDraft = z.infer<typeof detailDraft>;
export const optionToForm = (
  row?: ProductOptionRow
): z.infer<typeof optionForm> => ({
  type: "option",
  name: row?.name ?? "",
  nameEn: row?.nameEn ?? "",
  values: row ? (readOptionValues(row.values)?.join("\n") ?? "") : "",
  sortOrder: String(row?.sortOrder ?? 0),
});
export function variantToForm(
  row?: ProductVariantRow,
  options: ProductOptionRow[] = []
): z.infer<typeof variantForm> {
  const money = (v: number | null | undefined) =>
    row?.priceUnit === "minor" && v != null && v >= 0
      ? (v / 100).toFixed(2)
      : "";
  const selections = row ? readVariantSelections(row.options, options) : [];
  return {
    type: "variant",
    name: row?.name ?? "",
    sku: row?.sku ?? "",
    priceMode:
      row?.priceUnit === "unverified" || (row?.price != null && row.price < 0)
        ? "unverified"
        : row?.price == null
          ? "inherit"
          : "custom",
    price: money(row?.price),
    compareAtPrice: money(row?.compareAtPrice),
    costPrice: money(row?.costPrice),
    stock: row ? (row.stock === null ? "" : String(row.stock)) : "0",
    barcode: row?.barcode ?? "",
    weight: row?.weight ?? "",
    imageUrl: row?.imageUrl ?? "",
    selections: selections === null ? "" : JSON.stringify(selections),
    isActive: row ? row.isActive === 1 : true,
    sortOrder: String(row?.sortOrder ?? 0),
  };
}
export function detailFormRequest(draft: DraftBase, requestId: string) {
  const common = {
    productId: draft.productId,
    kind: `${draft.form.type}_${draft.mode}`,
    requestId,
    expectedDigest: draft.digest,
    reviewed: true,
    ...(draft.mode === "create" ? {} : { id: draft.id }),
  };
  if (draft.mode === "delete") return productDetailWrite.safeParse(common);
  const form = draft.form,
    baseline = draft.baseline;
  const number = (value: string) => (/^\d+$/.test(value) ? Number(value) : NaN);
  let fields: Record<string, unknown>;
  if (form.type === "option")
    fields = {
      name: form.name,
      nameEn: form.nameEn.trim() || null,
      values: form.values
        .split(/\r?\n/)
        .map(value => value.trim())
        .filter(Boolean),
      sortOrder: number(form.sortOrder),
    };
  else {
    let selections: unknown;
    try {
      selections = JSON.parse(form.selections);
    } catch {
      selections = null;
    }
    fields = {
      name: form.name,
      sku: form.sku.trim() || null,
      price:
        form.priceMode === "inherit"
          ? null
          : form.priceMode === "custom"
            ? form.price
            : "unverified",
      compareAtPrice: form.compareAtPrice || null,
      costPrice: form.costPrice || null,
      stock: form.stock === "" ? null : number(form.stock),
      barcode: form.barcode || null,
      weight: form.weight || null,
      imageUrl: form.imageUrl || null,
      selections,
      isActive: form.isActive ? 1 : 0,
      sortOrder: number(form.sortOrder),
    };
  }
  if (draft.mode === "update")
    fields = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) =>
          (form as any)[key] !== (baseline as any)[key] ||
          (key === "price" &&
            form.type === "variant" &&
            baseline.type === "variant" &&
            form.priceMode !== baseline.priceMode)
      )
    );
  return productDetailWrite.safeParse({ ...common, fields });
}
const entry = z
  .object({ savedAt: z.number().finite(), draft: detailDraft })
  .strict();
const prefix = "sary:product-detail:v1:";
const scopeId = (scope: string) => {
  const parsed = /^[1-9]\d*:[1-9]\d*:product-details:([1-9]\d*)$/.exec(scope);
  if (
    !parsed ||
    !Number.isSafeInteger(Number(parsed[1])) ||
    Number(parsed[1]) > 2147483647
  )
    throw Error("Invalid product detail scope");
  return Number(parsed[1]);
};
function checked(scope: string, raw: unknown) {
  const value = entry.parse(raw);
  if (value.draft.productId !== scopeId(scope))
    throw Error("Product detail scope mismatch");
  return value;
}
export function readDetailDraft(scope: string): DetailDraft | null {
  scopeId(scope);
  const raw = sessionStorage.getItem(prefix + scope);
  if (!raw) return null;
  if (raw.length > 100000) throw Error("Product detail draft too large");
  const value = checked(scope, JSON.parse(raw));
  if (
    !value.draft.attempt &&
    (value.savedAt > Date.now() || Date.now() - value.savedAt > 86400000)
  ) {
    sessionStorage.removeItem(prefix + scope);
    return null;
  }
  return value.draft;
}
export function saveDetailDraft(
  scope: string,
  draft: DetailDraft,
  epoch: number
) {
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  const value = JSON.stringify(checked(scope, { savedAt: Date.now(), draft }));
  if (value.length > 100000) throw Error("Product detail draft too large");
  sessionStorage.setItem(prefix + scope, value);
  if (sessionStorage.getItem(prefix + scope) !== value)
    throw Error("Product detail storage unavailable");
}
export function clearDetailDraft(scope: string, epoch: number) {
  scopeId(scope);
  if (epoch !== knowledgeCacheEpoch()) throw Error("Session changed");
  sessionStorage.removeItem(prefix + scope);
  if (sessionStorage.getItem(prefix + scope) !== null)
    throw Error("Product detail cleanup unavailable");
}
