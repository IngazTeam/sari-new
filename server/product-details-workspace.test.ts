// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  error: null as any,
  loading: false,
  fetching: false,
  paused: false,
  language: "en",
  write: vi.fn(),
  receipt: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    products: {
      details: {
        read: {
          useQuery: () => ({
            data: m.data,
            error: m.error,
            isLoading: m.loading,
            isFetching: m.fetching,
            fetchStatus: m.paused ? "paused" : "idle",
            refetch: m.refresh,
          }),
        },
        write: { useMutation: () => ({ mutateAsync: m.write }) },
      },
    },
    useUtils: () => ({
      products: { details: { receipt: { fetch: m.receipt } } },
    }),
  },
}));
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
  WorkspaceState: ({ kind }: any) =>
    React.createElement("div", { "data-state": kind }),
  workspaceFailureKind: () => "error",
}));
import { ProductDetailsWorkspace } from "../client/src/components/merchant/ProductDetailsWorkspace";
import {
  readDetailDraft,
  saveDetailDraft,
  variantToForm,
} from "../client/src/lib/product-details-workspace";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "9:7:product-details:3",
  digest = "a".repeat(64);
let host: HTMLDivElement, root: Root;
const copy = (key: string) =>
  key
    .split(".")
    .reduce((v: any, k) => v[k], m.language === "ar" ? ar : en) as string;
const buttons = (key: string) =>
  Array.from(host.querySelectorAll("button")).filter(
    b => b.textContent === copy(key)
  );
const click = async (key: string) => act(async () => buttons(key)[0]!.click());
const field = (key: string) =>
  host.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("#detail-" + key)!;
async function fill(key: string, value: string) {
  await act(async () => {
    const element = field(key);
    const proto =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      })
    );
  });
}
const reviewed = () =>
  Array.from(host.querySelectorAll("label"))
    .find(l => l.textContent === copy("categoryUx.reviewed"))!
    .querySelector("input")!;
const review = async () => act(async () => reviewed().click());
const render = async () =>
  act(async () =>
    root.render(
      React.createElement(ProductDetailsWorkspace, {
        scope,
        productId: 3,
        back: m.back,
      })
    )
  );
