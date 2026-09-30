import { z } from "zod";
import { majorToMinor } from "./product-money";

export const PRODUCT_DETAIL_READ_LIMIT = 500;
export const PRODUCT_OPTION_LIMIT = 20;
export const PRODUCT_OPTION_VALUES_LIMIT = 100;
export const PRODUCT_VARIANT_LIMIT = 500;
const id = z.number().int().positive().max(2147483647);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const name = (max: number) =>
  text(max)
    .transform(v => v.trim())
    .refine(v => v.length > 0);
const key = (v: string) => v.normalize("NFKC").trim().toLocaleLowerCase("en");
const sort = z.number().int().min(0).max(100000);
const active = z.union([z.literal(0), z.literal(1)]);
const money = z
  .string()
  .trim()
  .max(32)
  .refine(value => {
    try {
      majorToMinor(value);
      return true;
    } catch {
      return false;
    }
  })
  .nullable();
const values = z
  .array(name(100))
  .min(1)
  .max(PRODUCT_OPTION_VALUES_LIMIT)
  .refine(v => new Set(v.map(key)).size === v.length);
export const productOptionFields = z
  .object({
    name: name(100),
    nameEn: text(100)
      .transform(v => v.trim())
      .nullable(),
    values,
    sortOrder: sort,
  })
  .strict();
export const variantSelections = z
  .array(z.object({ optionId: id, value: name(100) }).strict())
  .max(PRODUCT_OPTION_LIMIT)
  .refine(v => new Set(v.map(i => i.optionId)).size === v.length);
