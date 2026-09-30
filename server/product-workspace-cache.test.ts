// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readProductWorkspaceCache,
  saveProductWorkspaceCache,
  clearProductWorkspaceCache,
} from "../client/src/lib/product-workspace-cache";
import {
  newProductForm,
  productToForm,
  productFormRequest,
  productPricePreview,
} from "../client/src/lib/product-workspace-model";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:products",
  requestId = "11111111-1111-4111-8111-111111111111",
  digest = "a".repeat(64);
const baseline = newProductForm("SAR"),
  form = { ...baseline, name: "New product", price: "0" };
const draft = {
  kind: "editor" as const,
  target: "new" as const,
  baseline,
  form,
  digest: null,
};
const attempt = () => {
  const result = productFormRequest("new", form, baseline, null, requestId);
  if (!result.success) throw result.error;
  return result.data;
};
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("product drafts and form boundaries", () => {
  it("isolates actor and merchant and clears drafts on logout", () => {
    saveProductWorkspaceCache(
      scope,
      { ...draft, attempt: attempt() },
      knowledgeCacheEpoch()
    );
    expect(readProductWorkspaceCache(scope)?.attempt).toEqual(attempt());
    expect(readProductWorkspaceCache("8:20:products")).toBeNull();
    expect(readProductWorkspaceCache("7:21:products")).toBeNull();
    clearKnowledgeWorkspace();
    expect(readProductWorkspaceCache(scope)).toBeNull();
  });
  it("expires only unsubmitted drafts, keeping uncertain creation and deletion requests", () => {
    const now = Date.now();
    saveProductWorkspaceCache(scope, draft, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readProductWorkspaceCache(scope)).toBeNull();
    vi.restoreAllMocks();
    saveProductWorkspaceCache(
      scope,
      { ...draft, attempt: attempt() },
      knowledgeCacheEpoch()
    );
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readProductWorkspaceCache(scope)?.attempt).toEqual(attempt());
    vi.restoreAllMocks();
    const deletion = {
      kind: "delete" as const,
      attempt: {
        ids: [1],
        expectedDigest: digest,
        reviewed: true as const,
        requestId,
      },
    };
    saveProductWorkspaceCache(scope, deletion, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readProductWorkspaceCache(scope)).toEqual(deletion);
  });
  it("rejects old callbacks and pending payloads that disagree with the draft or target", () => {
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(() => saveProductWorkspaceCache(scope, draft, epoch)).toThrow();
    expect(() => clearProductWorkspaceCache(scope, epoch)).toThrow();
    expect(() =>
      saveProductWorkspaceCache(
        scope,
        { ...draft, form: { ...form, name: "Different" }, attempt: attempt() },
        knowledgeCacheEpoch()
      )
    ).toThrow("mismatch");
    expect(() =>
      saveProductWorkspaceCache(
        scope,
        { ...draft, target: 2 },
        knowledgeCacheEpoch()
      )
    ).toThrow();
  });
  it("fails explicitly when storage ignores a write or contains invalid data", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveProductWorkspaceCache(scope, draft, knowledgeCacheEpoch())
    ).toThrow("unavailable");
    vi.restoreAllMocks();
    sessionStorage.setItem("sary:product-workspace:v1:" + scope, "bad json");
    expect(() => readProductWorkspaceCache(scope)).toThrow();
  });
  it.each([
    "",
    "0:20:products",
    "7:0:products",
    "7:20:customers",
    "7:20:products:2",
  ])("rejects invalid cache identity %s", value => {
    expect(() => readProductWorkspaceCache(value)).toThrow();
  });
  it("sends explicit nulls for cleared fields without rewriting unchanged values", () => {
    const base = {
      ...form,
      sku: "SKU",
      description: "Old",
      compareAtPrice: "10.00",
    };
    const result = productFormRequest(
      2,
      { ...base, sku: "", description: "", compareAtPrice: "" },
      base,
      digest,
      requestId
    );
    expect(result.success && result.data).toEqual({
      kind: "update",
      id: 2,
      expectedDigest: digest,
      requestId,
      fields: { description: null, sku: null, compareAtPrice: null },
    });
  });
  it("keeps long historical descriptions and unverified money out of an unrelated patch", () => {
    const row = {
      ...form,
      id: 2,
      merchantId: 20,
      price: 100,
      priceUnit: "unverified",
      compareAtPrice: 200,
      costPrice: 50,
      description: "A".repeat(20000),
      stock: null,
      lowStockAlert: 5,
      trackInventory: 1,
    } as any;
    const base = productToForm(row);
    expect(base.price).toBe("");
    expect(base.stock).toBe("");
    const changed = { ...base, name: "Renamed" };
    expect(
      productFormRequest(2, changed, base, digest, requestId)
    ).toMatchObject({ success: true, data: { fields: { name: "Renamed" } } });
    saveProductWorkspaceCache(
      scope,
      { kind: "editor", target: 2, form: changed, baseline: base, digest },
      knowledgeCacheEpoch()
    );
    expect(readProductWorkspaceCache(scope)?.kind).toBe("editor");
  });
  it.each(["1.005", "1x", "-1", "NaN", "1e3"])(
    "rejects price %s without parseFloat truncation",
    price => {
      expect(
        productFormRequest("new", { ...form, price }, baseline, null, requestId)
          .success
      ).toBe(false);
    }
  );
  it.each(["1.5", "2x", "-1", "1e3"])(
    "rejects quantity %s without parseInt truncation",
    stock => {
      expect(
        productFormRequest("new", { ...form, stock }, baseline, null, requestId)
          .success
      ).toBe(false);
    }
  );
  it("handles free prices, zero cost and negative margins without Infinity or NaN", () => {
    expect(
      productPricePreview({
        ...form,
        price: "0",
        costPrice: "1",
        compareAtPrice: "0",
      })
    ).toEqual({ margin: null, discount: null });
    expect(
      productPricePreview({
        ...form,
        price: "10",
        costPrice: "0",
        compareAtPrice: "20",
      })
    ).toEqual({ margin: 100, discount: 50 });
    expect(
      productPricePreview({
        ...form,
        price: "10",
        costPrice: "20",
        compareAtPrice: "5",
      })
    ).toEqual({ margin: -100, discount: null });
  });
});
