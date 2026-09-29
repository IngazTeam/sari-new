// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { websiteImportEn as c } from "../client/src/locales/website-import";
const api = vi.hoisted(() => ({
  access: {} as any,
  prepare: vi.fn(),
  read: vi.fn(),
  apply: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  scope: "1:2",
  prior: null as string | null,
  remember: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => c[key.split(".").at(-1) as keyof typeof c] || key,
  }),
}));
vi.mock("@/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(api.scope),
}));
vi.mock("@/lib/knowledge-workspace-cache", () => ({
  knowledgeCacheEpoch: () => 0,
  readKnowledgeAttempt: () => api.prior,
  rememberKnowledgeAttempt: api.remember,
  forgetKnowledgeAttempt: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      analysis: {
        importReview: { fetch: api.read },
        invalidate: api.invalidate,
      },
      sariBrain: { invalidate: api.invalidate },
      products: { invalidate: api.invalidate },
    }),
    analysis: {
      importAccess: { useQuery: () => api.access },
      previewImport: { useMutation: () => ({ mutateAsync: api.prepare }) },
      applyImport: { useMutation: () => ({ mutateAsync: api.apply }) },
      refreshImport: { useMutation: () => ({ mutateAsync: api.refresh }) },
    },
  },
}));
import { WebsiteImportWorkspace } from "../client/src/components/WebsiteImportWorkspace";
const id = "80e769f2-364c-4846-aac7-de847d6377d6";
const saved = () => ({
  state: "review",
  review: {
    previewId: id,
    revision: "a".repeat(64),
    expiresAt: "2026-10-01",
    warnings: [],
    proposal: {
      websiteUrl: "https://example.test",
      products: [
        {
          name: "Proposal",
          price: 0,
          currency: "SAR",
          description: "<img src=x onerror=alert(1)> FULL END",
        },
      ],
      pages: [],
      faqs: [],
      contactInfo: { phones: ["555"] },
    },
    current: {
      merchant: { phone: "444" },
      products: [
        { name: "Old", price: 1050, priceUnit: "minor", currency: "SAR" },
      ],
      variants: [],
      pages: [],
      faqs: [],
      sections: [],
    },
  },
});
let root: Root, host: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(WebsiteImportWorkspace)));
const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find(
    x => x.textContent === name
  )!;
const click = (name: string) => act(async () => button(name).click());
const check = (text: string) =>
  act(async () => {
    const label = Array.from(document.querySelectorAll("label")).find(x =>
      x.textContent?.includes(text)
    )!;
    label.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
  });
const choose = () =>
  act(async () => {
    const el = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Products"]'
    )!;
    el.value = "merge";
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const body = () => document.body.textContent || "";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.access = { data: { canManage: true } };
  api.prior = id;
  api.scope = "1:2";
  api.read.mockResolvedValue(saved());
  api.refresh.mockResolvedValue(saved());
  api.apply.mockResolvedValue({
    state: "applied",
    receipt: {
      savedProducts: 1,
      savedPages: 0,
      savedFaqs: 0,
      pausedSections: 0,
      appliedAt: "2026-09-29",
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("restores only the preview ID, without agreement or a write", async () => {
  await render();
  expect(api.read).toHaveBeenCalledWith({ previewId: id }, { staleTime: 0 });
  expect(api.apply).not.toHaveBeenCalled();
  expect(button(c.save).disabled).toBe(true);
  expect(body()).toContain("FULL END");
  expect(body()).toContain("10.5");
  expect(document.querySelector("img")).toBeNull();
});
it("sends only the saved identity/revision and reviewed choices", async () => {
  await render();
  await choose();
  await check(c.ack);
  await click(c.save);
  expect(api.apply).toHaveBeenCalledWith({
    previewId: id,
    expectedRevision: "a".repeat(64),
    choices: {
      productsAction: "merge",
      pagesAction: "skip",
      faqsAction: "skip",
      applyContactInfo: false,
    },
    acknowledged: true,
  });
  expect(body()).toContain(c.saved);
});
it("clears approval when a choice changes", async () => {
  await render();
  await check(c.ack);
  await choose();
  expect(button(c.save).disabled).toBe(true);
});
it("blocks uncertain saves until a read or refreshed review and new agreement", async () => {
  api.apply.mockRejectedValue({ data: { code: "CONFLICT" } });
  await render();
  await choose();
  await check(c.ack);
  await click(c.save);
  expect(body()).toContain(c.conflict);
  expect(button(c.save).disabled).toBe(true);
  await click(c.refresh);
  expect(api.refresh).toHaveBeenCalledWith({ previewId: id });
  expect(button(c.save).disabled).toBe(true);
});
it("does not report missing results when their receipt cannot be read", async () => {
  api.read.mockRejectedValue(Error("offline"));
  await render();
  expect(body()).toContain(c.error);
  expect(body()).not.toContain(c.expired);
  expect(api.apply).not.toHaveBeenCalled();
});
it("shows an already changed receipt without a reapply control", async () => {
  api.read.mockResolvedValue({
    state: "changed",
    receipt: {
      savedProducts: 1,
      savedPages: 0,
      savedFaqs: 0,
      pausedSections: 0,
    },
  });
  await render();
  expect(body()).toContain(c.changed);
  expect(button(c.save)).toBeUndefined();
});
it.each(["expired", "not_found"])(
  "handles %s without a save button",
  async state => {
    api.read.mockResolvedValue({ state });
    await render();
    expect(body()).toContain(c.expired);
    expect(button(c.save)).toBeUndefined();
  }
);
it("blocks writes when permissions fail even with cached allowed data", async () => {
  api.access = { data: { canManage: true }, error: Error("offline") };
  await render();
  expect(body()).toContain(c.permissionError);
  expect(button(c.save).disabled).toBe(true);
});
it("resets the preview and agreement when switching stores", async () => {
  await render();
  await choose();
  await check(c.ack);
  api.scope = "1:3";
  api.prior = null;
  await render();
  expect(body()).not.toContain("FULL END");
  expect(api.apply).not.toHaveBeenCalled();
  expect(button(c.extract).disabled).toBe(true);
});
it("does not auto-extract a site while opening the page", async () => {
  api.prior = null;
  await render();
  expect(api.prepare).not.toHaveBeenCalled();
  expect(button(c.extract).disabled).toBe(true);
});
