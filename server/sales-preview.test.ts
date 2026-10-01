import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { TextDecoder, TextEncoder } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SalesPreviewModel,
  salesModes,
  salesQueries,
} from "../prototypes/tenant-dashboard/src/sales-preview-model";
import { previewPolicy } from "../prototypes/tenant-dashboard/preview-policy.mjs";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const base = "prototypes/tenant-dashboard/site/";
let dom: JSDOM | undefined,
  w: any,
  errors: unknown[] = [];
afterEach(() => {
  dom?.window.close();
  dom = undefined;
  vi.useRealTimers();
});
async function mount(search = "lang=en") {
  errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "sales-analytics.html", "utf8"), {
    url: "http://127.0.0.1:4329/sales-analytics.html?" + search,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.structuredClone = structuredClone;
  w.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      this.port1.unref();
      this.port2.unref();
    }
  };
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  runInContext(
    readFileSync(base + "sales-preview.js", "utf8"),
    dom.getInternalVMContext()
  );
  await vi.waitFor(() =>
    expect(w.document.querySelector("aside")).toBeTruthy()
  );
}
const content = () => w.document.body.textContent;
const button = (label: string) =>
  Array.from(w.document.querySelectorAll("button")).find(
    (b: any) => b.textContent === label
  ) as any;
