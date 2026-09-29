import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ar from "../client/src/locales/ar.json";
let dom: JSDOM, w: any, errors: Error[], files: any[];
const base = "prototypes/tenant-dashboard/site/";
const route = (name = "metrics-dashboard") => {
  w.history.replaceState(null, "", "#/page/merchant/" + name);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const change = (id: string, value: string) => {
  const el = w.document.getElementById("tm-" + id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const click = (name: string) =>
  w.document.querySelector(`[data-tm-action="${name}"]`).click();
const settle = () => new Promise(r => setTimeout(r, 220));
beforeEach(() => {
  errors = [];
  files = [];
  const console = new VirtualConsole();
  console.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      this.port1.unref();
      this.port2.unref();
    }
  };
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  w.URL.createObjectURL = (blob: any) => {
    files.push({ blob });
    return "blob:preview";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    expect(this.isConnected).toBe(true);
    files.at(-1).filename = this.download;
  };
  for (const name of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "assistant.js",
    "notifications.js",
    "test-metrics-preview.js",
    "pages.js",
    "app.js",
  ])
    runInContext(readFileSync(base + name, "utf8"), dom.getInternalVMContext());
  route();
});
afterEach(() => {
  expect(errors.map(error => String((error as any).cause ?? error))).toEqual(
    []
  );
  dom.window.close();
});

describe("test metrics prototype parity", () => {
  it.each(["metrics-dashboard", "try-sari-analytics"])(
    "uses the actual 15-metric report on %s",
    name => {
      route(name);
      expect(w.document.querySelectorAll("[data-metric]")).toHaveLength(15);
      expect(w.document.querySelectorAll(".ov-panel")).toHaveLength(5);
      expect(w.document.querySelectorAll(".tm-unmeasured")).toHaveLength(8);
      expect(
        w.document.querySelector(".page-local-note").textContent
      ).toContain("بيانات مصطنعة");
      expect(w.document.querySelector(".tm-report").textContent).toContain(
        "العملة غير مسجلة"
      );
      expect(w.document.querySelector(".tm-report").textContent).toContain(
        "غير مقاس بهذه البيانات"
      );
    }
  );
  it.each(["day", "week", "month"])(
    "changes the complete snapshot to %s",
    period => {
      change("period", period);
      const d = w.TestMetricsPreview.snapshot();
      expect(d.period).toBe(period);
      expect(d.metrics.conversionRate.denominator).toBe(d.sessions);
      expect(d.metrics.avgConversationLength.sample).toBe(d.messages);
      expect(
        d.feedback.positive + d.feedback.negative + d.feedback.unrated
      ).toBe(d.feedback.eligibleReplies);
      expect(d.feedback.eligibleReplies + d.feedback.excludedGuardrails).toBe(
        d.replies
      );
      expect(d.metrics.totalRevenue.value).toBe(
        d.metrics.avgDealValue.value * d.metrics.avgDealValue.sample
      );
      expect(w.document.querySelector("time").getAttribute("datetime")).toBe(
        d.from
      );
    }
  );
  it.each(["error", "offline", "forbidden", "loading"])(
    "hides old data and export in %s",
    mode => {
      change("mode", mode);
      expect(w.document.querySelector(".tm-report")).toBeNull();
      expect(w.document.querySelector("[data-tm-action=export]").disabled).toBe(
        true
      );
    }
  );
  it("keeps unknown values distinct from zeros in empty periods", () => {
    change("mode", "empty");
    const d = w.TestMetricsPreview.snapshot();
    expect(d.sessions).toBe(0);
    expect(d.metrics.conversionRate.value).toBeNull();
    expect(d.metrics.csatScore.value).toBeNull();
    expect(d.metrics.totalRevenue.value).toBe(0);
    expect(d.longSessions.share).toBeNull();
    expect(w.document.querySelectorAll("[data-metric]")).toHaveLength(15);
  });
  it("recovers explicitly after a failed read", async () => {
    change("mode", "error");
    click("recover");
    expect(w.document.querySelector("[aria-busy=true]")).not.toBeNull();
    await settle();
    expect(w.document.querySelector(".tm-report")).not.toBeNull();
  });
  it("exports all 15 metrics with units, sample and synthetic source", async () => {
    click("export");
    expect(files[0].filename).toBe("sary-test-metrics-preview-day.csv");
    const reader = new w.FileReader();
    const result = new Promise<string>(
      resolve => (reader.onload = () => resolve(reader.result))
    );
    reader.readAsText(files[0].blob);
    const csv = await result;
    for (const text of [
      "بيانات مصطنعة",
      "المقام",
      "مللي ثانية",
      "NPS",
      "CSAT",
      "احتراف المبيعات",
      "العملة غير مسجلة",
    ])
      expect(csv).toContain(text);
    change("mode", "export-failure");
    click("export");
    expect(files).toHaveLength(1);
    expect(w.document.getElementById("toast").textContent).toContain(
      "تعذّر تجهيز الملف"
    );
  });
  it("discards a refresh after selecting another period", async () => {
    const pending = w.TestMetricsPreview.primary();
    change("period", "month");
    await pending;
    expect(w.document.getElementById("tm-period").value).toBe("month");
    expect(w.document.querySelector(".tm-report")).not.toBeNull();
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال"
    );
  });
  it("discards a refresh after leaving the route", async () => {
    const pending = w.TestMetricsPreview.primary();
    route("products");
    await pending;
    expect(w.document.querySelector(".tm-report")).toBeNull();
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال"
    );
  });
  it("does not claim refresh success in a failure scenario", async () => {
    change("mode", "forbidden");
    await w.TestMetricsPreview.primary();
    expect(w.document.querySelector(".tm-report")).toBeNull();
    expect(w.document.getElementById("toast").textContent).toContain(
      ar.overviewWorkspace.refreshFailed
    );
  });
  it("links only to corresponding prototype destinations", () => {
    expect(
      [...w.document.querySelectorAll(".tm-report a")].map((a: any) =>
        a.getAttribute("href")
      )
    ).toEqual([
      "#/page/merchant/test-sari",
      "#/page/merchant/overview-analytics",
      "#/page/merchant/sari-brain",
    ]);
  });
});
