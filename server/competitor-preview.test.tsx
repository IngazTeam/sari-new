// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import {
  competitorSelection,
  competitorWorkspaceResult,
  competitorDetailResult,
} from "../shared/competitor-workspace";
import {
  scopedCompetitors,
  scopedCompetitorDetail,
} from "../client/src/lib/competitor-workspace";
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: state.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ||
      key,
  }),
}));
import CompetitorAnalysis from "../client/src/pages/CompetitorAnalysis";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  serviceModes,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.language = "en";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  model = new ServicePreviewModel(269);
  history.replaceState(null, "", "/?path=/merchant/competitor-analysis");
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        <CompetitorAnalysis />
      </ServicePreviewContext.Provider>
    )
  );
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
    b.textContent?.trim().startsWith(text)
  )!;
const click = (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });
const list = (input = {}, instance = model) =>
  competitorWorkspaceResult.parse(
    instance.read("websiteAnalysis.competitorWorkspace", input).data
  );
const detail = (id = 32, productPage = 1, instance = model) =>
  competitorDetailResult.parse(
    instance.read("websiteAnalysis.competitorDetail", { id, productPage }).data
  );
it.each(["ar", "en"])(
  "renders the actual page, complete report and reviewed deletion in %s",
  async language => {
    state.language = language;
    const c = (language === "ar" ? ar : en).competitorWorkspaceUx;
    await render();
    expect(host.querySelectorAll(".cmp-card")).toHaveLength(25);
    await click(c.details);
    expect(document.body.textContent).toContain("Saved strength 6");
    expect(document.body.textContent).toContain("USD");
    expect(document.body.textContent).toContain(c.evidence);
    expect(button(c.confirmDelete).disabled).toBe(true);
    await act(async () =>
      (document.querySelector(".cmp-check input") as HTMLInputElement).click()
    );
    await click(c.confirmDelete);
    expect(model.operations).toBe(1);
    expect(list().stats.total).toBe(31);
    expect(host.textContent).toContain(c.removed);
  }
);
it.each(serviceModes)(
  "renders %s safely without unintentional writes",
  async mode => {
    model = new ServicePreviewModel(269, mode);
    await render();
    expect(host.querySelectorAll(".cmp-card").length > 0).toBe(
      ![
        "empty",
        "loading",
        "failure",
        "forbidden",
        "session",
        "foreign",
        "stale-error",
      ].includes(mode)
    );
    expect(model.operations).toBe(0);
  }
);
it.each([269, 270])(
  "covers complete reports and currency-separated products for tenant %s",
  id => {
    const other = new ServicePreviewModel(id);
    try {
      const a = list({}, other),
        b = list({ page: 2 }, other);
      expect(new Set([...a.rows, ...b.rows].map(r => r.id)).size).toBe(32);
      expect(list({ query: "%" }, other).rows.map(r => r.id)).toEqual([1]);
      expect(list({ state: "failed" }, other).stats).toEqual(a.stats);
      expect(list({ sort: "oldest" }, other).rows[0].id).toBe(1);
      const d = detail(32, 1, other),
        e = detail(32, 2, other);
      expect(d.products).toHaveLength(25);
      expect(e.products).toHaveLength(3);
      expect(d.pricing).toMatchObject({
        pricedCount: 25,
        unverifiedCount: 3,
        groups: [
          { currency: "SAR", count: 13 },
          { currency: "USD", count: 12 },
        ],
      });
      expect(d.report.salesProficiency).toBeNull();
      expect(d.notes.strengths.items).toHaveLength(6);
      expect(
        scopedCompetitors(a, id + 1000, id, competitorSelection.parse({}))
      ).toEqual(a);
      expect(scopedCompetitorDetail(d, id + 1000, id, 32, 1)).toEqual(d);
      expect(
        scopedCompetitorDetail(d, id + 1000, id === 269 ? 270 : 269, 32, 1)
      ).toBeNull();
    } finally {
      other.dispose();
    }
  }
);
it("rejects cross-tenant revisions, missing records, running reports and conflicting children", async () => {
  const other = new ServicePreviewModel(270),
    bad = new ServicePreviewModel(269, "unavailable-reference");
  try {
    await expect(
      other.mutate("websiteAnalysis.deleteReviewedCompetitor", {
        id: 32,
        expectedRevision: detail().revision,
        acknowledged: true,
      })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await expect(
      model.mutate("websiteAnalysis.deleteReviewedCompetitor", {
        id: 31,
        expectedRevision: detail(31).revision,
        acknowledged: true,
      })
    ).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });
    await expect(
      bad.mutate("websiteAnalysis.deleteReviewedCompetitor", {
        id: 32,
        expectedRevision: detail(32, 1, bad).revision,
        acknowledged: true,
      })
    ).rejects.toMatchObject({ data: { code: "PRECONDITION_FAILED" } });
    expect(
      model.read("websiteAnalysis.competitorDetail", { id: 999 }).error
    ).toBeTruthy();
    expect(other.operations + bad.operations + model.operations).toBe(0);
  } finally {
    other.dispose();
    bad.dispose();
  }
});
it("creates one pending example and reconciles an uncertain result without duplicate writes", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await expect(
    model.mutate("websiteAnalysis.addCompetitor", {
      requestId:crypto.randomUUID(),
      name: "New synthetic",
      url: "https://example.test",
    })
  ).rejects.toBeTruthy();
  expect(model.operations).toBe(1);
  const result = await model.refetch("websiteAnalysis.competitorWorkspace", {});
  expect(result.data.stats.total).toBe(33);
  expect(result.data.rows[0]).toMatchObject({
    name: "New synthetic",
    status: "pending",
    salesProficiency: null,
  });
  expect(model.operations).toBe(1);
});
it("keeps read-only authority after refreshing", async () => {
  model = new ServicePreviewModel(269, "readonly");
  expect(
    (await model.refetch("websiteAnalysis.competitorWorkspace", {})).data
      .canManage
  ).toBe(false);
  await expect(
    model.mutate("websiteAnalysis.addCompetitor", {
      requestId:crypto.randomUUID(),
      name: "No",
      url: "https://example.test",
    })
  ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
});
it('recovers a lost accepted request by the same id without adding twice',async()=>{
  model=new ServicePreviewModel(269,'uncertain-save');const requestId=crypto.randomUUID(),input={requestId,name:'Local',url:'https://example.test/'};
  await expect(model.mutate('websiteAnalysis.addCompetitor',input)).rejects.toBeTruthy();const first=(await model.refetch('websiteAnalysis.competitorAnalysisAttempt',{requestId})).data;expect(first).toMatchObject({requestId,state:'running'});
  expect(await model.mutate('websiteAnalysis.addCompetitor',input)).toMatchObject({created:false,requestId});expect(model.operations).toBe(1);
});
it('closes a missing preview reference and rejects late admission',async()=>{
  const requestId=crypto.randomUUID();expect(await model.mutate('websiteAnalysis.closeCompetitorAnalysisAttempt',{requestId})).toMatchObject({state:'closed'});await expect(model.mutate('websiteAnalysis.addCompetitor',{requestId,name:'Late',url:'https://example.test/'})).rejects.toMatchObject({data:{code:'CONFLICT'}});expect(list().stats.total).toBe(32);
});
it("keeps products expanded when paging and restores the selected report in the URL", async () => {
  await render();
  await click(en.competitorWorkspaceUx.details);
  const section = document.querySelector(
    ".cmp-product-section"
  ) as HTMLDetailsElement;
  await act(async () => {
    section.open = true;
    section.dispatchEvent(new Event("toggle"));
  });
  const nav = document.querySelector('nav[aria-label="Saved products"]')!;
  await act(async () =>
    (
      Array.from(nav.querySelectorAll("button")).find(
        b => b.textContent === "Next"
      ) as HTMLButtonElement
    ).click()
  );
  expect(location.search).toContain("report=32");
  expect(location.search).toContain("products=2");
  expect(document.querySelectorAll(".cmp-products>li")).toHaveLength(3);
  expect(
    (document.querySelector(".cmp-product-section") as HTMLDetailsElement).open
  ).toBe(true);
});
