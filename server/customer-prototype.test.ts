import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CustomerPreviewStore,
  customerModes,
  type CustomerMode,
} from "../prototypes/tenant-dashboard/src/customer-model";
import {
  customerListSchema,
  customerDetailSchema,
} from "../shared/customer-workspace";
import {
  customerAnnotationsSchema,
  customerAnnotationReceipt,
} from "../shared/customer-annotations";
const key = "966500000001";
describe("customer prototype model", () => {
  it.each(Object.keys(customerModes) as CustomerMode[])(
    "uses valid contracts in %s",
    mode => {
      const store = new CustomerPreviewStore();
      store.setMode(mode);
      expect(customerListSchema.safeParse(store.list({})).success).toBe(true);
      expect(
        customerDetailSchema.safeParse(store.detail({ key })).success
      ).toBe(true);
      expect(
        customerAnnotationsSchema.safeParse(store.read({ key, page: 1 }))
          .success
      ).toBe(true);
    }
  );
  it("filters and pages the complete list, orders and conversations", () => {
    const store = new CustomerPreviewStore();
    expect(store.list({}).rows).toHaveLength(25);
    expect(store.list({ page: 2 }).rows).toHaveLength(7);
    expect(store.list({ activity: "unknown" }).pagination.total).toBe(8);
    expect(store.list({ search: "%2F" }).rows[0].key).toBe("customer%2F76");
    const d = store.detail({ key, ordersPage: 2, conversationsPage: 2 });
    expect(d.orders.rows).toHaveLength(2);
    expect(d.conversations.rows).toHaveLength(3);
  });
  it("separates simulated balances and excluded amounts", () => {
    const store = new CustomerPreviewStore();
    store.setMode("ambiguous");
    const d = store.detail({ key });
    expect(d.loyalty.points).toBeNull();
    expect(d.amounts).toHaveLength(2);
    expect(d.amounts.reduce((sum, a) => sum + a.excludedAmounts, 0)).toBe(1);
  });
  it("stores an uncertain result once and checks receipt identity", async () => {
    const store = new CustomerPreviewStore(),
      input = {
        kind: "note",
        key,
        content: "Literal <img>",
        requestId: "11111111-1111-4111-8111-111111111111",
      };
    store.setMode("uncertain");
    await expect(store.write(input)).rejects.toThrow();
    const receipt = await store.receipt(input.requestId);
    expect(customerAnnotationReceipt.safeParse(receipt).success).toBe(true);
    await expect(store.write(input)).resolves.toEqual(receipt);
    expect(store.read({ key, page: 1 }).notes).toHaveLength(1);
    await expect(
      store.write({ ...input, content: "Other" })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
  it("rejects stale tags and exports every filtered row with separate values", async () => {
    const store = new CustomerPreviewStore();
    store.conflict(key);
    await expect(
      store.write({
        kind: "tags",
        key,
        tags: ["Mine"],
        expectedRevision: 0,
        requestId: "11111111-1111-4111-8111-111111111111",
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const file = await store.exportCsv({ activity: "unknown", language: "en" });
    expect(file.count).toBe(8);
    expect(file.data.split("\r\n")).toHaveLength(9);
    expect(file.data).toContain("Eligible SAR");
    expect(file.data).toContain("Eligible USD");
    expect(file.data).toContain("'966500000004");
  });
});
let dom: JSDOM, w: any, errors: Error[], downloads: string[];
async function boot(path = "/merchant/customers") {
  errors = [];
  downloads = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e));
  const base = "prototypes/tenant-dashboard/site/";
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/#/page" + path,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
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
    throw Error("No fetch in customer prototype");
  });
  w.URL.createObjectURL = vi.fn(() => "blob:customers");
  w.URL.revokeObjectURL = vi.fn();
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  for (const script of Array.from(
    w.document.querySelectorAll("script[src]")
  ) as any[])
    runInContext(
      readFileSync(base + script.getAttribute("src"), "utf8"),
      dom.getInternalVMContext()
    );
  await vi.waitFor(() =>
    expect(w.document.querySelector(".cw-workspace")).not.toBeNull()
  );
}
const text = () => w.document.getElementById("main").textContent as string;
const button = (label: string) =>
  Array.from(w.document.querySelectorAll("#main button")).find(
    (b: any) => b.textContent.trim() === label
  ) as any;
async function click(label: string) {
  const b = button(label);
  expect(b, label).toBeTruthy();
  b.click();
  await new Promise(r => setTimeout(r, 20));
}
async function choose(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  expect(el).toBeTruthy();
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
const mode = (value: string) => choose(".cp-controls select", value);
async function fill(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  const proto =
    el.tagName === "TEXTAREA"
      ? w.HTMLTextAreaElement.prototype
      : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
async function openFirst() {
  w.document
    .querySelector(".cw-list a")
    .dispatchEvent(
      new w.MouseEvent("click", { bubbles: true, cancelable: true })
    );
  await vi.waitFor(() => expect(button("الملاحظات والوسوم")).toBeTruthy());
}
describe("built customer prototype", () => {
  beforeEach(() => boot());
  afterEach(() => {
    w.CustomerPreview.unmount();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
    dom.window.close();
  });
  it("opens the catalog detail template as a sample customer", async () => {
    w.location.hash = "#/page/merchant/customers/:phone";
    await vi.waitFor(() => expect(button("الملاحظات والوسوم")).toBeTruthy());
    expect(text()).toContain("966500000001");
    expect(w.document.querySelector('[data-state="missing"]')).toBeNull();
  });
  it("uses the actual list and follows encoded contact links", async () => {
    expect(w.document.querySelectorAll(".cw-list>li")).toHaveLength(25);
    const link = w.document.querySelector(
      'a[href="/merchant/customers/customer%252F76"]'
    );
    link.dispatchEvent(
      new w.MouseEvent("click", { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(button("الملاحظات والوسوم")).toBeTruthy());
    expect(text()).toContain("customer%2F76");
    expect(w.document.querySelectorAll("#main h1")).toHaveLength(1);
  });
  it.each([
    "loading",
    "error",
    "offline",
    "forbidden",
    "session",
    "wrongTenant",
    "wrongSelection",
  ])("hides stale list and blocks export for %s", async state => {
    await mode(state);
    expect(w.document.querySelector(".cw-list")).toBeNull();
    expect(button("تصدير النتائج CSV").disabled).toBe(true);
    expect(w.document.querySelector("[data-state]")).not.toBeNull();
  });
  it("supports literal search, activity and pagination without creating customers", async () => {
    await click("التالي");
    expect(w.document.querySelectorAll(".cw-list>li")).toHaveLength(7);
    await fill(".cw-filters input", "%2F");
    await click("بحث");
    expect(w.document.querySelectorAll(".cw-list>li")).toHaveLength(1);
    await click("مسح البحث");
    await choose(".cw-filters select", "unknown");
    expect(w.document.querySelectorAll(".cw-list>li")).toHaveLength(8);
    expect(w.document.querySelector("[data-page-form=create]")).toBeNull();
  });
  it("renders empty and read-only states and both languages", async () => {
    await mode("empty");
    expect(text()).toContain("لا توجد نتائج لهذا البحث");
    await mode("viewer");
    expect(button("تصدير النتائج CSV").disabled).toBe(true);
    await choose(".cp-controls label:nth-of-type(2) select", "en");
    expect(w.document.querySelector(".cw-workspace").dir).toBe("ltr");
    expect(text()).toContain("Sources and definitions");
    expect(text()).not.toContain("customerWorkspaceUx.");
  });
  it("persists notes through internal navigation and recovers a lost acknowledgement once", async () => {
    await openFirst();
    await click("الملاحظات والوسوم");
    await mode("uncertain");
    await fill("textarea", "ملاحظة محاكاة 76");
    await click("حفظ الملاحظة");
    expect(text()).toContain("نتيجة المحاولة السابقة غير مؤكدة");
    expect(w.document.querySelector("textarea").disabled).toBe(true);
    await click("تحقق من نتيجة الحفظ");
    expect(text()).toContain("تم الحفظ. رقم الطلب");
    expect(w.document.querySelectorAll(".cw-notes>li")).toHaveLength(1);
    w.document
      .querySelector('a[href="/merchant/customers"]')
      .dispatchEvent(
        new w.MouseEvent("click", { bubbles: true, cancelable: true })
      );
    await vi.waitFor(() =>
      expect(w.document.querySelector(".cw-list")).not.toBeNull()
    );
    await openFirst();
    await click("الملاحظات والوسوم");
    expect(w.document.querySelectorAll(".cw-notes>li")).toHaveLength(1);
  });
  it("retains tag drafts, displays concurrent change and requires replacing the draft explicitly", async () => {
    await openFirst();
    await click("الملاحظات والوسوم");
    await fill(".cw-form input", "VIP");
    await click("إضافة إلى المسودة");
    await click("محاكاة تعديل زميل للوسوم");
    expect(button("حفظ الوسوم").disabled).toBe(true);
    expect(text()).toContain("VIP");
    expect(text()).toContain("وسم أضافه زميل");
    await click("استخدم الوسوم الحالية بدل المسودة");
    expect(text()).not.toContain("VIP");
  });
  it("retains the note after rejected saving and resets only after confirmation", async () => {
    await openFirst();
    await click("الملاحظات والوسوم");
    await mode("saveError");
    await fill("textarea", "احتفظ بالنص");
    await click("حفظ الملاحظة");
    expect(w.document.querySelector("textarea").value).toBe("احتفظ بالنص");
    await click("إعادة المثال");
    expect(w.document.querySelector("textarea").value).toBe("احتفظ بالنص");
    await click("نعم، إعادة المثال");
    await click("الملاحظات والوسوم");
    expect(w.document.querySelector("textarea").value).toBe("");
  });
  it("exports a local example and cancels a deferred result when filters change", async () => {
    await mode("exportError");
    await click("تصدير النتائج CSV");
    expect(downloads).toHaveLength(0);
    await mode("data");
    await click("تصدير النتائج CSV");
    expect(downloads).toEqual(["sary-customer-preview.csv"]);
    await mode("exportSlow");
    await click("تصدير النتائج CSV");
    await choose(".cw-filters select", "unknown");
    await click("إكمال التصدير المؤجل");
    expect(downloads).toHaveLength(1);
  });
  it("pages actual order and conversation tables and displays missing customer", async () => {
    await openFirst();
    await click("الطلبات");
    expect(w.document.querySelectorAll("tbody tr")).toHaveLength(25);
    await click("التالي");
    expect(w.document.querySelectorAll("tbody tr")).toHaveLength(2);
    await click("المحادثات");
    expect(
      w.document.querySelectorAll('a[href*="/merchant/conversations?phone="]')
    ).toHaveLength(25);
    await click("التالي");
    expect(
      w.document.querySelectorAll('a[href*="/merchant/conversations?phone="]')
    ).toHaveLength(3);
    await mode("missing");
    expect(w.document.querySelector("[data-state=missing]")).not.toBeNull();
  });
});
