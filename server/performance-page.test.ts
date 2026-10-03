// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { performanceFixture } from "./tests/helpers/performance-fixture";
import {
  performanceRows,
  performanceCsv,
} from "../client/src/lib/performance-report";
const m = vi.hoisted(() => ({
  data: undefined as any,
  error: null as any,
  merchantError: null as any,
  merchantId: 20,
  fetching: false,
  merchantFetching: false,
  query: vi.fn(),
  refetch: vi.fn(),
  merchantRefetch: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  filename: "",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    merchants: {
      getCurrent: {
        useQuery: () => ({
          data: { id: m.merchantId },
          error: m.merchantError,
          isFetching: m.merchantFetching,
          refetch: m.merchantRefetch,
        }),
      },
    },
    performance: {
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
    i18n: { language: "ar" },
    t: (key: string) => key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key,
  }),
}));
import { PerformanceWorkspace } from "../client/src/components/merchant/PerformanceWorkspace";
const t = (key: string) =>
    key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key,
  l = ar.performanceWorkspace;
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(PerformanceWorkspace)));
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
const click = (text: string) =>
  act(async () => {
    button(text).click();
  });
const fill = (id: string, value: string) =>
  act(async () => {
    const input = container.querySelector<HTMLInputElement>("#" + id)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T10:00:00Z"));
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = performanceFixture();
  m.error = null;
  m.merchantError = null;
  m.merchantId = 20;
  m.fetching = false;
  m.merchantFetching = false;
  m.filename = "";
  m.refetch.mockResolvedValue({ data: m.data });
  m.merchantRefetch.mockResolvedValue({ data: { id: 20 } });
  URL.createObjectURL = vi.fn(() => "blob:performance");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    expect(this.isConnected).toBe(true);
    m.filename = this.download;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("performance evidence workspace", () => {
  it("renders all observations, samples, period bounds and seven unmeasured claims", async () => {
    await render();
    expect(m.query).toHaveBeenCalledWith(
      { startDate: "2026-09-01", endDate: "2026-09-30" },
      { staleTime: 0, refetchOnMount: "always" }
    );
    expect(container.querySelectorAll("[data-performance]")).toHaveLength(21);
    expect(container.textContent).toContain(l.unlinkedReviews);
    expect(performanceRows(m.data, t).some(row => row.includes(l.unlinkedReviews))).toBe(true);
    expect(container.querySelectorAll("#pf-limits + p")).toHaveLength(1);
    expect(
      container
        .querySelector("[aria-labelledby=pf-limits]")
        ?.querySelectorAll("dd")
    ).toHaveLength(7);
    for (const key of [
      "periodNote",
      "partial",
      "ordersNote",
      "repeatNote",
      "reviewsNote",
      "valueNote",
      "limitsNote",
    ] as const)
      expect(container.textContent).toContain(l[key]);
    expect(
      container.querySelector("[data-performance=average]")?.textContent
    ).toContain("٣٫٥");
    expect(container.textContent).toContain("SAR");
    expect(container.textContent).toContain("USD");
  });
  it.each([
    "error",
    "forbidden",
    "merchant-error",
    "foreign",
    "stale-range",
    "fetching",
    "merchant-fetching",
    "missing",
  ])("hides cached figures and blocks export for %s", async kind => {
    if (kind === "error") m.error = Error("source");
    if (kind === "forbidden") m.error = { data: { code: "FORBIDDEN" } };
    if (kind === "merchant-error") m.merchantError = Error("owner");
    if (kind === "foreign") m.data.merchantId = 99;
    if (kind === "stale-range") m.data.selection.startDate = "2026-08-01";
    if (kind === "fetching") m.fetching = true;
    if (kind === "merchant-fetching") m.merchantFetching = true;
    if (kind === "missing") m.data = undefined;
    await render();
    expect(container.querySelector(".pf-report")).toBeNull();
    expect(button(l.export).disabled).toBe(true);
  });
  it("keeps date edits local until apply and prevents exporting the previous selection", async () => {
    await render();
    await fill("pf-start", "2026-09-20");
    expect(m.query).toHaveBeenLastCalledWith(
      m.data.selection,
      expect.any(Object)
    );
    expect(container.textContent).toContain(l.dirty);
    expect(button(l.export).disabled).toBe(true);
    await click(l.apply);
    expect(m.query).toHaveBeenLastCalledWith(
      { startDate: "2026-09-20", endDate: "2026-09-30" },
      expect.any(Object)
    );
    expect(container.querySelector(".pf-report")).toBeNull();
  });
  it.each([
    ["2026-10-01", "2026-09-30"],
    ["2026-01-01", "2026-09-30"],
    ["2026-09-01", "2026-10-01"],
    ["", "2026-09-30"],
  ])(
    "rejects invalid draft %s / %s without changing the query",
    async (start, end) => {
      await render();
      await fill("pf-start", start);
      await fill("pf-end", end);
      await click(l.apply);
      expect(container.querySelector("[role=alert]")?.textContent).toBe(
        l.rangeError
      );
      expect(
        container.querySelector("#pf-start")?.getAttribute("aria-describedby")
      ).toBe("pf-range-error");
      expect(m.query).toHaveBeenLastCalledWith(
        m.data.selection,
        expect.any(Object)
      );
    }
  );
  it("applies a preset and hides the previous cohort", async () => {
    await render();
    await click(l.days7);
    expect(m.query).toHaveBeenLastCalledWith(
      { startDate: "2026-09-24", endDate: "2026-09-30" },
      expect.any(Object)
    );
    expect(container.querySelector(".pf-report")).toBeNull();
  });
  it("exports both complete periods and keeps monetary units and currencies distinct", async () => {
    await render();
    await click(l.export);
    expect(m.filename).toBe("sary-performance-20-2026-09-01-2026-09-30.csv");
    expect(m.success).toHaveBeenCalledWith(l.exportReady);
    const rows = performanceRows(m.data, t);
    expect(rows).toContainEqual([l.totalValue, "SAR", 129.5, 100]);
    expect(rows).toContainEqual([l.totalValue, "USD", 20.5, 11]);
    expect(rows).toContainEqual([l.average, l.stars, 3.5, l.unavailable]);
    expect(rows).toContainEqual([l.proficiency, l.unavailable]);
    expect(performanceCsv(m.data, t).startsWith("\uFEFF")).toBe(true);
  });
  it("never announces a failed refresh as success and retries both sources", async () => {
    m.refetch.mockRejectedValue(Error("failed"));
    await render();
    await click(l.refresh);
    expect(m.merchantRefetch).toHaveBeenCalledTimes(1);
    expect(m.success).not.toHaveBeenCalled();
    expect(m.failure).toHaveBeenCalledWith(l.refreshFailed);
  });
  it("discards a late refresh notification after changing the range", async () => {
    let resolve!: (value: any) => void;
    m.refetch.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    await render();
    await click(l.refresh);
    await click(l.days7);
    await act(async () => resolve({ data: performanceFixture() }));
    expect(m.success).not.toHaveBeenCalled();
    expect(m.failure).not.toHaveBeenCalled();
  });
  it("does not turn an absent review sample into zero percent", async () => {
    m.data.current.reviews = {
      total: 0,
      valid: 0,
      invalid: 0,
      positive: 0,
      average: null,
      positiveShare: null,
    };
    await render();
    expect(
      container.querySelector("[data-performance=positiveShare]")?.textContent
    ).toContain(l.unavailable);
    expect(
      container.querySelector("[data-performance=validReviews]")?.textContent
    ).toContain("٠");
  });
  it("keeps language keys aligned and escapes CSV formula text", () => {
    expect(Object.keys(ar.performanceWorkspace).sort()).toEqual(
      Object.keys(en.performanceWorkspace).sort()
    );
    expect(performanceCsv(m.data, () => "=UNSAFE()")).toContain("'=UNSAFE()");
  });
});
