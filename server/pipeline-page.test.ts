// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { pipelineFixture } from "./tests/helpers/pipeline-fixture";
const m = vi.hoisted(() => ({
  data: undefined as any,
  merchantId: 20 as number | undefined,
  error: null as any,
  merchantError: null as any,
  fetching: false,
  merchantFetching: false,
  query: vi.fn(),
  refetch: vi.fn(),
  merchantRefetch: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  language: "ar",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    merchants: {
      getCurrent: {
        useQuery: () => ({
          data: m.merchantId ? { id: m.merchantId } : undefined,
          error: m.merchantError,
          isFetching: m.merchantFetching,
          refetch: m.merchantRefetch,
        }),
      },
    },
    salesPipeline: {
      workspace: {
        useQuery: (input: any, options: any) => {
          m.query(input, options);
          return {
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          };
        },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.failure } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((v: any, k) => v?.[k], m.language === "en" ? en : ar) ?? key,
  }),
}));
import { PipelineWorkspace } from "../client/src/components/merchant/PipelineWorkspace";
import { pipelineSelectionKey } from "../client/src/components/merchant/PipelineReport";
let root: Root, container: HTMLDivElement;
const l = ar.pipelineWorkspace;
const render = () =>
  act(async () => root.render(React.createElement(PipelineWorkspace)));
const click = (selector: string) =>
  act(async () =>
    container.querySelector<HTMLButtonElement>(selector)!.click()
  );
