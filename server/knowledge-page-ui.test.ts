// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { knowledgePagesEn as c } from "../client/src/locales/knowledge-pages";
const api = vi.hoisted(() => ({
  list: {} as any,
  read: vi.fn(),
  change: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  scope: "10:20:pages",
  input: null as any,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: Record<string, unknown>) => {
      let value = c[key.split(".").at(-1) as keyof typeof c] || key;
      for (const [k, v] of Object.entries(args || {}))
        value = value.replaceAll(`{{${k}}}`, String(v));
      return value;
    },
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(api.scope),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: {
        pageReview: { fetch: api.read },
        invalidate: api.invalidate,
      },
    }),
    sariBrain: {
      pageWorkspace: {
        useQuery: (input: any) => {
          api.input = input;
          return { ...api.list, refetch: api.refresh };
        },
      },
      changeWorkspacePage: { useMutation: () => ({ mutateAsync: api.change }) },
    },
  },
}));
import { KnowledgeWebsiteWorkspace } from "../client/src/components/KnowledgeWebsiteWorkspace";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
let root: Root, container: HTMLDivElement;
const row = () => ({
  id: 4,
  title: "Synthetic page",
  url: "https://example.test/page",
  pageType: "other",
  state: "enabled",
});
const review = () => ({
  page: { ...row(), content: "Full text ".repeat(1200) + " THE END" },
  revision: "a".repeat(64),
  duplicateCount: 0,
  canEnable: true,
  sections: [
    {
      id: 5,
      title: "Linked section",
      content: "Child text",
      state: "eligible",
    },
  ],
  faqs: [
    {
      id: 6,
      question: "Linked question?",
      answer: "Full answer",
      enabled: true,
    },
  ],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scope = "10:20:pages";
  api.list = {
    data: {
      items: [row()],
      canManage: true,
      saved: 1,
      enabled: 1,
      total: 1,
      page: 1,
      totalPages: 1,
    },
  };
  api.read.mockResolvedValue(review());
  api.change.mockResolvedValue({ success: true });
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
  act(async () => root.render(React.createElement(KnowledgeWebsiteWorkspace)));
const body = () => document.body.textContent || "";
const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    el => el.textContent === label
  )!;
const click = (label: string) =>
  act(async () => {
    expect(button(label)).toBeTruthy();
    button(label).click();
  });
const field = (label: string) =>
  Array.from(document.body.querySelectorAll("label"))
    .find(el => el.textContent?.startsWith(label))!
    .querySelector("input,select") as HTMLInputElement;
const choose = (value: string) =>
  act(async () => {
    const el = field(c.action);
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const ack = () => act(async () => field(c.acknowledge).click());
it("shows a failed list separately from empty and can retry", async () => {
  api.list = { error: Error("private SQL") };
  await render();
  expect(body()).toContain(c.loadFailed);
  expect(body()).not.toContain(c.noPages);
  expect(body()).not.toContain("private SQL");
  await click(c.retry);
  expect(api.refresh).toHaveBeenCalledTimes(1);
});
it("shows a successful empty list without a quality score", async () => {
  api.list.data.items = [];
  api.list.data.saved = 0;
  await render();
  expect(body()).toContain(c.noPages);
  expect(body()).toContain(c.scope);
  expect(body()).not.toContain("100%");
});
it("preserves full text, affected records and escaped untrusted text", async () => {
  const r = review();
  r.page.content += "<img src=x onerror=alert(1)>";
  api.read.mockResolvedValue(r);
  await render();
  await click(c.review);
  expect(body()).toContain("THE END");
  expect(body()).toContain("Child text");
  expect(body()).toContain("Full answer");
  expect(document.body.querySelector("img[src=x]")).toBeNull();
});
it("does not render unsafe URLs as clickable links", async () => {
  api.list.data.items[0].url = "javascript:alert(1)";
  await render();
  expect(document.body.querySelector('a[href^="javascript:"]')).toBeNull();
});
it("requires an explicit action and fresh acknowledgement after action changes", async () => {
  await render();
  await click(c.review);
  expect(button(c.apply).disabled).toBe(true);
  await choose("pause");
  await ack();
  expect(button(c.apply).disabled).toBe(false);
  await choose("delete");
  expect((field(c.acknowledge) as HTMLInputElement).checked).toBe(false);
  expect(button(c.apply).disabled).toBe(true);
  await ack();
  await click(c.apply);
  expect(api.change).toHaveBeenCalledWith({
    id: 4,
    action: "delete",
    expectedRevision: "a".repeat(64),
    acknowledged: true,
  });
  expect(body()).toContain(c.savedMessage);
});
it.each(["CONFLICT", "INTERNAL_SERVER_ERROR"])(
  "forces fresh review after %s without success or automatic retry",
  async code => {
    api.change.mockRejectedValue({ data: { code }, message: "private SQL" });
    await render();
    await click(c.review);
    await choose("pause");
    await ack();
    await click(c.apply);
    expect(body()).toContain(code === "CONFLICT" ? c.conflict : c.uncertain);
    expect(body()).not.toContain(c.savedMessage);
    expect(body()).not.toContain("private SQL");
    expect(button(c.apply)).toBeUndefined();
    api.read.mockResolvedValue({ ...review(), revision: "b".repeat(64) });
    await click(c.refreshReview);
    expect(button(c.apply).disabled).toBe(true);
    expect(api.change).toHaveBeenCalledTimes(1);
  }
);
it("handles missing review without exposing cached action controls", async () => {
  api.read.mockRejectedValue({ data: { code: "NOT_FOUND" } });
  await render();
  await click(c.review);
  expect(body()).toContain(c.missing);
  expect(button(c.apply)).toBeUndefined();
});
it("viewer can read full text but cannot manage records", async () => {
  api.list.data.canManage = false;
  await render();
  await click(c.review);
  expect(body()).toContain("THE END");
  expect(button(c.apply)).toBeUndefined();
  expect(api.change).not.toHaveBeenCalled();
});
it("blocks ambiguous duplicate pages and ineligible enable", async () => {
  api.read.mockResolvedValue({
    ...review(),
    duplicateCount: 1,
    canEnable: false,
  });
  await render();
  await click(c.review);
  expect(body()).toContain(c.duplicates);
  expect(body()).toContain(c.blocked);
  expect(field(c.action).closest("fieldset")?.disabled).toBe(true);
  expect(
    document.querySelector<HTMLOptionElement>('option[value="enable"]')
      ?.disabled
  ).toBe(true);
});
it("fetches current detail even if an earlier cached review is fresh forever", async () => {
  const cache = new QueryClient();
  let remote = review();
  api.read.mockImplementation((input, options) =>
    cache.fetchQuery({
      queryKey: ["page", input.id],
      queryFn: async () => structuredClone(remote),
      staleTime: Infinity,
      ...options,
    })
  );
  await render();
  await click(c.review);
  await click(c.close);
  remote.page.content = "Changed remotely";
  await click(c.review);
  expect(body()).toContain("Changed remotely");
  cache.clear();
});
it("does not render a pending read after merchant scope changes", async () => {
  let resolve!: (r: any) => void;
  api.read.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await click(c.review);
  api.scope = "10:21:pages";
  await render();
  await act(async () => resolve(review()));
  expect(body()).not.toContain("THE END");
});
it("ignores a late read after logout clears the knowledge epoch", async () => {
  let resolve!: (r: any) => void;
  api.read.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await click(c.review);
  await act(async () => {
    clearKnowledgeWorkspace();
    resolve(review());
  });
  expect(body()).not.toContain("THE END");
});
it("search and state changes reset pagination", async () => {
  await render();
  await act(async () => {
    const el = field(c.search);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, "shipping");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(c.searchButton);
  expect(api.input).toEqual({ search: "shipping", state: "all", page: 1 });
  await act(async () => {
    const el = field(c.filter);
    el.value = "paused";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(api.input).toEqual({ search: "shipping", state: "paused", page: 1 });
});
