// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({
  merchant: 20,
  path: "/merchant/insights",
  data: {} as any,
  error: null as any,
  fetching: false,
  refetch: vi.fn(),
  input: {} as any,
  blob: undefined as Blob | undefined,
  downloads: [] as string[],
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7 } }) } },
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) },
    },
    insights: {
      workspace: {
        useQuery: (input: any) => {
          m.input = input;
          return {
            data: m.data,
            error: m.error,
            isError: !!m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          };
        },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("wouter", () => ({
  useLocation: () => [m.path, vi.fn()],
  Link: ({ children, ...props }: any) =>
    React.createElement("a", props, children),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string, values?: any) => {
      const value = key.split(".").reduce((obj: any, k) => obj?.[k], ar) ?? key;
      return typeof value === "string"
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, k: string) => values?.[k] ?? ""
          )
        : value;
    },
  }),
}));
import InsightsDashboard from "../client/src/pages/merchant/InsightsDashboard";
import { toast } from "sonner";
let root: Root, container: HTMLDivElement;
const paging = { page: 1, pages: 1, total: 1, pageSize: 20, offset: 0 };
const fixture = () => ({
  merchantId: 20,
  period: "30d",
  from: "2026-08-30T00:00:00.000Z",
  through: "2026-09-29T00:00:00.000Z",
  keywords: {
    ...paging,
    suggested: 1,
    markedResponseCreated: 0,
    categories: [{ category: "question", count: 1 }],
    rows: [
      {
        id: 1,
        keyword: "=سؤال مهم",
        frequency: 15,
        category: "question",
        status: "new",
        suggestedResponse: "اقتراح <img src=x> للمراجعة",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-09-28T00:00:00.000Z",
      },
    ],
  },
  reports: {
    ...paging,
    rows: [
      {
        id: 2,
        weekStart: "2026-09-21T00:00:00.000Z",
        weekEnd: "2026-09-27T23:59:59.000Z",
        createdAt: "2026-09-28T00:00:00.000Z",
        observation: {
          total: 10,
          positive: 4,
          negative: 1,
          neutral: 2,
          classified: 7,
          unclassified: 3,
          valid: true,
          positiveShare: 40,
        },
        emailMarkedSent: false,
        emailSentAt: null,
      },
    ],
  },
  tests: {
    ...paging,
    evidenceKind: "legacy_unverified_observations",
    statisticalConfidence: null,
    activationAllowed: false,
    rows: [
      {
        id: 3,
        name: "اختبار الشحن",
        keyword: "الشحن",
        status: "paused",
        createdAt: "2026-09-01T00:00:00.000Z",
        startedAt: null,
        completedAt: null,
        storedSelection: "variant_a",
        variantA: {
          text: "صيغة أ",
          total: 0,
          positive: 0,
          valid: true,
          ratio: null,
        },
        variantB: {
          text: "صيغة ب",
          total: 10,
          positive: 11,
          valid: false,
          ratio: null,
        },
      },
    ],
  },
});
const render = () =>
  act(async () => root.render(React.createElement(InsightsDashboard)));
