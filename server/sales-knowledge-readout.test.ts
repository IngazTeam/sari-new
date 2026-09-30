// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/en.json";
import { salesKnowledgeFixture } from "../prototypes/tenant-dashboard/src/sales-knowledge-fixture";
const m = vi.hoisted(() => ({
  listInput: [] as any[],
  detailInput: [] as any[],
  list: {} as any,
  detail: {} as any,
  refresh: vi.fn(),
  scope: "7:20:sales-readout",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { dir: () => "ltr" },
    t: (key: string, args: Record<string, unknown> = {}) =>
      ((en.salesKnowledgeUx as any)[key.split(".").at(-1)!] || key).replace(
        /\{\{(\w+)\}\}/g,
        (_: string, k: string) => String(args[k] ?? "")
      ),
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(m.scope),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sariBrain: {
      sectionWorkspace: {
        useQuery: (input: any, options: any) => {
          m.listInput.push({ input, options });
          return { ...m.list, refetch: m.refresh };
        },
      },
      sectionReview: {
        useQuery: (input: any, options: any) => {
          m.detailInput.push({ input, options });
          return { ...m.detail, refetch: m.refresh };
        },
      },
    },
  },
}));
import {
  SalesKnowledgeReadout,
  SalesKnowledgeGroupView,
} from "../client/src/components/SalesKnowledgeReadout";
let root: Root, container: HTMLDivElement;
const c = en.salesKnowledgeUx;
const fixture = () => salesKnowledgeFixture("sales_intel", true);
const actions = {
  onOpen: vi.fn(),
  onPage: vi.fn(),
  onRefresh: vi.fn(),
  onRefreshDetail: vi.fn(),
  onManage: vi.fn(),
};
const props = (extra: any = {}) => ({
  kind: "sales_intel" as const,
  data: {
    items: fixture()
      .slice(0, 8)
      .map(x => x.section),
    page: 1,
    totalPages: 2,
    total: 10,
  },
  selected: null,
  ...actions,
  ...extra,
});
const render = (extra: any = {}) =>
  act(async () =>
    root.render(React.createElement(SalesKnowledgeGroupView, props(extra)))
  );
const button = (name: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent === name)!;
beforeEach(() => {
  vi.clearAllMocks();
  m.listInput = [];
  m.detailInput = [];
  m.list = { data: props().data };
  m.detail = {};
  m.scope = "7:20:sales-readout";
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows every section in the returned page with all six states and source, not just the first", async () => {
  await render();
  expect(container.querySelectorAll("li")).toHaveLength(8);
  for (const state of [
    "eligible",
    "pending",
    "paused",
    "expired",
    "unverified",
    "excluded",
  ])
    expect(container.textContent).toContain((c as any)[state]);
  expect(container.textContent).toContain(c.scope);
  expect(container.textContent).toContain("10 sections");
});
it.each(["loading", "error"])("hides stale list values for %s", async state => {
  await render({ [state]: true });
  expect(container.querySelectorAll("li")).toHaveLength(0);
  expect(container.textContent).not.toContain("10 sections");
  expect(container.textContent).toContain(
    state === "loading" ? c.loading : c.readError
  );
});
it("shows a real empty result separately from errors", async () => {
  await render({ data: { items: [], total: 0, page: 1, totalPages: 1 } });
  expect(container.textContent).toContain(c.empty);
  expect(container.querySelector("[role=alert]")).toBeNull();
});
it("opens the full section, retains paragraphs and bullets, escapes text, and labels stored metadata", async () => {
  const detail = fixture()[0];
  detail.section.content += "<img src=x onerror=alert(1)>";
  await render({ selected: 1, detail });
  expect(container.textContent).toContain(detail.section.content);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain(c.behavior);
  expect(container.textContent).toContain(c.on);
  expect(container.textContent).toContain(c.summary);
  expect(
    container
      .querySelector("button[aria-expanded=true]")
      ?.getAttribute("aria-controls")
  ).toBe("sales-section-1");
});
it.each(["detailLoading", "detailError"])(
  "hides stale detail on %s",
  async state => {
    await render({ selected: 1, detail: fixture()[0], [state]: true });
    expect(container.textContent).not.toContain(fixture()[0].section.content);
  }
);
it("rejects a detail for another section or section type", async () => {
  await render({ selected: 1, detail: fixture()[1] });
  expect(container.textContent).toContain(c.detailError);
  expect(container.textContent).not.toContain(fixture()[1].section.content);
  const detail = fixture()[0];
  detail.section.sectionType = "opportunities";
  await render({ selected: 1, detail });
  expect(container.textContent).toContain(c.detailError);
});
it("uses refreshed detail state over older list metadata", async () => {
  const detail = fixture()[0];
  detail.section.state = "paused";
  detail.section.title = "Revised title";
  await render({ selected: 1, detail });
  expect(container.querySelector("li")?.textContent).toContain(c.paused);
  expect(container.querySelector("li")?.textContent).toContain("Revised title");
});
it("wires pagination, reading, closing, refresh and management independently", async () => {
  await render();
  await act(async () => button(c.next).click());
  expect(actions.onPage).toHaveBeenCalledWith(2);
  expect(button(c.previous).disabled).toBe(true);
  await act(async () => button(c.open).click());
  expect(actions.onOpen).toHaveBeenCalledWith(1);
  await act(async () => button(c.refresh).click());
  await act(async () => button(c.manage).click());
  expect(actions.onRefresh).toHaveBeenCalledOnce();
  expect(actions.onManage).toHaveBeenCalledOnce();
  await render({ selected: 1, detailError: true });
  await act(async () => button(c.retryDetail).click());
  expect(actions.onRefreshDetail).toHaveBeenCalledOnce();
  await act(async () => button(c.close).click());
  expect(actions.onOpen).toHaveBeenLastCalledWith(null);
});
it("does not infer customer invisibility for opportunity sections", async () => {
  await render({
    kind: "opportunities",
    data: { items: [], page: 1, totalPages: 1, total: 0 },
  });
  expect(container.textContent).toContain(c.opportunitiesHelp);
});
it("reads each type through the verified workspace, only loads selected details and resets on scope change", async () => {
  await act(async () =>
    root.render(
      React.createElement(SalesKnowledgeReadout, {
        active: true,
        onManage: actions.onManage,
      })
    )
  );
  expect(m.listInput.slice(-2).map(x => x.input.type)).toEqual([
    "sales_intel",
    "opportunities",
  ]);
  expect(m.listInput[0].options).toMatchObject({
    retry: false,
    enabled: true,
    staleTime: 0,
  });
  expect(m.detailInput.every(x => !x.options.enabled)).toBe(true);
  await act(async () => button(c.open).click());
  expect(m.detailInput.some(x => x.input.id === 1 && x.options.enabled)).toBe(
    true
  );
  m.scope = "7:21:sales-readout";
  await act(async () =>
    root.render(
      React.createElement(SalesKnowledgeReadout, {
        active: false,
        onManage: actions.onManage,
      })
    )
  );
  expect(m.detailInput.slice(-2).every(x => !x.options.enabled)).toBe(true);
  expect(m.listInput.slice(-2).every(x => !x.options.enabled)).toBe(true);
});
