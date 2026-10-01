import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigableMerchantTools } from "../client/src/components/merchant/navigation";
let dom: JSDOM, w: any, errors: Error[];
const base = "prototypes/tenant-dashboard/site/";
const route = (suffix = "") => {
  w.history.replaceState(null, "", "#/page/merchant/tools" + suffix);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const input = (value: string) => {
  const el = w.document.querySelector(".tools-prototype input");
  el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
};
const select = (selector: string, value: string) => {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const text = () => w.document.querySelector(".tools-prototype").textContent;
beforeEach(() => {
  errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/#/page/merchant/tools",
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
    throw Error("No provider calls in the directory");
  });
  for (const script of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "notifications.js",
    "tools-preview.js",
    "pages.js",
    "app.js",
  ])
    runInContext(
      readFileSync(base + script, "utf8"),
      dom.getInternalVMContext()
    );
});
afterEach(() => {
  expect(errors).toEqual([]);
  expect(w.fetch).not.toHaveBeenCalled();
  dom.window.close();
});
describe("built interactive tool directory", () => {
  it("replaces the old directory with exactly the real navigable catalog and one heading", () => {
    const links = [
      ...w.document.querySelectorAll(".tools-prototype nav a"),
    ].map((a: any) => a.getAttribute("href"));
    expect(links).toEqual(navigableMerchantTools.map(t => "#/page" + t.path));
    expect(w.document.querySelectorAll("#main h1")).toHaveLength(1);
    expect(
      w.document.querySelectorAll("#main [data-page-action=primary]")
    ).toHaveLength(0);
  });
  it("retains typed search and focus after rendering, then restores a shared URL", () => {
    input("WHATSAPP numbers");
    expect(w.document.querySelectorAll(".tools-prototype nav a")).toHaveLength(
      1
    );
    expect(w.document.activeElement).toBe(
      w.document.querySelector(".tools-prototype input")
    );
    const url = w.location.hash;
    w.render();
    expect(w.location.hash).toBe(url);
    expect(w.document.querySelector(".tools-prototype input").value).toBe(
      "WHATSAPP numbers"
    );
    expect(text()).toContain("عرض 1 من 93");
  });
  it("keeps the selected language and section in the URL across rerenders", () => {
    select("#tools-preview-language", "en");
    select(".tools-prototype .mw-tools-section select", "ai");
    expect(w.document.querySelector(".tools-prototype").dir).toBe("ltr");
    expect(w.document.querySelector("#main h1").textContent).toBe("All tools");
    expect(text()).toContain("Assistant personas");
    expect(text()).not.toContain("merchantNavigationUx");
    expect(w.location.hash).toContain("section=ai");
    expect(w.location.hash).toContain("lang=en");
    w.render();
    expect(w.document.querySelector("#tools-preview-language").value).toBe(
      "en"
    );
    expect(w.document.querySelector(".mw-tools-section select").value).toBe(
      "ai"
    );
  });
  it("handles an unknown section, safely escapes text and recovers from no matches", () => {
    route("?section=unknown&q=%3Cscript%3E");
    expect(text()).toContain("القسم الموجود في الرابط غير معروف");
    expect(w.document.querySelectorAll(".tools-prototype script")).toHaveLength(
      0
    );
    expect(text()).toContain("لا توجد أدوات مطابقة");
    w.document.querySelector(".mw-tools-empty button").click();
    expect(w.document.querySelectorAll(".tools-prototype nav a")).toHaveLength(
      navigableMerchantTools.length
    );
    expect(w.location.hash).toBe("#/page/merchant/tools");
  });
  it("leaves an input method composition intact until its text is committed", () => {
    const el = w.document.querySelector(".tools-prototype input");
    el.dispatchEvent(
      new w.CompositionEvent("compositionstart", { bubbles: true })
    );
    el.value = "مُسَاعِد";
    el.dispatchEvent(
      new w.InputEvent("input", { bubbles: true, isComposing: true })
    );
    expect(w.document.querySelector(".tools-prototype input")).toBe(el);
    el.dispatchEvent(
      new w.CompositionEvent("compositionend", { bubbles: true })
    );
    expect(w.document.querySelectorAll(".tools-prototype nav a")).toHaveLength(
      9
    );
    expect(w.document.querySelector(".tools-prototype input").value).toBe(
      "مُسَاعِد"
    );
  });
});
