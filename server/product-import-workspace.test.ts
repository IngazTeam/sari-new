// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  error: null as any,
  fetching: false,
  paused: false,
  updated: 10,
  language: "en",
  inputs: {} as any,
  prepare: vi.fn(),
  commit: vi.fn(),
  receipt: vi.fn(),
  discard: vi.fn(),
  read: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
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
          list: { invalidate: m.invalidate },
          importReview: {
            read: { fetch: m.read, invalidate: m.invalidate },
            receipt: { fetch: m.receipt },
          },
        },
      }),
      products: {
        list: query("list"),
        importReview: {
          read: query("read"),
          prepare: { useMutation: () => ({ mutateAsync: m.prepare }) },
          commit: { useMutation: () => ({ mutateAsync: m.commit }) },
          discard: { useMutation: () => ({ mutateAsync: m.discard }) },
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
  WorkspaceState: ({ kind, onRetry, action, title, description }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      title,
      description,
      action ||
        (onRetry &&
          React.createElement("button", { onClick: onRetry }, "Retry"))
    ),
  workspaceFailureKind: (error: any) =>
    error?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : error?.data?.code === "UNAUTHORIZED"
        ? "session"
        : error?.data?.code === "NOT_FOUND"
          ? "missing"
          : "error",
}));
import { ProductImportWorkspace } from "../client/src/components/merchant/ProductImportWorkspace";
import {
  readImportAttempt,
  saveImportAttempt,
  clearImportAttempt,
  checkedImportReceipt,
  checkedImportReview,
  readImportFile,
  importFileError,
  productImportTemplate,
  type ImportAttempt,
} from "../client/src/lib/product-import-workspace";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import { productCatalogInput } from "../shared/product-catalog";
import { productImportReadInput } from "../shared/product-import";
import { previewProductImport } from "./product-import-preview";
const scope = "7:20:product-import",
  reviewId = "11111111-1111-4111-8111-111111111185",
  requestId = "11111111-1111-4111-8111-111111111186",
  digest = "a".repeat(64);
