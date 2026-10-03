import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ar from "../client/src/locales/ar.json";

let dom: JSDOM, w: any, errors: Error[], files: any[], requests: string[];
const base = "prototypes/tenant-dashboard/site/";
const route = (name = "performance-metrics") => {
  w.history.replaceState(null, "", "#/page/merchant/" + name);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const change = (id: string, value: string) => {
  const el = w.document.getElementById("pp-" + id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const click = (action: string) =>
  w.document.querySelector(`[data-pp-action="${action}"]`).click();
const apply = () =>
  w.document
    .getElementById("pp-range")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
beforeEach(() => {
  errors = [];
  files = [];
  requests = [];
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
  w.fetch = (url: string) => {
    requests.push(url);
    throw Error("Prototype must stay local");
  };
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
    "notifications.js",
    "performance-preview.js",
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
  expect(requests).toEqual([]);
  dom.window.close();
});
describe("performance prototype parity", () => {
  it("renders all actual observations, currencies and evidence limits", () => {
    expect(w.document.querySelectorAll("[data-performance]")).toHaveLength(21);
    expect(w.document.querySelector('.pf-report').textContent).toContain(ar.performanceWorkspace.unlinkedReviews);
    expect(w.document.querySelectorAll(".pf-report table")).toHaveLength(6);
    expect(w.document.querySelectorAll(".pf-report .ov-pair")).toHaveLength(7);
    expect(w.document.querySelector(".page-local-note").textContent).toContain(
      "بيانات مصطنعة"
    );
    expect(w.document.querySelector(".pf-report").textContent).toContain(
      ar.performanceWorkspace.proficiency
    );
    expect(w.document.querySelector(".pf-method").hasAttribute("open")).toBe(
      false
    );
    expect(
      w.document.querySelector('.pf-report a[href="#/page/merchant/orders"]')
    ).not.toBeNull();
  });
  it.each([7, 30, 90])(
    "applies %s days with equal adjacent measured windows",
    days => {
      click("days-" + days);
      const d = w.PerformancePreview.snapshot();
      const length = (p: any) =>
        (Date.parse(p.through) - Date.parse(p.from)) / 1000 + 1;
      expect(length(d.current)).toBe(d.secondsPerPeriod);
      expect(length(d.previous)).toBe(d.secondsPerPeriod);
      expect(Date.parse(d.current.from) - Date.parse(d.previous.through)).toBe(
        1000
      );
      expect(d.partialCurrentDay).toBe(true);
      expect(d.current.messages.incoming + d.current.messages.outgoing).toBe(
        d.current.messages.total
      );
      expect(d.current.reviews.valid + d.current.reviews.invalid).toBe(
        d.current.reviews.total
      );
      expect(w.document.querySelector("time").getAttribute("datetime")).toBe(
        d.current.from
      );
    }
  );
  it("separates the draft from displayed/exportable results until applied", () => {
    const before = w.PerformancePreview.snapshot();
    change("start", "2026-09-24");
    expect(w.PerformancePreview.snapshot()).toEqual(before);
    expect(w.document.querySelector("[data-pp-action=export]").disabled).toBe(
      true
    );
    expect(w.document.body.textContent).toContain(
      ar.performanceWorkspace.dirty
    );
    apply();
    expect(w.PerformancePreview.snapshot().selection.startDate).toBe(
      "2026-09-24"
    );
    expect(w.document.querySelector("[data-pp-action=export]").disabled).toBe(
      false
    );
  });
  it.each(["", "2026-01-01", "2026-10-01"])(
    "rejects invalid start %s without replacing the result",
    start => {
      const before = w.PerformancePreview.snapshot();
      change("start", start);
      apply();
      expect(w.PerformancePreview.snapshot()).toEqual(before);
      expect(w.document.getElementById("pp-error").textContent).toBe(
        ar.performanceWorkspace.rangeError
      );
      expect(
        w.document.getElementById("pp-start").getAttribute("aria-describedby")
      ).toBe("pp-error");
      click("days-7");
      expect(w.document.getElementById("pp-error")).toBeNull();
    }
  );
  it.each(["error", "offline", "forbidden", "loading"])(
    "hides old results and disables export for %s",
    mode => {
      change("mode", mode);
      expect(w.document.querySelector(".pf-report")).toBeNull();
      expect(w.document.querySelector("[data-pp-action=export]").disabled).toBe(
        true
      );
    }
  );
  it("distinguishes empty observations and unmeasured ratios", () => {
    change("mode", "empty");
    const d = w.PerformancePreview.snapshot();
    for (const p of [d.current, d.previous]) {
      expect(p.messages.total).toBe(0);
      expect(p.orders.total).toBe(0);
      expect(p.orders.deliveredShare).toBeNull();
      expect(p.orderPhones.repeatShare).toBeNull();
      expect(p.reviews.average).toBeNull();
      expect(p.reviews.positiveShare).toBeNull();
    }
    expect(w.document.body.textContent).toContain(
      ar.performanceWorkspace.empty
    );
  });
  it("avoids invented growth when there is no previous sample", () => {
    change("mode", "no-previous");
    const d = w.PerformancePreview.snapshot();
    expect(d.current.messages.total).toBeGreaterThan(0);
    expect(d.previous.messages.total).toBe(0);
    expect(w.document.body.textContent).toContain(
      ar.performanceWorkspace.noBase
    );
  });
  it("recovers explicitly after a failed source", async () => {
    change("mode", "error");
    click("recover");
    expect(w.document.querySelector("[aria-busy=true]")).not.toBeNull();
    await new Promise(r => setTimeout(r, 220));
    expect(w.document.querySelector(".pf-report")).not.toBeNull();
  });
  it("does not acknowledge a failed refresh", async () => {
    change("mode", "error");
    await w.PerformancePreview.primary();
    expect(w.document.getElementById("toast").textContent).toBe(
      ar.performanceWorkspace.refreshFailed
    );
    expect(w.document.querySelector(".pf-report")).toBeNull();
  });
  it("discards stale refresh completion after a new range or route", async () => {
    const pending = w.PerformancePreview.primary();
    click("days-7");
    await pending;
    expect(w.PerformancePreview.snapshot().selection.startDate).toBe(
      "2026-09-24"
    );
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال المحلي"
    );
    const next = w.PerformancePreview.primary();
    route("dashboard");
    await next;
    route();
    expect(w.PerformancePreview.canPrimary()).toBe(true);
    expect(w.document.querySelector(".pf-report")).not.toBeNull();
  });
  it("exports the applied report with all units, periods, limits and synthetic source", async () => {
    click("days-7");
    click("export");
    expect(files[0].filename).toBe(
      "sary-performance-preview-2026-09-24-2026-09-30.csv"
    );
    const reader = new w.FileReader();
    const result = new Promise<string>(
      resolve => (reader.onload = () => resolve(reader.result))
    );
    reader.readAsText(files[0].blob);
    const csv = await result;
    for (const value of [
      "بيانات مصطنعة",
      "2026-09-24",
      "UTC",
      "SAR",
      "USD",
      ar.performanceWorkspace.proficiency,
      ar.performanceWorkspace.invalidReviews,
      ar.performanceWorkspace.stars,
    ])
      expect(csv).toContain(value);
    change("mode", "export-failure");
    click("export");
    expect(files).toHaveLength(1);
    expect(w.document.getElementById("toast").textContent).toBe(
      ar.performanceWorkspace.exportFailed
    );
  });
});
