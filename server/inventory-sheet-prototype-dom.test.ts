import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import ExcelJS from "exceljs";
import { inventoryPreviewScope } from "../prototypes/tenant-dashboard/src/inventory-sheet-model";
let dom: JSDOM, w: any, errors: Error[];
const text = () => w.document.getElementById("main").textContent as string;
const button = (name: string) =>
  Array.from(w.document.querySelectorAll("#main button")).find(
    (b: any) => b.textContent.trim() === name
  ) as any;
async function click(name: string) {
  const b = button(name);
  expect(b, name).toBeTruthy();
  expect(b.disabled, name).not.toBe(true);
  b.click();
  await new Promise(r => setTimeout(r, 20));
}
async function choose(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
describe("built inventory prototype with actual workspace", () => {
  beforeEach(async () => {
    errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", e => errors.push(e));
    const base = "prototypes/tenant-dashboard/site/";
    dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
      url: "http://127.0.0.1:4329/#/page/merchant/sheets/inventory",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    });
    w = dom.window;
    w.sessionStorage.setItem(
      "sary:inventory-sheet:v1:" + inventoryPreviewScope,
      "stale example reference"
    );
    w.structuredClone = structuredClone;
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.scrollTo = () => {};
    Object.defineProperty(w, "crypto", { value: webcrypto });
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
    for (const script of Array.from(
      w.document.querySelectorAll("script[src]")
    ) as any[])
      runInContext(
        readFileSync(base + script.getAttribute("src"), "utf8"),
        dom.getInternalVMContext()
      );
    await vi.waitFor(() =>
      expect(text()).toContain("مراجعة مخزون Google Sheets")
    );
  });
  afterEach(() => {
    w.ImportPreview?.unmount();
    w.ProductPreview?.unmount();
    w.CustomerPreview?.unmount();
    w.ReportPreview?.unmount();
    w.OrderPreview?.unmount();
    w.QuotationPreview?.unmount();
    dom.window.close();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
  });
  const workspace = () => w.document.querySelector(".is-workspace").textContent;
  async function start(mode = "ready") {
    await choose(".pp-controls label:nth-of-type(1) select", mode);
    await click("عرض أوراق الملف");
    await choose(".is-workspace label select", "0");
    await click("قراءة الورقة للمراجعة");
  }
  async function approve() {
    w.document.querySelector(".is-workspace input[type=checkbox]").click();
    await vi.waitFor(() =>
      expect(button("اعتماد تحديث 24 كمية").disabled).toBe(false)
    );
  }
  it("uses the actual stock screen, pages source rows and switches languages", async () => {
    await start();
    expect(w.document.querySelectorAll(".ps-row")).toHaveLength(20);
    expect(workspace()).toContain("منتج محلي 1");
    expect(workspace()).toContain("20");
    await click("التالي");
    expect(w.document.querySelectorAll(".ps-row")).toHaveLength(5);
    await choose(".is-workspace .pw-panel > label select", "unchanged");
    expect(w.document.querySelectorAll(".ps-row")).toHaveLength(1);
    expect(workspace()).toContain("منتج محلي 2");
    await choose(".pp-controls label:nth-of-type(2) select", "en");
    expect(workspace()).toContain("Review Google Sheets inventory");
    expect(workspace()).not.toMatch(
      /(?:inventorySheet|productSheet|productImport|productWorkspace)Ux\./
    );
  });
  it("shows both zero and unknown and blocks bad column choices before rereading", async () => {
    await start("nullStock");
    expect(workspace()).toContain("غير معلوم");
    expect(w.document.querySelectorAll(".ps-row")[3].textContent).toContain(
      "0"
    );
    await approve();
    await choose(".is-mapping label:nth-child(2) select", "0");
    expect(button("اعتماد تحديث 24 كمية").disabled).toBe(true);
    expect(button("إعادة قراءة ومراجعة").disabled).toBe(true);
    expect(workspace()).toContain("اختر عمودين مختلفين");
  });
  it("corrects ambiguous headers through explicit mapping then new review", async () => {
    await start("ambiguous");
    expect(workspace()).toContain("أكثر من عمود");
    expect(
      w.document.querySelector(".is-workspace input[type=checkbox]").disabled
    ).toBe(true);
    await choose(".is-mapping label:nth-child(2) select", "1");
    await click("إعادة قراءة ومراجعة");
    expect(
      w.document.querySelector(".is-workspace input[type=checkbox]").disabled
    ).toBe(false);
    expect(text()).toContain("قراءات المخزون المحلية: 2");
  });
  it.each([
    "invalidRows",
    "unknown",
    "duplicate",
    "formula",
    "boolean",
    "external",
  ])("prevents partial approval for %s", async mode => {
    await start(mode);
    expect(workspace()).toContain("صحح الصفوف الممنوعة");
    expect(
      w.document.querySelector(".is-workspace input[type=checkbox]").disabled
    ).toBe(true);
    expect(text()).toContain("كميات محدثة: 0");
  });
  it("recovers lost preparation without rereading", async () => {
    await start("prepareLost");
    expect(workspace()).toContain("مرجع المراجعة المحفوظ");
    await click("تحقق من المراجعة");
    expect(workspace()).toContain("2. راجع التغييرات");
    expect(text()).toContain("قراءات المخزون المحلية: 1");
  });
  it("recovers lost commit once and keeps its paginated receipt across navigation", async () => {
    await start("commitLost");
    await approve();
    await click("اعتماد تحديث 24 كمية");
    expect(workspace()).toContain("نحتاج تأكيد نتيجة العملية");
    await click("فحص النتيجة");
    expect(workspace()).toContain("اكتمل اعتماد المراجعة");
    expect(text()).toContain("كميات محدثة: 24");
    expect(
      w.document.querySelectorAll(".is-workspace details li")
    ).toHaveLength(20);
    await click("التالي");
    expect(
      w.document.querySelectorAll(".is-workspace details li")
    ).toHaveLength(5);
    w.location.hash = "#/page/merchant/products/upload";
    await vi.waitFor(() =>
      expect(w.document.querySelector(".is-workspace")).toBeNull()
    );
    w.location.hash = "#/page/merchant/sheets/inventory";
    await vi.waitFor(() =>
      expect(workspace()).toContain("اكتمل اعتماد المراجعة")
    );
    expect(text()).toContain("كميات محدثة: 24");
  });
  it.each([
    "readError",
    "loading",
    "offline",
    "wrongTenant",
    "session",
    "forbidden",
  ])("hides the reviewed data on %s", async mode => {
    await start();
    await choose(".pp-controls label:nth-of-type(1) select", mode);
    expect(workspace()).not.toContain("2. راجع التغييرات");
    expect(
      w.document.querySelector(".is-workspace input[type=checkbox]")
    ).toBeNull();
  });
  it("keeps export and product links within the prototype", async () => {
    expect(
      w.document.querySelector(".is-workspace header a").getAttribute("href")
    ).toBe("#/page/merchant/data-sync");
    await start();
    await approve();
    await click("اعتماد تحديث 24 كمية");
    expect(
      Array.from(w.document.querySelectorAll(".is-workspace a")).some(
        (a: any) => a.getAttribute("href") === "#/page/merchant/products"
      )
    ).toBe(true);
  });
});