const cached = (): ImportAttempt => ({
  reviewId,
  fingerprint: "b".repeat(64),
  digest,
  attempt: null,
  receipt: null,
});
const write = () => ({
  reviewId,
  requestId,
  expectedDigest: digest,
  reviewed: true as const,
});
const receipt = () => ({
  merchantId: 20,
  actorId: 7,
  reviewId,
  requestId,
  kind: "import" as const,
  digest,
  productIds: [85],
  count: 1,
  createdAt: "2026-09-30T12:00:00.000Z",
});
const defaultOptions = {
  currency: "SAR" as const,
  productType: "physical" as const,
  status: "draft" as const,
  delimiter: "," as const,
  sheet: 0,
};
let root: Root, host: HTMLDivElement;
async function fixture(
  source = "name,price,sku\n<script>Literal</script>,12.34,S-1"
) {
  const preview = await previewProductImport({
    format: "csv",
    fileName: "products.csv",
    currency: "SAR",
    csvData: source,
  });
  return {
    merchantId: 20,
    actorId: 7,
    reviewId,
    selection: productImportReadInput.parse({ reviewId }),
    createdAt: "2026-09-30T12:00:00.000Z",
    expiresAt: "2026-10-01T12:00:00.000Z",
    expired: false,
    canManage: true,
    integrationSource: "none",
    canCommit: preview.invalid === 0,
    receipt: null,
    preview: {
      ...preview,
      digest,
      rows: preview.rows.slice(0, 20),
      filteredTotal: preview.total,
      totalPages: Math.ceil(preview.total / 20),
    },
  };
}
async function render() {
  await act(async () => {
    root.render(React.createElement(ProductImportWorkspace, { scope }));
  });
}
function button(text: string) {
  const found = Array.from(host.querySelectorAll("button")).find(
    item => item.textContent === text
  );
  if (!found) throw Error(`Button not found: ${text}`);
  return found;
}
async function click(text: string) {
  await act(async () => {
    button(text).click();
  });
}
async function consent() {
  const checkbox = host.querySelector<HTMLInputElement>("input[type=checkbox]");
  if (!checkbox) throw Error("No consent");
  await act(async () => checkbox.click());
}
async function chooseFile(
  name = "products.csv",
  source = "name,price\nTest,1"
) {
  const bytes = new TextEncoder().encode(source),
    file = new File([bytes], name, { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.buffer,
  });
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true }))
  );
  return file;
}
beforeEach(async () => {
  vi.resetAllMocks();
  sessionStorage.clear();
  clearKnowledgeWorkspace();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  m.error = null;
  m.fetching = false;
  m.paused = false;
  m.updated = 10;
  m.language = "en";
  m.data = {
    list: {
      merchantId: 20,
      canManage: true,
      readAt: "2026-09-30T12:00:00.000Z",
      selection: productCatalogInput.parse({ pageSize: 1 }),
      currency: "SAR",
      integrationSource: "none",
      items: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
      summary: {
        all: 0,
        out: 0,
        low: 0,
        untracked: 0,
        unknown: 0,
        priceReview: 0,
      },
    },
    read: await fixture(),
  };
  m.discard.mockResolvedValue({ discarded: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("import reference storage and file contracts", () => {
  it("stores only scoped identifiers, never file contents, and survives reload for recovery", () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    expect(readImportAttempt(scope)).toEqual(cached());
    expect(readImportAttempt("8:20:product-import")).toBeNull();
    expect(
      sessionStorage.getItem("sary:product-import:v1:" + scope)
    ).not.toContain("Literal");
  });
  it("keeps unresolved commits without an expiry and verifies receipt/request identity", () => {
    const saved = { ...cached(), attempt: write() };
    saveImportAttempt(scope, saved, knowledgeCacheEpoch());
    expect(readImportAttempt(scope)?.attempt).toEqual(write());
    expect(() =>
      saveImportAttempt(
        scope,
        { ...saved, receipt: { ...receipt(), actorId: 8 } },
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(() =>
      checkedImportReceipt(
        { ...receipt(), requestId: reviewId },
        scope,
        write()
      )
    ).toThrow();
  });
  it("fails closed on malformed storage, readback failure, and logout races", () => {
    sessionStorage.setItem("sary:product-import:v1:" + scope, "bad");
    expect(() => readImportAttempt(scope)).toThrow();
    sessionStorage.clear();
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(() => saveImportAttempt(scope, cached(), epoch)).toThrow();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveImportAttempt(scope, cached(), knowledgeCacheEpoch())
    ).toThrow();
  });
  it("logout removes references and rejects foreign response/selection", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    clearKnowledgeWorkspace();
    expect(readImportAttempt(scope)).toBeNull();
    expect(() =>
      checkedImportReview(
        { ...m.data.read, actorId: 8 },
        scope,
        productImportReadInput.parse({ reviewId })
      )
    ).toThrow();
    expect(() =>
      checkedImportReview(
        m.data.read,
        scope,
        productImportReadInput.parse({ reviewId, page: 2 })
      )
    ).toThrow();
  });
  it.each(["ar", "en"])(
    "templates are accepted by the same parser in %s",
    async language => {
      for (const type of ["physical", "service"] as const) {
        const result = await previewProductImport({
          format: "csv",
          fileName: "p.csv",
          currency: "SAR",
          csvData: productImportTemplate(type, language),
        });
        expect(result.valid).toBe(1);
        expect(result.rows[0].fields).toMatchObject({
          productType: type,
          status: "draft",
          stock: null,
          price: "99.99",
        });
      }
    }
  );
  it("validates extension/size/UTF-8 and reads the exact source without numeric coercion", async () => {
    expect(importFileError({ name: "p.exe", size: 1 })).toBe("file_type");
    expect(importFileError({ name: "p.csv", size: 6 * 1024 * 1024 })).toBe(
      "file_size"
    );
    expect(importFileError({ name: "p.xlsx", size: 0 })).toBe("empty_file");
    const source = "الاسم,السعر\nمنتج,12.30",
      bytes = new TextEncoder().encode(source);
    expect(
      await readImportFile(
        {
          name: "p.csv",
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        } as File,
        defaultOptions
      )
    ).toMatchObject({ csvData: source });
    await expect(
      readImportFile(
        {
          name: "p.csv",
          size: 2,
          arrayBuffer: async () => new Uint8Array([0xff, 0xff]).buffer,
        } as File,
        defaultOptions
      )
    ).rejects.toThrow("encoding");
  });
});
describe("reviewed product import screen", () => {
  it("clears only a missing review reference after confirmation, without server writes", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.error = { data: { code: "NOT_FOUND" } };
    m.data.read = undefined;
    await render();
    await click("Import another file");
    expect(readImportAttempt(scope)).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Start a new review?");
    await click("Start a new file");
    expect(readImportAttempt(scope)).toBeNull();
    expect(m.discard).not.toHaveBeenCalled();
    expect(m.commit).not.toHaveBeenCalled();
    expect(host.querySelector("details")?.open).toBe(true);
  });
  it("never offers to forget an unresolved import even when the review is missing", async () => {
    saveImportAttempt(
      scope,
      { ...cached(), attempt: write() },
      knowledgeCacheEpoch()
    );
    m.error = { data: { code: "NOT_FOUND" } };
    m.data.read = undefined;
    await render();
    expect(host.textContent).toContain("Confirm the operation result");
    expect(host.textContent).not.toContain("Import another file");
    expect(readImportAttempt(scope)?.attempt).toEqual(write());
  });
  it.each(["INTERNAL_SERVER_ERROR", "UNAUTHORIZED", "FORBIDDEN"])(
    "does not forget a review for %s",
    async code => {
      saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
      m.error = { data: { code } };
      m.data.read = undefined;
      await render();
      expect(host.textContent).not.toContain("Import another file");
      expect(readImportAttempt(scope)).not.toBeNull();
    }
  );
  it("rechecks missing status before confirming local cleanup", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.error = { data: { code: "NOT_FOUND" } };
    await render();
    await click("Import another file");
    m.error = null;
    m.updated++;
    await render();
    expect(button("Start a new file").disabled).toBe(true);
    expect(readImportAttempt(scope)).not.toBeNull();
    expect(m.discard).not.toHaveBeenCalled();
  });
  it("provides an immediate restart action on expired reviews and waits for server cleanup", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.data.read.expired = true;
    m.data.read.canCommit = false;
    await render();
    await click("Import another file");
    m.discard.mockRejectedValue(Error("offline"));
    await click("Remove review");
    expect(readImportAttempt(scope)).not.toBeNull();
    m.discard.mockResolvedValue({ discarded: true });
    await click("Remove review");
    expect(readImportAttempt(scope)).toBeNull();
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("does not accept a foreign receipt nested inside a valid review", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.data.read.receipt = { ...receipt(), merchantId: 99 };
    await render();
    expect(host.textContent).not.toContain("1 items were created");
    expect(host.querySelector("[data-state=error]")).not.toBeNull();
  });
  it("keeps an unresolved request when the review contains a different operation receipt", async () => {
    saveImportAttempt(
      scope,
      { ...cached(), attempt: write() },
      knowledgeCacheEpoch()
    );
    m.data.read.receipt = {
      ...receipt(),
      requestId: "11111111-1111-4111-8111-111111111187",
    };
    m.data.read.canCommit = false;
    await render();
    expect(host.textContent).toContain("Confirm the operation result");
    expect(readImportAttempt(scope)?.attempt?.requestId).toBe(requestId);
  });
  it("restores the original options for an unconfirmed preview without storing the file", async () => {
    saveImportAttempt(
      scope,
      {
        ...cached(),
        digest: null,
        options: {
          ...defaultOptions,
          currency: "USD",
          delimiter: ";",
          sheet: 1,
        },
      },
      knowledgeCacheEpoch()
    );
    m.data.read = undefined;
    await render();
    expect(host.querySelector("select")?.value).toBe("USD");
    expect(host.textContent).toContain("Restore preview");
    expect(readImportAttempt(scope)?.options?.delimiter).toBe(";");
  });
  it("shows file defaults and the matching template without requesting any writes", async () => {
    m.data.read = undefined;
    await render();
    expect(host.textContent).toContain("Import products");
    expect(button("Preview file").disabled).toBe(true);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("discards an invalid newly chosen file instead of retaining the previous one", async () => {
    await render();
    await chooseFile();
    expect(button("Preview file").disabled).toBe(false);
    await chooseFile("bad.exe");
    expect(button("Preview file").disabled).toBe(true);
    expect(
      host.querySelector("input[type=file]")?.getAttribute("aria-invalid")
    ).toBe("true");
  });
  it("persists the reference before preview preparation and validates the returned scope", async () => {
    m.data.read = undefined;
    m.prepare.mockImplementation(async (input: any) => {
      expect(readImportAttempt(scope)?.reviewId).toBe(input.reviewId);
      const result = await fixture();
      result.reviewId = input.reviewId;
      result.selection = productImportReadInput.parse({
        reviewId: input.reviewId,
      });
      m.data.read = result;
      return result;
    });
    await render();
    await chooseFile();
    await click("Preview file");
    await act(async () => {
      await vi.waitFor(() => expect(m.prepare).toHaveBeenCalledTimes(1));
    });
    expect(readImportAttempt(scope)?.digest).toBe(digest);
    expect(m.commit).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Review before importing");
  });
  it("shows raw and effective values as text, requires consent, and persists the UUID before commit", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.commit.mockImplementation(async (input: any) => {
      expect(readImportAttempt(scope)?.attempt).toEqual(input);
      return { ...receipt(), requestId: input.requestId };
    });
    await render();
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain("<script>Literal</script>");
    expect(host.textContent).toContain(
      "Values to import after applying defaults"
    );
    expect(button("Import 1 items").disabled).toBe(true);
    await consent();
    await click("Import 1 items");
    expect(m.commit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("1 items were created");
    expect(readImportAttempt(scope)?.receipt?.count).toBe(1);
  });
  it("retains the exact request after an uncertain reply and recovers the receipt without resending", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.commit.mockRejectedValue(Error("Lost reply"));
    await render();
    await consent();
    await click("Import 1 items");
    const saved = readImportAttempt(scope)!;
    expect(saved.attempt).toBeTruthy();
    expect(host.textContent).toContain("Confirm the operation result");
    m.receipt.mockResolvedValue({
      ...receipt(),
      requestId: saved.attempt!.requestId,
    });
    await click("Check result");
    expect(host.textContent).toContain("1 items were created");
    expect(m.commit).toHaveBeenCalledTimes(1);
  });
  it("rejects a mismatched receipt and retries only the saved request", async () => {
    const saved = { ...cached(), attempt: write() };
    saveImportAttempt(scope, saved, knowledgeCacheEpoch());
    m.receipt.mockResolvedValue({ ...receipt(), merchantId: 99 });
    m.commit.mockRejectedValue(Error("offline"));
    await render();
    await click("Check result");
    expect(readImportAttempt(scope)?.receipt).toBeNull();
    await click("Retry same request");
    expect(m.commit).toHaveBeenCalledWith(write());
    expect(readImportAttempt(scope)?.attempt?.requestId).toBe(requestId);
  });
  it("clears a definitively rejected commit but keeps the preview and removes consent", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    m.commit.mockRejectedValue({ data: { code: "CONFLICT" } });
    await render();
    await consent();
    await click("Import 1 items");
    expect(readImportAttempt(scope)?.attempt).toBeNull();
    expect(readImportAttempt(scope)?.digest).toBe(digest);
    expect(button("Import 1 items").disabled).toBe(true);
    expect(host.textContent).toContain("The file was not imported");
  });
  it.each(["foreign", "stale", "error", "offline", "fetching"])(
    "does not allow approval from a %s response",
    async kind => {
      saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
      if (kind === "foreign") m.data.read.merchantId = 99;
      if (kind === "stale") m.data.read.selection.page = 2;
      if (kind === "error")
        m.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
      if (kind === "offline") m.paused = true;
      if (kind === "fetching") m.fetching = true;
      await render();
      expect(host.querySelector("input[type=checkbox]")).toBeNull();
      expect(m.commit).not.toHaveBeenCalled();
    }
  );
  it.each(["invalid", "expired", "viewer", "source"])(
    "blocks a %s review",
    async kind => {
      saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
      if (kind === "invalid") m.data.read = await fixture("name,price\nBad,");
      if (kind === "expired") m.data.read.expired = true;
      if (kind === "viewer") {
        m.data.read.canManage = false;
        m.data.list.canManage = false;
      }
      if (kind === "source") m.data.read.integrationSource = "salla";
      m.data.read.canCommit = false;
      await render();
      expect(button("Import 1 items").disabled).toBe(true);
      if (kind === "invalid")
        expect(host.textContent).toContain("Price is required");
    }
  );
  it("resets approval on refresh and option changes", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    await render();
    await consent();
    expect(button("Import 1 items").disabled).toBe(false);
    m.updated++;
    await render();
    expect(button("Import 1 items").disabled).toBe(true);
    await consent();
    const currency = host.querySelector("select")!;
    await act(async () => {
      currency.value = "USD";
      currency.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(button("Import 1 items").disabled).toBe(true);
    expect(host.textContent).toContain("Update the preview");
  });
  it("allows explicitly ignoring a column without restoring the previous mapping", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    await render();
    await chooseFile();
    const select = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Map column 3: sku"]'
    )!;
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select.value).toBe("");
    expect(button("Import 1 items").disabled).toBe(true);
  });
  it("does not accept a late mutation after logout", async () => {
    saveImportAttempt(scope, cached(), knowledgeCacheEpoch());
    let resolve: (value: any) => void = () => {};
    m.commit.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    await render();
    await consent();
    await act(async () => button("Import 1 items").click());
    const pending = readImportAttempt(scope)!.attempt!;
    clearKnowledgeWorkspace();
    await act(async () =>
      resolve({ ...receipt(), requestId: pending.requestId })
    );
    expect(readImportAttempt(scope)).toBeNull();
    expect(host.textContent).not.toContain("1 items were created");
  });
  it("blocks writes when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw Error("Unavailable");
    });
    await render();
    expect(host.querySelector("[data-state=error]")).not.toBeNull();
    expect(m.commit).not.toHaveBeenCalled();
  });
});
