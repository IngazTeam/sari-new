import { readFileSync, existsSync } from "node:fs";
import { runInContext } from "node:vm";
import { MessageChannel } from "node:worker_threads";
import { TextDecoder, TextEncoder } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MessagesPreviewModel,
  messagesModes,
} from "../prototypes/tenant-dashboard/src/messages-preview-model";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { Workbook } from "exceljs";
let downloads: string[] = [];
const base = "prototypes/tenant-dashboard/site/";
let dom: JSDOM | undefined,
  w: any,
  errors: unknown[] = [];
afterEach(() => {
  dom?.window.close();
  dom = undefined;
  vi.useRealTimers();
});
async function mount(search = "lang=en") {
  errors = [];
  downloads = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "messages-analytics.html", "utf8"), {
    url: "http://127.0.0.1:4329/messages-analytics.html?" + search,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  w = dom.window;
  w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  w.URL.createObjectURL = vi.fn(() => "blob:message-example");
  w.URL.revokeObjectURL = vi.fn();
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push(this.download);
  };
  w.fetch = () => {
    throw Error("Network is forbidden in this preview");
  };
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.structuredClone = structuredClone;
  w.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      this.port1.unref();
      this.port2.unref();
    }
  };
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  runInContext(
    readFileSync(base + "messages-preview.js", "utf8"),
    dom.getInternalVMContext()
  );
  await vi.waitFor(() =>
    expect(w.document.querySelector("aside")).toBeTruthy()
  );
}
const content = () => w.document.body.textContent;
const button = (label: string) =>
  Array.from(w.document.querySelectorAll("button")).find(
    (b: any) => b.textContent === label
  ) as any;
