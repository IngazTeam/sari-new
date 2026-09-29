import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dom: JSDOM,
  w: any,
  errors: Error[],
  exported: { blob: Blob; filename?: string }[];
const base = "prototypes/tenant-dashboard/site/";
const route = (path = "insights") => {
  w.history.replaceState(null, "", "#/page/merchant/" + path);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const click = (action: string, value?: string) => {
  const el = w.document.querySelector(
    `[data-in-action="${action}"]${value ? `[data-value="${value}"]` : ""}`
  );
  expect(el).toBeTruthy();
  el.click();
};
const primary = () =>
  w.document.querySelector('[data-page-action="primary"]').click();
const text = () => w.document.querySelector(".in-workspace").textContent;
const rows = () => [...w.document.querySelectorAll(".in-panel > article")];
const mode = (value: string) => {
  const el = w.document.getElementById("in-mode");
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const csv = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new w.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
beforeEach(() => {
  errors = [];
  exported = [];
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
  w.URL.createObjectURL = (blob: Blob) => {
    exported.push({ blob });
    return "blob:local-test";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    expect(this.isConnected).toBe(true);
    exported.at(-1)!.filename = this.download;
  };
  for (const name of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "assistant.js",
    "notifications.js",
    "quick-responses.js",
    "insights.js",
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

describe("insights prototype matches the read-only workspace", () => {
  it.each([
    ["insights", "keywords"],
    ["ai-suggestions", "keywords"],
    ["ab-tests", "tests"],
  ])("opens %s with the correct detailed tab", (path, tab) => {
    route(path);
    expect(w.document.querySelector("[role=tab][aria-selected=true]").id).toBe(
      "in-tab-" + tab
    );
    expect(rows()).toHaveLength(20);
    expect(
      w.document.querySelectorAll("[data-page-action=primary]")
    ).toHaveLength(1);
    expect(
      w.document.querySelector("[data-page-action=primary]").textContent
    ).toBe("تحديث البيانات");
  });
  it("filters by last sighting, pages independently, and resets pages after period changes", () => {
    expect(text()).toContain("22 سجل");
    expect(rows()[0].textContent).toContain("التكرار التراكمي");
    click("next");
    expect(rows()).toHaveLength(2);
    click("tab", "reports");
    expect(rows()).toHaveLength(20);
    click("next");
    expect(rows()).toHaveLength(4);
    click("tab", "keywords");
    expect(rows()).toHaveLength(2);
    click("period", "90");
    expect(rows()).toHaveLength(20);
    expect(text()).toContain("24 سجل");
    click("tab", "reports");
    click("period", "7");
    expect(rows()).toHaveLength(7);
    expect(text()).toContain("صفحة 1 من 1");
    expect(w.document.querySelector("[data-in-action=next]").disabled).toBe(
      true
    );
  });
  it.each(["keywords", "reports", "tests"])(
    "has an honest empty state for %s with disabled export",
    tab => {
      click("tab", tab);
      mode("empty");
      expect(rows()).toHaveLength(0);
      expect(w.document.querySelector("[data-in-action=export]").disabled).toBe(
        true
      );
      click("export");
      expect(exported).toHaveLength(0);
      expect(text()).toContain("0 سجل");
    }
  );
  it.each(["loading", "error", "offline", "forbidden"])(
    "hides stale values and blocks export in %s",
    state => {
      mode(state);
      expect(rows()).toHaveLength(0);
      expect(w.document.querySelector(".in-stats")).toBeNull();
      expect(w.document.querySelector("[data-in-action=export]").disabled).toBe(
        true
      );
      click("export");
      expect(exported).toHaveLength(0);
      if (state === "loading")
        expect(
          w.document.querySelector("[data-page-action=primary]").disabled
        ).toBe(true);
      else expect(text()).toContain("لا نعرض أصفارًا");
    }
  );
  it("recovers only after refresh and locks repeated requests without early success", async () => {
    mode("error");
    click("recover");
    expect(text()).toContain("جارٍ تحديث البيانات");
    expect(
      w.document.querySelector("[data-page-action=primary]").disabled
    ).toBe(true);
    primary();
    expect(exported).toHaveLength(0);
    await Promise.resolve();
    expect(rows()).toHaveLength(20);
    expect(w.document.body.textContent).toContain("حُدّثت البيانات التوضيحية");
  });
  it("does not toast success after a failed source refresh or obsolete route refresh", async () => {
    mode("offline");
    primary();
    await Promise.resolve();
    expect(text()).toContain("تعذّر الاتصال");
    expect(w.document.body.textContent).not.toContain(
      "حُدّثت البيانات التوضيحية"
    );
    mode("normal");
    primary();
    route("ab-tests");
    await Promise.resolve();
    expect(w.document.querySelector("[role=tab][aria-selected=true]").id).toBe(
      "in-tab-tests"
    );
    expect(w.document.body.textContent).not.toContain(
      "حُدّثت البيانات التوضيحية"
    );
  });
  it("shows independent sample denominators, unavailable empty/invalid ratios and oldest-first trend", () => {
    click("tab", "reports");
    expect(rows()[0].textContent).toContain("٤٠%");
    expect(rows()[2].textContent).toContain("غير متاح");
    expect(rows()[3].textContent).toContain("عدادات غير متسقة");
    expect(rows()[3].querySelector(".in-ratio").textContent).toBe("غير متاح");
    expect(w.document.querySelectorAll(".in-trend > div")).toHaveLength(20);
    const trend = w.document.querySelectorAll(".in-trend > div");
    expect(trend[0].textContent).toContain("حجم العينة");
    expect(trend[19].textContent).toContain("٤");
    expect(text()).toContain("فلا تُجمع كعملاء فريدين");
    expect(text()).toContain(
      "لا يمثل رضا مقاسًا أو شراءً مؤكدًا أو احتراف المبيعات"
    );
  });
  it("keeps historical selections and invalid A/B observations separate from statistical wins", () => {
    route("ab-tests");
    // Stable descending ID within the shared creation timestamp.
    click("next");
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain("عدادات غير متسقة");
    expect(rows()[1].textContent).toContain("غير متاح");
    expect(rows()[1].querySelectorAll("button")).toHaveLength(0);
    click("previous");
    expect(text()).toContain(
      "الاختيار التاريخي المحفوظ: A. ليس إثبات فوز أو إذن تفعيل"
    );
    expect(text()).toContain(
      "لا تثبت تحويلًا أو فائزًا إحصائيًا ولا تفعّل أي رد"
    );
  });
  it("supports RTL tab navigation, Home/End and focus after rerender", () => {
    const key = (value: string) =>
      w.document
        .querySelector("[role=tab][aria-selected=true]")
        .dispatchEvent(
          new w.KeyboardEvent("keydown", {
            key: value,
            bubbles: true,
            cancelable: true,
          })
        );
    key("ArrowLeft");
    expect(w.document.activeElement.id).toBe("in-tab-reports");
    key("End");
    expect(w.document.activeElement.id).toBe("in-tab-tests");
    key("ArrowRight");
    expect(w.document.activeElement.id).toBe("in-tab-reports");
    key("Home");
    expect(w.document.activeElement.id).toBe("in-tab-keywords");
    expect(
      w.document.getElementById("in-panel").getAttribute("aria-labelledby")
    ).toBe("in-tab-keywords");
  });
  it.each(["keywords", "reports", "tests"])(
    "exports only the displayed %s page with UTC scope and honest evidence",
    async tab => {
      click("tab", tab);
      click("next");
      click("export");
      expect(exported).toHaveLength(1);
      expect(exported[0].filename).toBe(
        `sary-insights-preview-${tab}-30d-page-2.csv`
      );
      const value = await csv(exported[0].blob);
      expect(value).toContain('"scope","displayed page only"');
      expect(value).toContain('"period","30d"');
      expect(value).toContain('"preview","local design sample"');
      expect(value.split("\r\n")).toHaveLength(7 + (tab === "reports" ? 4 : 2));
      if (tab === "tests")
        expect(value).toContain('"legacy_unverified_observations","false"');
      expect(w.document.querySelector("a[download]")).toBeNull();
    }
  );
  it("does not write stored merchant data or invoke remote requests during review", async () => {
    const saved = { ...w.localStorage };
    const fetch = vi.fn();
    w.fetch = fetch;
    click("tab", "reports");
    click("period", "7");
    primary();
    await Promise.resolve();
    click("tab", "tests");
    expect({ ...w.localStorage }).toEqual(saved);
    expect(fetch).not.toHaveBeenCalled();
  });
});
