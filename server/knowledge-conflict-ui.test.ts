// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { knowledgeConflictsEn as copy } from "../client/src/locales/knowledge-conflicts";
const api = vi.hoisted(() => ({
  list: {} as any,
  review: {} as any,
  decide: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  scope: "10:20:conflicts",
  page: 0,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => copy[key.split(".").at(-1) as keyof typeof copy] || key,
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(api.scope),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: Object.fromEntries(
        [
          "getKnowledgeSections",
          "getPendingReviews",
          "getActivityLog",
          "getChangelog",
          "getHealthScore",
        ].map(k => [k, { invalidate: api.invalidate }])
      ),
    }),
    sariBrain: {
      conflictWorkspace: {
        useQuery: (input: any) => {
          api.page = input.page;
          return { ...api.list, refetch: api.refresh };
        },
      },
      conflictReview: {
        useQuery: () => ({ ...api.review, refetch: api.refresh }),
      },
      approveSection: { useMutation: () => ({ mutateAsync: api.decide }) },
    },
  },
}));
import { KnowledgeConflictWorkspace } from "../client/src/components/KnowledgeConflictWorkspace";
let root: Root, container: HTMLDivElement;
const section = {
  id: 4,
  title: "New policy",
  content: "Complete proposed text ".repeat(50),
  source: "manual",
  sourceUrl: null,
  useInBot: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scope = "10:20:conflicts";
  api.list = {
    data: {
      items: [section],
      total: 1,
      page: 1,
      totalPages: 1,
      canManage: true,
    },
  };
  api.review = {
    data: {
      section,
      current: {
        ...section,
        id: 3,
        title: "Current policy",
        content: "Original current text",
        useInBot: true,
      },
      previousText: "Earlier source text",
      reason: "New policy",
      link: "verified",
      canApprove: true,
      revision: "a".repeat(64),
    },
  };
  api.decide.mockResolvedValue({ success: true });
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
  act(async () => root.render(React.createElement(KnowledgeConflictWorkspace)));
const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find(
    n => n.textContent === label
  )!;
const click = (label: string) =>
  act(async () => {
    expect(button(label)).toBeTruthy();
    button(label).click();
  });
const field = (label: string) =>
  Array.from(document.querySelectorAll("label"))
    .find(n => n.textContent === label)!
    .querySelector("input")!;
const check = (label: string) => act(async () => field(label).click());
const open = async () => {
  await render();
  await click(copy.review);
};
it("does not confuse failed reads with an empty queue", async () => {
  api.list = { isError: true };
  await render();
  expect(container.textContent).toContain(copy.loadError);
  expect(container.textContent).not.toContain(copy.empty);
  await click(copy.retry);
  expect(api.refresh).toHaveBeenCalled();
});
it("shows the complete proposed and current text with explicit replacement effects", async () => {
  await open();
  expect(container.textContent).toContain(section.content);
  expect(container.textContent).toContain("Original current text");
  expect(container.textContent).toContain(copy.linked);
  expect(button(copy.save).disabled).toBe(true);
});
it("requires a selected action and consent and sends the reviewed version", async () => {
  await open();
  await check(copy.replace);
  expect(button(copy.save).disabled).toBe(true);
  await check(copy.ack);
  await click(copy.save);
  expect(api.decide).toHaveBeenCalledWith({
    sectionId: 4,
    action: "approve",
    acknowledged: true,
    expectedRevision: "a".repeat(64),
  });
  expect(container.textContent).toContain(copy.saved);
});
it("invalidates consent on changing the decision", async () => {
  await open();
  await check(copy.replace);
  await check(copy.ack);
  await check(copy.reject);
  expect(field(copy.ack).checked).toBe(false);
  expect(button(copy.save).disabled).toBe(true);
});
it("will not apply an old approval to automatically refreshed review text", async () => {
  await open();
  await check(copy.replace);
  await check(copy.ack);
  api.review.data = { ...api.review.data, revision: "b".repeat(64) };
  await render();
  expect(field(copy.ack).checked).toBe(false);
  expect(button(copy.save).disabled).toBe(true);
  await click(copy.save);
  expect(api.decide).not.toHaveBeenCalled();
});
it("blocks unavailable sources but permits a reviewed close without activation", async () => {
  api.review.data.link = "unavailable";
  api.review.data.canApprove = false;
  api.review.data.current = null;
  await open();
  expect(field(copy.approve).disabled).toBe(true);
  await check(copy.reject);
  await check(copy.ack);
  await click(copy.save);
  expect(api.decide.mock.calls[0][0].action).toBe("reject");
});
it("warns that unlinked approval does not replace existing knowledge", async () => {
  api.review.data.link = "unlinked";
  api.review.data.current = null;
  await open();
  expect(container.textContent).toContain(copy.unlinked);
  expect(field(copy.approve).disabled).toBe(false);
});
it("retains the review on uncertain results and prevents a second blind request", async () => {
  api.decide.mockRejectedValue(Error("Lost response"));
  await open();
  await check(copy.reject);
  await check(copy.ack);
  await click(copy.save);
  expect(container.textContent).toContain(copy.unknown);
  expect(button(copy.save).disabled).toBe(true);
  await click(copy.close);
  expect(document.body.textContent).not.toContain(copy.retainedHelp);
  await click(copy.keep);
  expect(document.querySelector("[data-conflict-review]")).toBeTruthy();
});
it("keeps stale review text for comparison but requires reload and new consent", async () => {
  api.decide.mockRejectedValue({ data: { code: "CONFLICT" } });
  await open();
  await check(copy.replace);
  await check(copy.ack);
  await click(copy.save);
  expect(container.textContent).toContain(copy.changed);
  await click(copy.reloadReview);
  expect(field(copy.ack).checked).toBe(false);
  expect(api.refresh).toHaveBeenCalled();
});
it("does not expose decision controls to read-only users", async () => {
  api.list.data.canManage = false;
  await open();
  expect(container.querySelector("fieldset")).toBeNull();
  expect(button(copy.save).disabled).toBe(true);
});
it("protects a selected decision when closing and discards it on tenant switch", async () => {
  await open();
  await check(copy.reject);
  await click(copy.close);
  expect(document.body.textContent).toContain(copy.retainedHelp);
  await click(copy.keep);
  api.scope = "10:21:conflicts";
  await render();
  expect(document.querySelector("[data-conflict-review]")).toBeNull();
});
it("prevents double submission while a decision is pending", async () => {
  let done: (value: any) => void = () => {};
  api.decide.mockImplementation(() => new Promise(r => (done = r)));
  await open();
  await check(copy.reject);
  await check(copy.ack);
  await click(copy.save);
  expect(button(copy.saving).disabled).toBe(true);
  expect(button(copy.close).disabled).toBe(true);
  await act(async () => done({ success: true }));
  expect(api.decide).toHaveBeenCalledTimes(1);
});
it("shows review loading failure and no actionable approval", async () => {
  api.review = { isError: true };
  await open();
  expect(container.textContent).toContain(copy.reviewError);
  expect(button(copy.save).disabled).toBe(true);
});
it("can navigate beyond the first page of proposals", async () => {
  api.list.data.totalPages = 2;
  await render();
  await click(copy.next);
  expect(api.page).toBe(2);
});
