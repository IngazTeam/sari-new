// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Page from "../client/src/pages/merchant/AnalyticsDashboard";
const state = vi.hoisted(() => ({
  queries: {} as Record<string, any>,
  calls: [] as any[],
  language: "en",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: new Proxy(
    {},
    {
      get: (_, namespace: string) =>
        new Proxy(
          {},
          {
            get: (_, method: string) => ({
              useQuery: (input: any, options: any) => {
                const name = namespace + "." + method;
                state.calls.push({ name, input, options });
                if (!state.queries[name]) throw Error(name);
                return state.queries[name];
              },
            }),
          }
        ),
    }
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ??
      key,
    i18n: { language: state.language },
  }),
}));
let host: HTMLDivElement, root: Root;
let memory: ReturnType<typeof memoryLocation>;
const query = (data: any) => ({
  data,
  isError: false,
  isLoading: false,
  isFetching: false,
  refetch: vi.fn(async () => ({ data })),
});
const kpi = () => ({
  totalRevenue: 10000,
  totalOrders: 1,
  averageOrderValue: 10000,
  totalCustomers: 1,
  conversionRate: null,
  revenueGrowth: null,
  ordersGrowth: null,
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  memory = memoryLocation({ path: "/merchant/analytics", record: true });
  state.language = "en";
  state.calls = [];
  state.queries = {
    "merchants.getCurrent": query({ id: 20, currency: "SAR" }),
  };
  for (const name of [
    "getRevenueTrends",
    "getTopProducts",
    "getCampaignAnalytics",
    "getCustomerSegments",
    "getHourlyAnalytics",
    "getWeekdayAnalytics",
    "getDiscountCodeAnalytics",
  ])
    state.queries["analytics." + name] = query([]);
  state.queries["analytics.getDashboardKPIs"] = query(kpi());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const mount = () =>
  act(async () =>
    root.render(
      React.createElement(
        Router,
        { hook: memory.hook, searchHook: memory.searchHook },
        React.createElement(Page)
      )
    )
  );
const tab = async (name: string) => {
  const button = Array.from(host.querySelectorAll("[role=tab]")).find(
    e => e.textContent === name
  )!;
  expect(button).toBeTruthy();
  await act(async () =>
    button.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    )
  );
};
describe("sales analytics unavailable evidence", () => {
  it("restores period and tab from the URL and preserves unrelated parameters", async () => {
    memory.navigate("/merchant/analytics?range=1y&tab=products&from=hub");
    await mount();
    expect(host.querySelector<HTMLSelectElement>("#sales-period")?.value).toBe(
      "1y"
    );
    expect(
      host.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(en.salesAnalyticsUx.products);
    const input = state.calls.find(
      c => c.name === "analytics.getDashboardKPIs"
    ).input;
    expect(Date.parse(input.endDate) - Date.parse(input.startDate)).toBe(
      365 * 86400000
    );
    expect(input.currency).toBe("SAR");
    await tab(en.salesAnalyticsUx.campaigns);
    expect(memory.history.at(-1)).toContain("from=hub");
    expect(memory.history.at(-1)).toContain("tab=campaigns");
    await act(async () => {
      memory.navigate("/merchant/analytics?range=7d&tab=time");
    });
    expect(host.querySelector<HTMLSelectElement>("#sales-period")?.value).toBe(
      "7d"
    );
    expect(
      host.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(en.salesAnalyticsUx.time);
  });
  it("changes a period without losing the selected tab", async () => {
    await mount();
    await tab(en.salesAnalyticsUx.products);
    const select = host.querySelector<HTMLSelectElement>("#sales-period")!;
    await act(async () => {
      select.value = "90d";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(memory.history.at(-1)).toContain("range=90d");
    expect(memory.history.at(-1)).toContain("tab=products");
    expect(
      host.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(en.salesAnalyticsUx.products);
  });
  it("keeps independent results and filters usable when one section fails", async () => {
    state.queries["analytics.getRevenueTrends"].isError = true;
    state.queries["analytics.getTopProducts"].data = [
      {
        productId: 1,
        productName: "Visible product",
        totalSales: 2,
        totalRevenue: 100,
        averagePrice: 50,
        stockLevel: 3,
      },
    ];
    await mount();
    expect(host.querySelector("#sales-period")).toBeTruthy();
    expect(host.querySelectorAll("[role=alert]")).toHaveLength(1);
    expect(host.textContent).toContain("Visible product");
    expect(host.textContent).toContain("SAR 100.00");
    await act(async () =>
      host.querySelector<HTMLElement>("[role=alert] button")!.click()
    );
    expect(
      state.queries["analytics.getRevenueTrends"].refetch
    ).toHaveBeenCalledOnce();
    expect(
      state.queries["analytics.getDashboardKPIs"].refetch
    ).not.toHaveBeenCalled();
  });
  it.each(["ar", "en"])(
    "keeps every trend number available in an accessible table in %s",
    async language => {
      state.language = language;
      state.queries["analytics.getRevenueTrends"].data = [
        { date: "2026-09-01", orders: 2, revenue: 1250 },
      ];
      await mount();
      const copy =
        language === "ar" ? ar.salesAnalyticsUx : en.salesAnalyticsUx;
      expect(
        host.querySelector(".mw-sales-analytics")?.getAttribute("dir")
      ).toBe(language === "ar" ? "rtl" : "ltr");
      const table = host.querySelector("table")!;
      expect(table.querySelectorAll("thead th[scope=col]")).toHaveLength(3);
      expect(table.querySelectorAll("tbody th[scope=row]")).toHaveLength(31);
      expect(table.textContent).toContain(
        new Intl.NumberFormat(language === "ar" ? "ar-SA" : "en-GB", {
          style: "currency",
          currency: "SAR",
        }).format(12.5)
      );
      const group = host.querySelector("[role=group]")!;
      const before = table.textContent;
      await act(async () =>
        group.querySelectorAll<HTMLButtonElement>("button")[1].click()
      );
      expect(group.querySelector("[aria-pressed=true]")?.textContent).toBe(
        copy.value
      );
      expect(table.textContent).toBe(before);
    }
  );
  it("renders weekday names in the selected language instead of trusting Arabic source labels", async () => {
    state.queries["analytics.getWeekdayAnalytics"].data = [
      { day: "الأحد", dayNumber: 0, orders: 1, revenue: 100 },
    ];
    await mount();
    await tab(en.salesAnalyticsUx.time);
    expect(host.textContent).toContain("Sunday");
    expect(host.textContent).not.toContain("الأحد");
  });
  it("refreshes to the current time without requesting hidden campaign or hourly data", async () => {
    await mount();
    const refresh = Array.from(host.querySelectorAll("button")).find(
      b => b.textContent === en.salesAnalyticsUx.refresh
    )!;
    state.calls = [];
    vi.setSystemTime(new Date("2026-10-01T12:01:00Z"));
    await act(async () => refresh.click());
    for (const method of [
      "getDashboardKPIs",
      "getRevenueTrends",
      "getTopProducts",
      "getCustomerSegments",
    ]) {
      const call = state.calls.find(c => c.name === "analytics." + method);
      expect(call.input.endDate).toBe("2026-10-01T12:01:00.000Z");
      expect(call.options.enabled).not.toBe(false);
      expect(
        state.queries["analytics." + method].refetch
      ).not.toHaveBeenCalled();
    }
    expect(
      state.calls.find(c => c.name === "analytics.getCampaignAnalytics").options
        .enabled
    ).toBe(false);
    expect(
      state.calls.find(c => c.name === "analytics.getHourlyAnalytics").options
        .enabled
    ).toBe(false);
  });
  it("reloads the confirmed store when currency changed instead of retrying a stale currency forever", async () => {
    state.queries["analytics.getDashboardKPIs"].isError = true;
    state.queries["analytics.getDashboardKPIs"].error = {
      data: { code: "CONFLICT" },
    };
    await mount();
    await act(async () =>
      host.querySelector<HTMLElement>("[role=alert] button")!.click()
    );
    expect(
      state.queries["merchants.getCurrent"].refetch
    ).toHaveBeenCalledOnce();
    expect(
      state.queries["analytics.getDashboardKPIs"].refetch
    ).not.toHaveBeenCalled();
  });
  it("formats stored minor units and does not invent a comparison or purchase conversion", async () => {
    await mount();
    expect(host.textContent).toContain("SAR 100.00");
    expect(host.textContent).not.toContain("10,000.00");
    expect(host.textContent).toContain(en.analyticsEvidenceUx.noComparison);
    expect(host.textContent).toContain(en.salesAnalyticsUx.conversionScope);
    expect(host.textContent).not.toContain("0.0%");
  });
  it("uses the confirmed merchant currency and preserves the major-unit coupon value", async () => {
    state.queries["merchants.getCurrent"].data.currency = "USD";
    state.queries["analytics.getDiscountCodeAnalytics"].data = [
      {
        code: "TEN",
        type: "fixed",
        value: 10,
        usageCount: 1,
        revenue: 1234,
        averageOrderValue: 1234,
      },
    ];
    await mount();
    await tab(en.analyticsDashboardPage.tabCampaigns);
    const row = Array.from(host.querySelectorAll("tbody tr")).find(r =>
      r.textContent?.includes("TEN")
    );
    expect(row?.textContent).toContain("US$10.00");
    expect(row?.textContent).toContain("US$12.34");
    expect(row?.textContent).not.toContain("SAR");
  });
  it("keeps the chosen campaign tab across loading and retry", async () => {
    state.queries["analytics.getCampaignAnalytics"].isFetching = true;
    await mount();
    await tab(en.analyticsDashboardPage.tabCampaigns);
    expect(host.querySelector("[role=tablist]")).toBeTruthy();
    state.queries["analytics.getCampaignAnalytics"].isFetching = false;
    await mount();
    expect(
      host.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(en.analyticsDashboardPage.tabCampaigns);
    expect(host.textContent).toContain(en.salesAnalyticsUx.campaignScope);
  });
  it.each(["ar", "en"])(
    "renders a store read error without starting analytics in %s",
    async language => {
      state.language = language;
      state.queries["merchants.getCurrent"] = {
        ...query({ id: 999 }),
        isError: true,
      };
      await mount();
      expect(host.textContent).toContain(
        (language === "ar" ? ar : en).analyticsEvidenceUx.storeFailed
      );
      expect(
        state.calls.filter(c => c.name.startsWith("analytics."))
      ).toHaveLength(0);
    }
  );
  it("hides stale totals and retries the currently visible queries after a failed read", async () => {
    state.queries["analytics.getDashboardKPIs"].isError = true;
    await mount();
    expect(host.textContent).toContain(en.analyticsEvidenceUx.failedHelp);
    expect(host.textContent).not.toContain("SAR 100.00");
    await act(async () =>
      host.querySelector<HTMLElement>("[role=alert] button")!.click()
    );
    expect(
      state.queries["analytics.getDashboardKPIs"].refetch
    ).toHaveBeenCalledOnce();
    expect(
      state.queries["analytics.getCampaignAnalytics"].refetch
    ).not.toHaveBeenCalled();
    state.queries["analytics.getDashboardKPIs"].isError = false;
    await mount();
    expect(host.querySelector("[role=tablist]")).toBeTruthy();
  });
  it.each(["isFetching", "isLoading"])(
    "hides cached totals while %s",
    async flag => {
      state.queries["analytics.getDashboardKPIs"][flag] = true;
      await mount();
      expect(host.querySelector("[role=tablist]")).toBeTruthy();
      expect(host.textContent).not.toContain("SAR 100.00");
    }
  );
  it("does not treat an undefined successful-looking response as zero", async () => {
    state.queries["analytics.getDashboardKPIs"].data = undefined;
    await mount();
    expect(host.textContent).toContain(en.analyticsEvidenceUx.failedHelp);
  });
  it("renders campaign evidence gaps neutrally without fabricated percentages", async () => {
    state.queries["analytics.getCampaignAnalytics"].data = [
      {
        campaignId: 1,
        campaignName: "Fixture campaign",
        sentCount: 9,
        openRate: null,
        clickRate: null,
        conversionRate: null,
        revenue: null,
        roi: null,
      },
    ];
    await mount();
    await tab(en.analyticsDashboardPage.tabCampaigns);
    expect(host.textContent).toContain("Fixture campaign");
    expect(host.textContent).toContain(en.salesAnalyticsUx.campaignScope);
    expect(host.textContent).toContain("Unavailable");
    expect(host.textContent).not.toContain("999+%");
    expect(host.textContent).not.toContain("65.0%");
    expect(host.textContent).not.toContain("25.0%");
  });
  it("treats campaign read failure as a retryable error instead of no campaigns", async () => {
    state.queries["analytics.getCampaignAnalytics"].isError = true;
    await mount();
    await tab(en.analyticsDashboardPage.tabCampaigns);
    expect(host.textContent).toContain(en.analyticsEvidenceUx.failedHelp);
    expect(host.textContent).not.toContain(
      en.analyticsDashboardPage.noCampaigns
    );
  });
  it("shows unknown stock without presenting it as zero stock", async () => {
    state.queries["analytics.getTopProducts"].data = [
      {
        productId: 9,
        productName: "Recorded item",
        totalSales: 1,
        totalRevenue: 100,
        averagePrice: 100,
        stockLevel: null,
      },
    ];
    await mount();
    await tab(en.analyticsDashboardPage.tabProducts);
    const row = Array.from(host.querySelectorAll("tbody tr")).find(r =>
      r.textContent?.includes("Recorded item")
    );
    expect(row?.textContent).toContain("Unavailable");
  });
});
