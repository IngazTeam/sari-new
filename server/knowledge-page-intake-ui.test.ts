// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { knowledgePageIntakeEn as c } from "../client/src/locales/knowledge-page-intake";
const api = vi.hoisted(() => ({
  prepare: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  invalidate: vi.fn(),
  scope: "10:20:website-intake",
  permission: { data: { canManage: true } } as any,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => c[key.split(".").at(-1) as keyof typeof c] || key,
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(api.scope),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: {
        pageIntakeReceipt: { fetch: api.read },
        invalidate: api.invalidate,
      },
    }),
    sariBrain: {
      pageWorkspace: { useQuery: () => api.permission },
      previewUrl: { useMutation: () => ({ mutateAsync: api.prepare }) },
      savePreviewedPage: { useMutation: () => ({ mutateAsync: api.save }) },
    },
  },
}));
import { KnowledgeWebsiteIntake } from "../client/src/components/KnowledgeWebsiteIntake";
import {
  clearKnowledgeWorkspace,
  readKnowledgeAttempt,
  rememberKnowledgeAttempt,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const id = "00000000-0000-4000-8000-000000000001",
  snapshot = () => ({
    previewId: id,
    url: "https://example.test/review",
    title: "Reviewed page",
    content: "Full text ".repeat(1500) + " END <img src=x onerror=alert(1)>",
    analysis: null,
    wordCount: 3000,
    expiresAt: "2099-01-01T00:00:00Z",
  });
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  clearKnowledgeWorkspace();
  api.scope = "10:20:website-intake";
  api.permission = { data: { canManage: true } };
  api.prepare.mockResolvedValue(snapshot());
  api.save.mockResolvedValue({
    state: "saved",
    pageId: 9,
    sectionId: 10,
    indexing: "ready",
  });
  api.read.mockResolvedValue({ state: "review", preview: snapshot() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () => root.render(React.createElement(KnowledgeWebsiteIntake)));
const body = () => document.body.textContent || "";
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    b => b.textContent === label
  )!;
const click = (label: string) =>
  act(async () => {
    button(label).click();
  });
const fill = async (value: string) =>
  act(async () => {
    const el = document.querySelector<HTMLInputElement>("input[type=url]")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const ack = () =>
  act(async () => {
    document.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  });
const prepare = async () => {
  await render();
  await fill("https://example.test/review");
  await click(c.prepare);
};
it("shows full escaped source text and requires consent, without submitting unseen replacement text", async () => {
  await prepare();
  expect(body()).toContain("END <img");
  expect(document.querySelector("img[src=x]")).toBeNull();
  expect(button(c.save).disabled).toBe(true);
  await ack();
  await click(c.save);
  expect(api.save).toHaveBeenCalledWith({ previewId: id, acknowledged: true });
  expect(body()).toContain(c.saved);
  expect(api.invalidate).toHaveBeenCalledTimes(1);
});
it("does not save on preview, stores only the opaque reference, and resets acknowledgement on reopen", async () => {
  await prepare();
  expect(api.save).not.toHaveBeenCalled();
  expect(readKnowledgeAttempt(api.scope)).toBe(id);
  expect(JSON.stringify({ ...sessionStorage })).not.toContain("Full text");
  await ack();
  await click(c.close);
  await click(c.open);
  expect(button(c.save).disabled).toBe(true);
});
it("restores the server snapshot after refresh with approval unset", async () => {
  rememberKnowledgeAttempt(api.scope, id, knowledgeCacheEpoch());
  await render();
  expect(api.read).toHaveBeenCalledWith({ previewId: id }, { staleTime: 0 });
  await click(c.open);
  expect(button(c.save).disabled).toBe(true);
  expect(api.prepare).not.toHaveBeenCalled();
});
it("resolves a lost success response from the receipt without a second mutation", async () => {
  await prepare();
  api.save.mockRejectedValue(Error("Disconnected"));
  api.read.mockResolvedValue({ state: "saved", pageId: 9, sectionId: 10 });
  await ack();
  await click(c.save);
  expect(body()).toContain(c.saved);
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(button(c.save).disabled).toBe(true);
});
it("keeps an unknown result locked until a read succeeds", async () => {
  await prepare();
  api.save.mockRejectedValue(Error("Disconnected"));
  api.read.mockRejectedValue(Error("Offline"));
  await ack();
  await click(c.save);
  expect(body()).toContain(c.uncertain);
  expect(button(c.save).disabled).toBe(true);
  await click(c.close);
  expect(button(c.another)).toBeUndefined();
  expect(readKnowledgeAttempt(api.scope)).toBe(id);
});
it.each(["changed", "deleted"])(
  "shows %s receipts without recreating knowledge",
  async state => {
    rememberKnowledgeAttempt(api.scope, id, knowledgeCacheEpoch());
    api.read.mockResolvedValue({ state, pageId: 9, sectionId: 10 });
    await render();
    expect(body()).toContain(c[state as "changed"]);
    expect(api.save).not.toHaveBeenCalled();
    await click(c.another);
    expect(readKnowledgeAttempt(api.scope)).toBeNull();
  }
);
it("reports expired previews and does not renew or save automatically", async () => {
  rememberKnowledgeAttempt(api.scope, id, knowledgeCacheEpoch());
  api.read.mockResolvedValue({ state: "expired" });
  await render();
  expect(body()).toContain(c.expired);
  expect(api.prepare).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});
it("blocks writes for viewers and on a permission read error", async () => {
  for (const permission of [
    { data: { canManage: false } },
    { data: { canManage: true }, error: Error("failed") },
  ]) {
    api.permission = permission;
    await render();
    expect(button(c.prepare).disabled).toBe(true);
  }
  expect(api.prepare).not.toHaveBeenCalled();
});
it("will not save if durable attempt storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("disabled");
  });
  await prepare();
  expect(body()).toContain(c.storage);
  expect(api.save).not.toHaveBeenCalled();
});
it("isolates account switches from an in-flight preview response", async () => {
  let done: (v: any) => void = () => {};
  api.prepare.mockReturnValue(new Promise(r => (done = r)));
  await render();
  await fill("https://example.test/review");
  await click(c.prepare);
  api.scope = "11:30:website-intake";
  await render();
  await act(async () => done(snapshot()));
  expect(body()).not.toContain("Reviewed page");
  expect(readKnowledgeAttempt(api.scope)).toBeNull();
  expect(readKnowledgeAttempt("10:20:website-intake")).toBeNull();
});
it("resets consent when rereading and blocks a rapid double save", async () => {
  await prepare();
  await ack();
  await click(c.recover);
  expect(button(c.save).disabled).toBe(true);
  await ack();
  let done: (v: any) => void = () => {};
  api.save.mockReturnValue(new Promise(r => (done = r)));
  await act(async () => {
    button(c.save).click();
    button(c.save).click();
  });
  expect(api.save).toHaveBeenCalledTimes(1);
  await act(async () =>
    done({ state: "saved", pageId: 9, sectionId: 10, indexing: "unconfirmed" })
  );
  expect(body()).toContain(c.indexing);
});
