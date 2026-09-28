import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = "prototypes/tenant-dashboard/site/",
  key = "sary-testing-preview-v1";
let dom: JSDOM, w: any, errors: Error[];
function boot(saved?: string) {
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
  w.fetch = vi.fn(() => {
    throw Error("No network in a local design preview");
  });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  if (saved) w.localStorage.setItem(key, saved);
  for (const script of [...w.document.querySelectorAll("script[src]")] as any[])
    runInContext(
      readFileSync(base + script.getAttribute("src"), "utf8"),
      dom.getInternalVMContext()
    );
}
beforeEach(() => boot());
afterEach(() => {
  expect(errors).toEqual([]);
  expect(w.fetch).not.toHaveBeenCalled();
  dom.window.close();
});
const route = (name = "test-sari") => {
  w.history.replaceState(null, "", `#/page/merchant/${name}`);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const node = (selector: string): any => {
  const n = w.document.querySelector(selector);
  expect(n, selector).toBeTruthy();
  return n;
};
const click = (action: string, extra = "") =>
  node(`[data-tp-action="${action}"]${extra}`).click();
const input = (id: string, value: string) => {
  const n = node("#tp-" + id);
  n.value = value;
  n.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const option = (name: string, value: string) => {
  const n = node(`[data-tp-option="${name}"]`);
  n.value = value;
  n.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const confirm = () => {
  const n = node("#tp-confirm");
  n.checked = true;
  n.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const submit = (type = "chat") =>
  node(`[data-tp-form="${type}"]`).dispatchEvent(
    new w.Event("submit", { bubbles: true, cancelable: true })
  );
const session = (name = "test-sari") =>
  JSON.parse(w.localStorage.getItem(key)).sessions["/merchant/" + name];
const text = () => node("#main").textContent;
const example = () => {
  input("question", "السلام عليكم");
  submit();
  click("finish");
};
const scenario = (id: string) => {
  const n = node("#tp-scenario");
  n.value = id;
  n.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const reload = () => {
  const saved = w.localStorage.getItem(key);
  dom.window.close();
  boot(saved);
  route();
};

describe("assistant testing workspace prototype", () => {
  it("clears modal validation when the native close button or Escape closes the dialog", () => {
    route();
    example();
    click("deal");
    submit("dialog");
    expect(node("#dialog").textContent).toContain("أكّد مراجعتك");
    node("#dialog").close();
    node("#dialog").dispatchEvent(new w.Event("close"));
    click("rate", "[data-value=positive]");
    expect(w.document.querySelector("#tp-input-error")).toBeNull();
    click("deal");
    expect(node("#tp-confirm").checked).toBe(false);
    expect(w.document.querySelector("#tp-deal-error")).toBeNull();
  });
  it("does not carry a prior scenario into the new empty-session confirmation", () => {
    route();
    scenario("complaint");
    confirm();
    submit("dialog");
    click("reset");
    expect(node("#dialog-title").textContent).toBe("بدء جلسة جديدة");
    expect(node("#dialog").textContent).not.toContain("شكوى وتأخر طلب");
    confirm();
    submit("dialog");
    expect(session().messages).toHaveLength(0);
    expect(session().draft).toBe("");
  });
  it("does not overwrite an edited question when retrying an older failed message", () => {
    route();
    option("fault", "failure");
    example();
    input("question", "سؤال جديد محفوظ");
    click("retry");
    expect(node("#tp-question").value).toBe("سؤال جديد محفوظ");
    expect(text()).toContain("عدّلت مسودة السؤال");
    expect(session().messages).toHaveLength(1);
    expect(session().pending).toBeNull();
  });
  it("replaces both generic pages, exposes all examples, and keeps their sessions independent", () => {
    route("sari-playground");
    expect(w.document.querySelectorAll("[data-tp-action=quick]")).toHaveLength(
      5
    );
    click("quick", '[data-index="0"]');
    expect(node("#tp-question").value).toBe("السلام عليكم");
    submit();
    expect(text()).toContain("بانتظار رد المثال");
    expect(node("#tp-question").disabled).toBe(true);
    click("finish");
    expect(session("sari-playground").messages).toHaveLength(2);
    expect(text()).toContain("ترتيب الرسائل وحده لا يثبت ذاكرة محادثة");
    route();
    expect(node("#tp-scenario").options).toHaveLength(8);
    expect(text()).toContain("لا توجد تقييمات");
    expect(w.document.querySelectorAll("[data-tp-message]")).toHaveLength(0);
    node("[data-page-action=primary]").click();
    expect(w.document.activeElement.id).toBe("tp-question");
  });
  it("validates input length inline, escapes arbitrary input, and does not invent a model response", () => {
    route();
    submit();
    expect(node("#tp-question").getAttribute("aria-invalid")).toBe("true");
    expect(w.document.activeElement.id).toBe("tp-question");
    input("question", "x".repeat(2001));
    submit();
    expect(text()).toContain("2000 حرف");
    input("question", "<img src=x onerror=alert(1)>");
    submit();
    click("finish");
    expect(text()).toContain("<img src=x onerror=alert(1)>");
    expect(w.document.querySelector("img[src=x]")).toBeNull();
    expect(text()).toContain("هذا نص خارج الأمثلة الجاهزة");
    expect(w.document.querySelector("[data-tp-action=rate]")).toBeNull();
  });
  it("preserves draft through route changes and reload; Enter composition and Shift Enter do not submit", () => {
    route();
    input("question", "سؤال محفوظ");
    for (const opts of [{ shiftKey: true }, { isComposing: true }])
      node("#tp-question").dispatchEvent(
        new w.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...opts,
        })
      );
    expect(session().messages).toHaveLength(0);
    route("sari-playground");
    route();
    expect(node("#tp-question").value).toBe("سؤال محفوظ");
    reload();
    expect(node("#tp-question").value).toBe("سؤال محفوظ");
    node("#tp-question").dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(session().messages).toHaveLength(1);
    submit();
    expect(session().messages).toHaveLength(1);
  });
  it.each(["failure", "rate"])(
    "keeps a %s reply failure recoverable without duplicating the user message",
    mode => {
      route();
      option("fault", mode);
      input("question", "السلام عليكم");
      submit();
      click("finish");
      expect(session().messages).toHaveLength(1);
      expect(node("#tp-question").value).toBe("السلام عليكم");
      option("fault", "sample");
      click("retry");
      click("finish");
      expect(session().messages.map((m: any) => m.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(session().messages[0].failed).toBeUndefined();
    }
  );
  it("locks uncertain work and reconciles it once, including restoration after reload", () => {
    route();
    option("fault", "uncertain");
    input("question", "السلام عليكم");
    submit();
    click("finish");
    expect(text()).toContain("النتيجة غير مؤكدة");
    expect(node("[data-tp-action=reset]").disabled).toBe(true);
    reload();
    click("reconcile");
    expect(session().messages).toHaveLength(2);
    expect(session().pending).toBeNull();
    expect(w.document.querySelector("[data-tp-action=reconcile]")).toBeNull();
    input("question", "شكراً لك");
    submit();
    reload();
    expect(text()).toContain("النتيجة غير مؤكدة");
    click("reconcile");
    expect(session().messages).toHaveLength(4);
  });
  it("snapshots the reply outcome before lab controls change", () => {
    route();
    option("fault", "failure");
    input("question", "السلام عليكم");
    submit();
    option("fault", "sample");
    click("finish");
    expect(session().messages[0].failed).toBe("failure");
    expect(session().messages).toHaveLength(1);
  });
  it("toggles and replaces ratings, derives the denominator from replies, and preserves a zero-rating history", () => {
    route();
    example();
    click("rate", "[data-value=positive]");
    expect(text()).toContain("100% ردود مفيدة");
    click("rate", "[data-value=negative]");
    expect(text()).toContain("0% ردود مفيدة");
    expect(session().history.at(-1)).toEqual({ rate: 0, total: 1 });
    click("rate", "[data-value=negative]");
    expect(text()).toContain("لا توجد تقييمات");
    expect(session().history.at(-1)).toEqual({ rate: null, total: 0 });
    reload();
    expect(session().history).toHaveLength(3);
    expect(text()).toContain("لا تقيس التحويل أو احتراف المبيعات");
  });
  it("reviews scenario replacement, keeps it unsent, and does not grade its fixed preamble", () => {
    route();
    example();
    click("rate", "[data-value=positive]");
    scenario("multi");
    submit("dialog");
    expect(node("#dialog").textContent).toContain("أكّد مراجعتك");
    expect(session().messages).toHaveLength(2);
    confirm();
    submit("dialog");
    expect(session().id).toBe(2);
    expect(session().messages).toHaveLength(2);
    expect(node("#tp-question").value).toBe("عندك ساعات ذكية؟");
    expect(session().pending).toBeNull();
    expect(session().history).toHaveLength(0);
    expect(w.document.querySelector("[data-tp-action=rate]")).toBeNull();
    submit();
    click("finish");
    expect(session().messages).toHaveLength(4);
    expect(w.document.querySelectorAll("[data-tp-action=rate]")).toHaveLength(
      2
    );
  });
  it("cancels resets and failed session creation without losing messages, rating, draft or start time", () => {
    route();
    example();
    input("question", "مسودة");
    const before = session();
    click("reset");
    click("close");
    expect(session()).toEqual(before);
    option("session", "failure");
    click("reset");
    confirm();
    submit("dialog");
    expect(node("#dialog").textContent).toContain("تعذرت تهيئة الجلسة البديلة");
    expect(session()).toEqual(before);
    click("close");
    option("session", "success");
    click("reset");
    expect(node("#tp-confirm").checked).toBe(false);
    confirm();
    submit("dialog");
    expect(session().messages).toHaveLength(0);
    expect(session().draft).toBe("");
    expect(session().id).toBe(2);
    expect(session().startedAt).toBeGreaterThanOrEqual(before.startedAt);
  });
  it("validates deal amounts, invalidates confirmation on edit and shows success only after local acknowledgement", () => {
    route();
    expect(node("[data-tp-action=deal]").disabled).toBe(true);
    example();
    click("deal");
    submit("dialog");
    expect(node("#tp-value").getAttribute("aria-invalid")).toBe("true");
    expect(w.document.activeElement.id).toBe("tp-value");
    for (const value of ["0", "-1", "Infinity", "12x", "1.234"]) {
      input("value", value);
      confirm();
      submit("dialog");
      expect(session().deal).toBeNull();
      expect(node("#dialog").open).toBe(true);
    }
    input("value", "149.50");
    confirm();
    input("value", "150");
    expect(node("#tp-confirm").checked).toBe(false);
    confirm();
    submit("dialog");
    expect(session().deal).toBeNull();
    expect(text()).toContain("بانتظار تأكيد حفظ الصفقة");
    click("finish");
    expect(session().deal).toMatchObject({ value: "150.00", messageCount: 2 });
    expect(node("[data-tp-action=deal]").disabled).toBe(true);
    reload();
    expect(text()).toContain("150.00 ر.س");
  });
  it("recovers a failed deal save with its value intact and reconciles an uncertain result only once", () => {
    route();
    example();
    option("save", "failure");
    click("deal");
    input("value", "250");
    confirm();
    submit("dialog");
    click("finish");
    expect(session().deal).toBeNull();
    expect(text()).toContain("تعذر حفظ الصفقة");
    option("save", "uncertain");
    click("deal");
    expect(node("#tp-value").value).toBe("250");
    expect(node("#tp-confirm").checked).toBe(false);
    confirm();
    submit("dialog");
    click("finish");
    reload();
    click("reconcile");
    expect(session().deal.value).toBe("250.00");
    expect(session().pending).toBeNull();
  });
  it("keeps read failures distinct from empty data and blocks viewer mutations", () => {
    route();
    example();
    const before = session();
    option("read", "error");
    expect(text()).toContain("تعذرت قراءة الجلسة");
    expect(w.document.querySelector("[data-tp-message]")).toBeNull();
    expect(w.document.querySelector(".tp-counts")).toBeNull();
    click("read-ready");
    expect(session()).toEqual(before);
    option("role", "viewer");
    expect(node("#tp-question").disabled).toBe(true);
    expect(node("[data-tp-action=reset]").disabled).toBe(true);
    expect(node("[data-tp-action=rate]").disabled).toBe(true);
    submit();
    expect(session()).toEqual(before);
  });
  it("closes a scenario on route navigation and prevents stale modal mutations", () => {
    route();
    scenario("price");
    confirm();
    route("sari-playground");
    expect(node("#dialog").open).toBe(false);
    const before = w.localStorage.getItem(key);
    submit("dialog");
    expect(w.localStorage.getItem(key)).toBe(before);
  });
  it("reports unavailable storage instead of promising persistence", () => {
    route();
    vi.spyOn(w.Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    input("question", "السلام عليكم");
    submit();
    expect(text()).toContain("تعذر التخزين المحلي");
    click("finish");
    expect(text()).toContain("وعليكم السلام");
    vi.restoreAllMocks();
  });
});
