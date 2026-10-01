import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ar from "../client/src/locales/ar.json";

let dom: JSDOM, w: any, errors: Error[], files: any[], requests: string[];
const base = "prototypes/tenant-dashboard/site/";
const route = (name = "sales-pipeline") => {
  w.history.replaceState(null, "", "#/page/merchant/" + name);
  w.dispatchEvent(new w.HashChangeEvent("hashchange"));
};
const change = (id: string, value: string) => {
  const el = w.document.getElementById("plp-" + id);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
};
const click = (action: string) =>
  w.document.querySelector(`[data-pipeline-queue="${action}"]`).click();
beforeEach(() => {
  errors = [];
  files = [];
  requests = [];
  const console = new VirtualConsole();
  console.on("jsdomError", e => errors.push(e));
  dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
    url: "http://127.0.0.1:4329/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  w = dom.window;
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      this.port1.unref();
      this.port2.unref();
    }
  };
  w.structuredClone = structuredClone;
  w.scrollTo = () => {};
  w.fetch = (url: string) => {
    requests.push(url);
    throw Error("Prototype must stay local");
  };
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  w.URL.createObjectURL = (blob: any) => {
    files.push({ blob });
    return "blob:preview";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    expect(this.isConnected).toBe(true);
    files.at(-1).filename = this.download;
  };
  for (const name of [
    "features.js",
    "page-catalog.js",
    "brain.js",
    "brain-workbench.js",
    "notifications.js",
    "pipeline-preview.js",
    "pages.js",
    "app.js",
  ])
    runInContext(readFileSync(base + name, "utf8"), dom.getInternalVMContext());
  route();
});
afterEach(() => {
  expect(errors.map(error => String((error as any).cause ?? error))).toEqual(
    []
  );
  expect(requests).toEqual([]);
  dom.window.close();
});

describe("pipeline prototype parity", () => {
  it("opens the linked demo contact and safely preserves phone query encoding", () => {
    route("conversations?phone=%2B966500000000&name=ignored");
    expect(w.document.querySelector(".conversation-search input").value).toBe(
      "+966500000000"
    );
    expect(w.document.querySelectorAll(".conversation-item")).toHaveLength(1);
    expect(
      w.document.querySelector(".conversation-item").textContent
    ).toContain("أحتاج تفاصيل المنتج");
    expect(w.document.querySelector(".page-recovery")).toBeNull();
    route("conversations?phone=%3Cimg%20src%3Dx%3E");
    expect(w.document.querySelector(".conversation-search input").value).toBe(
      "<img src=x>"
    );
    expect(w.document.querySelectorAll(".conversation-item")).toHaveLength(0);
    expect(w.document.querySelector(".conversation-search img")).toBeNull();
  });
  it("shares the actual work list, stages, collapsed evidence and synthetic source", () => {
    expect(w.document.querySelectorAll(".pl-actions button")).toHaveLength(4);
    expect(w.document.querySelectorAll("optgroup option")).toHaveLength(10);
    expect(w.document.querySelectorAll("[data-pipeline-item]")).toHaveLength(2);
    expect(w.document.querySelector(".pl-analysis").open).toBe(false);
    expect(w.document.querySelector(".page-local-note").textContent).toContain(
      "بيانات مصطنعة"
    );
    expect(w.document.body.textContent).toContain(
      ar.pipelineWorkspace.limitsNote
    );
    expect(
      w.document.querySelector('a[href="#/page/merchant/sales-hub"]')
    ).not.toBeNull();
  });
  it.each([
    ["ready", 2],
    ["needs-human", 1],
    ["pending", 20],
    ["stalled", 0],
    ["paid", 1],
    ["lost", 1],
    ["all", 20],
  ])("shows the matching %s queue", (queue, count) => {
    const el = w.document.getElementById("pl-queue");
    el.value = queue;
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
    expect(w.PipelinePreview.snapshot().selection).toEqual({
      queue,
      page: 1,
      pageSize: 20,
    });
    expect(w.document.querySelectorAll("[data-pipeline-item]")).toHaveLength(
      count
    );
  });
  it("paginates all pending records and resets the page on stage change", () => {
    click("pending");
    expect(w.PipelinePreview.snapshot().list.total).toBe(23);
    w.document.querySelector('[data-pipeline-page="2"]').click();
    expect(w.document.querySelectorAll("[data-pipeline-item]")).toHaveLength(3);
    expect(w.document.querySelector('[data-pipeline-page="3"]').disabled).toBe(
      true
    );
    const el = w.document.getElementById("pl-queue");
    el.value = "stage:purchased";
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
    expect(w.PipelinePreview.snapshot().selection).toEqual({
      queue: "stage",
      stage: "purchased",
      page: 1,
      pageSize: 20,
    });
    expect(w.document.body.textContent).toContain(ar.pipelineWorkspace.empty);
    click("all");
    expect(w.PipelinePreview.snapshot().selection.stage).toBeUndefined();
  });
  it.each(["error", "offline", "forbidden", "loading"])(
    "hides previous results in %s",
    mode => {
      change("mode", mode);
      expect(w.document.querySelector(".pl-report")).toBeNull();
      expect(w.document.querySelector("[data-pipeline-item]")).toBeNull();
    }
  );
  it("does not turn an empty outcome sample into conversion", () => {
    change("mode", "empty");
    const d = w.PipelinePreview.snapshot();
    expect(d.total).toBe(0);
    expect(d.outcomes.paidStageShare).toBeNull();
    expect(d.list.items).toEqual([]);
    expect(Object.values(d.queues).every(v => v === 0)).toBe(true);
    expect(w.document.body.textContent).toContain(
      ar.pipelineWorkspace.noSample
    );
  });
  it("recovers explicitly after failure without network requests", async () => {
    change("mode", "error");
    w.document.querySelector("[data-plp-recover]").click();
    expect(w.document.querySelector("[aria-busy=true]")).not.toBeNull();
    await new Promise(r => setTimeout(r, 220));
    expect(w.document.querySelector(".pl-report")).not.toBeNull();
  });
  it("does not announce success on a failed refresh", async () => {
    change("mode", "error");
    await w.PipelinePreview.primary();
    expect(w.document.getElementById("toast").textContent).toBe(
      ar.pipelineWorkspace.refreshFailed
    );
  });
  it("discards stale refresh completion after mode or route changes", async () => {
    const first = w.PipelinePreview.primary();
    change("mode", "empty");
    await first;
    expect(w.document.getElementById("toast").textContent).not.toContain(
      "تم تحديث المثال المحلي"
    );
    const second = w.PipelinePreview.primary();
    route("dashboard");
    await second;
    route();
    expect(w.PipelinePreview.canPrimary()).toBe(true);
    expect(w.PipelinePreview.snapshot().total).toBe(0);
  });
});
