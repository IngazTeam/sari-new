import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dom: JSDOM, w: any, errors: Error[];
const base = "prototypes/tenant-dashboard/site/";
const key = "sary-quick-response-workspace-v1";
const data = () => JSON.parse(w.localStorage.getItem(key));
const click = (action: string, id?: number) => {
  const selector = `[data-qr-action="${action}"]${id ? `[data-id="${id}"]` : ""}`;
  if (id === 1 && !w.document.querySelector(selector))
    fill("search", "مدة التوصيل");
  const el = w.document.querySelector(selector);
  expect(el).toBeTruthy();
  el.click();
};
const fill = (field: string, value: string | boolean) => {
  const el =
    w.document.getElementById("qr-" + field) ||
    w.document.querySelector(`[name="${field}"]`);
  expect(el).toBeTruthy();
  if (typeof value === "boolean") el.checked = value;
  else el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const submit = (type = "editor") =>
  w.document
    .querySelector(`[data-qr-form="${type}"]`)
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const dialog = () => w.document.getElementById("dialog");
const primary = () =>
  w.document.querySelector('[data-page-action="primary"]').click();
beforeEach(() => {
  errors = [];
  const console = new VirtualConsole();
  console.on("jsdomError", e => errors.push(e));
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
  for (const name of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "notifications.js",
    "quick-responses.js",
    "pages.js",
    "app.js",
  ])
    runInContext(readFileSync(base + name, "utf8"), dom.getInternalVMContext());
  w.history.replaceState(null, "", "#/page/merchant/quick-responses");
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
});
afterEach(() => {
  expect(errors).toEqual([]);
  dom.window.close();
});

