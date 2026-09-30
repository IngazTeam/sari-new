// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  optionToForm,
  variantToForm,
  detailFormRequest,
  detailDraft,
  readDetailDraft,
  saveDetailDraft,
  clearDetailDraft,
  type DetailDraft,
} from "../client/src/lib/product-details-workspace";
import {
  knowledgeCacheEpoch,
  clearKnowledgeWorkspace,
} from "../client/src/lib/knowledge-workspace-cache";
import type { ProductVariantRow } from "../shared/product-details";
const scope = "9:7:product-details:3",
  requestId = "11111111-1111-4111-8111-111111111111",
  digest = "a".repeat(64);
const row: ProductVariantRow = {
  id: 4,
  merchantId: 7,
  productId: 3,
  name: "Variant",
  sku: null,
  price: 1234,
  priceUnit: "minor",
  compareAtPrice: 1500,
  costPrice: 0,
  stock: null,
  barcode: null,
  weight: null,
  imageUrl: null,
  options: null,
  isActive: 1,
  sortOrder: 0,
};
const draft = (patch: Partial<DetailDraft> = {}): DetailDraft => {
  const form = variantToForm(row);
  return {
    productId: 3,
    mode: "update",
    id: 4,
    digest,
    form: { ...form, name: "Changed" },
    baseline: form,
    ...patch,
  };
};
const attempt = (d = draft()) => {
  const result = detailFormRequest(d, requestId);
  if (!result.success) throw result.error;
  return result.data;
};
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("product detail draft boundaries", () => {
  it("patches only the changed variant field and preserves exact decimal and unknown quantity", () => {
    const d = draft();
    expect(d.baseline).toMatchObject({
      price: "12.34",
      costPrice: "0.00",
      stock: "",
      selections: "[]",
      priceMode: "custom",
    });
    expect(attempt(d).fields).toEqual({ name: "Changed" });
  });
  it("separates price inheritance from old unverified money", () => {
    const form = variantToForm({
      ...row,
      priceUnit: "unverified",
      price: 12,
      costPrice: 5,
    });
    expect(form).toMatchObject({
      priceMode: "unverified",
      price: "",
      costPrice: "",
    });
    expect(
      attempt(draft({ baseline: form, form: { ...form, name: "Rename" } }))
        .fields
    ).toEqual({ name: "Rename" });
    expect(
      attempt(
        draft({ baseline: form, form: { ...form, priceMode: "inherit" } })
      ).fields
    ).toEqual({ price: null });
    expect(
      attempt(
        draft({
          baseline: form,
          form: { ...form, priceMode: "custom", price: "0" },
        })
      ).fields
    ).toEqual({ price: "0" });
    expect(
      detailFormRequest(
        draft({ baseline: form, form: { ...form, price: "1" } }),
        requestId
      ).success
    ).toBe(false);
  });
  it("does not clear unreadable legacy option values or selections during unrelated edits", () => {
    const option = optionToForm({
      id: 1,
      merchantId: 7,
      productId: 3,
      name: "Size",
      nameEn: null,
      sortOrder: 0,
      values: "bad JSON",
    });
    expect(option.values).toBe("");
    expect(
      attempt(draft({ baseline: option, form: { ...option, nameEn: "Size" } }))
        .fields
    ).toEqual({ nameEn: "Size" });
    const variant = variantToForm({ ...row, options: "bad JSON" });
    expect(variant.selections).toBe("");
    expect(
      attempt(
        draft({ baseline: variant, form: { ...variant, name: "Rename" } })
      ).fields
    ).toEqual({ name: "Rename" });
    expect(
      attempt(
        draft({ baseline: variant, form: { ...variant, selections: "[]" } })
      ).fields
    ).toEqual({ selections: [] });
  });
  it("parses one option value per line and rejects normalized duplicates", () => {
    const baseline = optionToForm(),
      form = { ...baseline, name: "Size", values: "S\n\nL\r\n XL " };
    expect(
      attempt(draft({ mode: "create", id: null, form, baseline })).fields
    ).toEqual({
      name: "Size",
      nameEn: null,
      values: ["S", "L", "XL"],
      sortOrder: 0,
    });
    expect(
      detailFormRequest(
        draft({
          mode: "create",
          id: null,
          form: { ...form, values: "S\ns" },
          baseline,
        }),
        requestId
      ).success
    ).toBe(false);
  });
  it.each(["1e3", "-1", "1.5", "2147483648"])(
    "rejects invalid quantity %s",
    stock => {
      const baseline = variantToForm();
      expect(
        detailFormRequest(
          draft({
            mode: "create",
            id: null,
            baseline,
            form: { ...baseline, name: "New", stock },
          }),
          requestId
        ).success
      ).toBe(false);
    }
  );
  it("keeps zero quantities, inherited prices and missing cost distinct on creation", () => {
    const baseline = variantToForm(),
      form = { ...baseline, name: "New" };
    expect(
      attempt(draft({ mode: "create", id: null, form, baseline })).fields
    ).toMatchObject({
      stock: 0,
      price: null,
      costPrice: null,
      compareAtPrice: null,
      selections: [],
    });
  });
  it("persists ordinary invalid drafts for correction but rejects mismatched submitted attempts", () => {
    const d = draft();
    if (d.form.type !== "variant") throw Error();
    saveDetailDraft(
      scope,
      { ...d, form: { ...d.form, stock: "bad" } },
      knowledgeCacheEpoch()
    );
    expect(readDetailDraft(scope)?.form).toMatchObject({ stock: "bad" });
    expect(() =>
      saveDetailDraft(
        scope,
        { ...d, form: { ...d.form, name: "Other" }, attempt: attempt(d) },
        knowledgeCacheEpoch()
      )
    ).toThrow("mismatch");
    expect(detailDraft.safeParse({ ...d, id: null }).success).toBe(false);
    expect(
      detailDraft.safeParse({ ...d, baseline: optionToForm() }).success
    ).toBe(false);
  });
  it("isolates actor, tenant and product, including an attempted cross-product cache copy", () => {
    saveDetailDraft(
      scope,
      { ...draft(), attempt: attempt() },
      knowledgeCacheEpoch()
    );
    for (const other of [
      "8:7:product-details:3",
      "9:8:product-details:3",
      "9:7:product-details:4",
    ])
      expect(readDetailDraft(other)).toBeNull();
    expect(() =>
      saveDetailDraft("9:7:product-details:4", draft(), knowledgeCacheEpoch())
    ).toThrow("scope");
  });
  it.each([
    "9:7:products",
    "0:7:product-details:3",
    "9:7:product-details:0",
    "9:7:product-details:2147483648",
  ])("rejects invalid scope %s", scope =>
    expect(() => readDetailDraft(scope)).toThrow()
  );
  it("expires only unsubmitted drafts and keeps a pending deletion for receipt recovery", () => {
    const now = Date.now();
    saveDetailDraft(scope, draft(), knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readDetailDraft(scope)).toBeNull();
    vi.restoreAllMocks();
    const d = draft({ mode: "delete" }),
      a = attempt(d);
    expect(a).toMatchObject({ kind: "variant_delete", id: 4, productId: 3 });
    saveDetailDraft(scope, { ...d, attempt: a }, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readDetailDraft(scope)?.attempt).toEqual(a);
  });
  it("fails on silent or throwing storage failures and oversized or corrupted stored data", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveDetailDraft(scope, draft(), knowledgeCacheEpoch())
    ).toThrow("unavailable");
    vi.restoreAllMocks();
    for (const raw of ["bad", "x".repeat(100001)]) {
      sessionStorage.setItem("sary:product-detail:v1:" + scope, raw);
      expect(() => readDetailDraft(scope)).toThrow();
    }
  });
  it("clears on logout and rejects stale writes and cleanups", () => {
    const epoch = knowledgeCacheEpoch();
    saveDetailDraft(scope, { ...draft(), attempt: attempt() }, epoch);
    clearKnowledgeWorkspace();
    expect(readDetailDraft(scope)).toBeNull();
    expect(() => saveDetailDraft(scope, draft(), epoch)).toThrow("Session");
    expect(() => clearDetailDraft(scope, epoch)).toThrow("Session");
  });
  it("does not claim successful cleanup when storage ignores removal", () => {
    saveDetailDraft(scope, draft(), knowledgeCacheEpoch());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {});
    expect(() => clearDetailDraft(scope, knowledgeCacheEpoch())).toThrow(
      "cleanup"
    );
  });
});
