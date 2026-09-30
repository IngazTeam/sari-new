import { describe, it, expect } from "vitest";
import {
  productDetailsSnapshot,
  productDetailWrite,
  productDetailReceipt,
  planProductDetailChange,
  readOptionValues,
  readVariantSelections,
  type ProductDetailsSnapshot,
  type ProductOptionRow,
  type ProductVariantRow,
} from "../shared/product-details";
const digest = "a".repeat(64),
  requestId = "11111111-1111-4111-8111-111111111111";
const request = {
  productId: 3,
  requestId,
  expectedDigest: digest,
  reviewed: true,
};
const option = (
  id = 1,
  patch: Partial<ProductOptionRow> = {}
): ProductOptionRow => ({
  id,
  merchantId: 7,
  productId: 3,
  name: "Size",
  nameEn: "Size",
  values: '["S","L"]',
  sortOrder: 0,
  ...patch,
});
const variant = (
  id = 1,
  patch: Partial<ProductVariantRow> = {}
): ProductVariantRow => ({
  id,
  merchantId: 7,
  productId: 3,
  name: "Small",
  sku: "S-1",
  price: 1234,
  priceUnit: "minor",
  compareAtPrice: 1500,
  costPrice: 0,
  stock: null,
  barcode: null,
  weight: null,
  imageUrl: null,
  options: '[{"optionId":1,"value":"S"}]',
  isActive: 1,
  sortOrder: 0,
  ...patch,
});
const snapshot = (
  patch: Partial<ProductDetailsSnapshot> = {}
): ProductDetailsSnapshot => ({
  merchantId: 7,
  actorId: 9,
  productId: 3,
  productName: "Coffee",
  currency: "SAR",
  hasVariants: 1,
  canManage: true,
  locked: false,
  digest,
  options: [option()],
  variants: [variant()],
  ...patch,
});
const fields = {
  name: "Large",
  sku: "L-1",
  price: "12.34",
  compareAtPrice: null,
  costPrice: "0",
  stock: null,
  barcode: null,
  weight: null,
  imageUrl: null,
  selections: [{ optionId: 1, value: "L" }],
  isActive: 1,
  sortOrder: 0,
};
const plan = (input: object, source = snapshot()) =>
  planProductDetailChange(source, { ...request, ...input });
