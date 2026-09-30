import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  reportFixture,
  reportModes,
} from "../prototypes/tenant-dashboard/src/report-model";
import { reportSnapshotSchema } from "../shared/report-workspace";

describe("report prototype fixtures", () => {
  it.each(Object.keys(reportModes) as (keyof typeof reportModes)[])(
    "keeps the %s fixture valid across every selection",
    mode => {
      for (const kind of ["sales", "customers", "conversations"] as const)
        for (const period of ["day", "week", "month", "year"] as const)
          for (const currency of ["SAR", "USD"] as const) {
            const d = reportFixture({ kind, period, currency }, mode);
            expect(reportSnapshotSchema.safeParse(d).success).toBe(true);
            expect(d.kind).toBe(kind);
            if (d.kind === "sales") {
              expect(
                d.productSample.inspectedOrders + d.productSample.omittedOrders
              ).toBe(d.totalOrders);
              expect(d.validAmountOrders + d.excludedAmounts).toBe(
                d.totalOrders
              );
            }
          }
    }
  );
  it("distinguishes legacy missing units, partial coverage and a missing comparison baseline", () => {
    const s = { kind: "sales", period: "month", currency: "SAR" } as const;
    expect(reportFixture(s, "legacy")).toMatchObject({
      totalOrders: 8,
      topProducts: [],
      productSample: { excludedOrders: 8 },
    });
    expect(reportFixture(s, "partial")).toMatchObject({
      totalOrders: 300,
      excludedAmounts: 1,
      productSample: { inspectedOrders: 250, omittedOrders: 50 },
    });
    expect(reportFixture(s, "noBase")).toMatchObject({
      growth: null,
      growthAvailable: false,
    });
  });
});

let dom: JSDOM,
  w: any,
  errors: Error[],
  downloads: { name: string; attached: boolean }[];