async function select(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
}
const scope = (merchantId = 206, days = 30) => ({
  merchantId,
  currency: merchantId === 207 ? "USD" : "SAR",
  startDate: new Date(Date.UTC(2026, 9, 1, 12) - days * 86400000).toISOString(),
  endDate: "2026-10-01T12:00:00Z",
  groupBy: days > 30 ? "week" : "day",
  limit: 10,
});
describe("local sales model boundaries", () => {
  it.each(salesModes)(
    "supports %s with scoped fixtures for both tenants",
    mode => {
      for (const id of [206, 207]) {
        const model = new SalesPreviewModel(id, mode);
        for (const name of salesQueries)
          expect(() => model.read(name, scope(id))).not.toThrow();
        expect(model.retries).toBe(0);
        expect(() =>
          model.read("analytics.getTopProducts", scope(id === 206 ? 207 : 206))
        ).toThrow();
      }
    }
  );
  it("keeps amount, time and customer totals consistent across periods", () => {
    for (const days of [7, 30, 90, 365]) {
      const model = new SalesPreviewModel();
      const input = scope(206, days),
        kpi = model.read("analytics.getDashboardKPIs", input).data;
      for (const query of [
        "analytics.getRevenueTrends",
        "analytics.getHourlyAnalytics",
        "analytics.getWeekdayAnalytics",
      ] as const) {
        const rows = model.read(query, input).data;
        expect(rows.reduce((s: number, r: any) => s + r.orders, 0)).toBe(
          kpi.totalOrders
        );
        expect(rows.reduce((s: number, r: any) => s + r.revenue, 0)).toBe(
          kpi.totalRevenue
        );
      }
      expect(
        model.read("analytics.getCustomerSegments", input).data[0].count
      ).toBe(kpi.totalCustomers);
    }
    expect(
      new SalesPreviewModel().read("analytics.getDashboardKPIs", scope(206, 7))
        .data.totalOrders
    ).toBe(2);
    expect(
      new SalesPreviewModel().read(
        "analytics.getDashboardKPIs",
        scope(206, 365)
      ).data.totalOrders
    ).toBe(6);
  });
  it("rejects unknown queries and invalid periods", () => {
    const m = new SalesPreviewModel();
    expect(() => m.read("analytics.delete" as any, scope())).toThrow();
    for (const startDate of ["invalid", "2027-01-01", "2020-01-01"])
      expect(() =>
        m.read("analytics.getDashboardKPIs", { ...scope(), startDate })
      ).toThrow();
  });
  it("recovers only the selected section and isolates separate models", async () => {
    const a = new SalesPreviewModel(206, "failure"),
      b = new SalesPreviewModel(207, "failure");
    await a.refetch("analytics.getDashboardKPIs", scope());
    expect(a.read("analytics.getDashboardKPIs", scope()).isError).toBe(false);
    expect(a.read("analytics.getRevenueTrends", scope()).isError).toBe(true);
    expect(b.read("analytics.getDashboardKPIs", scope(207)).isError).toBe(true);
  });
  it("requires refreshing store identity to recover currency conflicts", async () => {
    const m = new SalesPreviewModel(206, "currency");
    expect(m.read("analytics.getDashboardKPIs", scope()).error?.data.code).toBe(
      "CONFLICT"
    );
    await m.refetch("merchants.getCurrent");
    expect(m.currency).toBe("USD");
    expect(m.read("analytics.getDashboardKPIs", scope()).isError).toBe(true);
    expect(
      m.read("analytics.getDashboardKPIs", { ...scope(), currency: "USD" })
        .isError
    ).toBe(false);
  });
});
describe("compiled actual sales screen", () => {
  it.each(["ar", "en"])(
    "renders all five sections and restored controls in %s",
    async language => {
      await mount("lang=" + language + "&range=90d&tab=products");
      const copy = language === "ar" ? ar : en;
      await vi.waitFor(() =>
        expect(w.document.querySelectorAll("h1")).toHaveLength(1)
      );
      expect(w.document.querySelector("#sales-period").value).toBe("90d");
      for (const id of [
        "overview",
        "products",
        "campaigns",
        "customers",
        "time",
      ]) {
        const el = w.document.querySelector(
          '[role=tab][id$="trigger-' + id + '"]'
        );
        el.dispatchEvent(
          new w.MouseEvent("mousedown", { bubbles: true, button: 0 })
        );
        await vi.waitFor(() =>
          expect(el.getAttribute("data-state")).toBe("active")
        );
        expect(w.location.search).toContain("tab=" + id);
        expect(w.location.search).toContain("range=90d");
        expect(content()).not.toMatch(
          /salesAnalyticsUx\.|analyticsEvidenceUx\.|\{\{/
        );
      }
      expect(content()).toContain(copy.salesAnalyticsUx.weekdays);
      expect(errors).toEqual([]);
    }
  );
  it.each(salesModes)(
    "renders %s without stale metrics or console errors",
    async mode => {
      await mount("lang=en&scenario=" + mode);
      await vi.waitFor(() =>
        expect(content()).toContain("Actual sales analytics preview")
      );
      if (mode === "stale") {
        expect(content()).not.toContain("999,999.99");
        expect(
          w.document.querySelectorAll("[role=alert]").length
        ).toBeGreaterThan(0);
      }
      if (mode === "loading" || mode === "section-loading") {
        button("Finish simulated loading").click();
        await vi.waitFor(() =>
          expect(w.document.querySelectorAll("h1")).toHaveLength(1)
        );
        expect(w.document.querySelector("[aria-busy=true]")).toBeNull();
      }
      if (mode === "partial") {
        expect(w.document.querySelectorAll("[role=alert]")).toHaveLength(1);
        expect(content()).toContain("Sample product A");
        w.document.querySelector("[role=alert] button").click();
        await vi.waitFor(() =>
          expect(w.document.querySelector("[role=alert]")).toBeNull()
        );
      }
      expect(errors).toEqual([]);
    }
  );
  it("recovers currency, switches tenants and preserves the selected period and language", async () => {
    await mount("lang=en&scenario=currency&tab=products&range=7d");
    w.document.querySelector("[role=alert] button").click();
    await vi.waitFor(() =>
      expect(w.document.querySelector("[role=alert]")).toBeNull()
    );
    expect(content()).toContain("USD");
    await select("aside select:nth-of-type(1)", "normal");
    const selects = w.document.querySelectorAll("aside select");
    selects[2].value = "207";
    selects[2].dispatchEvent(new w.Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(content()).toContain("Sample product B"));
    expect(content()).not.toContain("Sample product A");
    expect(w.document.querySelector("#sales-period").value).toBe("7d");
    expect(w.document.documentElement.lang).toBe("en");
    expect(errors).toEqual([]);
  });
  it("retains unrelated preview controls through period changes and browser history", async () => {
    await mount("lang=en&tenant=207&scenario=normal&tab=time");
    await select("#sales-period", "90d");
    expect(w.location.search).toContain("tab=time");
    expect(w.location.search).toContain("tenant=207");
    w.history.back();
    await vi.waitFor(() =>
      expect(w.document.querySelector("#sales-period").value).toBe("30d")
    );
    expect(w.location.search).toContain("lang=en");
  });
  it("has no server mutation or network implementation and enforces local frame policy", () => {
    const api = readFileSync(
      "prototypes/tenant-dashboard/src/sales-preview-api.ts",
      "utf8"
    );
    expect(api).not.toMatch(/\bfetch\(|useMutation|WebSocket|axios/);
    expect(
      previewPolicy("/sales-analytics.html", new URLSearchParams("embed=brain"))
    ).toContain("frame-ancestors 'self'");
    expect(
      previewPolicy("/sales-analytics.html", new URLSearchParams())
    ).toContain("frame-ancestors 'none'");
    expect(
      previewPolicy("/sales-analytics.html", new URLSearchParams())
    ).toContain("connect-src 'none'");
  });
});
