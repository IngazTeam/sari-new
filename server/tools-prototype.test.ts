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
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
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

describe('prototype shared tool discovery',()=>{
  const dialog=()=>w.document.querySelector('#dialog');
  const open=()=>{const button=w.document.querySelector('[data-action=search]');button.focus();button.click();};
  const searchInput=()=>w.document.querySelector('#global-search');
  const links=()=>[...w.document.querySelectorAll('#search-results a')];
  const type=(value:string)=>{searchInput().value=value;searchInput().dispatchEvent(new w.Event('input',{bubbles:true}));};
  const key=(element:any,key:string,extra={})=>element.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
  it('shows all real navigable tools instead of truncating at 15 or offering parameter placeholders',()=>{
    open();expect(links().map((a:any)=>a.getAttribute('href'))).toEqual(navigableMerchantTools.map(t=>'#/page'+t.path));
    expect(w.document.querySelector('#global-search-count').textContent).toContain('93 من 93');
    expect(dialog().querySelectorAll('[data-action=feature]')).toHaveLength(0);
    expect(w.document.querySelectorAll('#sidebar a[aria-current=page]')).toHaveLength(1);
    expect(w.document.querySelector('#sidebar a[aria-current=page]').getAttribute('href')).toBe('#/page/merchant/tools');
  });
  it('matches multilingual names and clears empty results without replacing the focused input',()=>{
    open();const el=searchInput();type('assistant language');expect(links()).toHaveLength(1);expect(links()[0].getAttribute('href')).toBe('#/page/merchant/language-settings');
    type('مُسَاعِد');expect(links()).toHaveLength(9);
    type('<img src=x>');expect(links()).toHaveLength(0);expect(dialog().querySelector('img')).toBeNull();
    dialog().querySelector('[data-action=clear-global-search]').click();expect(searchInput()).toBe(el);expect(w.document.activeElement).toBe(el);expect(links()).toHaveLength(93);
  });
  it('uses the same English labels when the directory language is English and resets dialog direction for other actions',()=>{
    route('?lang=en');open();expect(dialog().dir).toBe('ltr');expect(dialog().querySelector('h2').textContent).toBe('Where would you like to go?');
    expect(links()[0].textContent).toContain('Initial setup');expect(dialog().querySelector('[data-action=close]').getAttribute('aria-label')).toBe('Close');
    dialog().close();w.openDialog('عنوان','<p>تجربة</p>');expect(dialog().hasAttribute('dir')).toBe(false);expect(dialog().hasAttribute('data-tool-search')).toBe(false);
  });
  it('supports arrows, Home/End, composition and shortcut toggling without triggering navigation',()=>{
    open();searchInput().focus();key(searchInput(),'ArrowDown',{isComposing:true});expect(w.document.activeElement).toBe(searchInput());
    key(searchInput(),'ArrowDown');expect(w.document.activeElement).toBe(links()[0]);key(links()[0],'End');expect(w.document.activeElement).toBe(links().at(-1));
    key(links().at(-1),'Home');key(links()[0],'ArrowUp');expect(w.document.activeElement).toBe(searchInput());
    searchInput().dispatchEvent(new w.CompositionEvent('compositionstart',{bubbles:true}));type('مُسَاعِد');expect(links()).toHaveLength(93);
    const cancel=new w.Event('cancel',{cancelable:true});dialog().dispatchEvent(cancel);expect(cancel.defaultPrevented).toBe(true);
    searchInput().dispatchEvent(new w.CompositionEvent('compositionend',{bubbles:true}));expect(links()).toHaveLength(9);
    key(searchInput(),'k',{ctrlKey:true});expect(dialog().open).toBe(false);expect(w.document.activeElement).toBe(w.document.querySelector('[data-action=search]'));
    open();type('assistant');key(searchInput(),'Escape');expect(dialog().open).toBe(false);expect(w.document.activeElement).toBe(w.document.querySelector('[data-action=search]'));
  });
  it('opens a real local page from its result and restores the prior directory through history',async()=>{
    route('?section=ai');open();type('assistant language');links()[0].click();
    await vi.waitFor(()=>expect(w.location.hash).toBe('#/page/merchant/language-settings'));await vi.waitFor(()=>expect(dialog().open).toBe(false));
    expect(w.document.querySelector('#main iframe').getAttribute('src')).toContain('assistant-options.html');
    w.history.back();await vi.waitFor(()=>expect(w.location.hash).toBe('#/page/merchant/tools?section=ai'));
    await vi.waitFor(()=>expect(w.document.querySelector('.mw-tools-section select')?.value).toBe('ai'));
  });
  it('redirects legacy tool filters to the new directory and returns mobile menu focus to its opener',()=>{
    w.history.replaceState(null,'','#/tools/ai');w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    expect(w.location.hash).toBe('#/page/merchant/tools?section=ai');expect(w.document.querySelector('.mw-tools-section select').value).toBe('ai');
    const more=w.document.querySelector('#bottom-nav [data-action=menu]');more.focus();more.click();
    w.document.querySelector('[data-action=nav-close]').click();expect(w.document.activeElement).toBe(more);
  });
});
