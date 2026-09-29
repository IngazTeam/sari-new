// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  data: {} as any,
  error: null as any,
  fetching: false,
  blob: undefined as Blob | undefined,
  filename: "",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    insights: {
      report: {
        useQuery: (input: any, options: any) => {
          m.query(input, options);
          return {
            data: m.data,
            isError: !!m.error,
            error: m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          };
        },
      },
    },
  },
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
import { InsightReportDetails } from "../client/src/components/merchant/InsightReportDetails";
let root: Root, container: HTMLDivElement;
const fixture = () => ({
  id: 3,
  merchantId: 20,
  weekStart: "2026-09-20T00:00:00.000Z",
  weekEnd: "2026-09-27T00:00:00.000Z",
  createdAt: "2026-09-28T00:00:00.000Z",
  emailMarkedSent: true,
  emailSentAt: "2026-09-28T01:00:00.000Z",
  evidenceKind: "legacy_report_without_generation_evidence",
  observation: {
    total: 10,
    positive: 4,
    negative: 1,
    neutral: 2,
    unclassified: 3,
    valid: true,
    positiveShare: 40,
  },
  topKeywords: {
    format: "list",
    items: ["shipping", "<img src=x>"],
    raw: null,
  },
  topComplaints: { format: "legacy", items: [], raw: "legacy complaint\ntext" },
  recommendations: {
    format: "list",
    items: ["=DANGEROUS(1)", 'Advice with "quotes"\nand another line'],
    raw: null,
  },
  historicalValues: {
    positivePercentage: 99,
    negativePercentage: 70,
    sentimentIndex: 100,
  },
});
const render = (merchantId = 20, reportId = 3) =>
  act(async () =>
    root.render(
      React.createElement(InsightReportDetails, { merchantId, reportId })
    )
  );
const open = () =>
  act(async () => {
    const el = container.querySelector("details")!;
    el.open = true;
    el.dispatchEvent(new Event("toggle"));
  });
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    el => el.textContent === label
  )!;
const blobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = fixture();
  m.error = null;
  m.fetching = false;
  m.blob = undefined;
  m.filename = "";
  URL.createObjectURL = vi.fn(blob => {
    m.blob = blob;
    return "blob:test-report";
  });
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
});
describe("full saved sentiment report review", () => {
  it("fetches only after opening and includes full safely rendered recommendations and legacy text", async () => {
    await render();
    expect(m.query).not.toHaveBeenCalled();
    await open();
    expect(m.query).toHaveBeenCalledWith(
      { reportId: 3 },
      { refetchOnMount: "always", staleTime: 0 }
    );
    expect(container.textContent).toContain("legacy complaint\ntext");
    expect(container.textContent).toContain("<img src=x>");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(ar.insightReport.evidence);
    expect(container.textContent).toContain(ar.insightReport.historyHelp);
    expect(container.textContent).toContain(ar.insightReport.oldIndex);
  });
  it("exports all text and evidence labels from the read snapshot with safe spreadsheet cells", async () => {
    await render();
    await open();
    await act(async () => button(ar.insightReport.export).click());
    expect(m.filename).toBe("sary-insight-report-3.csv");
    expect(m.blob).toBeDefined();
    const text = await blobText(m.blob!);
    expect(text).toContain(
      '"evidence","legacy_report_without_generation_evidence"'
    );
    expect(text).toContain('"recommendations","1","\'=DANGEROUS(1)"');
    expect(text).toContain('Advice with ""quotes""\nand another line');
    expect(text).toContain('"top_complaints_raw","legacy complaint\ntext"');
    expect(text).toContain('"unverified_historical_sentiment_index","100"');
    expect(text).toContain('"positive_share_percent","40"');
    expect(document.querySelector("a[download]")).toBeNull();
  });
  it.each([
    ["FORBIDDEN", ar.insightReport.failed],
    ["NOT_FOUND", ar.insightReport.missing],
    ["INTERNAL_SERVER_ERROR", ar.insightReport.failed],
  ])("hides stale contents and export after %s", async (code, label) => {
    m.error = { data: { code } };
    await render();
    await open();
    expect(container.textContent).toContain(label);
    expect(container.textContent).not.toContain("shipping");
    expect(button(ar.insightReport.export)).toBeUndefined();
    await act(async () => button(ar.keywordReview.retry).click());
    expect(m.refetch).toHaveBeenCalledOnce();
  });
  it.each([{ id: 4 }, { merchantId: 21 }])(
    "rejects a mismatched detail scope %j",
    async patch => {
      m.data = { ...fixture(), ...patch };
      await render();
      await open();
      expect(container.textContent).toContain(ar.insightReport.failed);
      expect(container.textContent).not.toContain("shipping");
      expect(button(ar.insightReport.export)).toBeUndefined();
    }
  );
  it("shows loading rather than a false empty result or stale exported content", async () => {
    m.fetching = true;
    await render();
    await open();
    expect(container.querySelector("[role=status]")).toBeTruthy();
    expect(container.textContent).not.toContain(ar.insightReport.noText);
    expect(button(ar.insightReport.export)).toBeUndefined();
  });
  it("distinguishes genuinely empty stored fields from a failed read", async () => {
    const empty = { format: "empty", items: [], raw: null };
    m.data = {
      ...fixture(),
      topKeywords: empty,
      topComplaints: empty,
      recommendations: empty,
    };
    await render();
    await open();
    expect(container.textContent?.split(ar.insightReport.noText)).toHaveLength(
      4
    );
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(button(ar.insightReport.export)).toBeTruthy();
  });
});
