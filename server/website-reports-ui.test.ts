// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { websiteReportsEn as c } from "../client/src/locales/website-reports";
const api = vi.hoisted(() => ({
  list: {} as any,
  detail: {} as any,
  remove: vi.fn(),
  start: vi.fn(),
  refresh: vi.fn(),
  refreshList: vi.fn(),
  invalidate: vi.fn(),
  scope: "1:2",
  input: null as any,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => c[key.split(".").at(-1) as keyof typeof c] || key,
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(api.scope),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      websiteAnalysis: { invalidate: api.invalidate },
      sariBrain: { invalidate: api.invalidate },
    }),
    websiteAnalysis: {
      reports: {
        useQuery: (input: any) => {
          api.input = input;
          return { ...api.list, refetch: api.refreshList };
        },
      },
      report: { useQuery: () => ({ ...api.detail, refetch: api.refresh }) },
      deleteReviewedReport: {
        useMutation: () => ({ mutateAsync: api.remove }),
      },
      analyze: { useMutation: () => ({ mutateAsync: api.start }) },
    },
  },
}));
import { WebsiteReportsWorkspace } from "../client/src/components/WebsiteReportsWorkspace";
let root: Root, host: HTMLDivElement;
const report = () => ({
  id: 7,
  title: "Report title",
  url: "https://example.test/source",
  status: "completed",
  overallScore: 70,
  seoScore: 0,
  performanceScore: 60,
  uxScore: 50,
  contentQuality: 90,
  createdAt: "2026-09-29",
  updatedAt: "2026-09-29",
  scrapedContent: "<img src=x onerror=alert(1)> FULL SOURCE END",
  seoIssues: '["Stored issue"]',
  metaTags: "broken historical json",
  errorMessage: null,
});
const render = () =>
  act(async () => root.render(React.createElement(WebsiteReportsWorkspace)));
const body = () => document.body.textContent || "";
const button = (name: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    b => b.textContent === name
  )!;
const click = async (name: string) =>
  act(async () => {
    expect(button(name)).toBeTruthy();
    button(name).click();
  });
