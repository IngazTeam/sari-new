// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import type { ReportSnapshot } from "../shared/report-workspace";
const m = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  fetching: false,
  loading: false,
  paused: false,
  language: "en",
  selection: null as any,
  refresh: vi.fn(),
  workbook: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    reports: {
      workspace: {
        useQuery: (input: any) => {
          m.selection = input;
          return {
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            isLoading: m.loading,
            fetchStatus: m.paused ? "paused" : "idle",
            dataUpdatedAt: 10,
            refetch: m.refresh,
          };
        },
      },
    },
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
      ).replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? "")),
  }),
}));
vi.mock("../client/src/lib/report-export", () => ({
  reportWorkbook: m.workbook,
}));
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind, onRetry, description }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      description,
      onRetry && React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (e: any) =>
    e?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : e?.data?.code === "UNAUTHORIZED"
        ? "session"
        : "error",
}));
import { ReportsWorkspace } from "../client/src/components/merchant/ReportsWorkspace";

const base = {
  merchantId: 20,
  period: "month" as const,
  from: "2026-09-01T12:00:01.000Z",
  through: "2026-09-30T12:00:00.000Z",
  timeZone: "UTC" as const,
};
function data(kind: ReportSnapshot["kind"] = "sales"): ReportSnapshot {
  if (kind === "sales")
    return {
      ...base,
      kind,
      currency: "SAR",
      previousFrom: "2026-08-02T12:00:01.000Z",
      previousThrough: "2026-09-01T12:00:00.000Z",
      totalOrders: 4,
      validAmountOrders: 3,
      excludedAmounts: 1,
      totalRevenue: 12345,
      markedPaidMinor: 1000,
      averageOrderValue: 4115,
      totalConversations: 2,
      conversionRate: 200,
      previousRevenue: 10000,
      previousExcludedAmounts: 0,
      growth: 23.45,
      growthAvailable: true,
      productSample: {
        inspectedOrders: 4,
        eligibleOrders: 4,
        excludedOrders: 2,
        includedItems: 2,
        excludedItems: 1,
        omittedOrders: 0,
        orderLimit: 250,
      },
      topProducts: [
        { name: "<img src=x onerror=alert(1)>", quantity: 2, revenue: 1000 },
      ],
    };
  if (kind === "customers")
    return {
      ...base,
      kind,
      totalCustomers: 2,
      newCustomers: 1,
      activeCustomers: 1,
      unknownPhoneConversations: 1,
      retentionRate: 50,
      topCustomers: [
        {
          conversationId: 55,
          customerName: '=HYPERLINK("https://example.test")',
          customerPhone: "0500000000",
          purchaseCount: 3,
          totalSpent: null,
        },
      ],
    };
  return {
    ...base,
    kind,
    totalConversations: 4,
    withPurchase: 1,
    invalidPurchaseCounters: 1,
    averageResponseTime: null,
    satisfactionRate: null,
    responseTimeAvailable: false,
    satisfactionAvailable: false,
    topicsAvailable: false,
    conversionRate: 25,
    topTopics: [],
  };
}
let root: Root,
  host: HTMLDivElement,
  frames: Map<number, FrameRequestCallback>,
  frameId: number;
