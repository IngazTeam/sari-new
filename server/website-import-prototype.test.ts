import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { beforeEach, afterEach, it, expect } from "vitest";
let dom: JSDOM, w: any;
beforeEach(() => {
  dom = new JSDOM("<main></main>", {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  w = dom.window;
  w.WebsiteReportsPreview = { render: () => "<h2>Existing reports</h2>" };
  runInContext(
    readFileSync("prototypes/tenant-dashboard/site/website-import.js", "utf8"),
    dom.getInternalVMContext()
  );
  w.render = () =>
    (w.document.querySelector("main").innerHTML = w.WebsiteImportPreview.render(
      { route: "/merchant/smart-analysis" }
    ));
  w.render();
});
afterEach(() => dom.window.close());
const click = (action: string) =>
  w.document.querySelector(`[data-wi="${action}"]`).click();
const change = (selector: string, value: string) => {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const preview = () => {
  w.document.getElementById("wi-extract-ack").click();
  w.document
    .querySelector("[data-wi-prepare]")
    .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
};
const approve = () => {
  change("[data-wi-choice=products]", "merge");
  w.document.getElementById("wi-ack").click();
};
it("requires separate agreement before preparing and before saving", () => {
  expect(w.document.querySelector("button[type=submit]").disabled).toBe(true);
  preview();
  expect(w.document.querySelector("[data-wi=apply]").disabled).toBe(true);
  approve();
  expect(w.document.querySelector("[data-wi=apply]").disabled).toBe(false);
  click("apply");
  expect(w.document.body.textContent).toContain("حُفظ الاستيراد التوضيحي");
});
it("requires a fresh confirmation after a conflict", () => {
  change("#wi-outcome", "conflict");
  preview();
  approve();
  click("apply");
  expect(w.document.querySelector("[data-wi=apply]").disabled).toBe(true);
  click("refresh");
  expect(w.document.getElementById("wi-ack").checked).toBe(false);
});
it("recovers a saved result after an uncertain response without a second apply", () => {
  change("#wi-outcome", "uncertain");
  preview();
  approve();
  click("apply");
  expect(w.document.body.textContent).toContain("تعذر تأكيد النتيجة");
  click("read");
  expect(w.document.body.textContent).toContain("حُفظ الاستيراد التوضيحي");
  expect(w.document.querySelector("[data-wi=apply]")).toBeNull();
});
it.each(["readonly", "loading", "error"])(
  "blocks preparing in %s mode",
  mode => {
    change("#wi-mode", mode);
    expect(w.document.querySelector("button[type=submit]").disabled).toBe(true);
  }
);
it("retains access to the existing report mock", () => {
  click("tab-reports");
  expect(w.document.body.textContent).toContain("Existing reports");
  click("tab-import");
  expect(w.document.querySelector("[data-wi-prepare]")).not.toBeNull();
});
it("allows reviewing an empty extraction without inventing proposed records", () => {
  change("#wi-mode", "empty");
  preview();
  expect(w.document.body.textContent).toContain("لم يعثر المثال على بيانات");
  expect(w.document.querySelector("[data-wi=apply]").disabled).toBe(true);
  expect(w.document.body.textContent).not.toContain("علبة قهوة جديدة");
});
