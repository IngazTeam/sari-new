// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  error: null as any,
  fetching: false,
  paused: false,
  language: "en",
  updated: 10,
  inputs: {} as any,
  refresh: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  deleteWrite: vi.fn(),
  deleteReceipt: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => {
  const query = (name: string) => ({
    useQuery: (input: any) => {
      m.inputs[name] = input;
      return {
        data: m.data[name],
        error: m.error,
        isFetching: m.fetching,
        isLoading: false,
        fetchStatus: m.paused ? "paused" : "idle",
        dataUpdatedAt: m.updated,
        refetch: m.refresh,
      };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        products: {
          editor: {
            receipt: { fetch: m.receipt },
            deleteReceipt: { fetch: m.deleteReceipt },
          },
        },
      }),
      products: {
        list: query("list"),
        getLowStock: query("stock"),
        categories: { read: query("categories") },
        editor: {
          read: query("read"),
          deleteReview: query("deletion"),
          write: { useMutation: () => ({ mutateAsync: m.write }) },
          deleteWrite: { useMutation: () => ({ mutateAsync: m.deleteWrite }) },
        },
      },
    },
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, values: any = {}) =>
      String(
        key
          .split(".")
          .reduce((v: any, k) => v?.[k], m.language === "ar" ? ar : en) ?? key
      ).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")),
  }),
}));
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind, onRetry }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      onRetry && React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (error: any) =>
    error?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : error?.data?.code === "UNAUTHORIZED"
        ? "session"
        : "error",
}));
import { ProductCatalogWorkspace } from "../client/src/components/merchant/ProductCatalogWorkspace";
import { ProductStockWorkspace } from "../client/src/components/merchant/ProductStockWorkspace";
import { productStockInput } from "../shared/product-stock";
import { ProductEditorWorkspace } from "../client/src/components/merchant/ProductEditorWorkspace";
import { ProductDeleteWorkspace } from "../client/src/components/merchant/ProductDeleteWorkspace";
import { productCatalogInput } from "../shared/product-catalog";
import {
  readProductWorkspaceCache,
  saveProductWorkspaceCache,
} from "../client/src/lib/product-workspace-cache";
import {
  newProductForm,
  productFormRequest,
} from "../client/src/lib/product-workspace-model";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:products",
  digest = "a".repeat(64),
  requestId = "11111111-1111-4111-8111-111111111111",
  readAt = "2026-09-30T12:00:00.000Z";