async function boot(full = false) {
  errors = [];
  downloads = [];
  const console = new VirtualConsole();
  console.on("jsdomError", error => errors.push(error));
  const base = "prototypes/tenant-dashboard/site/";
  dom = new JSDOM(
    full
      ? readFileSync(base + "index.html", "utf8")
      : '<html><body><div id="report-prototype-root"></div></body></html>',
    {
      url: "http://127.0.0.1:4329/#/page/merchant/reports",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: console,
    }
  );
  w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      this.port1.unref();
      this.port2.unref();
    }
  };
  w.fetch = vi.fn(() => {
    throw Error("Prototype must not fetch");
  });
  w.print = vi.fn();
  w.URL.createObjectURL = vi.fn(() => "blob:local-report");
  w.URL.revokeObjectURL = vi.fn();
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({
      name: this.download,
      attached: w.document.body.contains(this),
    });
  };
  if (full) {
    for (const script of Array.from(
      w.document.querySelectorAll("script[src]")
    ) as any[])
      runInContext(
        readFileSync(base + script.getAttribute("src"), "utf8"),
        dom.getInternalVMContext()
      );
  } else {
    runInContext(
      readFileSync(base + "report-preview.js", "utf8"),
      dom.getInternalVMContext()
    );
    w.ReportPreview.mount();
  }
  await vi.waitFor(() =>
    expect(w.document.querySelector(".rw-workspace")).not.toBeNull()
  );
}
const text = () => w.document.body.textContent as string;
async function choose(selector: string, value: string) {
  const node = w.document.querySelector(selector);
  expect(node, selector).toBeTruthy();
  node.value = value;
  node.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 30));
}
const mode = (value: string) => choose(".rp-controls select", value);
async function click(label: string) {
  const button = Array.from(w.document.querySelectorAll("button")).find(
    (node: any) => node.textContent.trim() === label
  ) as any;
  expect(button, label).toBeTruthy();
  button.click();
  await new Promise(r => setTimeout(r, 30));
}
describe("built prototype uses actual reports workspace", () => {
  beforeEach(() => boot());
  afterEach(() => {
    w.ReportPreview.unmount();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
    dom.window.close();
  });
  it("switches all report types and keeps period/currency controls and the method", async () => {
    expect(text()).toContain("١٬٠٠٠");
    await choose("#report-currency", "USD");
    expect(text()).toContain("٢٠٠");
    await choose("#report-period", "day");
    expect(text()).toContain("٥٠");
    await click("العملاء");
    expect(w.document.querySelector("#report-currency")).toBeNull();
    expect(text()).toContain("0500000071");
    expect(w.document.querySelectorAll("tbody tr")).toHaveLength(5);
    await click("المحادثات");
    expect(text()).toContain("لم يُقَس بعد");
    expect(text()).toContain("تصنيف المواضيع غير متاح");
  });
  it.each([
    "error",
    "offline",
    "loading",
    "forbidden",
    "session",
    "wrongTenant",
    "wrongPeriod",
    "wrongCurrency",
  ])("blocks stale content/export in %s", async state => {
    await mode(state);
    expect(w.document.querySelector("[data-report-result]")).toBeNull();
    const exportButton = Array.from(w.document.querySelectorAll("button")).find(
      (b: any) => b.textContent === "تصدير Excel"
    ) as any;
    expect(exportButton.disabled).toBe(true);
  });
  it("recovers a read error explicitly, keeps forbidden access and explains public actions", async () => {
    await mode("error");
    await click("إعادة المحاولة");
    expect(w.document.querySelector("[data-report-result]")).not.toBeNull();
    await mode("forbidden");
    await click("إعادة المحاولة");
    expect(w.document.querySelector('[data-state="forbidden"]')).not.toBeNull();
    await mode("session");
    w.document
      .querySelector('a[href="/login"]')
      .dispatchEvent(
        new w.MouseEvent("click", { bubbles: true, cancelable: true })
      );
    await vi.waitFor(() => expect(text()).toContain("لم تُرسل بيانات"));
    expect(w.location.pathname).toBe("/");
  });
  it("shows exclusions and nulls without dropping all existing orders", async () => {
    await mode("legacy");
    expect(text()).toContain("توجد طلبات");
    await mode("partial");
    expect(text()).toContain("250 من 300");
    await mode("empty");
    expect(text()).toContain("لا توجد سجلات مطابقة في النطاق");
  });
  it("renders English and preserves the selection after language changes", async () => {
    await choose("#report-period", "week");
    await choose(".rp-controls label:nth-of-type(2) select", "en");
    expect(w.document.querySelector(".rw-workspace").dir).toBe("ltr");
    expect(w.document.querySelector("#report-period").value).toBe("week");
    expect(text()).toContain("Calculation method and sample");
    expect(text()).not.toContain("reportWorkspaceUx.");
  });
  it("reports export failure and downloads a local workbook on retry", async () => {
    await mode("exportError");
    await click("تصدير Excel");
    expect(text()).toContain("تعذر تصدير التقرير");
    expect(downloads).toHaveLength(0);
    await mode("data");
    await click("تصدير Excel");
    await vi.waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatchObject({
      attached: true,
      name: "sary-report-9000071-sales-month-SAR.xlsx",
    });
  });
  it("abandons an old slow export after changing currency", async () => {
    await mode("exportSlow");
    await click("تصدير Excel");
    expect(downloads).toHaveLength(0);
    await choose("#report-currency", "USD");
    await click("إكمال التجهيز المؤجل");
    await vi.waitFor(() => expect(text()).not.toContain("جارٍ تجهيز الملف"));
    expect(downloads).toHaveLength(0);
  });
  it("prints the actual document and releases the portal after printing", async () => {
    await click("طباعة / حفظ PDF");
    await vi.waitFor(() => expect(w.print).toHaveBeenCalledOnce());
    expect(w.document.querySelector(".rw-print details").open).toBe(true);
    w.dispatchEvent(new w.Event("afterprint"));
    await vi.waitFor(() =>
      expect(w.document.querySelector(".rw-print")).toBeNull()
    );
  });
});
describe("reports shell route", () => {
  it("replaces the generic page and follows internal recovery links without a request", async () => {
    await boot(true);
    try {
      expect(
        w.document.querySelector("#main #report-prototype-root")
      ).not.toBeNull();
      await mode("error");
      const anchor = w.document.querySelector(
        '.rw-workspace a[href="/merchant/tools"]'
      );
      expect(anchor).not.toBeNull();
      anchor.dispatchEvent(
        new w.MouseEvent("click", { bubbles: true, cancelable: true })
      );
      await vi.waitFor(() =>
        expect(w.location.hash).toBe("#/page/merchant/tools")
      );
      expect(w.fetch).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    } finally {
      w.ReportPreview.unmount();
      dom.window.close();
    }
  });
});