async function select(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
}
describe("actual message preview model", () => {
  it.each(messagesModes)("provides isolated %s states without writes", mode => {
    for (const id of [208, 209]) {
      const model = new MessagesPreviewModel(id, mode);
      expect(model.read("merchant").data.id).toBe(id);
      expect(model.read("messages", { period: "30d" }).data.merchantId).toBe(
        mode === "foreign" ? 999 : id
      );
      expect(model.retries).toBe(0);
    }
  });
  it.each(["7d", "30d", "90d"] as const)(
    "keeps all %s dates and sums and stable snapshot identity",
    period => {
      const model = new MessagesPreviewModel(),
        data = model.fixture(period);
      expect(model.fixture(period)).toBe(data);
      expect(data.daily).toHaveLength(Number(period.slice(0, -1)));
      expect(data.hourly).toHaveLength(24);
      expect(data.daily.reduce((n, r) => n + r.count, 0)).toBe(
        data.messages.total
      );
      expect(data.hourly.reduce((n, r) => n + r.count, 0)).toBe(
        data.messages.total
      );
      expect(data.sentiment.classified + data.sentiment.unclassified).toBe(
        data.messages.incoming
      );
      expect(data.orderAssociation.salesProficiency).toBeNull();
    }
  );
  it("recovers a mismatched snapshot and rejects unsupported requests", async () => {
    const m = new MessagesPreviewModel(208, "foreign");
    expect(m.read("messages", { period: "7d" }).data.merchantId).toBe(999);
    await m.refetch("messages", { period: "7d" });
    expect(m.read("messages", { period: "7d" }).data.merchantId).toBe(208);
    expect(() => m.read("delete" as any)).toThrow();
    expect(() => m.read("messages", { period: "1y" } as any)).toThrow();
  });
  it("releases delayed preparation only when requested", async () => {
    const m = new MessagesPreviewModel(208, "export-delay");
    let done = false;
    const p = m.prepareExport().then(() => (done = true));
    expect(m.pendingExports).toBe(1);
    expect(done).toBe(false);
    m.finishExports();
    await p;
    expect(done).toBe(true);
    expect(m.pendingExports).toBe(0);
  });
});
describe("compiled actual message screen", () => {
  it.each(["ar", "en"])(
    "renders all sections and URL filters in %s",
    async lang => {
      await mount("lang=" + lang + "&range=90d");
      const copy = lang === "ar" ? ar : en;
      await vi.waitFor(() =>
        expect(w.document.querySelectorAll("h1")).toHaveLength(1)
      );
      expect(w.document.querySelectorAll("tbody tr")).toHaveLength(114);
      for (const id of ["sentiment", "products", "messages"]) {
        const el = w.document.querySelector(
          '[role=tab][id$="trigger-' + id + '"]'
        );
        el.dispatchEvent(
          new w.MouseEvent("mousedown", { bubbles: true, button: 0 })
        );
        await vi.waitFor(() =>
          expect(el.getAttribute("data-state")).toBe("active")
        );
        expect(w.location.search).toContain("range=90d");
        expect(w.location.search).toContain("tab=" + id);
      }
      expect(content()).not.toMatch(/messageWorkspace\./);
      expect(content()).toContain(copy.messageWorkspace.windowNote);
      expect(errors).toEqual([]);
    }
  );
  it.each([
    "failure",
    "offline",
    "store-failure",
    "forbidden",
    "foreign",
    "stale",
  ])("recovers %s without showing cached values", async scenario => {
    await mount("lang=en&scenario=" + scenario);
    await vi.waitFor(() =>
      expect(
        w.document.querySelector(
          '[data-state="error"],[data-state="forbidden"]'
        )
      ).toBeTruthy()
    );
    expect(content()).not.toContain("99,999");
    expect(button(en.messageWorkspace.export)).toBeUndefined();
    w.document.querySelector(".mw-state-actions button").click();
    await vi.waitFor(() =>
      expect(button(en.messageWorkspace.export)).toBeTruthy()
    );
    expect(content()).not.toContain("99,999");
    expect(errors).toEqual([]);
  });
  it("finishes loading explicitly and keeps a real empty snapshot exportable", async () => {
    await mount("lang=en&scenario=loading");
    button("Finish simulated loading").click();
    await vi.waitFor(() =>
      expect(button(en.messageWorkspace.export)).toBeTruthy()
    );
    await select("aside select", "empty");
    expect(content()).toContain(en.messageWorkspace.empty);
    expect(content()).toContain(en.messageWorkspace.unavailable);
    expect(button(en.messageWorkspace.export)).toBeTruthy();
  });
  it("simulates restoring a session without navigating to a real login", async () => {
    await mount("lang=en&scenario=session");
    const link = w.document.querySelector('a[href="/login"]');
    link.dispatchEvent(
      new w.MouseEvent("click", { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() =>
      expect(button(en.messageWorkspace.export)).toBeTruthy()
    );
    expect(w.location.pathname).toBe("/messages-analytics.html");
  });
  it.each(["csv", "xlsx", "pdf"])(
    "exports a local %s from all sections with an explicit sample label",
    async format => {
      await mount("lang=en&range=90d");
      const formats = w.document.querySelectorAll("select");
      formats[formats.length - 1].value = format;
      formats[formats.length - 1].dispatchEvent(
        new w.Event("change", { bubbles: true })
      );
      await vi.waitFor(() =>
        expect(formats[formats.length - 1].value).toBe(format)
      );
      button(en.messageWorkspace.export).click();
      await vi.waitFor(
        () => expect(downloads).toEqual(["sary-messages-208-90d." + format]),
        { timeout: 4000 }
      );
      expect(w.URL.createObjectURL).toHaveBeenCalledOnce();
      const bytes = await new Promise<ArrayBuffer>((resolve,reject)=>{
        const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;
        reader.readAsArrayBuffer(w.URL.createObjectURL.mock.calls[0][0]);
      });
      if(format==='csv'){
        const csv=new TextDecoder().decode(bytes);
        expect(csv).toContain('Local sample, not actual store results');
        expect(csv).toContain(en.messageWorkspace.salesProficiency);
        expect(csv).toContain(en.messageWorkspace.unmeasured);
      }else if(format==='xlsx'){
        const book=new Workbook();await book.xlsx.load(Buffer.from(bytes));
        expect(book.worksheets).toHaveLength(9);
        expect(book.worksheets[0].getCell('B2').value).toBe('Local sample, not actual store results');
      }else expect(new TextDecoder().decode(bytes).slice(0,5)).toBe('%PDF-');
      expect(errors).toEqual([]);
    }
  );
  it.each(["language", "period", "tenant"])(
    "discards pending exports after changing %s",
    async key => {
      await mount("lang=en&scenario=export-delay");
      const formats = w.document.querySelectorAll("select");
      formats[formats.length - 1].value = "csv";
      formats[formats.length - 1].dispatchEvent(
        new w.Event("change", { bubbles: true })
      );
      button(en.messageWorkspace.export).click();
      await vi.waitFor(() =>
        expect(button("Complete pending file")).toBeTruthy()
      );
      if (key === "language")
        await select("aside label:nth-of-type(2) select", "ar");
      if (key === "period") await select(".mw-main>div header select", "7d");
      if (key === "tenant")
        await select("aside label:nth-of-type(3) select", "209");
      const finish = button(
        key === "language" ? "أكمل تجهيز الملف المعلق" : "Complete pending file"
      );
      if (finish) finish.click();
      await vi.waitFor(() =>
        expect(
          button("Complete pending file") || button("أكمل تجهيز الملف المعلق")
        ).toBeUndefined()
      );
      expect(downloads).toEqual([]);
      expect(errors).toEqual([]);
    }
  );
  it("reports export preparation failure without creating a file", async () => {
    await mount("lang=en&scenario=export-failure");
    button(en.messageWorkspace.export).click();
    await vi.waitFor(() =>
      expect(content()).toContain(en.messageWorkspace.exportFailed)
    );
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
  });
  it("removes the independent old renderer and exporter", () => {
    for (const name of [
      "message-analytics.js",
      "message-analytics.css",
      "message-export.js",
    ])
      expect(existsSync(base + name)).toBe(false);
    expect(readFileSync(base + "pages.js", "utf8")).not.toContain(
      "MessagePreview"
    );
    expect(readFileSync(base + "index.html", "utf8")).not.toMatch(
      /message-analytics\.(js|css)/
    );
  });
});