function button(label: string) {
  const node = [...document.querySelectorAll("button")].find(
    el => el.textContent?.trim() === label
  );
  if (!node) throw Error("Missing " + label);
  return node;
}
const click = (label: string) =>
  act(async () => {
    const el = button(label);
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    el.click();
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.merchant = 20;
  m.path = "/merchant/insights";
  m.data = fixture();
  m.error = null;
  m.fetching = false;
  m.downloads = [];
  m.blob = undefined;
  m.refetch.mockImplementation(async () => ({ data: m.data }));
  URL.createObjectURL = vi.fn((blob: Blob) => {
    m.blob = blob;
    return "blob:test-insights";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    m.downloads.push(this.download);
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
});
describe("truthful insight workspace UI", () => {
  it("shows the keyword cohort and lifetime meaning with full escaped suggestions", async () => {
    await render();
    expect(container.textContent).toContain(ar.insightsWorkspace.keywordHelp);
    expect(container.textContent).toContain("اقتراح <img src=x> للمراجعة");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("undefined");
  });
  it("opens A/B directly from its route and exposes sample limitations instead of a winner", async () => {
    m.path = "/merchant/ab-tests";
    await render();
    expect(
      button(ar.insightsWorkspace.tests).getAttribute("aria-selected")
    ).toBe("true");
    expect(container.textContent).toContain("اختبار الشحن");
    expect(container.textContent).toContain(ar.insightsWorkspace.testHelp);
    expect(container.textContent).toContain(ar.insightsWorkspace.invalid);
    expect(container.textContent).toContain(ar.insightsWorkspace.unavailable);
    expect(container.textContent).not.toContain("99%");
  });
  it("opens saved suggestions from the suggestions route and follows route changes", async () => {
    m.path = "/merchant/ab-tests";
    await render();
    m.path = "/merchant/ai-suggestions";
    await render();
    expect(
      button(ar.insightsWorkspace.keywords).getAttribute("aria-selected")
    ).toBe("true");
  });
  it("renders report dates, unclassified counts and positive share without crashing", async () => {
    await render();
    await click(ar.insightsWorkspace.reports);
    expect(container.textContent).toContain(ar.insightsWorkspace.positiveShare);
    expect(container.textContent).toContain(ar.insightsWorkspace.unclassified);
    expect(container.textContent).toContain(ar.insightsWorkspace.ratioHelp);
    expect(container.textContent).not.toContain("Invalid Date");
  });
  it("represents absent samples as unavailable and genuine empty tabs explicitly", async () => {
    m.data.reports.rows[0].observation = {
      total: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      unclassified: 0,
      valid: true,
      positiveShare: null,
    };
    await render();
    await click(ar.insightsWorkspace.reports);
    expect(container.textContent).toContain(ar.insightsWorkspace.unavailable);
    m.data = fixture();
    m.data.reports.rows = [];
    m.data.reports.total = 0;
    await render();
    expect(container.textContent).toContain(ar.insightsWorkspace.emptyReports);
    expect(button(ar.insightsWorkspace.export).disabled).toBe(true);
  });
  it("hides stale values on source failure and blocks export rather than showing zero results", async () => {
    m.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    await render();
    expect(container.textContent).toContain("تعذّر عرض الصفحة");
    expect(container.textContent).not.toContain("=سؤال مهم");
    expect(container.textContent).not.toContain(
      ar.insightsWorkspace.emptyKeywords
    );
    expect(button(ar.insightsWorkspace.export).disabled).toBe(true);
  });
  it("shows permission failures distinctly and rejects data from another selected tenant", async () => {
    m.error = { data: { code: "FORBIDDEN" } };
    await render();
    expect(container.textContent).toContain("تحتاج صلاحية");
    m.error = null;
    m.merchant = 21;
    await render();
    expect(container.textContent).not.toContain("=سؤال مهم");
    expect(button(ar.insightsWorkspace.export).disabled).toBe(true);
  });
  it("awaits refresh, locks repeats and rejects cached-error responses", async () => {
    let resolve!: (v: any) => void;
    m.refetch.mockImplementation(() => new Promise(yes => (resolve = yes)));
    await render();
    await click(ar.insightsWorkspace.refresh);
    expect(toast.success).not.toHaveBeenCalled();
    expect(button(ar.insightsWorkspace.refresh).disabled).toBe(true);
    await click(ar.insightsWorkspace.refresh);
    expect(m.refetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ data: m.data, error: Error("offline") }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      ar.insightsWorkspace.refreshFailed
    );
  });
  it("acknowledges a successful refresh only when its result arrives", async () => {
    await render();
    await click(ar.insightsWorkspace.refresh);
    expect(toast.success).toHaveBeenCalledWith(ar.insightsWorkspace.refreshed);
  });
  it("ignores refresh completion after switching merchants", async () => {
    let resolve!: (v: any) => void;
    m.refetch.mockImplementation(() => new Promise(yes => (resolve = yes)));
    await render();
    await click(ar.insightsWorkspace.refresh);
    const old = m.data;
    m.merchant = 21;
    m.data = { ...fixture(), merchantId: 21 };
    await render();
    await act(async () => resolve({ data: old }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("paginates the selected tab and resets every page when the period changes", async () => {
    m.data.keywords.pages = 3;
    m.data.keywords.total = 45;
    await render();
    await click(ar.common.next);
    expect(m.input.keywordPage).toBe(2);
    await click(ar.insightsWorkspace.days.replace("{{count}}", "7"));
    expect(m.input).toEqual({
      period: "7d",
      keywordPage: 1,
      reportPage: 1,
      testPage: 1,
    });
    expect(container.textContent).not.toContain("=سؤال مهم");
    expect(button(ar.insightsWorkspace.export).disabled).toBe(true);
  });
  it("exports only the displayed page with explicit metadata and inert spreadsheet text", async () => {
    await render();
    await click(ar.insightsWorkspace.export);
    expect(m.downloads).toEqual(["sary-insights-keywords-30d-page-1.csv"]);
    expect(m.blob?.type).toBe("text/csv;charset=utf-8");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(m.blob!);
    });
    expect(text).toContain("displayed page only");
    expect(text).toContain('"\'=سؤال مهم"');
    expect(text).toContain("lifetime_frequency");
    expect(text).not.toContain("sampleMessages");
  });
});
