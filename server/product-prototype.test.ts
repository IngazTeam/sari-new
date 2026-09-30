import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import {
  ProductPreviewStore,
  productModes,
  productPreviewId,
} from "../prototypes/tenant-dashboard/src/product-model";
import {
  productCatalogSchema,
  productEditorReadSchema,
} from "../shared/product-catalog";
import { productEditorReceipt } from "../shared/product-editor";
import {
  productDeleteReceipt,
  productDeleteReviewSchema,
} from "../shared/product-delete";
import {
  newProductForm,
  productFormRequest,
} from "../client/src/lib/product-workspace-model";
const requestId = "11111111-1111-4111-8111-111111111111";
function createInput() {
  const base = newProductForm("SAR"),
    form = {
      ...base,
      name: "New product",
      price: "12.34",
      costPrice: "0",
      stock: "",
    };
  const parsed = productFormRequest("new", form, base, null, requestId);
  if (!parsed.success) throw Error("Fixture");
  return parsed.data;
}
describe("product preview contract and mutations", () => {
  it.each(Object.keys(productModes) as (keyof typeof productModes)[])(
    "validates %s scenario",
    mode => {
      const s = new ProductPreviewStore();
      s.setMode(mode);
      expect(productCatalogSchema.safeParse(s.list({})).success).toBe(true);
      if (["empty", "missing"].includes(mode))
        expect(() => s.read({ id: 27 })).toThrow();
      else {
        expect(
          productEditorReadSchema.safeParse(s.read({ id: 27 })).success
        ).toBe(true);
        expect(
          productDeleteReviewSchema.safeParse(s.deleteReview({ ids: [1, 27] }))
            .success
        ).toBe(true);
      }
    }
  );
  it("pages, searches and distinguishes inventory/price facts", () => {
    const s = new ProductPreviewStore();
    expect(s.list({ pageSize: 20 }).items).toHaveLength(20);
    expect(s.list({ pageSize: 20, page: 2 }).items).toHaveLength(7);
    expect(s.list({ search: "MOCK-27" }).total).toBe(1);
    expect(s.list({ search: "%" }).total).toBe(0);
    expect(
      s.list({ inventory: "unknown" }).items.every(row => row.stock === null)
    ).toBe(true);
    s.setMode("legacy");
    expect(s.list({ price: "review" }).total).toBe(27);
  });
  it("creates precise price, zero cost and unknown stock from an empty catalog", async () => {
    const s = new ProductPreviewStore();
    s.setMode("empty");
    const r: any = await s.write(createInput());
    expect(productEditorReceipt.safeParse(r).success).toBe(true);
    expect(s.list({}).total).toBe(1);
    expect(s.read({ id: r.productId }).product).toMatchObject({
      price: 1234,
      costPrice: 0,
      stock: null,
    });
    await expect(s.write(createInput())).resolves.toEqual(r);
    expect(s.list({}).total).toBe(1);
  });
  it("recovers an uncertain save once and rejects UUID payload reuse", async () => {
    const s = new ProductPreviewStore();
    s.setMode("uncertain");
    const input = createInput();
    await expect(s.write(input)).rejects.toThrow();
    const r: any = await s.receipt(requestId, "editor");
    expect(r.merchantId).toBe(productPreviewId);
    await expect(s.write(input)).resolves.toEqual(r);
    await expect(
      s.write({ ...input, fields: { ...input.fields, name: "Other" } })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(s.list({}).total).toBe(28);
  });
  it("distinguishes not committed, wrong receipt and failed recovery", async () => {
    const s = new ProductPreviewStore();
    s.setMode("notCommitted");
    await expect(s.write(createInput())).rejects.toThrow();
    await expect(s.receipt(requestId, "editor")).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });
    s.setMode("wrongReceipt");
    const bad: any = await s.write(createInput());
    expect(bad.merchantId).toBe(1);
    expect((await s.receipt(requestId, "editor")).merchantId).toBe(
      productPreviewId
    );
    s.setMode("receiptError");
    await expect(s.receipt(requestId, "editor")).rejects.toThrow();
  });
  it("checks revisions and preserves unrelated values on a patch", async () => {
    const s = new ProductPreviewStore(),
      before = s.read({ id: 27 });
    s.conflict();
    await expect(
      s.write({
        kind: "update",
        id: 27,
        requestId,
        expectedDigest: before.digest,
        fields: { name: "Mine" },
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const current = s.read({ id: 27 });
    await s.write({
      kind: "update",
      id: 27,
      requestId,
      expectedDigest: current.digest,
      fields: { name: "Mine", costPrice: null, status: "draft" },
    });
    expect(s.read({ id: 27 }).product).toMatchObject({
      name: "Mine",
      costPrice: null,
      isActive: 0,
      stock: current.product.stock,
      description: current.product.description,
    });
  });
  it.each(["viewer", "source", "references"] as const)(
    "blocks deletion for %s",
    async mode => {
      const s = new ProductPreviewStore();
      s.setMode(mode);
      const review = s.deleteReview({ ids: [1] });
      expect(review.canDelete).toBe(false);
      await expect(
        s.deleteWrite({
          ids: [1],
          reviewed: true,
          expectedDigest: review.digest,
          requestId,
        })
      ).rejects.toThrow();
      expect(s.list({}).total).toBe(27);
    }
  );
  it("recovers deletion after records disappear and rejects changed review", async () => {
    const s = new ProductPreviewStore(),
      old = s.deleteReview({ ids: [27] });
    s.conflict();
    await expect(
      s.deleteWrite({
        ids: [27],
        reviewed: true,
        expectedDigest: old.digest,
        requestId,
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    s.setMode("uncertain");
    const review = s.deleteReview({ ids: [1, 27] }),
      input = {
        ids: [1, 27],
        reviewed: true,
        expectedDigest: review.digest,
        requestId,
      };
    await expect(s.deleteWrite(input)).rejects.toThrow();
    expect(() => s.read({ id: 27 })).toThrow();
    const receipt = await s.receipt(requestId, "delete");
    expect(productDeleteReceipt.safeParse(receipt).success).toBe(true);
    await expect(s.deleteWrite(input)).resolves.toEqual(receipt);
    expect(s.list({}).total).toBe(25);
  });
});
let dom: JSDOM, w: any, errors: Error[];
async function boot() {
  errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e));
  const base = "prototypes/tenant-dashboard/site/";
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/#/page/merchant/products",
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
    expect(w.document.querySelector(".pw-catalog-list")).not.toBeNull()
  );
}
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
const mode = (value: string) => choose(".pp-controls select", value);
async function fill(selector: string, value: string) {
  const el = w.document.querySelector(selector),
    proto =
      el.tagName === "TEXTAREA"
        ? w.HTMLTextAreaElement.prototype
        : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
async function check(selector: string) {
  w.document.querySelector(selector).click();
  await new Promise(r => setTimeout(r, 20));
}
describe("built product prototype with actual UI", () => {
  beforeEach(boot);
  afterEach(() => {
    w.ProductPreview.unmount();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
    dom.window.close();
  });
  it("renders saved markup literally after leaving and reopening the workspace", async () => {
    await click("إضافة منتج");
    await fill("#product-name", "<img src=x onerror=alert(1)>");
    await fill("#product-price", "1");
    await click("حفظ المنتج");
    expect(text()).toContain("<img src=x onerror=alert(1)>");
    expect(w.document.querySelector("#main img[src=x]")).toBeNull();
    w.location.hash = "#/page/merchant/tools";
    await vi.waitFor(() =>
      expect(w.document.querySelector(".pw-workspace")).toBeNull()
    );
    w.location.hash = "#/page/merchant/products";
    await vi.waitFor(() =>
      expect(w.document.querySelector(".pw-catalog-list")).not.toBeNull()
    );
    expect(text()).toContain("<img src=x onerror=alert(1)>");
    expect(w.document.querySelector("#main img[src=x]")).toBeNull();
  });
  it("uses the actual list, pagination, literal search and internal import link", async () => {
    expect(w.document.querySelectorAll(".pw-product")).toHaveLength(20);
    await click("التالي");
    expect(w.document.querySelectorAll(".pw-product")).toHaveLength(7);
    await fill("input[type=search]", "MOCK-27");
    await vi.waitFor(() =>
      expect(w.document.querySelectorAll(".pw-product")).toHaveLength(1)
    );
    expect(
      w.document.querySelector(".pw-workspace a").getAttribute("href")
    ).toBe("#/page/merchant/products/upload");
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
  ])("hides stale list for %s", async value => {
    await mode(value);
    expect(w.document.querySelector(".pw-catalog-list")).toBeNull();
    expect(button("إضافة منتج").disabled).toBe(true);
    expect(w.document.querySelector("[data-state]")).not.toBeNull();
  });
  it("renders legacy prices, source and viewer locks and both languages", async () => {
    await mode("legacy");
    expect(text()).toContain("سعر يحتاج مراجعة");
    await mode("source");
    expect(button("إضافة منتج").disabled).toBe(true);
    await mode("viewer");
    expect(button("إضافة منتج").disabled).toBe(true);
    await choose(".pp-controls label:nth-of-type(2) select", "en");
    expect(w.document.querySelector(".pw-workspace").dir).toBe("ltr");
    expect(text()).toContain("Your products, clearly");
    expect(text()).not.toContain("productWorkspaceUx.");
  });
  it("preserves a draft and recovers an uncertain create without duplicating it", async () => {
    await click("إضافة منتج");
    await click("حفظ المنتج");
    expect(w.document.querySelectorAll("[aria-invalid=true]")).toHaveLength(2);
    await fill("#product-name", "منتج محاكاة");
    await fill("#product-price", "12.34");
    await click("العودة للمنتجات");
    await click("متابعة المسودة");
    expect(w.document.querySelector("#product-name").value).toBe("منتج محاكاة");
    await mode("uncertain");
    await click("حفظ المنتج");
    expect(w.document.querySelector("#product-name").disabled).toBe(true);
    expect(w.document.querySelector(".pw-workspace table")).toBeNull();
    await click("فحص النتيجة");
    await vi.waitFor(() =>
      expect(w.document.querySelector(".pw-catalog-list")).not.toBeNull()
    );
    expect(text()).toContain("منتج محاكاة");
    expect(text()).toContain("تأكدت العملية");
    expect(
      w.sessionStorage.getItem(
        "sary:product-workspace:v1:9000082:9000082:products"
      )
    ).toBeNull();
  });
  it("keeps a local change through an explicit conflict review", async () => {
    await click("مراجعة وتعديل");
    await fill("#product-name", "اسم من مسودتي");
    await click("محاكاة تعديل زميل للمنتج 27");
    expect(text()).toContain("تغيّر المنتج منذ فتحه");
    expect(button("حفظ المنتج").disabled).toBe(true);
    expect(w.document.querySelector("table")).not.toBeNull();
    await check(".pw-check input");
    const merge = Array.from(
      w.document.querySelectorAll(".pw-workspace button")
    ).find((b: any) => b.textContent.includes("تطبيق مسودتي")) as any;
    expect(merge).toBeTruthy();
    merge.click();
    await new Promise(r => setTimeout(r, 20));
    expect(w.document.querySelector("#product-name").value).toBe(
      "اسم من مسودتي"
    );
    expect(w.document.querySelector("#product-description").value).toContain(
      "تعديل زميل"
    );
    await click("حفظ المنتج");
    expect(text()).toContain("اسم من مسودتي");
  });
  it("prioritizes receipt recovery over a conflict caused by its own committed edit", async () => {
    await click("مراجعة وتعديل");
    await fill("#product-name", "تعديل بإقرار مفقود");
    await mode("uncertain");
    await click("حفظ المنتج");
    expect(text()).toContain("نحتاج تأكيد نتيجة العملية");
    expect(text()).not.toContain("تغيّر المنتج منذ فتحه");
    expect(w.document.querySelector(".pw-workspace table")).toBeNull();
    await click("فحص النتيجة");
    expect(text()).toContain("تعديل بإقرار مفقود");
    expect(w.document.querySelector(".pw-catalog-list")).not.toBeNull();
  });
  it("requires deletion consent and recovers deletion when review becomes missing", async () => {
    await mode("uncertain");
    await click("مراجعة الحذف");
    expect(button("تأكيد الحذف النهائي").disabled).toBe(true);
    await check(".pw-check input");
    await click("تأكيد الحذف النهائي");
    expect(text()).toContain("نحتاج تأكيد نتيجة العملية");
    await click("فحص النتيجة");
    expect(w.document.querySelector(".pw-catalog-list")).not.toBeNull();
    expect(text()).not.toContain("منتج توضيحي 27");
  });
  it("does not discard another workspace draft when resetting the example", async () => {
    w.sessionStorage.setItem("sary:product-workspace:v1:1:1:products", "keep");
    await click("إضافة منتج");
    await fill("#product-name", "Draft");
    await click("إعادة المثال");
    await click("نعم، إعادة المثال");
    expect(
      w.sessionStorage.getItem("sary:product-workspace:v1:1:1:products")
    ).toBe("keep");
    expect(w.document.querySelectorAll(".pw-product")).toHaveLength(20);
  });
});