const receipt = (request: any) => ({
  merchantId: 7,
  actorId: 9,
  productId: 3,
  requestId: request.requestId,
  kind: request.kind,
  detailId: request.id ?? 10,
  digest: "b".repeat(64),
  confirmedAt: "2026-09-30T12:00:00.000Z",
});
const option = (id = 1, patch: any = {}) => ({
  id,
  merchantId: 7,
  productId: 3,
  name: "Size",
  nameEn: null,
  values: '["S","L"]',
  sortOrder: 0,
  ...patch,
});
const variant = (id = 1, patch: any = {}) => ({
  id,
  merchantId: 7,
  productId: 3,
  name: "Small " + id,
  sku: "S-" + id,
  price: 1234,
  priceUnit: "minor",
  compareAtPrice: null,
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
async function newVariant() {
  await click("detailUx.addVariant");
  await fill("name", "Large");
  await review();
}
async function options() {
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find(b => b.textContent?.startsWith(copy("detailUx.options") + " ·"))!
      .click()
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  m.data = {
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
  };
  m.error = null;
  m.loading = m.fetching = m.paused = false;
  m.language = "en";
  m.refresh.mockResolvedValue({ data: m.data });
  m.write.mockImplementation(async request => receipt(request));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("actual product options and variants workspace", () => {
  it("shows no changes instead of field errors when opening an unchanged variant", async () => {
    await render();
    await click("detailUx.edit");
    expect(host.textContent).toContain(copy("categoryUx.noChange"));
    expect(host.textContent).not.toContain(
      copy("productWorkspaceUx.reviewFields")
    );
    expect(buttons("detailUx.save")[0].disabled).toBe(true);
  });
  it.each(["ar", "en"])(
    "renders %s copy and invalid fields without writes",
    async language => {
      m.language = language;
      await render();
      expect(host.textContent).toContain(copy("detailUx.title"));
      expect(m.write).not.toHaveBeenCalled();
      await click("detailUx.addVariant");
      expect(field("name").getAttribute("aria-invalid")).toBe("true");
      expect(buttons("detailUx.save")[0].disabled).toBe(true);
      await fill("name", "Large");
      await fill("stock", "1e3");
      expect(field("stock").getAttribute("aria-invalid")).toBe("true");
      expect(host.textContent).not.toMatch(
        /(?:detailUx|categoryUx|productWorkspaceUx)\./
      );
    }
  );
  it("reviews default inheritance and unknown stock, then validates and clears a receipt", async () => {
    await render();
    await click("detailUx.addVariant");
    await fill("name", "Large");
    await fill("stock", "");
    expect(buttons("detailUx.save")[0].disabled).toBe(true);
    expect(host.textContent).toContain(copy("detailUx.requiresVariant"));
    await review();
    await click("detailUx.save");
    expect(m.write.mock.calls[0][0]).toMatchObject({
      kind: "variant_create",
      expectedDigest: digest,
      fields: { price: null, stock: null, costPrice: null },
    });
    expect(readDetailDraft(scope)).toBeNull();
    expect(host.textContent).toContain("confirmed receipt");
  });
  it("preserves unverified prices and malformed selection JSON when changing only a name", async () => {
    m.data.variants = [
      variant(1, {
        price: 1234,
        priceUnit: "unverified",
        costPrice: 700,
        options: "broken",
      }),
    ];
    await render();
    await click("detailUx.edit");
    expect(host.textContent).toContain(copy("detailUx.priceReview"));
    expect(host.textContent).toContain(copy("detailUx.unreadable"));
    await fill("name", "Rename");
    await review();
    await click("detailUx.save");
    expect(m.write.mock.calls[0][0].fields).toEqual({ name: "Rename" });
  });
  it("shows automatic clearing of legacy cost in the before/after review when verifying price", async () => {
    m.data.variants = [
      variant(1, {
        priceUnit: "unverified",
        costPrice: 700,
        compareAtPrice: 1500,
      }),
    ];
    await render();
    await click("detailUx.edit");
    await fill("priceMode", "custom");
    await fill("price", "20.25");
    expect(host.querySelector(".pw-detail-review")!.textContent).toContain(
      copy("productWorkspaceUx.costPrice")
    );
    await review();
    await click("detailUx.save");
    expect(m.write.mock.calls[0][0].fields).toEqual({ price: "20.25" });
  });
  it.each(["[null]", '[{"optionId":900,"value":"lost"}]'])(
    "keeps malformed/orphan draft selections %s until explicit repair",
    async selections => {
      const form = {
        ...variantToForm(m.data.variants[0], m.data.options),
        selections,
      };
      saveDetailDraft(
        scope,
        {
          productId: 3,
          id: 1,
          mode: "update",
          digest,
          form,
          baseline: { ...form },
        },
        knowledgeCacheEpoch()
      );
      await render();
      expect(buttons("detailUx.resetSelections")).toHaveLength(1);
      await fill("name", "Rename");
      expect(readDetailDraft(scope)?.form).toMatchObject({ selections });
      await click("detailUx.resetSelections");
      expect(readDetailDraft(scope)?.form).toMatchObject({ selections: "[]" });
      await review();
      await click("detailUx.save");
      expect(m.write.mock.calls[0][0].fields).toEqual({
        name: "Rename",
        selections: [],
      });
    }
  );
  it("opens extra fields when an invalid restored image URL needs attention", async () => {
    const form = {
      ...variantToForm(m.data.variants[0], m.data.options),
      imageUrl: "javascript:alert(1)",
    };
    saveDetailDraft(
      scope,
      {
        productId: 3,
        id: 1,
        mode: "update",
        digest,
        form,
        baseline: variantToForm(m.data.variants[0], m.data.options),
      },
      knowledgeCacheEpoch()
    );
    await render();
    expect(field("imageUrl").closest("details")?.open).toBe(true);
    expect(field("imageUrl").getAttribute("aria-invalid")).toBe("true");
  });
  it("requires option values, rejects duplicates and preserves unreadable values on unrelated edits", async () => {
    m.data.options = [option(1, { values: "broken" })];
    m.data.variants = [];
    await render();
    await options();
    await click("detailUx.edit");
    expect(host.textContent).toContain(copy("detailUx.unreadableOption"));
    await fill("nameEn", "Size in English");
    await review();
    await click("detailUx.save");
    expect(m.write.mock.calls[0][0].fields).toEqual({
      nameEn: "Size in English",
    });
    await click("detailUx.addOption");
    await fill("name", "Colour");
    await fill("values", "Red\nRED");
    expect(buttons("detailUx.save")[0].disabled).toBe(true);
    await fill("values", "Red\nBlue");
    await review();
    await click("detailUx.save");
    expect(m.write.mock.calls[1][0]).toMatchObject({
      kind: "option_create",
      fields: { values: ["Red", "Blue"] },
    });
  });
  it("prevents deleting a used option, but shows the effect of deleting the last variant", async () => {
    await render();
    await options();
    await click("detailUx.delete");
    expect(host.textContent).toContain(copy("detailUx.inUse"));
    expect(buttons("productWorkspaceUx.confirmDelete")[0].disabled).toBe(true);
    await click("categoryUx.discard");
    await click("categoryUx.confirmDiscard");
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find(b => b.textContent?.startsWith(copy("detailUx.variants") + " ·"))!
        .click()
    );
    await click("detailUx.delete");
    expect(host.textContent).toContain(copy("detailUx.parentPrice"));
    await review();
    await click("productWorkspaceUx.confirmDelete");
    expect(m.write.mock.calls[0][0]).toMatchObject({
      kind: "variant_delete",
      id: 1,
    });
  });
  it.each(["error", "loading", "fetching", "paused", "foreign", "malformed"])(
    "hides data for %s state",
    async state => {
      if (state === "error") m.error = Error();
      else if (state === "foreign") m.data.actorId = 8;
      else if (state === "malformed") m.data.digest = "bad";
      else (m as any)[state] = true;
      await render();
      expect(buttons("detailUx.addVariant")).toHaveLength(0);
      expect(host.textContent).not.toContain("Small 1");
      expect(m.write).not.toHaveBeenCalled();
    }
  );
  it.each(["viewer", "locked"])(
    "allows reading but blocks editing for %s",
    async state => {
      if (state === "viewer") m.data.canManage = false;
      else m.data.locked = true;
      await render();
      expect(host.textContent).toContain("Small 1");
      expect(buttons("detailUx.edit")[0].disabled).toBe(true);
    }
  );
  it("persists a draft when leaving and requires explicit discard", async () => {
    await render();
    await click("detailUx.addVariant");
    await fill("name", "Draft");
    await click("productWorkspaceUx.back");
    expect(m.back).toHaveBeenCalled();
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    expect(field("name").value).toBe("Draft");
    await click("categoryUx.discard");
    expect(readDetailDraft(scope)).not.toBeNull();
    await click("categoryUx.confirmDiscard");
    expect(readDetailDraft(scope)).toBeNull();
  });
  it("retries the identical pending request after loss of response", async () => {
    m.write.mockRejectedValueOnce(Error());
    await render();
    await newVariant();
    await click("detailUx.save");
    const request = m.write.mock.calls[0][0];
    expect(readDetailDraft(scope)?.attempt).toEqual(request);
    expect(buttons("categoryUx.discard")).toHaveLength(0);
    await click("categoryUx.retrySame");
    expect(m.write.mock.calls[1][0]).toEqual(request);
    expect(readDetailDraft(scope)).toBeNull();
  });
  it("recovers a receipt after remount without submitting again", async () => {
    m.write.mockRejectedValueOnce(Error());
    await render();
    await newVariant();
    await click("detailUx.save");
    const request = m.write.mock.calls[0][0];
    await act(async () => root.unmount());
    root = createRoot(host);
    await render();
    m.receipt.mockResolvedValue(receipt(request));
    await click("categoryUx.recover");
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(readDetailDraft(scope)).toBeNull();
  });
  it.each([
    null,
    { actorId: 8 },
    { productId: 4 },
    { kind: "option_create" },
    { requestId: "22222222-2222-4222-8222-222222222222" },
  ])("retains pending request for an inconclusive receipt %j", async patch => {
    m.write.mockRejectedValueOnce(Error());
    await render();
    await newVariant();
    await click("detailUx.save");
    const request = m.write.mock.calls[0][0];
    m.receipt.mockResolvedValue(
      patch ? { ...receipt(request), ...patch } : null
    );
    await click("categoryUx.recover");
    expect(readDetailDraft(scope)?.attempt).toEqual(request);
  });
  it("requires a fresh review after conflict; update replacement is explicit", async () => {
    await render();
    await click("detailUx.edit");
    await fill("name", "My edit");
    await review();
    m.data = {
      ...m.data,
      digest: "b".repeat(64),
      variants: [variant(1, { name: "Concurrent edit" })],
    };
    await render();
    expect(buttons("detailUx.save")[0].disabled).toBe(true);
    expect(field("name").value).toBe("My edit");
    await click("detailUx.reload");
    expect(field("name").value).toBe("Concurrent edit");
    expect(reviewed().checked).toBe(false);
  });
  it("retains editable fields after definitive rejection", async () => {
    m.write.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await newVariant();
    await click("detailUx.save");
    expect(readDetailDraft(scope)?.attempt).toBeUndefined();
    expect(field("name").value).toBe("Large");
    expect(reviewed().checked).toBe(false);
  });
  it("blocks sending when pending reference cannot be stored", async () => {
    await render();
    await newVariant();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error();
    });
    await click("detailUx.save");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("ignores late responses after logout", async () => {
    let resolve!: (v: any) => void;
    m.write.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await render();
    await newVariant();
    await click("detailUx.save");
    const request = m.write.mock.calls[0][0];
    clearKnowledgeWorkspace();
    await act(async () => resolve(receipt(request)));
    expect(readDetailDraft(scope)).toBeNull();
    expect(host.textContent).not.toContain("confirmed receipt");
  });
  it("paginates all variants and searches by SKU without dropping the draft", async () => {
    m.data.variants = Array.from({ length: 25 }, (_, i) => variant(i + 1));
    await render();
    expect(buttons("detailUx.edit")).toHaveLength(20);
    expect(host.textContent).toContain("Page 1 of 2");
    await click("categoryUx.next");
    expect(buttons("detailUx.edit")).toHaveLength(5);
    await click("detailUx.addVariant");
    await fill("name", "My draft");
    const search = Array.from(host.querySelectorAll("label"))
      .find(l => l.textContent === copy("detailUx.search"))!
      .querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(search, "S-25");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("Small 25");
    expect(field("name").value).toBe("My draft");
  });
});
