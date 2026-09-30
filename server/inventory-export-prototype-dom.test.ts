import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { exportPreviewScope } from "../prototypes/tenant-dashboard/src/export-model";
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
describe("built export prototype with actual workspace", () => {
  beforeEach(async () => {
    errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", e => errors.push(e));
    const base = "prototypes/tenant-dashboard/site/";
    dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
      url: "http://127.0.0.1:4329/#/page/merchant/data-sync",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    });
    w = dom.window;
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
    await vi.waitFor(() => expect(text()).toContain("تصدير المخزون"));
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

  const workspace = () => w.document.querySelector(".pw-workspace").textContent;
  const mode = (value: string) =>
    choose(".pp-controls label:nth-of-type(1) select", value);
  async function approve() {
    w.document.querySelector(".ds-consent input").click();
    await vi.waitFor(() =>
      expect(button("تصدير المخزون").disabled).toBe(false)
    );
  }
  async function send(value = "ready") {
    await mode(value);
    await approve();
    await click("تصدير المخزون");
  }
  it("shares real confirmation, acknowledgement counters and both languages", async () => {
    expect(button("تصدير المخزون").disabled).toBe(true);
    await send();
    await vi.waitFor(() => expect(workspace()).toContain("أكد Google Sheets"));
    expect(workspace()).toContain("عدد المنتجات: 25");
    expect(workspace()).toContain("كميات غير معروفة: 1");
    expect(workspace()).toContain("أسعار بحاجة مراجعة: 1");
    expect(
      w.sessionStorage.getItem("sary:inventory-export:v1:" + exportPreviewScope)
    ).toBeNull();
    await choose(".pp-controls label:nth-of-type(2) select", "en");
    expect(workspace()).toContain("Google Sheets confirmed");
    expect(workspace()).not.toContain("dataSyncUx.");
  });
  it.each([
    "unlinked",
    "oauth",
    "loading",
    "offline",
    "readError",
    "forbidden",
    "session",
    "wrongTenant",
  ])("blocks export with %s", async value => {
    await mode(value);
    expect(button("تصدير المخزون").disabled).toBe(true);
    expect(w.document.querySelectorAll(".pw-workspace a[target]")).toHaveLength(
      0
    );
    expect(text()).toContain("كتابات مقبولة: 0");
  });
  it.each([
    ["empty", "لا توجد منتجات"],
    ["limit", "5000"],
    ["destination", "لم نجد ورقة"],
    ["sourceChanged", "لم تبدأ الكتابة"],
    ["rateLimit", "حد محاولات"],
  ])("explains %s before sending", async (value, message) => {
    await send(value);
    await vi.waitFor(() => expect(workspace()).toContain(message));
    expect(text()).toContain("كتابات مقبولة: 0");
    expect(
      w.sessionStorage.getItem("sary:inventory-export:v1:" + exportPreviewScope)
    ).toBeNull();
  });
  it("retains lost-write warning across navigation, opens local destination and requires acknowledgement", async () => {
    await send("lostReply");
    await vi.waitFor(() => expect(workspace()).toContain("فُقد الرد"));
    expect(text()).toContain("كتابات مقبولة: 1");
    expect(button("تصدير المخزون").disabled).toBe(true);
    w.location.hash = "#/page/merchant/sheets/inventory";
    await vi.waitFor(() =>
      expect(w.document.querySelector(".is-workspace")).not.toBeNull()
    );
    w.location.hash = "#/page/merchant/data-sync";
    await vi.waitFor(() =>
      expect(workspace()).toContain("محاولة تصدير تحتاج مراجعتك")
    );
    expect(text()).toContain("كتابات مقبولة: 1");
    const link = Array.from(
      w.document.querySelectorAll(".pw-workspace a")
    ).find((e: any) => e.textContent.includes("المحاولة السابقة")) as any;
    expect(link.getAttribute("href")).toBe("#export-destination");
    link.click();
    await vi.waitFor(() =>
      expect(
        w.document.querySelectorAll("#export-destination li")
      ).toHaveLength(25)
    );
    expect(
      w.document.querySelector("#export-destination li").textContent
    ).toContain("الكمية: 0");
    expect(
      w.document.querySelectorAll("#export-destination li")[1].textContent
    ).toContain("الكمية: فارغ");
    await click("راجعت الجدول");
    expect(w.document.querySelector(".ds-consent input").checked).toBe(false);
    expect(text()).toContain("محاولات التصدير المحلية: 1");
  });
  it.each(["notSent", "wrongReceipt", "failure"])(
    "does not treat %s as confirmation",
    async value => {
      await send(value);
      await vi.waitFor(() =>
        expect(
          w.document.querySelector(".pw-workspace [role=alert]")
        ).not.toBeNull()
      );
      expect(workspace()).not.toContain("أكد Google Sheets");
      expect(button("تصدير المخزون").disabled).toBe(true);
      expect(
        w.sessionStorage.getItem(
          "sary:inventory-export:v1:" + exportPreviewScope
        )
      ).not.toBeNull();
    }
  );
  it("resets only with an explicit confirmation", async () => {
    await send("lostReply");
    await vi.waitFor(() => expect(workspace()).toContain("فُقد الرد"));
    await click("إعادة مثال التصدير");
    await click("إلغاء");
    expect(
      w.sessionStorage.getItem("sary:inventory-export:v1:" + exportPreviewScope)
    ).not.toBeNull();
    await click("إعادة مثال التصدير");
    await click("نعم، إعادة مثال التصدير");
    await vi.waitFor(() => expect(text()).toContain("كتابات مقبولة: 0"));
    expect(
      w.sessionStorage.getItem("sary:inventory-export:v1:" + exportPreviewScope)
    ).toBeNull();
    expect(button("تصدير المخزون").disabled).toBe(true);
  });
});
