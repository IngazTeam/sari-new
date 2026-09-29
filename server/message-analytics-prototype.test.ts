import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let dom: JSDOM, w: any, errors: Error[], files: any[], exports: any[];
const base = "prototypes/tenant-dashboard/site/";
const route = (name = "message-analytics") => {
  w.history.replaceState(null, "", "#/page/merchant/" + name);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const change = (id: string, value: string) => {
  const el = w.document.getElementById("ma-" + id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const click = (action: string, value?: string) =>
  w.document
    .querySelector(
      `[data-ma-action="${action}"]${value ? `[data-value="${value}"]` : ""}`
    )
    .click();
const text = () => w.document.querySelector(".ma-workspace").textContent;
const settle = () => new Promise(r => setTimeout(r, 0));
beforeEach(() => {
  errors = [];
  files = [];
  exports = [];
  const console = new VirtualConsole();
  console.on("jsdomError", error => errors.push(error));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  w = dom.window;
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  w.URL.createObjectURL = (blob: Blob) => {
    files.push({ blob });
    return "blob:preview";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    expect(this.isConnected).toBe(true);
    files.at(-1).filename = this.download;
  };
  w.MessageExportPreview = {
    exportSnapshot: vi.fn(async (snapshot: any, format: string) => {
      exports.push({ snapshot, format });
      return new w.Blob(["local"]);
    }),
  };
  for (const name of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "assistant.js",
    "notifications.js",
    "message-analytics.js",
    "pages.js",
    "app.js",
  ])
    runInContext(readFileSync(base + name, "utf8"), dom.getInternalVMContext());
  route();
});
afterEach(() => {
  expect(errors).toEqual([]);
  dom.window.close();
  vi.restoreAllMocks();
});
describe("message analytics prototype parity", () => {
  it.each([
    "message-analytics",
    "sari-analytics",
    "advanced-analytics",
    "analytics-dashboard",
    "voice-messages",
    "analysis",
  ])("renders the detailed shared workspace at %s", name => {
    route(name);
    expect(w.document.querySelector("[role=tab][aria-selected=true]").id).toBe(
      "ma-tab-messages"
    );
    expect(w.document.querySelectorAll("main h1")).toHaveLength(1);
    expect(
      w.document.querySelector("[data-page-action=primary]").textContent
    ).toBe("تحديث البيانات");
    expect(
      w.document.querySelectorAll(".ma-workspace table tbody tr")
    ).toHaveLength(54);
    expect(w.document.querySelector("main").textContent).toContain(
      "لا تمثل نتائج متجر حقيقي"
    );
  });
  it("switches periods for every section and preserves complete 90/24 rows", async () => {
    change("period", "90");
    expect(
      w.document.querySelectorAll(".ma-workspace table tbody tr")
    ).toHaveLength(114);
    click("tab", "sentiment");
    expect(text()).toContain("ليست قياس رضا");
    click("tab", "products");
    expect(text()).toContain("دون حذف أي جزء منه");
    expect(text()).toContain("غير مقاس بهذه البيانات");
    click("export");
    await settle();
    const s = exports[0].snapshot;
    expect(s.period).toBe("90d");
    expect(s.daily).toHaveLength(90);
    expect(s.daily.reduce((sum: number, r: any) => sum + r.count, 0)).toBe(
      s.messages.total
    );
    expect(s.sentiment.classified + s.sentiment.unclassified).toBe(
      s.messages.incoming
    );
  });
  it.each(["csv", "xlsx", "pdf"])(
    "passes the complete snapshot to the shared %s exporter",
    async format => {
      change("format", format);
      click("export");
      await settle();
      expect(exports).toHaveLength(1);
      expect(exports[0].format).toBe(format);
      expect(exports[0].snapshot.hourly).toHaveLength(24);
      expect(exports[0].snapshot.products.rows).toHaveLength(2);
      expect(files[0].filename).toBe(`sary-messages-preview-30d.${format}`);
      expect(w.document.querySelector("a[download]")).toBeNull();
    }
  );
  it.each(["loading", "error", "offline", "forbidden"])(
    "hides data and export for %s without inventing zero",
    mode => {
      change("mode", mode);
      expect(w.document.querySelector(".ma-stats")).toBeNull();
      expect(w.document.querySelector("[data-ma-action=export]")).toBeNull();
      expect(text()).toContain("لا تُعرض بيانات قديمة");
      if (mode !== "loading") {
        click("recover");
      }
    }
  );
  it("shows genuine empty data with undefined percentages in all three tabs", async () => {
    change("mode", "empty");
    expect(text()).toContain("هذه نتيجة قراءة ناجحة");
    expect(text()).toContain("غير متاح");
    click("tab", "sentiment");
    expect(text()).toContain("غير متاح");
    click("tab", "products");
    expect(text()).toContain("لا توجد مطابقة");
    click("export");
    await settle();
    expect(exports[0].snapshot.messages.total).toBe(0);
    expect(exports[0].snapshot.orderAssociation.ratio).toBeNull();
  });
  it("uses RTL keyboard order and restores the selected tab focus", () => {
    const first = w.document.getElementById("ma-tab-messages");
    first.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(w.document.activeElement.id).toBe("ma-tab-sentiment");
    w.document.activeElement.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "End", bubbles: true })
    );
    expect(w.document.activeElement.id).toBe("ma-tab-products");
  });
  it.each(["period", "mode", "route"])(
    "discards a delayed export on %s change",
    async kind => {
      let resolve!: (blob: Blob) => void;
      w.MessageExportPreview.exportSnapshot.mockImplementation(
        () =>
          new Promise<Blob>(r => {
            resolve = r;
          })
      );
      click("export");
      await settle();
      expect(w.document.querySelector("[data-ma-action=export]").disabled).toBe(
        true
      );
      if (kind === "period") change("period", "7");
      if (kind === "mode") change("mode", "error");
      if (kind === "route") route("products");
      resolve(new w.Blob(["old"]));
      await settle();
      expect(files).toHaveLength(0);
    }
  );
  it("reports preparation failure without creating a download", async () => {
    change("mode", "export-failure");
    click("export");
    await settle();
    expect(files).toHaveLength(0);
    expect(w.document.getElementById("toast").textContent).toContain(
      "تعذر تجهيز الملف"
    );
  });
  it("refreshes through the primary action without creating an unrelated dialog", async () => {
    w.document.querySelector("[data-page-action=primary]").click();
    expect(
      w.document.querySelector(".ma-workspace [aria-busy=true]")
    ).toBeTruthy();
    await settle();
    expect(w.document.getElementById("dialog").hasAttribute("open")).toBe(
      false
    );
    expect(w.document.getElementById("toast").textContent).toContain(
      "حُدّثت بيانات المثال"
    );
  });
});
