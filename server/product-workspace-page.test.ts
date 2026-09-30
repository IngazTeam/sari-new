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
describe("product workspace UI", () => {
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
  it("keeps the 16 original form fields plus explicit currency and shows inline errors", async () => {
    await render(editor("new"));
    expect(
      host.querySelectorAll("form input, form textarea, form select")
    ).toHaveLength(17);
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
