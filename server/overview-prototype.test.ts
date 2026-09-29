import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
let dom: JSDOM, w: any, errors: Error[], files: any[];
const base = "prototypes/tenant-dashboard/site/";
const route = (name = "overview-analytics") => {
  w.history.replaceState(null, "", "#/page/merchant/" + name);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const change = (id: string, value: string) => {
  const el = w.document.getElementById("ov-" + id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const click = (name: string) =>
  w.document.querySelector(`[data-ov-action="${name}"]`).click();
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
    "overview-preview.js",
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
describe("overview prototype parity", () => {
  it("renders all seven actual report sections, statuses, currencies and synthetic note", () => {
    expect(w.document.querySelectorAll(".ov-panel")).toHaveLength(7);
    expect(
      [...w.document.querySelectorAll(".ov-report tbody")].map(
        (el: any) => el.children.length
      )
    ).toEqual([6, 3, 5]);
    expect(w.document.querySelector(".page-local-note").textContent).toContain(
      "بيانات مصطنعة"
    );
    expect(w.document.querySelector(".ov-report").textContent).toContain(
      "غير مقاس بهذه البيانات"
    );
    expect(w.document.querySelectorAll(".ov-subpanel")).toHaveLength(2);
  });
  it.each(["7d", "30d", "90d"])(
    "applies %s consistently to complete snapshot",
    period => {
      change("period", period);
      const d = w.OverviewPreview.snapshot();
      expect(d.period).toBe(period);
      expect(
        d.orders.statuses.reduce((n: number, r: any) => n + r.count, 0)
      ).toBe(d.orders.total);
      expect(
        d.orders.payments.reduce((n: number, r: any) => n + r.count, 0)
      ).toBe(d.orders.total);
      expect(
        d.reviews.distribution.reduce((n: number, r: any) => n + r.count, 0)
      ).toBe(d.reviews.valid);
      expect(w.document.querySelector("time").getAttribute("datetime")).toBe(
        d.from
      );
    }
  );
  it.each(["error", "offline", "forbidden", "loading"])(
    "hides data and export for %s",
    mode => {
      change("mode", mode);
      expect(w.document.querySelector(".ov-report")).toBeNull();
      expect(w.document.querySelector("[data-ov-action=export]").disabled).toBe(
        true
      );
    }
  );
  it("uses null samples in the empty state and retains sections", () => {
    change("mode", "empty");
    const d = w.OverviewPreview.snapshot();
    expect(d.orders.total).toBe(0);
    expect(d.reviews.average).toBeNull();
    expect(d.association.ratio).toBeNull();
    expect(w.document.querySelectorAll(".ov-panel")).toHaveLength(7);
    expect(w.document.querySelector("[data-ov-action=export]").disabled).toBe(
      false
    );
  });
  it("recovers explicitly from failure", async () => {
    change("mode", "error");
    click("recover");
    expect(w.document.querySelector("[aria-busy=true]")).not.toBeNull();
    await settle();
    expect(w.document.querySelector(".ov-report")).not.toBeNull();
  });
  it("exports a complete synthetic snapshot and distinguishes failure", async () => {
    click("export");
    expect(files[0].filename).toBe("sary-overview-preview-30d.csv");
    const reader = new w.FileReader();
    const result = new Promise<string>(
      resolve => (reader.onload = () => resolve(reader.result))
    );
    reader.readAsText(files[0].blob);
    const csv = await result;
    for (const text of [
      "بيانات مصطنعة",
      "حالة الطلب الحالية",
      "النجوم",
      "الإحالات",
      "احتراف المبيعات",
    ]) {
      expect(csv).toContain(text);
    }
    change("mode", "export-failure");
    click("export");
    expect(files).toHaveLength(1);
    expect(w.document.getElementById("toast").textContent).toContain(
      "تعذّر تجهيز الملف"
    );
  });
  it("invalidates a refresh when period changes", async () => {
    const pending = w.OverviewPreview.primary();
    change("period", "90d");
    await pending;
    expect(w.document.getElementById("ov-period").value).toBe("90d");
    expect(w.document.querySelector(".ov-report")).not.toBeNull();
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال"
    );
  });
  it("does not repaint or toast after leaving during refresh", async () => {
    const pending = w.OverviewPreview.primary();
    route("products");
    await pending;
    expect(w.document.querySelector(".ov-preview")).toBeNull();
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال"
    );
  });
  it("keeps all linked destinations inside the prototype", () => {
    const links = [...w.document.querySelectorAll(".ov-report a")].map(
      (a: any) => a.getAttribute("href")
    );
    expect(links).toEqual([
      "#/page/merchant/orders",
      "#/page/merchant/message-analytics",
      "#/page/merchant/sari-brain",
    ]);
  });
});