const render = async (scope = "7:20:reports") =>
  act(() =>
    root.render(React.createElement(ReportsWorkspace, { key: scope, scope }))
  );
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const click = async (text: string) => act(() => button(text).click());
const select = async (id: string, value: string) =>
  act(() => {
    const el = host.querySelector<HTMLSelectElement>(`#${id}`)!;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const frame = async () =>
  act(() => {
    const pending = Array.from(frames.values());
    frames.clear();
    pending.forEach(f => f(0));
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(m, {
    data: data(),
    error: null,
    fetching: false,
    loading: false,
    paused: false,
    language: "en",
    selection: null,
  });
  m.workbook.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  frames = new Map();
  frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:local-report");
      static revokeObjectURL = vi.fn();
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.spyOn(window, "print").mockImplementation(() => {});
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("actual tenant reports workspace", () => {
  it("renders the selected report, literal hostile text and explicit samples", async () => {
    await render();
    expect(m.selection).toEqual({
      kind: "sales",
      period: "month",
      currency: "SAR",
    });
    expect(host.textContent).toContain("123.45");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.textContent).toContain("4 of 4");
    expect(button("Export Excel").disabled).toBe(false);
  });
  it.each(["fetching", "loading", "paused"])(
    "does not expose a cached report or export during %s",
    async flag => {
      (m as any)[flag] = true;
      await render();
      expect(host.querySelector("[data-report-result]")).toBeNull();
      expect(button("Export Excel").disabled).toBe(true);
      expect(
        host.querySelector(
          `[data-state=${flag === "paused" ? "offline" : "loading"}]`
        )
      ).not.toBeNull();
    }
  );
  it.each(["FORBIDDEN", "UNAUTHORIZED", "INTERNAL_SERVER_ERROR"])(
    "shows %s rather than stale values",
    async code => {
      m.error = { data: { code } };
      await render();
      expect(host.querySelector("[data-report-result]")).toBeNull();
      expect(button("Print / Save PDF").disabled).toBe(true);
      await click("Retry");
      expect(m.refresh).toHaveBeenCalledOnce();
    }
  );
  it.each(["merchant", "period", "currency", "malformed"])(
    "rejects a %s mismatch instead of waiting forever",
    async mode => {
      if (mode === "merchant") m.data.merchantId = 21;
      if (mode === "period") m.data.period = "day";
      if (mode === "currency") m.data.currency = "USD";
      if (mode === "malformed") delete m.data.totalRevenue;
      await render();
      expect(host.querySelector("[data-state=error]")).not.toBeNull();
      expect(host.querySelector("[data-report-result]")).toBeNull();
    }
  );
  it("switches report kind and hides the prior result until the selected snapshot arrives", async () => {
    await render();
    await click("Customers");
    expect(m.selection.kind).toBe("customers");
    expect(host.querySelector("[data-report-result]")).toBeNull();
    expect(host.querySelector("#report-currency")).toBeNull();
    m.data = data("customers");
    await render();
    expect(host.textContent).toContain("0500000000");
    expect(host.textContent).toContain("Legacy value · unknown unit");
    await click("Conversations");
    m.data = data("conversations");
    await render();
    expect(host.textContent).toContain("25%");
    expect(host.textContent).toContain("Not measured yet");
  });
  it("exports exactly the displayed snapshot, source notes, excluded data and phone literals", async () => {
    await render();
    await click("Customers");
    m.data = data("customers");
    await render();
    let attached = false;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      attached = document.body.contains(this);
    });
    await click("Export Excel");
    expect(attached).toBe(true);
    expect(m.workbook).toHaveBeenCalledOnce();
    const doc = m.workbook.mock.calls[0][0];
    expect(doc.rows[0]).toContain("0500000000");
    expect(doc.rows[0][1]).toContain("=HYPERLINK");
    expect(doc.details[0].value).toContain("1");
    expect(doc.note).toContain("no documented unit");
    expect(host.textContent).toContain("Download");
  });
  it.each(["currency", "language", "scope", "fetching"])(
    "abandons a pending download after %s changes",
    async mode => {
      let resolve!: (value: ArrayBuffer) => void;
      m.workbook.mockReturnValue(new Promise<ArrayBuffer>(r => (resolve = r)));
      await render();
      await click("Export Excel");
      if (mode === "currency") await select("report-currency", "USD");
      if (mode === "language") {
        m.language = "ar";
        await render();
      }
      if (mode === "scope") await render("7:21:reports");
      if (mode === "fetching") {
        m.fetching = true;
        await render();
      }
      await act(async () => resolve(new ArrayBuffer(1)));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    }
  );
  it("allows retry after workbook generation fails and prevents duplicate export starts", async () => {
    let reject!: (e: Error) => void;
    m.workbook.mockReturnValue(new Promise((_, r) => (reject = r)));
    await render();
    await click("Export Excel");
    expect(button("Preparing file…").disabled).toBe(true);
    await act(async () => reject(Error("local failure")));
    expect(host.querySelector("[role=alert]")?.textContent).toContain("export");
    expect(button("Export Excel").disabled).toBe(false);
  });
  it("prints the reviewed snapshot with method expanded and cleans up after printing", async () => {
    await render();
    await click("Print / Save PDF");
    const portal = document.querySelector(".rw-print");
    expect(portal?.querySelector("details")?.open).toBe(true);
    expect(portal?.textContent).toContain("23.45%");
    await frame();
    await frame();
    expect(window.print).toHaveBeenCalledOnce();
    await act(() => window.dispatchEvent(new Event("afterprint")));
    expect(document.querySelector(".rw-print")).toBeNull();
  });
  it("cancels a queued print when selection changes", async () => {
    await render();
    await click("Print / Save PDF");
    await select("report-period", "week");
    await frame();
    await frame();
    expect(window.print).not.toHaveBeenCalled();
    expect(document.querySelector(".rw-print")).toBeNull();
  });
  it("preserves null denominators and distinguishes unavailable item units from zero orders", async () => {
    m.data = {
      ...data(),
      totalConversations: 0,
      conversionRate: null,
      averageOrderValue: null,
      growth: null,
      growthAvailable: false,
      topProducts: [],
    };
    await render();
    expect(host.textContent).toContain("Orders exist");
    expect(host.textContent).toContain("Not measured yet");
    expect(host.textContent).not.toContain(
      "No matching records in the displayed scope"
    );
  });
  it("renders Arabic with RTL and no unresolved translation keys", async () => {
    m.language = "ar";
    await render();
    expect(host.querySelector(".rw-workspace")?.getAttribute("dir")).toBe(
      "rtl"
    );
    expect(host.textContent).toContain("طريقة الحساب والعينة");
    expect(host.textContent).not.toContain("reportWorkspaceUx.");
  });
});
