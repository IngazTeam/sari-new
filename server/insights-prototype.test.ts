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
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
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
    "keyword-review.js",
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
      w.document.querySelector("[role=tab][aria-selected=true]").dispatchEvent(
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

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
const review = async () => {
  w.document.querySelector('[data-in-action=review][data-id="2"]').click();
  await settle();
};
const dialog = () => w.document.getElementById("dialog");
const kr = (action: string) => {
  const el = dialog().querySelector(`[data-kr-action="${action}"]`);
  expect(el).toBeTruthy();
  el.click();
};
const pick = (status: string) => {
  const el = w.document.getElementById("kr-status");
  el.value = status;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const card = () =>
  w.document
    .querySelector('[data-in-action=review][data-id="2"]')
    .closest("article");
describe("keyword review prototype parity", () => {
  it("reads the full suggestion and samples, saves a status only, and keeps data local to this session", async () => {
    const stored = { ...w.localStorage };
    await review();
    expect(dialog().textContent).toContain(
      "مثال محلي: هل يمكن توضيح طرق الدفع؟"
    );
    expect(dialog().textContent).toContain("لا ينشئ أو يفعل ردًا سريعًا");
    pick("reviewed");
    kr("save");
    await settle();
    expect(card().textContent).toContain("مراجع");
    expect({ ...w.localStorage }).toEqual(stored);
    expect(dialog().querySelector("[data-kr-action=save]").disabled).toBe(true);
  });
  it("guards the close button and native Escape while a status choice is unsaved", async () => {
    await review();
    pick("ignored");
    dialog().querySelector("[data-action=close]").click();
    expect(dialog().open).toBe(true);
    expect(dialog().textContent).toContain("لديك تغيير في الحالة");
    kr("continue");
    expect(w.document.getElementById("kr-status").value).toBe("ignored");
    dialog().dispatchEvent(
      new w.Event("cancel", { bubbles: false, cancelable: true })
    );
    expect(dialog().textContent).toContain("لديك تغيير في الحالة");
    kr("discard");
    expect(dialog().open).toBe(false);
    expect(card().textContent).toContain("جديد");
  });
  it("preserves a choice and compares full changed evidence before a separate write", async () => {
    await review();
    pick("reviewed");
    kr("external");
    kr("save");
    await settle();
    expect(dialog().textContent).toContain("تغيّر السجل منذ فتحه");
    expect(dialog().querySelector("[data-kr-action=save]").disabled).toBe(true);
    kr("review");
    await settle();
    expect(dialog().textContent).toContain("مثال محلي جديد بعد فتح المراجعة");
    expect(dialog().querySelector("[data-kr-action=accept]").disabled).toBe(
      true
    );
    dialog().querySelector("input[value=mine]").click();
    kr("accept");
    expect(w.document.getElementById("kr-status").value).toBe("reviewed");
    expect(dialog().querySelector(".in-review-record").textContent).toContain(
      "متجاهل"
    );
    kr("save");
    await settle();
    expect(card().textContent).toContain("مراجع");
  });
  it("requires a fresh deletion confirmation after accepting a newer record", async () => {
    await review();
    kr("begin-delete");
    expect(dialog().querySelector("[data-kr-action=delete]").disabled).toBe(
      true
    );
    dialog().querySelector("#kr-reviewed").click();
    kr("external");
    kr("delete");
    await settle();
    expect(dialog().querySelector("#kr-reviewed").checked).toBe(false);
    kr("review");
    await settle();
    kr("accept");
    expect(dialog().querySelector("#kr-reviewed").checked).toBe(false);
    expect(dialog().querySelector("[data-kr-action=delete]").disabled).toBe(
      true
    );
    dialog().querySelector("#kr-reviewed").click();
    kr("delete");
    await settle();
    expect(dialog().open).toBe(false);
    expect(
      w.document.querySelector('[data-in-action=review][data-id="2"]')
    ).toBeNull();
    expect(text()).toContain("21 سجل");
  });
  it("cancels deletion without changing the record", async () => {
    await review();
    kr("begin-delete");
    dialog().querySelector("#kr-reviewed").click();
    kr("cancel-delete");
    kr("close");
    expect(card().textContent).toContain("جديد");
    expect(text()).toContain("22 سجل");
  });
  it("does not accept a failed read and recovers without automatic saving", async () => {
    await review();
    pick("reviewed");
    kr("external");
    kr("save");
    await settle();
    kr("fail-read");
    kr("review");
    await settle();
    expect(dialog().textContent).toContain("تعذّر قراءة النسخة الحالية");
    expect(dialog().querySelector("[data-kr-action=accept]")).toBeNull();
    expect(dialog().querySelector("[data-kr-action=save]").disabled).toBe(true);
    kr("restore");
    kr("review");
    await settle();
    expect(dialog().querySelector("[data-kr-action=accept]")).toBeTruthy();
    expect(w.document.getElementById("kr-status").value).toBe("reviewed");
  });
  it("never recreates a deleted-elsewhere record", async () => {
    await review();
    pick("reviewed");
    kr("external-delete");
    kr("save");
    await settle();
    expect(dialog().textContent).toContain("لن نعيد إنشاءه");
    expect(dialog().querySelector("[data-kr-action=save]")).toBeNull();
    expect(dialog().querySelector("[data-kr-action=begin-delete]")).toBeNull();
  });
  it("offers read-only review to viewers and reflects permission loss on refresh", async () => {
    mode("viewer");
    await review();
    expect(dialog().textContent).toContain(
      "تغيير الحالة والحذف يحتاجان صلاحية"
    );
    expect(dialog().querySelector("select")).toBeNull();
    kr("close");
    mode("normal");
    await review();
    pick("reviewed");
    kr("revoke");
    kr("save");
    await settle();
    kr("review");
    await settle();
    kr("accept");
    expect(dialog().querySelector("select")).toBeNull();
    expect(dialog().querySelector("[data-kr-action=save]")).toBeNull();
  });
  it("ignores a read that completes after closing or navigation", async () => {
    w.document.querySelector('[data-in-action=review][data-id="2"]').click();
    kr("close");
    await settle();
    expect(dialog().open).toBe(false);
    w.document.querySelector('[data-in-action=review][data-id="2"]').click();
    route("ab-tests");
    await settle();
    expect(dialog().open).toBe(false);
    expect(w.document.querySelector("[role=tab][aria-selected=true]").id).toBe(
      "in-tab-tests"
    );
  });
});

const openReport = async (id = 1) => {
  click("tab", "reports");
  const details = w.document.querySelector(`[data-in-report="${id}"]`);
  details.open = true;
  details.dispatchEvent(new w.Event("toggle"));
  await settle();
  return details;
};
const reportMode = async (details: any, value: string) => {
  const el = details.querySelector("[data-in-report-mode]");
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await settle();
};
describe("saved report detail prototype parity", () => {
  it("loads details only when opened and exposes complete text with historical caveats", async () => {
    click("tab", "reports");
    expect(
      w.document.querySelector('[data-in-report="1"] .in-report-content')
        .textContent
    ).toBe("");
    const details = await openReport();
    expect(details.textContent).toContain("مثال محلي لنص قديم");
    expect(details.textContent).toContain("الشكاوى المحفوظة في التقرير");
    expect(details.textContent).toContain("تصنيف المشاعر لا يثبت الشراء");
    expect(details.textContent).toContain("قد تختلف عن عدادات التقرير");
    expect(details.textContent).toContain("ليست نتيجة استبيان رضا");
  });
  it.each(["error", "missing", "loading"])(
    "hides stale contents and export when detail source is %s",
    async state => {
      const details = await openReport();
      await reportMode(details, state);
      expect(
        details.querySelector("[data-in-action=export-report]")
      ).toBeNull();
      expect(
        details.querySelector(".in-report-content").textContent
      ).not.toContain("الشكاوى المحفوظة");
      expect(exported).toHaveLength(0);
      if (state === "loading")
        expect(details.querySelector("[role=status]")).toBeTruthy();
      else expect(details.querySelector("[role=alert]")).toBeTruthy();
      await reportMode(details, "normal");
      expect(
        details.querySelector("[data-in-action=export-report]")
      ).toBeTruthy();
    }
  );
  it("represents absent fields explicitly instead of failing the entire report", async () => {
    const details = await openReport(3);
    expect(
      details.textContent.split("لا يوجد نص محفوظ في هذا الحقل.")
    ).toHaveLength(4);
    expect(details.querySelector("[role=alert]")).toBeNull();
  });
  it("exports complete report content and keeps historical values distinct from calculated share", async () => {
    const details = await openReport();
    details.querySelector("[data-in-action=export-report]").click();
    expect(exported).toHaveLength(1);
    expect(exported[0].filename).toBe("sary-insight-report-preview-1.csv");
    const text = await csv(exported[0].blob);
    expect(text).toContain('"preview","local design sample"');
    expect(text).toContain('"positive_share_percent","40"');
    expect(text).toContain('"unverified_historical_positive_percentage","99"');
    expect(text).toContain('"top_complaints_format","legacy"');
    expect(text).toContain("مثال محلي لنص قديم:\nاستفسار عن مدة التوصيل.");
    expect(text).toContain('"recommendations","2"');
  });
  it("ignores a pending detail read after closing the section or changing routes", async () => {
    click("tab", "reports");
    const details = w.document.querySelector('[data-in-report="1"]');
    details.open = true;
    details.dispatchEvent(new w.Event("toggle"));
    details.open = false;
    details.dispatchEvent(new w.Event("toggle"));
    await settle();
    expect(details.querySelector("[data-in-action=export-report]")).toBeNull();
    details.open = true;
    details.dispatchEvent(new w.Event("toggle"));
    route("ab-tests");
    await settle();
    expect(w.document.querySelector(".in-report-content")).toBeNull();
  });
});
