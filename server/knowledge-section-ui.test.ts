// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { knowledgeSectionsEn as c } from "../client/src/locales/knowledge-sections";
const api = vi.hoisted(() => ({
  list: {} as any,
  health: {} as any,
  read: vi.fn(),
  receipt: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  scope: "10:20:sections",
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
        sectionReview: { fetch: api.read },
        sectionCreationReceipt: { fetch: api.receipt },
        ...Object.fromEntries(
          [
            "getHealthScore",
            "getKnowledgeSections",
            "getActivityLog",
            "getChangelog",
            "conflictWorkspace",
          ].map(k => [k, { invalidate: api.invalidate }])
        ),
      },
    }),
    sariBrain: {
      sectionWorkspace: {
        useQuery: (input: any) => {
          api.input = input;
          return { ...api.list, refetch: api.refresh };
        },
      },
      getHealthScore: {
        useQuery: () => ({ ...api.health, refetch: api.refresh }),
      },
      createWorkspaceSection: {
        useMutation: () => ({ mutateAsync: api.create }),
      },
      updateWorkspaceSection: {
        useMutation: () => ({ mutateAsync: api.update }),
      },
      deleteWorkspaceSection: {
        useMutation: () => ({ mutateAsync: api.remove }),
      },
    },
  },
}));
import {
  KnowledgeSectionWorkspace,
  KnowledgeSectionReadiness,
} from "../client/src/components/KnowledgeSectionWorkspace";
let root: Root, container: HTMLDivElement;
const row = () => ({
  id: 4,
  parentId: null,
  title: "Original title",
  content: "Full text ".repeat(150),
  summary: "Old summary",
  sectionType: "policies",
  state: "paused",
  status: "approved",
  injectAs: "fact",
  useInBot: false,
  expired: false,
  source: "manual",
  sourceUrl: null,
  validUntil: null,
  replacesTeachingSource: false,
});
const review = () => ({
  section: row(),
  revision: "a".repeat(64),
  deleteRevision: "b".repeat(64),
  parent: null,
  descendants: [
    { id: 5, title: "Child" },
    { id: 6, title: "Grandchild" },
  ],
});
it("reopens the latest saved text even when a previous detail has a long cache lifetime", async () => {
  const cache = new QueryClient();
  let remote = review();
  api.read.mockImplementation((input, options) =>
    cache.fetchQuery({
      queryKey: ["section", input.id],
      queryFn: async () => structuredClone(remote),
      staleTime: Infinity,
      ...options,
    })
  );
  api.update.mockImplementation(async input => {
    remote = {
      ...remote,
      section: { ...remote.section, content: input.content },
      revision: "d".repeat(64),
    };
    return { success: true };
  });
  await render();
  await click(c.open);
  await set(c.content, "Freshly saved content");
  await check(c.ack);
  await click(c.save);
  await click(c.open);
  expect(field(c.content).value).toBe("Freshly saved content");
  cache.clear();
});
it("rejects oversized multi-byte content before making a request", async () => {
  await render();
  await click(c.new);
  await set(c.sectionTitle, "Too large");
  await set(c.content, "😀".repeat(16384));
  await check(c.ack);
  await click(c.save);
  expect(container.textContent).toContain(c.tooLarge);
  expect(api.create).not.toHaveBeenCalled();
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.scope = "10:20:sections";
  api.list = {
    data: { items: [row()], canManage: true, total: 1, page: 1, totalPages: 1 },
  };
  api.health = {};
  api.read.mockResolvedValue(review());
  api.receipt.mockResolvedValue({ state: "not_found" });
  api.create.mockResolvedValue({
    success: true,
    id: 7,
    indexing: "not_requested",
  });
  api.update.mockResolvedValue({ success: true });
  api.remove.mockResolvedValue({ success: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (health = false) =>
  act(async () =>
    root.render(
      React.createElement(
        health ? KnowledgeSectionReadiness : KnowledgeSectionWorkspace
      )
    )
  );
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    el => el.textContent === text
  )!;
const click = (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });
const field = (text: string) =>
  Array.from(container.querySelectorAll("label"))
    .find(el => el.textContent?.startsWith(text))!
    .querySelector("input,textarea,select") as HTMLInputElement;
const set = (label: string, value: string) =>
  act(async () => {
    const el = field(label);
    Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const check = (label: string) => act(async () => field(label).click());
const reload = async () => {
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
};
it("restores a new draft after remount without approval or automatic submission", async () => {
  await render();
  await click(c.new);
  await set(c.sectionTitle, "Local draft");
  await set(c.content, "Private draft text");
  await check(c.ack);
  await reload();
  expect(container.textContent).toContain(c.draftAvailable);
  expect(button(c.new).disabled).toBe(true);
  await click(c.restoreDraft);
  expect(field(c.content).value).toBe("Private draft text");
  expect(field(c.ack).checked).toBe(false);
  expect(api.create).not.toHaveBeenCalled();
});
it("restores an uncertain create with the identical request after a lost response", async () => {
  await render();
  await click(c.new);
  await set(c.sectionTitle, "New");
  await set(c.content, "Text");
  api.create.mockRejectedValueOnce(Error("Lost response"));
  await check(c.ack);
  await click(c.save);
  const first = api.create.mock.calls[0][0];
  await reload();
  await click(c.restoreDraft);
  expect(field(c.content).matches(":disabled")).toBe(true);
  await click(c.checkCreation);
  expect(api.receipt).toHaveBeenCalledWith(
    { requestId: first.requestId },
    { staleTime: 0 }
  );
  expect(container.textContent).toContain(c.creationMissing);
  await check(c.ack);
  await click(c.retrySame);
  expect(api.create.mock.calls[1][0]).toEqual(first);
});
it.each(["saved", "changed", "deleted"])(
  "reconciles %s receipts without a second mutation",
  async state => {
    await render();
    await click(c.new);
    await set(c.sectionTitle, "New");
    await set(c.content, "Text");
    api.create.mockRejectedValueOnce(Error("Lost response"));
    await check(c.ack);
    await click(c.save);
    await reload();
    await click(c.restoreDraft);
    api.receipt.mockResolvedValue({ state, id: 7 });
    await click(c.checkCreation);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-section-editor]")).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(container.textContent).toContain(
      state === "deleted"
        ? c.creationDeleted
        : state === "changed"
          ? c.creationChanged
          : c.creationSaved
    );
  }
);
it("requires an explicit comparison before rebasing a restored edit onto a newer revision", async () => {
  await render();
  await click(c.open);
  await set(c.content, "My draft");
  await check(c.ack);
  await reload();
  api.read.mockResolvedValue({
    ...review(),
    section: { ...row(), content: "Concurrent text" },
    revision: "c".repeat(64),
  });
  await click(c.restoreDraft);
  expect(container.textContent).toContain("Concurrent text");
  expect(field(c.content).value).toBe("My draft");
  expect(field(c.ack).disabled).toBe(true);
  await reload();
  await click(c.restoreDraft);
  expect(button(c.useDraft)).toBeTruthy();
  await click(c.useDraft);
  expect(field(c.ack).checked).toBe(false);
  await check(c.ack);
  await click(c.save);
  expect(api.update).toHaveBeenCalledWith(
    expect.objectContaining({
      content: "My draft",
      expectedRevision: "c".repeat(64),
    })
  );
});
it("never restores a deletion or its approval", async () => {
  await render();
  await click(c.open);
  await click(c.remove);
  await check(c.ack);
  await reload();
  await click(c.restoreDraft);
  expect(button(c.deleteConfirm)).toBeUndefined();
  expect(field(c.ack).checked).toBe(false);
  expect(api.remove).not.toHaveBeenCalled();
});
it("does not send a new creation if its request identity cannot be retained", async () => {
  await render();
  await click(c.new);
  await set(c.sectionTitle, "New");
  await set(c.content, "Text");
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Quota");
  });
  try {
    await check(c.ack);
    await click(c.save);
    expect(api.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain(c.draftStorageError);
  } finally {
    spy.mockRestore();
  }
});
it("does not reveal cached text when write permission has been removed", async () => {
  await render();
  await click(c.new);
  await set(c.content, "Hidden cached text");
  api.list.data.canManage = false;
  await reload();
  expect(container.textContent).not.toContain(c.draftAvailable);
  expect(container.textContent).not.toContain("Hidden cached text");
  expect(sessionStorage.length).toBe(0);
});
it("distinguishes read errors and empty lists", async () => {
  api.list = { isError: true };
  await render();
  expect(container.textContent).toContain(c.loadError);
  expect(container.textContent).not.toContain(c.empty);
  await click(c.retry);
  expect(api.refresh).toHaveBeenCalled();
});
it("shows full content and requires a fresh acknowledgement after each edit", async () => {
  await render();
  await click(c.open);
  expect(field(c.content).value).toBe(row().content);
  await check(c.ack);
  await set(c.sectionTitle, "Changed title");
  expect(field(c.ack).checked).toBe(false);
  expect(button(c.save).disabled).toBe(true);
  await check(c.ack);
  await click(c.save);
  expect(api.update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 4,
      title: "Changed title",
      expectedRevision: "a".repeat(64),
      acknowledged: true,
    })
  );
});
it("creates paused sections by default with a stable request identity", async () => {
  await render();
  await click(c.new);
  expect(field(c.use).checked).toBe(false);
  await set(c.sectionTitle, "New section");
  await set(c.content, "New content");
  await check(c.ack);
  api.create.mockRejectedValueOnce(Error("lost response"));
  await click(c.save);
  const first = api.create.mock.calls[0][0];
  expect(field(c.content).matches(":disabled")).toBe(true);
  await check(c.ack);
  await click(c.retrySame);
  expect(api.create.mock.calls[1][0]).toEqual(first);
});
it("retains a rejected stale edit until the merchant explicitly loads the latest section", async () => {
  await render();
  await click(c.open);
  await set(c.content, "Draft text");
  await check(c.ack);
  api.update.mockRejectedValue({ data: { code: "CONFLICT" } });
  await click(c.save);
  expect(field(c.content).value).toBe("Draft text");
  expect(container.textContent).toContain(c.changed);
  expect(button(c.save).disabled).toBe(true);
  api.read.mockResolvedValue({
    ...review(),
    section: { ...row(), content: "Latest text" },
    revision: "c".repeat(64),
  });
  await click(c.refreshReview);
  expect(field(c.content).value).toBe("Latest text");
  expect(field(c.ack).checked).toBe(false);
});
it("previews every descendant and uses the deletion revision only after renewed consent", async () => {
  await render();
  await click(c.open);
  await check(c.ack);
  await click(c.remove);
  expect(container.textContent).toContain("Grandchild");
  expect(button(c.deleteConfirm).disabled).toBe(true);
  await check(c.ack);
  await click(c.deleteConfirm);
  expect(api.remove).toHaveBeenCalledWith({
    id: 4,
    expectedRevision: "b".repeat(64),
    acknowledged: true,
  });
});
it("does not edit pending proposals through this form", async () => {
  api.read.mockResolvedValue({
    ...review(),
    section: { ...row(), status: "pending_review", state: "pending" },
  });
  await render();
  await click(c.open);
  expect(container.textContent).toContain(c.pendingHelp);
  expect(button(c.save).disabled).toBe(true);
});
it("allows pausing an expired enabled section but prevents enabling it again", async () => {
  api.read.mockResolvedValue({
    ...review(),
    section: { ...row(), useInBot: true, expired: true, state: "expired" },
  });
  await render();
  await click(c.open);
  await check(c.use);
  expect(field(c.use).checked).toBe(false);
  expect(field(c.use).disabled).toBe(true);
  await check(c.ack);
  await click(c.save);
  expect(api.update).toHaveBeenCalledWith(
    expect.objectContaining({ useInBot: false })
  );
});
it("provides full read access without mutation actions to a viewer", async () => {
  api.list.data.canManage = false;
  await render();
  expect(button(c.new)).toBeUndefined();
  await click(c.open);
  expect(field(c.content).value).toBe(row().content);
  expect(button(c.save)).toBeUndefined();
  expect(button(c.remove)).toBeUndefined();
});
it("resets a draft when the confirmed tenant scope changes", async () => {
  await render();
  await click(c.open);
  await set(c.content, "Tenant draft");
  api.scope = "10:21:sections";
  await render();
  expect(container.querySelector("[data-section-editor]")).toBeNull();
});
it("keeps a failed detail read distinct from the list and does not leak server text", async () => {
  api.read.mockRejectedValue(Error("secret sql"));
  await render();
  await click(c.open);
  expect(container.textContent).toContain(c.loadError);
  expect(container.textContent).not.toContain("secret sql");
  expect(container.querySelector("[data-section-editor]")).toBeNull();
});
it("guards unsaved drafts on close", async () => {
  await render();
  await click(c.new);
  await set(c.sectionTitle, "Unsaved");
  await click(c.close);
  expect(document.body.textContent).toContain(c.discardHelp);
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find(el => el.textContent === c.keep)!
      .click()
  );
  expect(field(c.sectionTitle).value).toBe("Unsaved");
});
it("uses the API page when a filter or deletion clamps the previous page", async () => {
  api.list.data = { ...api.list.data, page: 2, totalPages: 3 };
  await render();
  await click(c.previous);
  expect(api.input.page).toBe(1);
});
it("reports a coverage read failure without a fabricated zero score", async () => {
  api.health = { isError: true };
  await render(true);
  expect(container.textContent).toContain(c.healthError);
  expect(container.textContent).not.toContain("0%");
});
it("explains withdrawn teaching and requires fresh acknowledgement before independent review", async () => {
  const section = {
    ...row(),
    useInBot: true,
    state: "unverified",
    replacesTeachingSource: true,
  };
  api.list.data.items = [section];
  api.read.mockResolvedValue({ ...review(), section });
  await render();
  expect(container.textContent).toContain(c.unverified);
  await click(c.open);
  expect(container.textContent).toContain(c.unverifiedHelp);
  expect(container.textContent).toContain(c.teachingReviewHelp);
  expect(field(c.use).checked).toBe(true);
  expect(button(c.save).disabled).toBe(true);
  expect(api.update).not.toHaveBeenCalled();
  await check(c.ack);
  await click(c.save);
  expect(api.update).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 4,
      content: section.content,
      acknowledged: true,
      expectedRevision: "a".repeat(64),
    })
  );
});
it("lets a reader inspect an unverified source without offering an approval action", async () => {
  api.list.data.canManage = false;
  api.read.mockResolvedValue({
    ...review(),
    section: { ...row(), state: "unverified", replacesTeachingSource: true },
  });
  await render();
  await click(c.open);
  expect(container.textContent).toContain(c.unverifiedHelp);
  expect(button(c.save)).toBeUndefined();
  expect(field(c.content).matches(":disabled")).toBe(true);
  expect(api.update).not.toHaveBeenCalled();
});
it("renders the coverage definition and independent eligibility counts", async () => {
  api.health = {
    data: {
      total: 17,
      covered: 1,
      areas: 6,
      saved: 7,
      counts: {
        eligible: 1,
        unverified: 2,
        pending: 1,
        paused: 1,
        expired: 1,
        excluded: 1,
      },
      breakdown: [{ key: "identity", count: 1 }],
    },
  };
  await render(true);
  expect(container.textContent).toContain("1 of 6 areas · 17%");
  expect(container.textContent).toContain(c.coverageHelp);
  for (const s of [
    "unverified",
    "pending",
    "paused",
    "expired",
    "excluded",
  ] as const)
    expect(container.textContent).toContain(c[s]);
});