describe("quick response interactive prototype", () => {
  it("validates fields and saves priority zero with new rules inactive", () => {
    primary();
    submit();
    expect(dialog().querySelectorAll("[aria-invalid=true]")).toHaveLength(2);
    fill("trigger", "سؤال جديد");
    fill("response", "إجابة مراجعة");
    fill("keywords", "سعر, شحن, سعر");
    fill("priority", "1.5");
    submit();
    expect(
      w.document.getElementById("qr-priority").getAttribute("aria-invalid")
    ).toBe("true");
    fill("priority", "0");
    submit();
    expect(data().at(-1)).toMatchObject({
      trigger: "سؤال جديد",
      keywords: "سعر، شحن",
      priority: 0,
      isActive: false,
    });
  });
  it("retains a draft on close and resumes it without a write", () => {
    click("edit", 1);
    fill("response", "مسودتي");
    click("close");
    expect(w.document.body.textContent).toContain("مسودة لم تحفظ");
    expect(data()).toBeNull();
    click("resume");
    expect(w.document.getElementById("qr-response").value).toBe("مسودتي");
    submit();
    expect(data().find((r: any) => r.id === 1).response).toBe("مسودتي");
  });
  it("handles search, status and paging over every rule", () => {
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      10
    );
    click("next");
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      2
    );
    fill("search", "مدة التوصيل");
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      1
    );
    fill("status", "inactive");
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      0
    );
    fill("search", "");
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      4
    );
  });
  it("previews active saved rules without counters or storage writes and clears old results while typing", () => {
    fill("question", "شحن");
    click("test");
    expect(w.document.getElementById("qr-result").textContent).toContain(
      "تطابق كلمة"
    );
    fill("question", "مدة التوصيل");
    expect(w.document.getElementById("qr-result").textContent).toBe("");
    click("test");
    expect(w.document.getElementById("qr-result").textContent).toContain(
      "تطابق كامل"
    );
    fill("question", "خدمة الشركات");
    click("test");
    expect(w.document.getElementById("qr-result").textContent).toContain(
      "لا توجد قاعدة"
    );
    expect(data()).toBeNull();
  });
  it("reviews conflicts, merges untouched priority, and waits for a separate save", () => {
    click("edit", 1);
    fill("response", "مسودتي");
    click("external");
    submit();
    expect(dialog().textContent).toContain("مسودتك باقية");
    click("review");
    expect(dialog().querySelector("form").reportValidity()).toBe(false);
    dialog().querySelector('input[name="response"][value="mine"]').checked =
      true;
    submit("review");
    expect(w.document.getElementById("qr-response").value).toBe("مسودتي");
    expect(w.document.getElementById("qr-priority").value).toBe("10");
    expect(data().find((r: any) => r.id === 1).response).toContain(
      "نافذة أخرى"
    );
    submit();
    expect(data().find((r: any) => r.id === 1).response).toBe("مسودتي");
  });
  it("requires deletion review again after a conflicting update", () => {
    click("delete", 1);
    submit();
    expect(data()).toBeNull();
    fill("reviewed", true);
    click("external");
    submit();
    click("review");
    submit("review");
    expect(dialog().textContent).toContain("رد محفوظ من نافذة أخرى");
    expect(w.document.getElementById("qr-reviewed").checked).toBe(false);
    submit();
    expect(data().some((r: any) => r.id === 1)).toBe(true);
    fill("reviewed", true);
    submit();
    expect(data().some((r: any) => r.id === 1)).toBe(false);
  });
  it("cancels deletion without a write and safely displays hostile text", () => {
    click("delete", 1);
    click("close");
    expect(data()).toBeNull();
    click("edit", 1);
    fill("response", "<img src=x onerror=alert(1)>");
    submit();
    expect(w.document.querySelector(".qr-workspace img")).toBeNull();
    click("delete", 1);
    expect(dialog().querySelector("img")).toBeNull();
  });
  it("does not recreate a deleted-elsewhere row", () => {
    click("edit", 1);
    fill("response", "باقية");
    click("external-delete");
    submit();
    click("review");
    expect(dialog().textContent).toContain("لن نعيد إنشاءه");
    expect(dialog().querySelector("button[type=submit]")).toBeNull();
    click("back");
    expect(w.document.getElementById("qr-response").value).toBe("باقية");
    submit();
    expect(data().some((r: any) => r.id === 1)).toBe(false);
  });
  it("reviews a changed collection before creation without writing during review", () => {
    primary();
    fill("trigger", "جديد");
    fill("response", "مسودتي");
    click("external");
    submit();
    click("review");
    expect(dialog().textContent).toContain("القائمة الحالية: 13");
    submit("review");
    expect(data()).toHaveLength(13);
    submit();
    expect(data()).toHaveLength(14);
  });
  it("offers the matching saved creation after normalization without a second create", () => {
    w.QuickResponsePreview.reset();
    primary();
    fill("trigger", "  مثال  ");
    fill("response", " نص ");
    fill("keywords", "سعر, شحن, سعر");
    w.localStorage.setItem(
      key,
      JSON.stringify([
        ...data(),
        {
          id: 90,
          trigger: "مثال",
          response: "نص",
          keywords: "سعر، شحن",
          priority: 5,
          isActive: false,
          useCount: 0,
        },
      ])
    );
    submit();
    click("review");
    expect(dialog().textContent).toContain("يوجد رد مطابق");
    click("open-saved", 90);
    expect(data()).toHaveLength(13);
    submit();
    expect(data()).toHaveLength(13);
  });
  it("disables writes for readers and shows an explicit load failure", () => {
    click("reader");
    expect(
      w.document.querySelector('[data-page-action="primary"]').disabled
    ).toBe(true);
    expect(w.document.querySelector('[data-qr-action="edit"]').disabled).toBe(
      true
    );
    expect(data()).toBeNull();
    click("reader");
    click("load");
    expect(
      w.document.querySelector('[data-page-action="primary"]').disabled
    ).toBe(true);
    expect(w.document.body.textContent).toContain("هذه ليست قائمة فارغة");
    expect(w.document.querySelector(".qr-stats")).toBeNull();
    click("load");
    expect(w.document.querySelectorAll(".qr-workspace article")).toHaveLength(
      10
    );
  });
  it("keeps field values after a failed save simulation", () => {
    click("edit", 1);
    fill("response", "مسودة باقية");
    click("fail");
    expect(dialog().textContent).toContain("تعذر الحفظ");
    expect(w.document.getElementById("qr-response").value).toBe("مسودة باقية");
    expect(data()).toBeNull();
  });
});
