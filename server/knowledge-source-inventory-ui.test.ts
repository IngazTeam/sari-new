// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { knowledgeSourcesEn as c } from "../client/src/locales/knowledge-sources";
const api = vi.hoisted(() => ({
  result: {} as any,
  refetch: vi.fn(),
  open: vi.fn(),
  options: {} as any,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => c[key.split(".").at(-1) as keyof typeof c] || key,
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sariBrain: {
      getSourceInventory: {
        useQuery: (_: unknown, options: any) => {
          api.options = options;
          return { ...api.result, refetch: api.refetch };
        },
      },
    },
  },
}));
import { KnowledgeSourceInventory } from "../client/src/components/KnowledgeSourceInventory";
let root: Root, container: HTMLDivElement;
const data = () => ({
  documents: {
    total: 5,
    textReady: 1,
    empty: 1,
    pending: 1,
    processing: 1,
    failed: 1,
  },
  products: { total: 4, active: 2 },
  faqs: { total: 3, enabled: 1, archived: 1 },
  pages: { total: 2, enabled: 1, withText: 1 },
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.result = { data: data() };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      React.createElement(KnowledgeSourceInventory, { onOpen: api.open })
    )
  );
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
it("shows every count with its meaning, including completed empty documents", async () => {
  await render();
  expect(container.querySelectorAll("[data-source-inventory]")).toHaveLength(4);
  for (const text of [
    c.help,
    c.emptyExtraction,
    c.productHelp,
    c.faqHelp,
    c.pageHelp,
  ])
    expect(container.textContent).toContain(text);
  expect(
    container.querySelector('[data-source-inventory="documents"] strong')
      ?.textContent
  ).toBe("5");
});
it("hides stale previous values on a read error and allows explicit retry", async () => {
  api.result = { data: data(), isError: true };
  await render();
  expect(container.querySelectorAll("[data-source-inventory]")).toHaveLength(0);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(c.error);
  await act(async () => button(c.retry).click());
  expect(api.refetch).toHaveBeenCalledOnce();
});
it("does not turn loading into a zero count", async () => {
  api.result = { isFetching: true };
  await render();
  expect(container.textContent).toContain(c.loading);
  expect(container.querySelector("strong")).toBeNull();
  expect(button(c.retry).disabled).toBe(true);
});
it("renders real zero counts after a successful empty read", async () => {
  const empty = data();
  for (const group of Object.values(empty))
    for (const key of Object.keys(group)) (group as any)[key] = 0;
  api.result = { data: empty };
  await render();
  expect(
    [...container.querySelectorAll("strong")].map(el => el.textContent)
  ).toEqual(["0", "0", "0", "0"]);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
it.each([
  ["documents", c.openDocuments],
  ["products", c.openProducts],
  ["faqs", c.openFaqs],
  ["pages", c.openPages],
])("opens the %s review without modifying data", async (kind, label) => {
  await render();
  await act(async () => button(label).click());
  expect(api.open).toHaveBeenCalledWith(kind);
  expect(api.refetch).not.toHaveBeenCalled();
});
it("requests fresh data when returning to overview and labels an in-progress refresh", async () => {
  api.result = { data: data(), isFetching: true };
  await render();
  expect(api.options.refetchOnMount).toBe("always");
  expect(container.textContent).toContain(c.refreshing);
  expect(button(c.retry).disabled).toBe(true);
});
