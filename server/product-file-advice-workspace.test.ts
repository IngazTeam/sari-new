// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  fetching: false,
  paused: false,
  language: "en",
  start: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  apply: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    products: {
      fileAdvice: {
        start: { useMutation: () => ({ mutateAsync: m.start }) },
        read: {
          useQuery: () => ({
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            isLoading: false,
            fetchStatus: m.paused ? "paused" : "idle",
            dataUpdatedAt: 1,
            refetch: m.refresh,
          }),
        },
      },
    },
    useUtils: () => ({
      products: { fileAdvice: { read: { invalidate: m.invalidate } } },
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
  WorkspaceState: ({ kind, onRetry }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      onRetry && React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (error: any) =>
    error?.data?.code === "NOT_FOUND"
      ? "missing"
      : error?.data?.code === "FORBIDDEN"
        ? "forbidden"
        : error?.data?.code === "UNAUTHORIZED"
          ? "session"
          : "error",
}));
import {
  ProductFileAdviceWorkspace,
  type ProductFileAdviceProps,
} from "../client/src/components/merchant/ProductFileAdviceWorkspace";
import {
  readAdviceReference,
  saveAdviceReference,
  checkedAdviceReceipt,
  fingerprintAdviceInput,
} from "../client/src/lib/product-file-advice-workspace";
import { readImportFile } from "../client/src/lib/product-import-workspace";
import {
  knowledgeCacheEpoch,
  clearKnowledgeWorkspace,
} from "../client/src/lib/knowledge-workspace-cache";
import {
  prepareProductFileAdvice,
  parseProductFileAdvice,
} from "./product-file-advice";
const scope = "7:20:product-import",
  requestId = "11111111-1111-4111-8111-111111111192";
const options = {
  currency: "SAR" as const,
  productType: "physical" as const,
  status: "draft" as const,
  delimiter: "," as const,
  sheet: 0,
};
function file(text = "name,price\nCoffee,12.34") {
  const bytes = new TextEncoder().encode(text);
  return {
    name: "products.csv",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  } as File;
}
let root: Root,
  host: HTMLDivElement,
  props: ProductFileAdviceProps,
  result: any;
const body = () => host.textContent!;
const button = (name: string) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === name
  )!;
