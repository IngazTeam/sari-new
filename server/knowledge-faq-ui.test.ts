// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { knowledgeFaqEn as copy } from "../client/src/locales/knowledge-faq";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
const api = vi.hoisted(() => ({
  query: {} as any,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  scope: "10:20:faq",
  input: null as any,
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
        ["getSources", "getFaqs", "getActivityLog", "getHealthScore"].map(k => [
          k,
          { invalidate: api.invalidate },
        ])
      ),
    }),
    sariBrain: {
      faqWorkspace: {
        useQuery: (input: any) => {
          api.input = input;
          return { ...api.query, refetch: api.refresh };
        },
      },
      createFaq: { useMutation: () => ({ mutateAsync: api.create }) },
      updateFaq: { useMutation: () => ({ mutateAsync: api.update }) },
      deleteFaq: { useMutation: () => ({ mutateAsync: api.remove }) },
    },
  },
}));
import { KnowledgeFaqWorkspace } from "../client/src/components/KnowledgeFaqWorkspace";
let root: Root, container: HTMLDivElement;
const row = () => ({
  id: 4,
  question: "Original question",
  answer: "Original answer",
  category: "Shipping",
  isActive: true,
  useInBot: false,
  revision: "a".repeat(64),
  requestId: null,
  pageId: null,
  syncSource: "extracted",
});
beforeEach(() => {
  clearKnowledgeWorkspace();
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("crypto", { randomUUID });
  api.scope = "10:20:faq";
  api.query = {
    data: { items: [row()], total: 1, page: 1, totalPages: 1, canManage: true },
  };
  api.create.mockResolvedValue({ success: true, id: 5 });
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
const render = () =>
  act(async () => root.render(React.createElement(KnowledgeFaqWorkspace)));
const button = (label: string) =>
  Array.from(document.querySelectorAll("button")).find(
    n => n.textContent === label
  )!;
const click = (label: string) =>
  act(async () => {
    expect(button(label)).toBeTruthy();
    button(label).click();
  });
const field = (label: string) => {
  const el = Array.from(document.querySelectorAll("label")).find(
    n => n.childNodes[0]?.textContent === label || n.textContent === label
  )!;
  return (
    el.htmlFor ? document.getElementById(el.htmlFor) : el.querySelector("input")
  ) as HTMLInputElement;
};
const set = (label: string, value: string) =>
  act(async () => {
    const el = field(label);
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const check = (label: string) => act(async () => field(label).click());
const fill = async () => {
  await set(copy.question, "New test question");
  await set(copy.answer, "New synthetic answer");
};
it("separates a read failure from a real empty result and offers reload", async () => {
  api.query = { isError: true };
  await render();
  expect(container.textContent).toContain(copy.loadError);
  expect(container.textContent).not.toContain(copy.empty);
  await click(copy.retry);
  expect(api.refresh).toHaveBeenCalledTimes(1);
  api.query = {
    data: { items: [], total: 0, page: 1, totalPages: 1, canManage: true },
  };
  await render();
  expect(container.textContent).toContain(copy.empty);
});
it("does not expose editing controls to a reader", async () => {
  api.query.data.canManage = false;
  await render();
  expect(container.textContent).toContain(copy.readOnly);
  expect(button(copy.add)).toBeUndefined();
  expect(button(copy.remove)).toBeUndefined();
});
it("rejects whitespace and saves a new question paused by default", async () => {
  await render();
  await click(copy.add);
  await set(copy.question, "   ");
  await set(copy.answer, "Answer");
  await click(copy.saveDraft);
  expect(container.textContent).toContain(copy.invalid);
  expect(api.create).not.toHaveBeenCalled();
  await fill();
  await click(copy.saveDraft);
  expect(api.create).toHaveBeenCalledWith(
    expect.objectContaining({
      question: "New test question",
      answer: "New synthetic answer",
      isActive: true,
      useInBot: false,
      requestId: expect.any(String),
    })
  );
  expect(container.textContent).toContain(copy.saved);
});
it("requires renewed approval when enabling an answer or changing its text", async () => {
  await render();
  await click(copy.add);
  await fill();
  await check(copy.useInBot);
  expect(button(copy.saveActive).disabled).toBe(true);
  await check(copy.approve);
  expect(button(copy.saveActive).disabled).toBe(false);
  await set(copy.answer, "Changed approved answer");
  expect(button(copy.saveActive).disabled).toBe(true);
  await check(copy.approve);
  await click(copy.saveActive);
  expect(api.create.mock.calls[0][0].useInBot).toBe(true);
});
it("blocks duplicate clicks while saving and preserves the frozen input", async () => {
  let resolve!: (v: any) => void;
  api.create.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await click(copy.add);
  await fill();
  await click(copy.saveDraft);
  expect(button(copy.saving).disabled).toBe(true);
  await click(copy.saving);
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(field(copy.answer).disabled).toBe(true);
  await act(async () => resolve({ id: 5 }));
});
it("sends the reviewed revision and keeps a conflicted edit visible", async () => {
  api.update.mockRejectedValue({ data: { code: "CONFLICT" } });
  await render();
  await click(copy.edit);
  await set(copy.answer, "My newer draft");
  await click(copy.saveDraft);
  expect(api.update.mock.calls[0][0]).toMatchObject({
    id: 4,
    expectedRevision: "a".repeat(64),
    answer: "My newer draft",
  });
  expect(container.textContent).toContain(copy.conflict);
  expect(field(copy.answer).value).toBe("My newer draft");
});
it("requires a confirmation before deletion and sends the reviewed revision", async () => {
  await render();
  await click(copy.remove);
  expect(api.remove).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(copy.deleteDescription);
  await click(copy.confirmDelete);
  expect(api.remove).toHaveBeenCalledWith({
    id: 4,
    expectedRevision: "a".repeat(64),
  });
});
it("does not delete when the confirmation is closed", async () => {
  await render();
  await click(copy.remove);
  await click(copy.cancelDelete);
  expect(api.remove).not.toHaveBeenCalled();
});
it("keeps an unknown create locked and retries with identical content and request identity", async () => {
  api.create.mockRejectedValueOnce(Error("Lost response"));
  await render();
  await click(copy.add);
  await fill();
  await click(copy.saveDraft);
  expect(field(copy.answer).disabled).toBe(true);
  expect(container.textContent).toContain(copy.unknown);
  const first = api.create.mock.calls[0][0];
  await click(copy.retrySame);
  expect(api.create.mock.calls[1][0]).toEqual(first);
});
it("restores a scoped in-memory draft without restoring approval", async () => {
  await render();
  await click(copy.add);
  await fill();
  await check(copy.useInBot);
  await check(copy.approve);
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(field(copy.answer).value).toBe("New synthetic answer");
  expect(field(copy.approve).checked).toBe(false);
  api.scope = "10:21:faq";
  await render();
  expect(document.querySelector("[data-faq-editor]")).toBeNull();
  api.scope = "10:20:faq";
  await render();
  expect(field(copy.answer).value).toBe("New synthetic answer");
});
it("protects unsaved changes when closing the editor", async () => {
  await render();
  await click(copy.add);
  await fill();
  await click(copy.cancel);
  expect(document.body.textContent).toContain(copy.discardTitle);
  await click(copy.keep);
  expect(field(copy.answer).value).toBe("New synthetic answer");
  await click(copy.cancel);
  await click(copy.discard);
  expect(document.querySelector("[data-faq-editor]")).toBeNull();
});
it("searches only on submission and preserves the server page for navigation", async () => {
  api.query.data.totalPages = 2;
  await render();
  await set(copy.search, "policy");
  expect(api.input.search).toBe("");
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
  expect(api.input).toMatchObject({ search: "policy", page: 1 });
  await click(copy.next);
  expect(api.input.page).toBe(2);
});

it("shows truthful deletion uncertainty without claiming a draft exists", async () => {
  api.remove.mockRejectedValue(Error("Lost response"));
  await render();
  await click(copy.remove);
  await click(copy.confirmDelete);
  expect(document.body.textContent).toContain(copy.deleteUnknown);
  expect(document.body.textContent).not.toContain(copy.unknown);
});
it("warns that an uncertain save may already exist before discarding its retry reference", async () => {
  api.create.mockRejectedValue(Error("Lost response"));
  await render();
  await click(copy.add);
  await fill();
  await click(copy.saveDraft);
  await click(copy.cancel);
  expect(document.body.textContent).toContain(copy.uncertainDiscard);
  expect(document.body.textContent).not.toContain(copy.discardDescription);
});