const acknowledge = () =>
  act(async () => {
    (
      document.querySelector(
        "[role=dialog] input[type=checkbox]"
      ) as HTMLInputElement
    ).click();
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scope = "1:2";
  api.list = {
    data: {
      items: [report()],
      total: 1,
      page: 1,
      totalPages: 1,
      canManage: true,
    },
  };
  api.detail = {
    data: {
      report: report(),
      products: [
        {
          id: 9,
          name: "Free sample",
          price: "0.00",
          currency: "SAR",
          inStock: 1,
          productUrl: "javascript:alert(1)",
        },
      ],
      insights: [
        {
          id: 4,
          title: "Saved suggestion",
          description: "Full suggestion",
          recommendation: "Verify first",
          impact: "Estimated only",
          priority: "high",
          type: "recommendation",
          category: "content",
        },
      ],
      revision: "a".repeat(64),
    },
  };
  api.refresh.mockResolvedValue({ data: api.detail.data });
  api.refreshList.mockResolvedValue({ data: api.list.data });
  api.remove.mockResolvedValue({ success: true });
  api.start.mockResolvedValue({ analysisId: 8 });
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
it("shows read failures separately from empty records even with cached data", async () => {
  api.list.error = Error("read");
  await render();
  expect(body()).toContain(c.readError);
  expect(body()).not.toContain(c.empty);
  expect(body()).not.toContain("Report title");
  expect(button(c.start).disabled).toBe(true);
});
it("shows a successful empty list without inventing results", async () => {
  api.list.data.items = [];
  api.list.data.total = 0;
  await render();
  expect(body()).toContain(c.empty);
  expect(body()).not.toContain(c.readError);
});
it("opens full source and suggestions, escapes HTML, preserves zero prices and unsafe links as text", async () => {
  await render();
  await click(c.open + " #7");
  expect(body()).toContain("FULL SOURCE END");
  expect(body()).toContain("Full suggestion");
  expect(body()).toContain("0.00");
  expect(body()).toContain(c.limitations);
  expect(document.querySelector("[role=dialog] img")).toBeNull();
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(body()).toContain("broken historical json");
});
it("requires acknowledgement and submits the exact reviewed revision once", async () => {
  await render();
  await click(c.open + " #7");
  expect(button(c.remove).disabled).toBe(true);
  await acknowledge();
  await click(c.remove);
  expect(api.remove).toHaveBeenCalledExactlyOnceWith({
    id: 7,
    expectedRevision: "a".repeat(64),
    acknowledged: true,
  });
  expect(body()).toContain(c.deleted);
});
it("blocks stale deletion until a fresh review and another acknowledgement", async () => {
  api.remove.mockRejectedValue({ data: { code: "CONFLICT" } });
  await render();
  await click(c.open + " #7");
  await acknowledge();
  await click(c.remove);
  expect(body()).toContain(c.conflict);
  expect(button(c.remove)).toBeUndefined();
  const dialog = document.querySelector("[role=dialog]")!;
  await act(async () => {
    Array.from(dialog.querySelectorAll("button"))
      .find(b => b.textContent === c.retry)!
      .click();
  });
  expect(button(c.remove).disabled).toBe(true);
  expect(api.refresh).toHaveBeenCalledOnce();
});
it.each(["pending", "analyzing"])(
  "hides scores and deletion for %s reports",
  async status => {
    api.detail.data.report.status = status;
    await render();
    await click(c.open + " #7");
    expect(body()).toContain(c.running);
    expect(body()).toContain(c.unavailable);
    expect(body()).not.toContain("70/100");
    expect(button(c.remove)).toBeUndefined();
  }
);
it("keeps read-only users able to review and export without starting or deleting", async () => {
  api.list.data.canManage = false;
  await render();
  expect(button(c.start).disabled).toBe(true);
  await click(c.open + " #7");
  expect(button(c.export).disabled).toBe(false);
  expect(button(c.remove)).toBeUndefined();
});
it("never presents cached detail as a successful read after failure", async () => {
  api.detail.error = Error("read");
  await render();
  await click(c.open + " #7");
  expect(body()).toContain(c.readError);
  expect(body()).not.toContain("FULL SOURCE END");
  expect(button(c.export).disabled).toBe(true);
});
it("resets destructive acknowledgement when the report revision changes", async () => {
  await render();
  await click(c.open + " #7");
  await acknowledge();
  api.detail.data = { ...api.detail.data, revision: "b".repeat(64) };
  await render();
  expect(button(c.remove).disabled).toBe(true);
});
it("resets an open report on a tenant switch", async () => {
  await render();
  await click(c.open + " #7");
  await acknowledge();
  api.scope = "1:3";
  await render();
  expect(document.querySelector("[role=dialog]")).toBeNull();
});
it("does not start an analysis just by opening its scope dialog", async () => {
  await render();
  await click(c.start);
  expect(body()).toContain(c.startEffect);
  expect(api.start).not.toHaveBeenCalled();
  expect(
    Array.from(document.querySelectorAll("[role=dialog] button")).find(
      b => b.textContent === c.start
    )?.disabled
  ).toBe(true);
});
it("exports the complete reviewed snapshot with its limitations", async () => {
  let exported: Blob | null = null;
  const BaseURL = URL;
  vi.stubGlobal("URL", class extends BaseURL {
    static createObjectURL(blob: Blob) { exported = blob; return "blob:test-report"; }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await render(); await click(c.open + " #7"); await click(c.export);
  expect(exported).not.toBeNull();
  const contents = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(exported!); });
  const parsed = JSON.parse(contents);
  expect(parsed.report.scrapedContent).toContain("FULL SOURCE END");
  expect(parsed.products[0].price).toBe("0.00");
  expect(parsed.insights[0].recommendation).toBe("Verify first");
  expect(parsed.limitations).toContain("not measured sales proficiency");
  expect(parsed.revision).toBe("a".repeat(64));
});