const add = (patch = {}) => ({
  kind: "variant_create",
  fields: { ...fields, ...patch },
});
const update = (fields: object) => ({ kind: "variant_update", id: 1, fields });
describe("product option and variant review plan", () => {
  it.each([
    { stock: -1 },
    { stock: 1.2 },
    { stock: 2147483648 },
    { isActive: 3 },
    { sortOrder: -1 },
    { price: "1.005" },
    { costPrice: "NaN" },
    { price: "-1" },
    { price: "21474836.48" },
    { name: " " },
    { name: "x".repeat(256) },
    { imageUrl: "javascript:alert(1)" },
    { imageUrl: "https://user:pass@example.test/a" },
    { sku: "x".repeat(101) },
    {
      selections: [
        { optionId: 1, value: "S" },
        { optionId: 1, value: "L" },
      ],
    },
    { barcode: "a\u0000b" },
  ])("rejects invalid variant values %j", patch => {
    expect(
      productDetailWrite.safeParse({ ...request, ...add(patch) }).success
    ).toBe(false);
  });
  it("converts exact money, keeps zero cost and unknown stock distinct, and permits inherited price", () => {
    const result = plan(add());
    expect(result.after).toMatchObject({
      price: 1234,
      costPrice: 0,
      stock: null,
      priceUnit: "minor",
      options: '[{"optionId":1,"value":"L"}]',
    });
    expect(result.hasVariants).toBe(1);
    expect(plan(add({ price: null })).after).toMatchObject({
      price: null,
      costPrice: 0,
    });
  });
  it("preserves unverified auxiliary money on unrelated edits but clears it on explicit price verification", () => {
    const source = snapshot({
      variants: [
        variant(1, {
          priceUnit: "unverified",
          price: 100,
          costPrice: 40,
          compareAtPrice: 120,
        }),
      ],
    });
    expect(plan(update({ name: "Renamed" }), source).after).toMatchObject({
      price: 100,
      priceUnit: "unverified",
      costPrice: 40,
      compareAtPrice: 120,
    });
    expect(() => plan(update({ costPrice: "2" }), source)).toThrow(
      "price_review"
    );
    expect(plan(update({ price: "1.00" }), source).after).toMatchObject({
      price: 100,
      priceUnit: "minor",
      costPrice: null,
      compareAtPrice: null,
    });
    expect(
      plan(update({ price: null, costPrice: "0" }), source).after
    ).toMatchObject({ price: null, priceUnit: "minor", costPrice: 0 });
  });
  it("allows clearing unknown cost without asserting price units", () => {
    expect(
      plan(
        update({ costPrice: null }),
        snapshot({
          variants: [variant(1, { priceUnit: "unverified", costPrice: 20 })],
        })
      ).after
    ).toMatchObject({ priceUnit: "unverified", costPrice: null });
  });
  it.each([
    { canManage: false },
    { locked: true },
    { productId: 4, options: [], variants: [] },
    { digest: "b".repeat(64) },
    { options: [option(1, { merchantId: 8 })] },
    { variants: [variant(1, { productId: 4 })] },
    { variants: [variant(), variant()] },
  ] as Partial<ProductDetailsSnapshot>[])(
    "rejects scope, permission or stale snapshot %j",
    patch => {
      expect(() => plan(add(), snapshot(patch))).toThrow();
    }
  );
  it("validates snapshot and receipt identities and rejects unknown write fields", () => {
    expect(productDetailsSnapshot.safeParse(snapshot()).success).toBe(true);
    expect(
      productDetailWrite.safeParse({ ...request, ...add(), merchantId: 8 })
        .success
    ).toBe(false);
    expect(
      productDetailReceipt.safeParse({
        merchantId: 7,
        actorId: 9,
        productId: 3,
        requestId,
        detailId: 2,
        kind: "variant_create",
        digest,
        confirmedAt: "2026-09-30T12:00:00.000Z",
      }).success
    ).toBe(true);
  });
  it("rejects duplicate option names and normalized option values", () => {
    expect(() =>
      plan({
        kind: "option_create",
        fields: { name: " size ", nameEn: null, values: ["a"], sortOrder: 0 },
      })
    ).toThrow("duplicate");
    for (const values of [
      [],
      ["S", "s"],
      ["Ａ", "A"],
      Array.from({ length: 101 }, (_, i) => String(i)),
    ])
      expect(
        productDetailWrite.safeParse({
          ...request,
          kind: "option_create",
          fields: { name: "Colour", nameEn: null, values, sortOrder: 0 },
        }).success
      ).toBe(false);
  });
  it("reads supported legacy mapping only when option identity and values are exact", () => {
    expect(readVariantSelections('{"Size":"S"}', [option()])).toEqual([
      { optionId: 1, value: "S" },
    ]);
    for (const raw of ['{"size":"S"}', '{"Size":"XL"}', "oops", "42", '["S"]'])
      expect(readVariantSelections(raw, [option()])).toBeNull();
    expect(
      readVariantSelections('{"Size":"S"}', [option(), option(2)])
    ).toBeNull();
    expect(readOptionValues("oops")).toBeNull();
    expect(readVariantSelections(null, [option()])).toEqual([]);
  });
  it("blocks deletion and removed values used by variants but preserves unrelated option edits", () => {
    expect(() => plan({ kind: "option_delete", id: 1 })).toThrow("in_use");
    expect(() =>
      plan({ kind: "option_update", id: 1, fields: { values: ["L"] } })
    ).toThrow("in_use");
    expect(
      plan({
        kind: "option_update",
        id: 1,
        fields: { name: "الحجم", nameEn: "Size" },
      }).after
    ).toMatchObject({ name: "الحجم", values: '["S","L"]' });
    expect(
      plan({
        kind: "option_update",
        id: 1,
        fields: { values: ["S", "L", "XL"] },
      }).after
    ).toMatchObject({ values: '["S","L","XL"]' });
  });
  it("protects legacy name mappings and unreadable selections from destructive option edits", () => {
    expect(() =>
      plan(
        { kind: "option_update", id: 1, fields: { name: "Other" } },
        snapshot({ variants: [variant(1, { options: '{"Size":"S"}' })] })
      )
    ).toThrow("in_use");
    const source = snapshot({ variants: [variant(1, { options: "unknown" })] });
    expect(() => plan({ kind: "option_delete", id: 1 }, source)).toThrow(
      "unreadable"
    );
    expect(
      plan({ kind: "option_update", id: 1, fields: { sortOrder: 1 } }, source)
        .after
    ).toMatchObject({ sortOrder: 1 });
    expect(plan(update({ name: "Rename only" }), source).after).toMatchObject({
      options: "unknown",
    });
    expect(
      plan(update({ selections: [{ optionId: 1, value: "L" }] }), source).after
    ).toMatchObject({ options: '[{"optionId":1,"value":"L"}]' });
  });
  it("rejects nonexistent options, values, duplicate names, SKUs and combinations", () => {
    for (const selections of [
      [{ optionId: 8, value: "L" }],
      [{ optionId: 1, value: "XL" }],
    ])
      expect(() => plan(add({ selections }))).toThrow("selection");
    for (const patch of [
      { name: " small " },
      { sku: "s-1" },
      { selections: [{ optionId: 1, value: "S" }] },
    ])
      expect(() => plan(add(patch))).toThrow("duplicate");
    expect(plan(add({ selections: [] })).after).toMatchObject({
      options: "[]",
    });
  });
  it("bounds creation while allowing correction within legacy larger option lists", () => {
    const options = Array.from({ length: 20 }, (_, i) =>
      option(i + 1, { name: `Option ${i}` })
    );
    expect(() =>
      plan(
        {
          kind: "option_create",
          fields: { name: "New", nameEn: null, values: ["A"], sortOrder: 0 },
        },
        snapshot({ options })
      )
    ).toThrow("limit");
    expect(
      plan(
        { kind: "option_update", id: 20, fields: { sortOrder: 1 } },
        snapshot({ options })
      ).after
    ).toMatchObject({ id: 20, sortOrder: 1 });
    const variants = Array.from({ length: 500 }, (_, i) =>
      variant(i + 1, { name: `V${i}` })
    );
    expect(() => plan(add(), snapshot({ variants }))).toThrow("limit");
  });
  it("tracks the parent variant flag and refuses no-op or missing changes", () => {
    expect(plan({ kind: "variant_delete", id: 1 }).hasVariants).toBe(0);
    expect(
      plan(
        { kind: "variant_delete", id: 1 },
        snapshot({ variants: [variant(), variant(2)] })
      ).hasVariants
    ).toBe(1);
    expect(() => plan(update({ name: "Small" }))).toThrow("no_change");
    expect(() =>
      plan({ kind: "option_update", id: 1, fields: { sortOrder: 0 } })
    ).toThrow("no_change");
    expect(() => plan({ kind: "variant_delete", id: 9 })).toThrow("missing");
    expect(() => plan({ kind: "option_delete", id: 9 })).toThrow("missing");
  });
  it("ignores undefined patch members without losing stored fields", () => {
    expect(
      plan({
        kind: "option_update",
        id: 1,
        fields: { sortOrder: 2, name: undefined },
      }).after
    ).toMatchObject({ name: "Size", sortOrder: 2 });
    expect(plan(update({ stock: 2, name: undefined })).after).toMatchObject({
      name: "Small",
      stock: 2,
    });
  });
});