const select = (value: string) =>
  act(async () => {
    const el = container.querySelector<HTMLSelectElement>("#pl-queue")!;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const refresh = () =>
  act(async () =>
    [...container.querySelectorAll("button")]
      .find(b => b.textContent === l.refresh)!
      .click()
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = pipelineFixture();
  m.merchantId = 20;
  m.error = null;
  m.merchantError = null;
  m.fetching = false;
  m.merchantFetching = false;
  m.language = "ar";
  m.refetch.mockResolvedValue({ data: m.data });
  m.merchantRefetch.mockResolvedValue({ data: { id: 20 } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("sales pipeline action workspace", () => {
  it.each(["__proto__", "constructor", "toString"])(
    "renders unrecognized loss reason %s as text",
    async reason => {
      m.data.losses = [{ reason, count: 1, share: 100 }];
      m.data.list.items[0].lossReason = reason;
      await render();
      expect(
        container.querySelector(".pl-analysis tbody th")?.textContent
      ).toBe(reason);
      expect(container.querySelector(".pl-items dl")?.textContent).toContain(
        reason
      );
    }
  );
  it("preserves every stage and action with results collapsed after the work list", async () => {
    await render();
    expect(container.querySelectorAll(".pl-actions button")).toHaveLength(4);
    expect(container.querySelectorAll("optgroup option")).toHaveLength(10);
    expect(container.querySelectorAll("[data-pipeline-item]")).toHaveLength(2);
    expect(container.querySelector(".pl-analysis")?.hasAttribute("open")).toBe(
      false
    );
    for (const text of [
      l.valuesNote,
      l.limitsNote,
      l.activityNote,
      l.openNote,
      l.purchased,
      l.paymentFailed,
      l.unknownStage,
    ])
      expect(container.textContent).toContain(text);
    expect(
      container.querySelector('a[href="/merchant/sales-hub"]')
    ).not.toBeNull();
    expect(
      container.querySelector('a[href="/merchant/sari-brain"]')
    ).not.toBeNull();
    expect(m.query).toHaveBeenCalledWith(
      { queue: "ready", page: 1, pageSize: 20 },
      { staleTime: 0, refetchOnMount: "always" }
    );
  });
  it.each([
    "error",
    "forbidden",
    "merchant-error",
    "foreign",
    "fetching",
    "merchant-fetching",
    "missing",
    "missing-both",
    "wrong-queue",
    "wrong-page",
  ])("hides cached private data for %s", async kind => {
    if (kind === "error") m.error = Error("source");
    if (kind === "forbidden") m.error = { data: { code: "FORBIDDEN" } };
    if (kind === "merchant-error") m.merchantError = Error("scope");
    if (kind === "foreign") m.data.merchantId = 21;
    if (kind === "fetching") m.fetching = true;
    if (kind === "merchant-fetching") m.merchantFetching = true;
    if (kind === "missing" || kind === "missing-both") m.data = undefined;
    if (kind === "missing-both") m.merchantId = undefined;
    if (kind === "wrong-queue") m.data.selection.queue = "all";
    if (kind === "wrong-page") m.data.selection.page = 2;
    await render();
    expect(container.querySelector(".pl-report")).toBeNull();
    expect(container.textContent).not.toContain("عميل تجريبي");
  });
  it("changes a queue without briefly showing the previous list", async () => {
    await render();
    await click('[data-pipeline-queue="pending"]');
    expect(m.query).toHaveBeenLastCalledWith(
      { queue: "pending", page: 1, pageSize: 20 },
      expect.any(Object)
    );
    expect(container.querySelector(".pl-report")).toBeNull();
    m.data = pipelineFixture({ queue: "pending", page: 1, pageSize: 20 });
    await render();
    expect(container.querySelectorAll("[data-pipeline-item]")).toHaveLength(20);
    await click('[data-pipeline-page="2"]');
    expect(m.query).toHaveBeenLastCalledWith(
      { queue: "pending", page: 2, pageSize: 20 },
      expect.any(Object)
    );
    m.data = pipelineFixture({ queue: "pending", page: 2, pageSize: 20 });
    await render();
    expect(container.querySelectorAll("[data-pipeline-item]")).toHaveLength(3);
    expect(
      container.querySelector<HTMLButtonElement>('[data-pipeline-page="3"]')!
        .disabled
    ).toBe(true);
    await select("stage:purchased");
    expect(m.query).toHaveBeenLastCalledWith(
      { queue: "stage", stage: "purchased", page: 1, pageSize: 20 },
      expect.any(Object)
    );
    m.data = pipelineFixture({
      queue: "stage",
      stage: "purchased",
      page: 1,
      pageSize: 20,
    });
    await render();
    expect(container.textContent).toContain(l.empty);
    await select("all");
    expect(m.query).toHaveBeenLastCalledWith(
      { queue: "all", page: 1, pageSize: 20 },
      expect.any(Object)
    );
  });
  it("escapes message previews, preserves encoded phone search and missing contact state", async () => {
    m.data.list.items[0].preview = '<img src=x onerror="alert(1)">';
    m.data.list.items[0].customerPhone = "+966&stage=paid";
    m.data.list.items[0].previewTruncated = true;
    m.data.list.items[1].customerPhone = "";
    await render();
    expect(container.querySelector(".pl-preview img")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect(container.textContent).toContain(l.truncated);
    expect(container.textContent).toContain(l.missingPhone);
    const link = container.querySelector<HTMLAnchorElement>(".pl-items a")!;
    const url = new URL(link.href);
    expect(url.searchParams.get("phone")).toBe("+966&stage=paid");
    expect(url.searchParams.get("stage")).toBeNull();
    expect(container.querySelectorAll(".pl-items a")).toHaveLength(1);
  });
  it("preserves legitimate zero and missing denominator separately", async () => {
    m.data.outcomes.paid = 0;
    m.data.outcomes.lost = 0;
    m.data.outcomes.paidStageShare = null;
    await render();
    expect(container.querySelector(".ov-metric strong")?.textContent).toBe(
      l.noSample
    );
    m.data.outcomes.lost = 2;
    m.data.outcomes.paidStageShare = 0;
    await render();
    expect(container.querySelector(".ov-metric strong")?.textContent).toBe(
      "٠%"
    );
  });
  it.each(["reject", "error", "foreign", "different-page", "missing"])(
    "does not announce unconfirmed refresh %s",
    async failure => {
      if (failure === "reject") m.refetch.mockRejectedValue(Error("failed"));
      else
        m.refetch.mockResolvedValue(
          failure === "error"
            ? { error: Error("source") }
            : failure === "missing"
              ? {}
              : {
                  data: {
                    ...m.data,
                    ...(failure === "foreign"
                      ? { merchantId: 21 }
                      : { selection: { ...m.data.selection, page: 2 } }),
                  },
                }
        );
      await render();
      await refresh();
      expect(m.merchantRefetch).toHaveBeenCalledTimes(1);
      expect(m.success).not.toHaveBeenCalled();
      expect(m.failure).toHaveBeenCalledWith(l.refreshFailed);
    }
  );
  it("does not acknowledge an old tenant refresh or allow concurrent clicks", async () => {
    let resolve!: (v: any) => void;
    m.refetch.mockReturnValue(new Promise(r => (resolve = r)));
    await render();
    await refresh();
    await refresh();
    expect(m.refetch).toHaveBeenCalledTimes(1);
    m.merchantId = 21;
    await render();
    await act(async () => resolve({ data: pipelineFixture() }));
    expect(m.success).not.toHaveBeenCalled();
    expect(m.failure).not.toHaveBeenCalled();
  });
  it("renders English and matches all translation keys", async () => {
    m.language = "en";
    await render();
    expect(container.querySelector("[dir]")?.getAttribute("dir")).toBe("ltr");
    expect(container.textContent).toContain(en.pipelineWorkspace.limitsNote);
    expect(container.textContent).not.toContain("pipelineWorkspace.");
    expect(Object.keys(ar.pipelineWorkspace).sort()).toEqual(
      Object.keys(en.pipelineWorkspace).sort()
    );
    expect(
      pipelineSelectionKey({ queue: "ready", page: 1, pageSize: 20 })
    ).not.toBe(pipelineSelectionKey({ queue: "ready", page: 2, pageSize: 20 }));
  });
});