const row = {
  id: 81,
  merchantId: 20,
  name: "<script>literal</script>",
  description: "Full description",
  price: 125,
  priceUnit: "minor",
  currency: "SAR",
  imageUrl: null,
  stock: null,
  sku: "SKU",
  barcode: null,
  compareAtPrice: null,
  costPrice: null,
  weight: null,
  category: "Category",
  categoryId: null,
  tags: null,
  productType: "physical",
  status: "active",
  lowStockAlert: 5,
  trackInventory: 1,
  isActive: 1,
  hasVariants: 0,
  sallaProductId: null,
};
let host: HTMLDivElement, root: Root, completed: ReturnType<typeof vi.fn>;
function fixtures() {
  return {
    stock: {
      merchantId: 20, readAt, selection: productStockInput.parse({}),
      items: [
        { merchantId: 20, productId: 81, variantId: null, kind: "product", productName: row.name, name: row.name, sku: "SKU", stock: 0, threshold: 5, state: "out", issue: null },
        { merchantId: 20, productId: 82, variantId: 3, kind: "variant", productName: "Coffee", name: "Large", sku: "LARGE", stock: 2, threshold: 5, state: "low", issue: null },
        { merchantId: 20, productId: 83, variantId: null, kind: "product", productName: "Missing variants", name: "Missing variants", sku: null, stock: null, threshold: null, state: "unknown", issue: "no_available_variants" },
      ], total: 3, totalPages: 1, summary: { out: 1, low: 1, unknown: 1, total: 3 },
    },
    categories: { merchantId: 20, actorId: 7, canManage: true, locked: false, digest, rows: [
      { id: 1, merchantId: 20, name: "Coffee", nameEn: null, parentId: null, sortOrder: 0, isActive: 1, productCount: 0 },
      { id: 2, merchantId: 20, name: "Inactive", nameEn: null, parentId: null, sortOrder: 0, isActive: 0, productCount: 0 },
    ] },
    list: {
      merchantId: 20,
      canManage: true,
      readAt,
      selection: productCatalogInput.parse({ pageSize: 20 }),
      currency: "SAR",
      integrationSource: "none",
      items: [row],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      summary: {
        all: 1,
        out: 0,
        low: 0,
        untracked: 0,
        unknown: 1,
        priceReview: 0,
        variants: 0,
        notApplicable: 0,
      },
    },
    read: {
      merchantId: 20,
      selection: { id: 81 },
      product: row,
      digest,
      external: false,
      canManage: true,
      integrationSource: "none",
      locked: false,
    },
    deletion: {
      merchantId: 20,
      selection: { ids: [81] },
      digest,
      canManage: true,
      canDelete: true,
      items: [
        {
          ...row,
          variants: 2,
          options: 1,
          locked: false,
          blocked: false,
          references: {
            rewards: 0,
            comparisons: 0,
            reviews: 0,
            promotions: 0,
            unreadablePromotions: 0,
            foreignDetails: 0,
          },
        },
      ],
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  sessionStorage.clear();
  clearKnowledgeWorkspace();
  m.data = fixtures();
  m.error = null;
  m.fetching = false;
  m.paused = false;
  m.language = "en";
  m.inputs = {};
  m.updated = 10;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  completed = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const render = async (node: React.ReactNode) =>
  act(async () => root.render(node));
const button = (label: string) => {
  const found = [...host.querySelectorAll("button")].find(
    value => value.textContent === label
  );
  if (!found) throw Error("Missing button: " + label);
  return found;
};
const click = async (node: HTMLElement) => act(async () => node.click());
async function change(selector: string, value: string) {
  const node = host.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const editor = (target: number | "new" = 81) =>
  React.createElement(ProductEditorWorkspace, {
    scope,
    target,
    currency: "SAR",
    canManage: true,
    back: vi.fn(),
    completed,
  });
const deletion = () =>
  React.createElement(ProductDeleteWorkspace, {
    scope,
    ids: [81],
    canManage: true,
    back: vi.fn(),
    completed,
  });
describe("stock attention workspace", () => {
  const selection = productStockInput.parse({});
  const selected = vi.fn(), opened = vi.fn(), back = vi.fn();
  const screen = (input = selection) => React.createElement(ProductStockWorkspace, {
    scope, selection: input, onSelection: selected, open: opened, back,
  });
  async function select(index: number, value: string) {
    const node = host.querySelectorAll("select")[index];
    await act(async () => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); });
  }
  it("separates variants from parents, explains setup gaps and navigates to the appropriate editor", async () => {
    await render(screen());
    expect(host.querySelectorAll(".pw-catalog-list > li")).toHaveLength(3);
    expect(host.textContent).toContain(en.stockUx.noVariants);
    expect(host.textContent).toContain(en.stockUx.scope);
    expect(host.textContent).toContain(en.stockUx.summaryHint);
    expect(host.querySelector("script")).toBeNull();
    await click(button(en.stockUx.openProduct));
    expect(opened).toHaveBeenLastCalledWith(81, false);
    const actions = [...host.querySelectorAll("button")].filter(node => node.textContent === en.stockUx.openVariants);
    await click(actions[0]); expect(opened).toHaveBeenLastCalledWith(82, true);
    await click(actions[1]); expect(opened).toHaveBeenLastCalledWith(83, true);
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each(["foreign", "selection", "malformed", "error", "offline", "loading"])("hides both rows and counts for %s data", async mode => {
    if (mode === "foreign") m.data.stock.merchantId = 99;
    if (mode === "selection") m.data.stock.selection.search = "old";
    if (mode === "malformed") m.data.stock.summary.total = 40;
    if (mode === "error") m.error = Error("network");
    if (mode === "offline") m.paused = true;
    if (mode === "loading") m.fetching = true;
    await render(screen());
    expect(host.querySelector(".pw-catalog-list")).toBeNull();
    expect(host.querySelector(".pw-summary")).toBeNull();
    expect(host.querySelector("[data-state]")).not.toBeNull();
  });
  it.each(["FORBIDDEN", "UNAUTHORIZED"])("shows %s recovery instead of a healthy empty state", async code => {
    m.error = { data: { code } }; await render(screen());
    expect(host.querySelector("[data-state]")?.getAttribute("data-state")).toBe(code === "FORBIDDEN" ? "forbidden" : "session");
    expect(host.textContent).not.toContain(en.stockUx.empty);
  });
  it("keeps unknown quantities distinct from zero", async () => {
    m.data.stock.items[0] = { ...m.data.stock.items[0], stock: -1, state: "unknown", issue: "stock_unknown" };
    m.data.stock.summary = { out: 0, low: 1, unknown: 2, total: 3 };
    await render(screen());
    expect(host.querySelector(".pw-catalog-list li")!.textContent).toContain("—");
    expect(host.querySelector(".pw-catalog-list li")!.textContent).toContain(en.stockUx.unknownHint);
  });
  it("resets pagination on filters and debounces literal search", async () => {
    vi.useFakeTimers();
    try {
      await render(screen()); await select(0, "variant");
      expect(selected).toHaveBeenLastCalledWith({ ...selection, kind: "variant", page: 1 });
      await select(1, "unknown"); expect(selected).toHaveBeenLastCalledWith({ ...selection, state: "unknown", page: 1 });
      await change('input[type="search"]', "  100%_  ");
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(selected).toHaveBeenLastCalledWith({ ...selection, search: "100%_", page: 1 });
    } finally { vi.useRealTimers(); }
  });
  it("distinguishes no matching rows from a scoped empty snapshot and resets filters", async () => {
    m.data.stock.items = []; m.data.stock.total = 0; m.data.stock.totalPages = 0;
    const filtered = { ...selection, search: "absent" };
    m.data.stock.selection = filtered; await render(screen(filtered));
    expect(host.textContent).toContain(en.productWorkspaceUx.noMatches);
    expect(host.textContent).not.toContain(en.stockUx.emptyHint);
    await click(button(en.productWorkspaceUx.resetFilters));
    expect(selected).toHaveBeenLastCalledWith(selection);
    m.data.stock.summary = { out: 0, low: 0, unknown: 0, total: 0 };
    await render(screen(filtered)); expect(host.textContent).toContain(en.stockUx.emptyHint);
  });
  it("preserves stock filters when opening a product and returning to stock", async () => {
    await render(React.createElement(ProductCatalogWorkspace, { scope }));
    await click(button(en.stockUx.title));
    m.data.stock.selection.state = "out";
    m.data.stock.items = [m.data.stock.items[0]]; m.data.stock.total = 1;
    await select(1, "out"); await click(button(en.stockUx.openProduct));
    expect(host.querySelector("#product-name")).not.toBeNull();
    await click(button(en.stockUx.back));
    expect(host.querySelectorAll("select")[1].value).toBe("out");
    expect(m.inputs.stock.state).toBe("out");
  });
  it("renders the Arabic stock screen without raw translation keys", async () => {
    m.language = "ar"; await render(screen());
    expect(host.querySelector("section")?.getAttribute("dir")).toBe("rtl");
    expect(host.textContent).toContain(ar.stockUx.title);
    expect(host.textContent).not.toMatch(/(?:stockUx|detailUx|categoryUx|productWorkspaceUx)\./);
  });
});
describe("product workspace UI", () => {
  it.each([
    ["physical", 1, "managedVariants"],
    ["service", 0, "serviceInventory"],
  ] as const)("does not expose the base stock as available inventory for %s (%s)", async (productType, hasVariants, label) => {
    m.data.list.items[0] = { ...row, stock: 987, productType, hasVariants };
    await render(React.createElement(ProductCatalogWorkspace, { scope }));
    const card = host.querySelector(".pw-product")!;
    expect(card.textContent).toContain(en.stockUx[label]);
    expect(card.textContent).not.toContain("987");
  });
  it("explains base quantity when editing a product with variants", async () => {
    m.data.read.product.hasVariants = 1;
    await render(editor());
    expect(host.textContent).toContain(en.stockUx.baseQuantityHint);
  });
  async function selectCategory(value: string) {
    const select = host.querySelector<HTMLSelectElement>("#product-categoryId")!;
    await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  }
  it("links a category without rewriting the text category, and restores the selected draft", async () => {
    await render(editor()); await selectCategory("1");
    expect(readProductWorkspaceCache(scope)).toMatchObject({ form: { categoryId: "1", category: "Category" } });
    await click(button("Save product")); expect(m.write.mock.calls[0][0].fields).toEqual({ categoryId: 1 });
  });
  it("does not offer inactive categories and blocks a selected category that becomes inactive", async () => {
    await render(editor()); expect(host.querySelector<HTMLOptionElement>('#product-categoryId option[value="2"]')!.disabled).toBe(true);
    await selectCategory("1"); m.data.categories.rows[0].isActive = 0; await render(editor());
    expect(button("Save product").disabled).toBe(true); expect(host.textContent).toContain(en.productWorkspaceUx.categorySelectionError);
    await selectCategory(""); await change("#product-name", "Other edit"); await click(button("Save product"));
    expect(m.write.mock.calls[0][0].fields).toEqual({ name: "Other edit" });
  });
  it.each(["missing", "foreign", "inactive"])("preserves an existing %s category on unrelated edits", async mode => {
    m.data.read.product = { ...row, categoryId: 2 };
    if (mode === "missing") m.data.categories.rows = [];
    if (mode === "foreign") m.data.categories.actorId = 8;
    await render(editor()); expect(host.querySelector<HTMLSelectElement>("#product-categoryId")!.value).toBe("2");
    await change("#product-name", "Rename only"); await click(button("Save product"));
    expect(m.write.mock.calls[0][0].fields).toEqual({ name: "Rename only" });
    expect(host.textContent).not.toContain("productWorkspaceUx.");
  });
  it("sends an explicit unlink for an existing category", async () => {
    m.data.read.product = { ...row, categoryId: 1 }; await render(editor());
    await selectCategory(""); await click(button("Save product"));
    expect(m.write.mock.calls[0][0].fields).toEqual({ categoryId: null });
  });
  it("migrates an older draft to the current link without overwriting the edited name", async () => {
    m.data.read.product = { ...row, categoryId: 1 };
    const { categoryId: _, ...oldForm } = newProductForm("SAR");
    sessionStorage.setItem("sary:product-workspace:v1:" + scope, JSON.stringify({ savedAt: Date.now(), draft: {
      kind: "editor", target: 81, digest, baseline: oldForm, form: { ...oldForm, name: "Old draft" },
    } }));
    await render(editor()); expect(host.querySelector<HTMLSelectElement>("#product-categoryId")!.value).toBe("1");
    await click(button("Save product")); expect(m.write.mock.calls[0][0].fields).toEqual({ name: "Old draft" });
  });
  it("renders literal text, unknown stock and real totals without pretending every product is available", async () => {
    await render(React.createElement(ProductCatalogWorkspace, { scope }));
    expect(host.textContent).toContain(row.name);
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain("Unknown");
    expect(host.querySelectorAll(".pw-summary dd")[0].textContent).toBe("1");
  });
  it.each([
    "error",
    "forbidden",
    "session",
    "paused",
    "fetching",
    "tenant",
    "selection",
  ])("does not render stale catalog rows for %s", async state => {
    if (state === "paused") m.paused = true;
    else if (state === "fetching") m.fetching = true;
    else if (state === "tenant") m.data.list.merchantId = 30;
    else if (state === "selection") m.data.list.selection.page = 2;
    else
      m.error = {
        data: {
          code:
            state === "forbidden"
              ? "FORBIDDEN"
              : state === "session"
                ? "UNAUTHORIZED"
                : "INTERNAL_SERVER_ERROR",
        },
      };
    await render(React.createElement(ProductCatalogWorkspace, { scope }));
    expect(host.querySelector(".pw-product")).toBeNull();
    expect(host.querySelector("[data-state]")).not.toBeNull();
  });
  it("shows a genuine empty catalog and disables writes for a viewer", async () => {
    m.data.list.items = [];
    m.data.list.total = 0;
    m.data.list.summary.all = 0;
    m.data.list.canManage = false;
    await render(React.createElement(ProductCatalogWorkspace, { scope }));
    expect(host.textContent).toContain("Add your first product");
    expect(button("Add product").disabled).toBe(true);
  });
  it("keeps the original fields plus explicit currency and linked category with inline errors", async () => {
    await render(editor("new"));
    expect(
      host.querySelectorAll("form input, form textarea, form select")
    ).toHaveLength(18);
    await click(button("Save product"));
    expect(
      host.querySelector("#product-name")?.getAttribute("aria-invalid")
    ).toBe("true");
    expect(
      host.querySelector("#product-price")?.getAttribute("aria-invalid")
    ).toBe("true");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("saves an exact field patch only after persisting its attempt, then confirms the matching receipt", async () => {
    m.write.mockImplementation(async (input: any) => {
      expect(readProductWorkspaceCache(scope)?.attempt).toEqual(input);
      return {
        merchantId: 20,
        actorId: 7,
        requestId: input.requestId,
        kind: "update",
        productId: 81,
        digest: "b".repeat(64),
        createdAt: readAt,
      };
    });
    await render(editor());
    await change("#product-name", "Changed");
    await click(button("Save product"));
    expect(m.write.mock.calls[0][0].fields).toEqual({ name: "Changed" });
    expect(completed).toHaveBeenCalledOnce();
    expect(readProductWorkspaceCache(scope)).toBeNull();
  });
  it("retains a failed ambiguous attempt and retries the same request ID", async () => {
    m.write.mockRejectedValue(Error("connection lost"));
    await render(editor());
    await change("#product-name", "Changed");
    await click(button("Save product"));
    const first = m.write.mock.calls[0][0];
    expect(host.textContent).toContain("Confirm the operation result");
    await click(button("Retry same request"));
    expect(m.write.mock.calls[1][0]).toEqual(first);
    expect(completed).not.toHaveBeenCalled();
  });
  it("rejects a receipt for another tenant instead of claiming success", async () => {
    m.write.mockImplementation(async (input: any) => ({
      merchantId: 30,
      actorId: 7,
      requestId: input.requestId,
      kind: "update",
      productId: 81,
      digest,
      createdAt: readAt,
    }));
    await render(editor());
    await change("#product-name", "Changed");
    await click(button("Save product"));
    expect(completed).not.toHaveBeenCalled();
    expect(readProductWorkspaceCache(scope)?.attempt).toBeDefined();
  });
  it("keeps a definitive rejected draft without an unresolved request", async () => {
    m.write.mockRejectedValue({ data: { code: "CONFLICT" } });
    await render(editor());
    await change("#product-name", "Changed");
    await click(button("Save product"));
    const saved = readProductWorkspaceCache(scope);
    expect(saved?.attempt).toBeUndefined();
    expect(saved?.kind === "editor" && saved.form.name).toBe("Changed");
  });
  it("blocks saving a stale draft until differences are explicitly reviewed", async () => {
    await render(editor());
    await change("#product-name", "Changed");
    m.data.read.digest = "b".repeat(64);
    m.data.read.product = { ...row, description: "Current description" };
    await render(editor());
    expect(host.textContent).toContain("The product has changed");
    expect(button("Save product").disabled).toBe(true);
    const consent = host.querySelector(".pw-check input") as HTMLInputElement;
    await click(consent);
    await click(button("Apply my draft to the current version"));
    expect(
      (host.querySelector("#product-description") as HTMLTextAreaElement).value
    ).toBe("Current description");
    expect(
      (host.querySelector("#product-name") as HTMLInputElement).value
    ).toBe("Changed");
    expect(button("Save product").disabled).toBe(false);
  });
  it("does not send when draft storage fails", async () => {
    await render(editor());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await change("#product-name", "Changed");
    expect(button("Save product").disabled).toBe(true);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("restores an unresolved creation and checks its receipt without losing the form", async () => {
    const baseline = newProductForm("SAR"),
      form = { ...baseline, name: "Saved draft", price: "0" };
    const request = productFormRequest("new", form, baseline, null, requestId);
    if (!request.success) throw request.error;
    saveProductWorkspaceCache(
      scope,
      {
        kind: "editor",
        target: "new",
        baseline,
        form,
        digest: null,
        attempt: request.data,
      },
      knowledgeCacheEpoch()
    );
    m.receipt.mockResolvedValue({
      merchantId: 20,
      actorId: 7,
      requestId,
      kind: "create",
      productId: 90,
      digest,
      createdAt: readAt,
    });
    await render(editor("new"));
    await click(button("Check result"));
    expect(completed).toHaveBeenCalledOnce();
  });
  it("requires explicit deletion consent and validates the resulting IDs", async () => {
    m.deleteWrite.mockImplementation(async (input: any) => ({
      merchantId: 20,
      actorId: 7,
      requestId: input.requestId,
      kind: "delete",
      ids: [81],
      digest,
      createdAt: readAt,
    }));
    await render(deletion());
    expect(button("Confirm permanent deletion").disabled).toBe(true);
    await click(host.querySelector("input[type=checkbox]")!);
    await click(button("Confirm permanent deletion"));
    expect(m.deleteWrite.mock.calls[0][0]).toMatchObject({
      ids: [81],
      reviewed: true,
      expectedDigest: digest,
    });
    expect(completed).toHaveBeenCalledOnce();
  });
  it("keeps deletion recovery available when the committed product no longer exists", async () => {
    const attempt = {
      ids: [81],
      expectedDigest: digest,
      reviewed: true as const,
      requestId,
    };
    saveProductWorkspaceCache(
      scope,
      { kind: "delete", attempt },
      knowledgeCacheEpoch()
    );
    m.error = { data: { code: "NOT_FOUND" } };
    m.deleteReceipt.mockResolvedValue({
      merchantId: 20,
      actorId: 7,
      requestId,
      kind: "delete",
      ids: [81],
      digest,
      createdAt: readAt,
    });
    await render(deletion());
    await click(button("Check result"));
    expect(completed).toHaveBeenCalledOnce();
  });
  it("blocks linked products and shows the exact reason", async () => {
    m.data.deletion.items[0].references.rewards = 1;
    m.data.deletion.canDelete = false;
    await render(deletion());
    expect(host.textContent).toContain("Loyalty rewards");
    expect(button("Confirm permanent deletion").disabled).toBe(true);
  });
  it("ignores a late save result after logout", async () => {
    let resolve!: (value: any) => void;
    m.write.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await render(editor());
    await change("#product-name", "Changed");
    await click(button("Save product"));
    const input = m.write.mock.calls[0][0];
    clearKnowledgeWorkspace();
    await act(async () =>
      resolve({
        merchantId: 20,
        actorId: 7,
        requestId: input.requestId,
        kind: "update",
        productId: 81,
        digest,
        createdAt: readAt,
      })
    );
    expect(completed).not.toHaveBeenCalled();
    expect(readProductWorkspaceCache(scope)).toBeNull();
  });
  it("renders Arabic labels without leaking translation keys", async () => {
    m.language = "ar";
    await render(editor("new"));
    expect(host.textContent).toContain("إضافة منتج");
    expect(host.textContent).not.toContain("productWorkspaceUx.");
  });
});
