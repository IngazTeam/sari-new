// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/en.json";
import { activityFixture } from "../prototypes/tenant-dashboard/src/knowledge-activity-fixture";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  refresh: vi.fn(),
  scope: "7:970160:knowledge-activity",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en", dir: () => "ltr" },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key.split(".").reduce((o: any, k) => o?.[k], en) ?? key;
      return value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
        String(args[k] ?? "")
      );
    },
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { sariBrain: { getActivityLog: { useQuery: m.query } } },
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(m.scope),
}));
import {
  KnowledgeActivityView,
  KnowledgeActivityWorkspace,
} from "../client/src/components/KnowledgeActivityWorkspace";
let root: Root, container: HTMLDivElement;
const copy = en.knowledgeActivityUx;
const actions = { onFilter: vi.fn(), onPage: vi.fn(), onRefresh: vi.fn() };
const props = (extra: any = {}) => ({
  merchantId: 970160,
  data: activityFixture("all", 1, true),
  loading: false,
  error: false,
  filter: "all",
  ...actions,
  ...extra,
});
const render = (extra: any = {}) =>
  act(async () =>
    root.render(React.createElement(KnowledgeActivityView, props(extra)))
  );
const button = (label: string) =>
  Array.from(container.querySelectorAll("button")).find(
    b => b.textContent === label
  )!;
const click = (label: string) => act(async () => button(label).click());
const select = (value: string) =>
  act(async () => {
    const element = container.querySelector("select")!;
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
const fill = (id: string, text: string) =>
  act(async () => {
    const input = container.querySelector<HTMLInputElement>("#" + id)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  m.scope = "7:970160:knowledge-activity";
  m.query.mockImplementation(input => ({
    data: activityFixture(input.actionType, input.page, true),
    isFetchedAfterMount: true,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: m.refresh,
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it("shows complete escaped descriptions, unknown actions and explicit missing dates", async () => {
  await render();
  expect(container.textContent).toContain(
    "<script>This stays plain text.</script>"
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain(copy.unknownDate);
  expect(container.textContent).toContain("custom_review");
  expect(container.textContent).toContain(copy.scope);
  expect(container.querySelectorAll("li")).toHaveLength(10);
});
it("keeps filter controls and recovery available for empty results", async () => {
  await render({ filter: "brain_reset", data: activityFixture("brain_reset") });
  expect(container.textContent).toContain(copy.noMatches);
  expect(container.querySelector("select")!.value).toBe("brain_reset");
  await click(copy.clearFilter);
  expect(actions.onFilter).toHaveBeenCalledWith("all");
  await select("products_deleted");
  expect(actions.onFilter).toHaveBeenCalledWith("products_deleted");
});
it.each([
  { loading: true },
  { error: true },
  { data: undefined },
  { data: { ...activityFixture(), merchantId: 999 } },
  { filter: "file_uploaded", data: activityFixture() },
])(
  "hides stale or invalid records while keeping the filter visible %j",
  async state => {
    await render(state);
    expect(container.querySelector("select")).not.toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).not.toContain("Saved example");
  }
);
it("supports previous, next and validated direct page navigation", async () => {
  await render();
  expect(button(copy.previous).disabled).toBe(true);
  await click(copy.next);
  expect(actions.onPage).toHaveBeenCalledWith(2);
  await fill("knowledge-activity-page", "2.5");
  expect(button(copy.jump).disabled).toBe(true);
  expect(container.querySelector("[role=alert]")).not.toBeNull();
  await fill("knowledge-activity-page", "3");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
  expect(actions.onPage).toHaveBeenCalledWith(3);
  await render({ data: activityFixture("all", 3, true) });
  expect(button(copy.next).disabled).toBe(true);
  await click(copy.previous);
  expect(actions.onPage).toHaveBeenLastCalledWith(2);
});
it("explains a bounded type list and retains a full typed code without silent clipping", async () => {
  await render({ data: { ...activityFixture(), actionTypesTruncated: true } });
  expect(container.textContent).toContain(copy.typesLimit);
  await fill("knowledge-activity-custom", "x".repeat(101));
  expect(button(copy.applyType).disabled).toBe(true);
  expect(
    container.querySelector<HTMLInputElement>("#knowledge-activity-custom")!
      .value
  ).toHaveLength(101);
  await fill("knowledge-activity-custom", "Legacy Action");
  await click(copy.applyType);
  expect(actions.onFilter).toHaveBeenCalledWith("Legacy Action");
});
it("refreshes only on the explicit refresh action", async () => {
  await render({ error: true });
  await click(copy.retry);
  expect(actions.onRefresh).toHaveBeenCalledTimes(1);
});
it("loads fresh scoped history only when its section is active and resets pagination with a filter", async () => {
  await act(async () =>
    root.render(
      React.createElement(KnowledgeActivityWorkspace, { active: false })
    )
  );
  expect(m.query).toHaveBeenLastCalledWith(
    { page: 1, pageSize: 10, actionType: "all" },
    { enabled: false, retry: false, staleTime: 0 }
  );
  await act(async () =>
    root.render(
      React.createElement(KnowledgeActivityWorkspace, { active: true })
    )
  );
  await click(copy.next);
  expect(m.query.mock.calls.at(-1)![0].page).toBe(2);
  await select("file_uploaded");
  expect(m.query.mock.calls.at(-1)![0]).toEqual({
    page: 1,
    pageSize: 10,
    actionType: "file_uploaded",
  });
  m.scope = "7:970161:knowledge-activity";
  await act(async () =>
    root.render(
      React.createElement(KnowledgeActivityWorkspace, { active: true })
    )
  );
  expect(m.query.mock.calls.at(-1)![0].actionType).toBe("all");
  expect(container.querySelectorAll("li")).toHaveLength(0);
});
