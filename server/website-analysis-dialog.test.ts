// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/en.json";
import {
  WebsiteAnalysisDialog,
  readWebsiteAnalysisResult,
  type WebsiteAnalysisDialogProps,
} from "../client/src/components/WebsiteAnalysisDialog";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", dir: () => "ltr" },
    t: (key: string, args: any) => {
      let text = (en.websiteAnalysisUx as any)[key.split(".").at(-1)!] || key;
      for (const [k, v] of Object.entries(args || {}))
        text = text.replace(`{{${k}}}`, String(v));
      return text;
    },
  }),
}));
let root: Root, container: HTMLDivElement, props: WebsiteAnalysisDialogProps;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  props = {
    open: true,
    onOpenChange: vi.fn(),
    result: null,
    issue: null,
    pending: false,
    currentStep: "scraping",
    progress: 20,
    statusError: false,
    statusFetching: false,
    onReadStatus: vi.fn(),
    onOpenDestination: vi.fn(),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(React.createElement(WebsiteAnalysisDialog, props))
  );
const c = en.websiteAnalysisUx;
const text = () => document.querySelector('[role="dialog"]')!.textContent!;
const click = async (label: string) =>
  act(async () => {
    (
      [...document.querySelectorAll("button")].find(
        b => b.textContent === label
      ) as HTMLButtonElement
    ).click();
  });
it("shows only the reported worker stage and progress, with a close action while requesting", async () => {
  props.pending = true;
  await render();
  expect(text()).toContain(c.requesting);
  expect(
    document
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow")
  ).toBe("20");
  await click(c.background);
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});
it("suppresses stale progress on read error and retries only the status", async () => {
  props.statusError = true;
  await render();
  expect(text()).toContain(c.statusError);
  expect(document.querySelector('[role="progressbar"]')).toBeNull();
  await click(c.checkStatus);
  expect(props.onReadStatus).toHaveBeenCalledOnce();
  expect(props.onOpenDestination).not.toHaveBeenCalled();
});
it.each(["startUnconfirmed", "unverified", "failed", "missing"] as const)(
  "describes %s without exposing provider errors or claiming rollback",
  async issue => {
    props.issue = issue;
    await render();
    expect(text()).toContain(c[issue]);
    expect(text()).toContain(c.reviewBeforeRetry);
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  }
);
it("allows checking a possibly accepted start request without submitting another", async () => {
  props.issue = "startUnconfirmed";
  await render();
  await click(c.checkStatus);
  expect(props.onReadStatus).toHaveBeenCalledOnce();
});
it("shows partial knowledge as incomplete, preserves zero, and separates site score from sales", async () => {
  props.result = {
    title: "Store <img src=x onerror=alert(1)>",
    score: 0,
    crawlStats: { pagesDiscovered: 5, pagesCrawled: 3, pagesSuccess: 2 },
    knowledgeEvolution: { added: 0, evolved: 1, conflicts: 2 },
    knowledgeError: "provider-secret-raw-error",
    salesIntelSummary: {
      totalSections: 7,
      hasIntel: false,
      hasOpportunities: true,
    },
  };
  await render();
  expect(text()).toContain(c.knowledgeIncomplete);
  expect(text()).toContain(c.scoreHelp);
  expect(text()).toContain(c.snapshotHelp);
  expect(text()).toContain(c.indexHelp);
  expect(text()).not.toContain("provider-secret");
  expect(text()).toContain("Store <img");
  expect(document.querySelector("img")).toBeNull();
  expect(text()).toContain("0 / 100");
  expect(text()).toContain(c.absent);
  expect(text()).toContain(c.present);
});
it("keeps all missing result metrics unknown instead of inventing zeros", async () => {
  props.result = {};
  await render();
  expect(document.querySelectorAll("dd")).toHaveLength(13);
  for (const cell of document.querySelectorAll("dd"))
    expect(cell.textContent).toBe("—");
  expect(text()).not.toContain("/ 100");
});
it.each([
  [c.openPages, "pages"],
  [c.openSections, "sections"],
  [c.openConflicts, "conflicts"],
  [c.openTesting, "testing"],
])("opens %s and closes the report", async (label, destination) => {
  props.result = {};
  await render();
  await click(label);
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
  expect(props.onOpenDestination).toHaveBeenCalledWith(destination);
});
it("does not display invalid progress as a measured percentage", async () => {
  props.progress = Infinity;
  await render();
  expect(
    document
      .querySelector('[role="progressbar"]')
      ?.hasAttribute("aria-valuenow")
  ).toBe(false);
  expect(text()).toContain(c.waiting);
});
it("rejects malformed and negative metrics without coercion", () => {
  const result = readWebsiteAnalysisResult({
    score: 101,
    crawlStats: {
      pagesDiscovered: "12",
      pagesCrawled: -1,
      pagesSuccess: 1.5,
      totalWords: Infinity,
    },
    knowledgeEvolution: { added: NaN },
    salesIntelSummary: { totalSections: "9", hasIntel: 1 },
  });
  for (const key of [
    "score",
    "discovered",
    "attempted",
    "read",
    "totalWords",
    "added",
    "sections",
    "intel",
  ] as const)
    expect(result[key]).toBeNull();
});

it.each([['returned',0,'indexingReturned'],['returned',4,'indexingReturned'],['failed',null,'indexingFailed'],['not_attempted',null,'indexingNotAttempted'],['invalid',5,'indexingUnknown'],['returned',-1,'indexingUnknown'],['returned','5','indexingUnknown']])('describes indexing %s/%s without claiming coverage',async(status,indexedSections,key)=>{
 props.result={indexingOutcome:{status,indexedSections},knowledgeEvolution:{added:2,merged:3,evolved:1,conflicts:0,unchanged:4}};await render();
 expect(text()).toContain((c as any)[key].replace('{{value}}',String(indexedSections)));expect(text()).toContain(c.merged);expect(text()).toContain(c.unchanged);expect(text()).toContain(c.indexHelp);
 const details=document.querySelector('details');expect(details?.open).toBe(false);expect(details?.textContent).toContain(c.snapshotTitle);expect(details?.textContent).toContain(c.snapshotHelp);
});
it.each([{pagesDiscovered:1,pagesCrawled:2,pagesSuccess:1},{pagesDiscovered:3,pagesCrawled:1,pagesSuccess:2},{pagesDiscovered:1,pagesSuccess:2}])('hides contradictory page counts %j',async crawlStats=>{props.result={crawlStats};await render();expect(text()).toContain(c.inconsistentCrawl);const r=readWebsiteAnalysisResult(props.result);expect([r.discovered,r.attempted,r.read]).toEqual([null,null,null]);});
it('does not label legacy reports as indexed and hides contradictory word counts',()=>{const r=readWebsiteAnalysisResult({crawlStats:{mainPageWords:10,totalWords:2}});expect(r).toMatchObject({indexing:'unknown',indexedSections:null,mainWords:null,totalWords:null,inconsistentCrawl:true});});