async function render(patch: Partial<ProductFileAdviceProps> = {}) {
  props = { ...props, ...patch };
  await act(async () =>
    root.render(React.createElement(ProductFileAdviceWorkspace, props))
  );
}
async function click(name: string) {
  const b = button(name);
  expect(b, name).toBeTruthy();
  expect(b.disabled, name).toBe(false);
  await act(async () => b.click());
}
async function check() {
  const b = host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  await act(async () => b.click());
}
async function save() {
  const input = {
    file: await readImportFile(props.file!, options),
    intent: "auto",
    language: "en",
  };
  saveAdviceReference(
    scope,
    {
      requestId,
      fingerprint: await fingerprintAdviceInput(input),
      fileName: "products.csv",
      intent: "auto",
      language: "en",
      options,
    },
    knowledgeCacheEpoch()
  );
}
const receipt = (state = "completed") => ({
  merchantId: 20,
  actorId: 7,
  requestId,
  fileName: "products.csv",
  fileDigest: result.fileDigest,
  sampleDigest: result.sampleDigest,
  state,
  failure: state === "uncertain" ? "provider_unknown" : null,
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: state === "processing" ? null : "2026-09-30T12:01:00.000Z",
  result: state === "completed" ? result : null,
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("crypto", webcrypto);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  clearKnowledgeWorkspace();
  m.data = null;
  m.error = null;
  m.fetching = false;
  m.paused = false;
  m.language = "en";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  props = {
    scope,
    file: file(),
    options,
    disabled: false,
    onApply: m.apply,
    onRestoreOptions: m.restore,
  };
  const context = await prepareProductFileAdvice({
    file: await readImportFile(props.file!, options),
  });
  result = parseProductFileAdvice(
    JSON.stringify({
      businessType: "products",
      mapping: [],
      summary: {
        text: "<img src=x onerror=alert(1)>",
        evidence: [{ row: 2, column: 0, quote: "Coffee" }],
      },
      sellingTips: [],
      crossSellSuggestions: [],
    }),
    context
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("file advice workspace", () => {
  it("requires a file and explicit consent before a new provider request", async () => {
    await render({ file: null });
    expect(button("Analyze and suggest").disabled).toBe(true);
    await render({ file: file() });
    expect(button("Analyze and suggest").disabled).toBe(true);
    await check();
    expect(button("Analyze and suggest").disabled).toBe(false);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("saves the reference before sending and never resends it after an uncertain response", async () => {
    m.start.mockImplementation(async (input: any) => {
      expect(readAdviceReference(scope)?.requestId).toBe(input.requestId);
      expect(input.reviewed).toBe(true);
      throw Error("lost response");
    });
    await render();
    await check();
    await click("Analyze and suggest");
    await act(async () => { await vi.waitFor(() => expect(m.start).toHaveBeenCalledTimes(1)); });
    expect(readAdviceReference(scope)).not.toBeNull();
    expect(button("Analyze and suggest")).toBeUndefined();
    await click("Retry");
    expect(m.start).toHaveBeenCalledTimes(1);
    expect(m.refresh).toHaveBeenCalledTimes(1);
    m.data = { ...receipt(), requestId: readAdviceReference(scope)!.requestId };
    await render();
    expect(body()).not.toContain(en.productAdviceUx.unknownResult);
    expect(body()).toContain(en.productAdviceUx.completed);
  });
  it("reads a saved result and applies only reviewed mappings to the same file", async () => {
    await save();
    m.data = receipt();
    await render();
    expect(body()).toContain("Sampled 1 of 1");
    expect(body()).toContain("not that a sales inference is correct");
    expect(host.querySelector("img")).toBeNull();
    expect(body()).toContain("<img src=x onerror=alert(1)>");
    expect(button("Use column mappings").disabled).toBe(true);
    await check();
    await click("Use column mappings");
    await act(async()=>{await vi.waitFor(()=>expect(m.apply).toHaveBeenCalledWith(result.proposal.mapping));});
    expect(m.start).not.toHaveBeenCalled();
    expect(body()).toContain("Mappings were applied to the file form only");
  });
  it("rejects applying advice to a changed file or changed currency", async () => {
    await save();
    m.data = receipt();
    await render({ file: file("name,price\nCoffee,99") });
    await check();
    await click("Use column mappings");
    expect(m.apply).not.toHaveBeenCalled();
    expect(body()).toContain("choose the same file");
    await render({ file: file(), options: { ...options, currency: "USD" } });
    await check();
    await click("Use column mappings");
    expect(m.apply).not.toHaveBeenCalled();
  });
  it("restores retained options explicitly without starting analysis or import", async () => {
    await save();
    m.data = receipt();
    await render();
    await click("Restore analysis options");
    expect(m.restore).toHaveBeenCalledWith(options);
    expect(m.start).not.toHaveBeenCalled();
    expect(m.apply).not.toHaveBeenCalled();
  });
  it.each(["tenant", "actor", "request"] as const)(
    "hides a response with the wrong %s identity",
    async field => {
      await save();
      m.data = {
        ...receipt(),
        [field === "tenant"
          ? "merchantId"
          : field === "actor"
            ? "actorId"
            : "requestId"]:
          field === "request" ? "11111111-1111-4111-8111-111111111193" : 99,
      };
      await render();
      expect(body()).not.toContain("Suggestions are ready");
      expect(host.querySelector("[data-state=error]")).not.toBeNull();
      expect(m.apply).not.toHaveBeenCalled();
    }
  );
  it.each(["error", "fetching", "paused"] as const)(
    "hides stale results while %s",
    async state => {
      await save();
      m.data = receipt();
      if (state === "error") m.error = Error("offline");
      else m[state] = true;
      await render();
      expect(body()).not.toContain("Review proposed column mappings");
    }
  );
  it("preserves a running request and confirms any explicit move away from uncertainty", async () => {
    await save();
    m.data = receipt("processing");
    await render();
    expect(button("Start another analysis")).toBeUndefined();
    m.data = receipt("uncertain");
    await render();
    await click("Start another analysis");
    expect(readAdviceReference(scope)).not.toBeNull();
    expect(body()).toContain("may have been charged");
    await click("Choose a new analysis");
    expect(readAdviceReference(scope)).toBeNull();
    expect(button("Analyze and suggest").disabled).toBe(true);
    expect(m.start).not.toHaveBeenCalled();
  });
  it("clears only a confirmed missing request reference after a separate confirmation", async () => {
    await save();
    m.error = { data: { code: "NOT_FOUND" } };
    await render();
    await click("Start another analysis");
    await click("Choose a new analysis");
    expect(readAdviceReference(scope)).toBeNull();
    expect(m.start).not.toHaveBeenCalled();
  });
  it("does not write or apply stale work after logout", async () => {
    let resolve!: (r: any) => void;
    m.start.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await render();
    await check();
    await click("Analyze and suggest");
    await act(async () => {
      await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
      clearKnowledgeWorkspace();
      resolve(receipt());
    });
    expect(readAdviceReference(scope)).toBeNull();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("renders Arabic guidance without leaking translation keys", async () => {
    m.language = "ar";
    await save();
    m.data = receipt();
    await render();
    expect(body()).toContain("لا تقيس احتراف المبيعات");
    expect(body()).not.toMatch(/product(?:Advice|Import|Workspace)Ux\./);
  });
});