export const productVariantFields = z
  .object({
    name: name(255),
    sku: text(100)
      .transform(v => v.trim())
      .nullable(),
    price: money,
    compareAtPrice: money,
    costPrice: money,
    stock: z.number().int().min(0).max(2147483647).nullable(),
    barcode: text(100).nullable(),
    weight: text(20).nullable(),
    imageUrl: text(500)
      .refine(value => {
        try {
          const url = new URL(value);
          return (
            ["https:", "http:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      })
      .nullable(),
    selections: variantSelections,
    isActive: active,
    sortOrder: sort,
  })
  .strict();
const scope = { id, merchantId: id, productId: id };
export const productOptionRow = z
  .object({
    ...scope,
    name: text(100),
    nameEn: text(100).nullable(),
    values: z.string().max(65535),
    sortOrder: z.number().int(),
  })
  .strict();
export const productVariantRow = z
  .object({
    ...scope,
    name: text(255),
    sku: text(100).nullable(),
    price: z.number().int().nullable(),
    priceUnit: z.enum(["minor", "unverified"]),
    compareAtPrice: z.number().int().nullable(),
    costPrice: z.number().int().nullable(),
    stock: z.number().int().nullable(),
    barcode: text(100).nullable(),
    weight: text(20).nullable(),
    imageUrl: z.string().max(500).nullable(),
    options: z.string().max(65535).nullable(),
    isActive: active,
    sortOrder: z.number().int(),
  })
  .strict();
export const productDetailsSnapshot = z
  .object({
    merchantId: id,
    actorId: id,
    productId: id,
    productName: z.string().max(255),
    currency: z.enum(["SAR", "USD"]),
    hasVariants: active,
    canManage: z.boolean(),
    locked: z.boolean(),
    digest,
    options: z.array(productOptionRow).max(PRODUCT_DETAIL_READ_LIMIT),
    variants: z.array(productVariantRow).max(PRODUCT_DETAIL_READ_LIMIT),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const name of ["options", "variants"] as const) {
      const rows = v[name];
      if (
        rows.some(
          row =>
            row.merchantId !== v.merchantId || row.productId !== v.productId
        ) ||
        new Set(rows.map(r => r.id)).size !== rows.length
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Product detail scope mismatch",
          path: [name],
        });
    }
  });
const request = {
  productId: id,
  requestId: z.string().uuid(),
  expectedDigest: digest,
  reviewed: z.literal(true),
};
const nonempty = (value: object) =>
  Object.values(value).some(v => v !== undefined);
export const productDetailWrite = z.discriminatedUnion("kind", [
  z
    .object({
      ...request,
      kind: z.literal("option_create"),
      fields: productOptionFields,
    })
    .strict(),
  z
    .object({
      ...request,
      kind: z.literal("option_update"),
      id,
      fields: productOptionFields.partial().refine(nonempty),
    })
    .strict(),
  z.object({ ...request, kind: z.literal("option_delete"), id }).strict(),
  z
    .object({
      ...request,
      kind: z.literal("variant_create"),
      fields: productVariantFields,
    })
    .strict(),
  z
    .object({
      ...request,
      kind: z.literal("variant_update"),
      id,
      fields: productVariantFields.partial().refine(nonempty),
    })
    .strict(),
  z.object({ ...request, kind: z.literal("variant_delete"), id }).strict(),
]);
export const productDetailsRead = z.object({ productId: id }).strict();
export const productDetailReceiptInput = z
  .object({ requestId: z.string().uuid() })
  .strict();
export const productDetailReceipt = z
  .object({
    merchantId: id,
    actorId: id,
    productId: id,
    requestId: z.string().uuid(),
    detailId: id,
    kind: z.enum([
      "option_create",
      "option_update",
      "option_delete",
      "variant_create",
      "variant_update",
      "variant_delete",
    ]),
    digest,
    confirmedAt: z.string().datetime(),
  })
  .strict();
export type ProductOptionRow = z.infer<typeof productOptionRow>;
export type ProductVariantRow = z.infer<typeof productVariantRow>;
export type ProductDetailWrite = z.infer<typeof productDetailWrite>;
export type ProductDetailsSnapshot = z.infer<typeof productDetailsSnapshot>;
export class ProductDetailPlanFailure extends Error {
  constructor(
    public reason:
      | "scope"
      | "locked"
      | "conflict"
      | "missing"
      | "limit"
      | "duplicate"
      | "in_use"
      | "unreadable"
      | "selection"
      | "price_review"
      | "no_change"
  ) {
    super(`product-detail:${reason}`);
  }
}
function fail(reason: ProductDetailPlanFailure["reason"]): never {
  throw new ProductDetailPlanFailure(reason);
}
export function readOptionValues(raw: string): string[] | null {
  try {
    const parsed = values.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function readVariantSelections(
  raw: string | null,
  options: readonly ProductOptionRow[]
) {
  if (raw === null || raw === "") return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  let result = variantSelections.safeParse(value);
  // Legacy name -> value objects are resolved only against exact, unambiguous names.
  if (
    !result.success &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const found = Object.entries(value).map(([name, selection]) => {
      const matches = options.filter(option => option.name === name);
      return {
        optionId: matches.length === 1 ? matches[0].id : 0,
        value: selection,
      };
    });
    result = variantSelections.safeParse(found);
  }
  if (!result.success) return null;
  for (const selection of result.data) {
    const option = options.find(row => row.id === selection.optionId);
    if (!option || !readOptionValues(option.values)?.includes(selection.value))
      return null;
  }
  return result.data.slice().sort((a, b) => a.optionId - b.optionId);
}
function selectionKey(value: z.infer<typeof variantSelections>) {
  return JSON.stringify(value.slice().sort((a, b) => a.optionId - b.optionId));
}
export function planProductDetailChange(
  rawSnapshot: unknown,
  rawInput: unknown
) {
  const snapshot = productDetailsSnapshot.parse(rawSnapshot),
    input = productDetailWrite.parse(rawInput);
  if (snapshot.productId !== input.productId) fail("scope");
  if (!snapshot.canManage || snapshot.locked) fail("locked");
  if (snapshot.digest !== input.expectedDigest) fail("conflict");
  if (
    input.kind === "option_create" ||
    input.kind === "option_update" ||
    input.kind === "option_delete"
  ) {
    const before =
      input.kind === "option_create"
        ? null
        : (snapshot.options.find(row => row.id === input.id) ??
          fail("missing"));
    if (
      input.kind === "option_create" &&
      snapshot.options.length >= PRODUCT_OPTION_LIMIT
    )
      fail("limit");
    const after: ProductOptionRow | null =
      input.kind === "option_delete"
        ? null
        : ({
            ...(before ?? {
              id: -1,
              merchantId: snapshot.merchantId,
              productId: snapshot.productId,
            }),
            ...Object.fromEntries(
              Object.entries(input.fields).filter(
                ([, value]) => value !== undefined
              )
            ),
            values:
              "values" in input.fields && input.fields.values !== undefined
                ? JSON.stringify(input.fields.values)
                : before!.values,
          } as ProductOptionRow);
    if (
      after &&
      snapshot.options.some(
        row => row.id !== after.id && key(row.name) === key(after.name)
      )
    )
      fail("duplicate");
    const next = snapshot.options
      .filter(row => row.id !== before?.id)
      .concat(after ? [after] : []);
    const structureChanged =
      !!before &&
      (!after || before.name !== after.name || before.values !== after.values);
    if (structureChanged)
      for (const variant of snapshot.variants) {
        const old = readVariantSelections(variant.options, snapshot.options);
        if (!old) fail("unreadable");
        if (
          old.some(selection => selection.optionId === before.id) &&
          (!after || readVariantSelections(variant.options, next) === null)
        )
          fail("in_use");
      }
    const changes =
      after && "fields" in input
        ? Object.keys(input.fields).filter(
            k => (after as any)[k] !== (before as any)?.[k]
          )
        : [];
    if (after && !changes.length) fail("no_change");
    return {
      kind: input.kind,
      before,
      after,
      changes,
      hasVariants: snapshot.variants.length > 0 ? (1 as const) : (0 as const),
    };
  }
  const before =
    input.kind === "variant_create"
      ? null
      : (snapshot.variants.find(row => row.id === input.id) ?? fail("missing"));
  if (input.kind === "variant_delete")
    return {
      kind: input.kind,
      before,
      after: null,
      changes: [],
      hasVariants: snapshot.variants.length > 1 ? (1 as const) : (0 as const),
    };
  if (
    input.kind === "variant_create" &&
    snapshot.variants.length >= PRODUCT_VARIANT_LIMIT
  )
    fail("limit");
  const fields = input.fields;
  if (
    before?.priceUnit === "unverified" &&
    fields.price === undefined &&
    (fields.costPrice != null || fields.compareAtPrice != null)
  )
    fail("price_review");
  const after = { ...before } as ProductVariantRow;
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (["price", "costPrice", "compareAtPrice"].includes(field))
      (after as any)[field] =
        value === null ? null : majorToMinor(value as string);
    else if (field === "selections")
      after.options = selectionKey(value as z.infer<typeof variantSelections>);
    else (after as any)[field] = value;
  }
  if (!before)
    Object.assign(after, {
      id: -1,
      merchantId: snapshot.merchantId,
      productId: snapshot.productId,
      priceUnit: "minor",
    });
  else if (before.priceUnit === "unverified" && fields.price !== undefined) {
    after.priceUnit = "minor";
    if (fields.costPrice === undefined) after.costPrice = null;
    if (fields.compareAtPrice === undefined) after.compareAtPrice = null;
  }
  const selections =
    fields.selections === undefined
      ? undefined
      : readVariantSelections(after.options, snapshot.options);
  if (selections === null) fail("selection");
  for (const row of snapshot.variants.filter(row => row.id !== before?.id)) {
    if (fields.name !== undefined && key(row.name) === key(after.name))
      fail("duplicate");
    if (fields.sku && row.sku && key(row.sku) === key(fields.sku))
      fail("duplicate");
    const other = readVariantSelections(row.options, snapshot.options);
    if (
      selections?.length &&
      other &&
      selectionKey(selections) === selectionKey(other)
    )
      fail("duplicate");
  }
  const changes = Object.keys(after).filter(
    k =>
      !["id", "merchantId", "productId"].includes(k) &&
      (after as any)[k] !== (before as any)?.[k]
  );
  if (!changes.length) fail("no_change");
  return { kind: input.kind, before, after, changes, hasVariants: 1 as const };
}
