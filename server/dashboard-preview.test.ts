import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { TextDecoder, TextEncoder } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardPreviewModel,
  dashboardModes,
  dashboardQueries,
  dashboardSample,
} from "../prototypes/tenant-dashboard/src/dashboard-preview-model";
import { dashboardWorkspaceSchema } from "../shared/dashboard-workspace";
import { dashboardSourcesSchema } from "../shared/dashboard-sources";
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
  dom = new JSDOM(readFileSync(base + "dashboard.html", "utf8"), {
    url: "http://127.0.0.1:4329/dashboard.html?" + search,
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
    readFileSync(base + "dashboard-preview.js", "utf8"),
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
async function details() {
  const el = w.document.querySelector("details.mw-panel");
  el.open = true;
  el.dispatchEvent(new w.Event("toggle"));
  await vi.waitFor(() =>
    expect(button("Request suggestions") || button("طلب اقتراحات")).toBeTruthy()
  );
}
describe("actual dashboard preview model", () => {
  it.each(dashboardModes)(
    "keeps %s local, scoped and structurally valid",
    mode => {
      for (const merchantId of [198, 199]) {
        const model = new DashboardPreviewModel(merchantId, mode);
        for (const key of dashboardQueries)
          expect(() => model.read(key, { days: 90 })).not.toThrow();
        const workspace = model.read("dashboard.workspace", { days: 90 }).data;
        expect(dashboardWorkspaceSchema.safeParse(workspace).success).toBe(
          true
        );
        expect(workspace.merchantId).toBe(
          mode === "foreign" ? 999 : merchantId
        );
        expect(
          dashboardSourcesSchema.safeParse(model.read("dashboard.sources").data)
            .success
        ).toBe(true);
        expect(model.requests).toBe(0);
        expect(model.read("dashboard.getAiInsights").data).toBeUndefined();
      }
    }
  );
  it.each([7, 30, 90] as const)(
    "maintains exact %s day windows and null empty comparisons",
    days => {
      const sample = dashboardSample(198, days, true);
      expect(Date.parse(sample.through) - Date.parse(sample.from)).toBe(
        days * 86400000
      );
      expect(sample.growth.orders).toBeNull();
      expect(sample.current.averageValueMinor).toBeNull();
    }
  );
  it("deduplicates pending requests and retries an explicit simulated failure without leaking tenants or languages", async () => {
    vi.useFakeTimers();
    const a = new DashboardPreviewModel(198, "insights-failed"),
      b = new DashboardPreviewModel(199);
    const first = a.refetch("dashboard.getAiInsights", { language: "en" });
    expect(a.refetch("dashboard.getAiInsights", { language: "en" })).toBe(
      first
    );
    expect(a.requests).toBe(1);
    expect(
      a.read("dashboard.getAiInsights", { language: "en" }).isFetching
    ).toBe(true);
    await vi.runAllTimersAsync();
    await first;
    expect(a.read("dashboard.getAiInsights", { language: "en" }).isError).toBe(
      true
    );
    expect(b.requests).toBe(0);
    expect(
      a.read("dashboard.getAiInsights", { language: "ar" }).data
    ).toBeUndefined();
    const retry = a.refetch("dashboard.getAiInsights", { language: "en" });
    await vi.runAllTimersAsync();
    await retry;
    expect(a.read("dashboard.getAiInsights", { language: "en" }).isError).toBe(
      false
    );
    expect(a.requests).toBe(2);
  });
  it("recovers only the retried read, leaving independent failures visible", async () => {
    vi.useFakeTimers();
    const model = new DashboardPreviewModel(198, "failure");
    const work = model.refetch("dashboard.workspace", { days: 7 });
    await vi.runAllTimersAsync();
    await work;
    expect(model.read("dashboard.workspace", { days: 7 }).isError).toBe(false);
    expect(model.read("dashboard.sources").isError).toBe(true);
  });
});
describe("bundled actual dashboard interactions", () => {
  it.each(dashboardModes)(
    "renders the %s scenario without runtime errors or untranslated keys",
    async mode => {
      await mount("lang=en&scenario=" + mode);
      await vi.waitFor(() => {
        if (mode === "loading")
          expect(w.document.querySelector(".mw-home")).toBeNull();
        else if (mode === "store-failure")
          expect(w.document.querySelector("[role=alert]")).toBeTruthy();
        else expect(w.document.querySelector(".mw-home")).toBeTruthy();
      });
      if (!["loading", "store-failure"].includes(mode)) await details();
      expect(content()).not.toMatch(
        /dashboardHomeUx|dashboardAnalyticsUx|dashboardSourcesUx|trialNoticeUx|merchantUx\./
      );
      expect(errors).toEqual([]);
    }
  );
  it.each(["ar", "en"])(
    "renders %s with actual evidence, translations and local destinations",
    async lang => {
      await mount("lang=" + lang);
      await details();
      expect(w.document.querySelectorAll("h1")).toHaveLength(1);
      expect(w.document.documentElement.dir).toBe(
        lang === "ar" ? "rtl" : "ltr"
      );
      expect(
        w.document.querySelectorAll(".mw-home-brain-links a")
      ).toHaveLength(4);
      expect(content()).not.toMatch(
        /dashboardHomeUx|dashboardAnalyticsUx|dashboardSourcesUx|knowledgeGroupsUx|trialNoticeUx|merchantUx\./
      );
      expect(
        Array.from(w.document.querySelectorAll(".mw-home a")).every((a: any) =>
          a.getAttribute("href").startsWith("./#/page/merchant/")
        )
      ).toBe(true);
      expect(errors).toEqual([]);
    }
  );
  it("preserves the period, language and tenant in history and changes currency with tenant", async () => {
    await mount("lang=en&tenant=199&days=30");
    expect(w.document.querySelector("#dashboard-period").value).toBe("30");
    await select("#dashboard-period", "90");
    expect(w.location.search).toContain("days=90");
    expect(w.location.search).toContain("tenant=199");
    w.history.back();
    await vi.waitFor(() =>
      expect(w.document.querySelector("#dashboard-period").value).toBe("30")
    );
    expect(content()).toContain("Demo B");
    expect(content()).toContain("US$");
    expect(errors).toEqual([]);
  });
  it("keeps suggestions lazy, presents failure and recovers through the visible retry", async () => {
    await mount("lang=en&scenario=insights-failed");
    await details();
    expect(content()).toContain("Local suggestion requests: 0");
    button("Request suggestions").click();
    await vi.waitFor(() =>
      expect(content()).toContain("Local suggestion requests: 1")
    );
    await vi.waitFor(() =>
      expect(w.document.querySelector("[role=alert]")).toBeTruthy()
    );
    expect(content()).not.toContain("Local sample: review failed files");
    button("Retry").click();
    await vi.waitFor(() =>
      expect(content()).toContain("Local sample: review failed files")
    );
    expect(content()).toContain("Local suggestion requests: 2");
    expect(errors).toEqual([]);
  });
  it.each(["foreign", "stale"])(
    "does not expose misleading metrics for %s data",
    async mode => {
      await mount("lang=en&scenario=" + mode);
      await details();
      expect(
        w.document.querySelectorAll(".mw-home-analytics .mw-metric")
      ).toHaveLength(0);
      expect(content()).not.toContain("Sample A");
      if (mode === "stale") expect(content()).not.toContain("4.6");
      expect(
        w.document.querySelectorAll("[role=alert]").length
      ).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    }
  );
  it("opens quick actions, closes with Escape and restores focus", async () => {
    await mount();
    const opener = button("Quick action");
    opener.click();
    await vi.waitFor(() =>
      expect(w.document.querySelector("[role=dialog]")).toBeTruthy()
    );
    expect(w.document.querySelectorAll("[role=dialog] a")).toHaveLength(5);
    w.document.activeElement.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      })
    );
    await vi.waitFor(() =>
      expect(w.document.querySelector("[role=dialog]")).toBeNull()
    );
    await vi.waitFor(() => expect(w.document.activeElement).toBe(opener));
    expect(errors).toEqual([]);
  });
});

 it.each([['trial', 'You are in the trial'], ['trial-expired', 'recorded trial period has ended'], ['trial-unknown', 'reliable expiry time is unavailable'], ['subscription-failed', 'could not verify the subscription']])('retains the shared subscription notice for %s', async (mode, text) => {
  await mount('lang=en&scenario=' + mode); await vi.waitFor(() => expect(w.document.querySelector('.sn-banner')?.textContent.toLowerCase()).toContain(text.toLowerCase())); expect(errors).toEqual([]);
 });
