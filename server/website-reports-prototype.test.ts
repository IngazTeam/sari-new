import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it } from "vitest";
let dom: JSDOM, w: any;
beforeEach(() => {
  dom = new JSDOM('<main></main><dialog id="dialog"></dialog>', {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  w = dom.window;
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  w.openDialog = (title: string, body: string) => {
    const d = w.document.querySelector("dialog");
    d.innerHTML = "<h2>" + title + "</h2>" + body;
    d.setAttribute("open", "");
  };
  runInContext(
    readFileSync("prototypes/tenant-dashboard/site/website-reports.js", "utf8"),
    dom.getInternalVMContext()
  );
  w.render = () =>
    (w.document.querySelector("main").innerHTML =
      w.WebsiteReportsPreview.render());
  w.render();
});
afterEach(() => dom.window.close());
const click = (action: string, id = "") =>
  w.document
    .querySelector(
      `[data-wr-action="${action}"]${id ? `[data-wr-id="${id}"]` : ""}`
    )
    .click();
const select = (id: string, value: string) => {
  const el = w.document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const ack = () => {
  const el = w.document.getElementById("wr-ack");
  el.checked = true;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
it("paginates reports and searches all results", () => {
  expect(w.document.querySelectorAll(".wr-grid article")).toHaveLength(8);
  click("next");
  expect(w.document.querySelectorAll(".wr-grid article")).toHaveLength(2);
  const f = w.document.querySelector("form");
  f.elements.search.value = "نواة";
  f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
  expect(w.document.querySelectorAll(".wr-grid article")).toHaveLength(1);
});
it("requires acknowledgement before deleting a reviewed report", () => {
  click("review", "1");
  expect(w.document.querySelector("[data-wr-action=delete]").disabled).toBe(
    true
  );
  ack();
  click("delete");
  expect(
    w.document.querySelector('[data-wr-action=review][data-wr-id="1"]')
  ).toBeNull();
});
it.each(["failure", "conflict"])(
  "requires a fresh review after %s",
  outcome => {
    select("wr-outcome", outcome);
    click("review", "1");
    ack();
    click("delete");
    expect(w.document.querySelector("[data-wr-action=delete]")).toBeNull();
    expect(w.document.querySelector("[data-wr-action=export]").disabled).toBe(
      true
    );
    click("reread");
    expect(w.document.getElementById("wr-ack").checked).toBe(false);
  }
);
it("does not offer deletion or scores while running", () => {
  click("review", "2");
  expect(w.document.querySelector("[data-wr-action=delete]")).toBeNull();
  expect(w.document.querySelector("dialog").textContent).toContain("غير متاح");
  expect(w.document.querySelector("dialog").textContent).not.toContain(
    "72/100"
  );
});
it("distinguishes failed loading, empty and read-only views", () => {
  select("wr-mode", "error");
  expect(w.document.querySelector("main").textContent).toContain("تعذر تحميل");
  expect(w.document.querySelectorAll(".wr-grid article")).toHaveLength(0);
  select("wr-mode", "empty");
  expect(w.document.querySelector("main").textContent).toContain(
    "لا توجد تقارير"
  );
  select("wr-mode", "readonly");
  click("review", "1");
  expect(w.document.querySelector("[data-wr-action=delete]")).toBeNull();
});
it("opening start explains actual impact without starting any example", () => {
  click("start");
  expect(w.document.querySelector("dialog").textContent).toContain(
    "معرفة مفعلة"
  );
  expect(w.document.querySelectorAll(".wr-grid article")).toHaveLength(8);
});
