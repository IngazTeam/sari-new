// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  close: vi.fn(),
  changed: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ keywords: { getById: { fetch: m.fetch } } }),
    keywords: {
      updateStatus: { useMutation: () => ({ mutateAsync: m.save }) },
      delete: { useMutation: () => ({ mutateAsync: m.remove }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string, values?: any) => {
      const value = key.split(".").reduce((o: any, k) => o?.[k], ar) ?? key;
      return typeof value === "string"
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, k: string) => values?.[k] ?? ""
          )
        : value;
    },
  }),
}));
import {
  KeywordReviewDialog,
  keywordSamples,
} from "../client/src/components/merchant/KeywordReviewDialog";
import { toast } from "sonner";
let root: Root, container: HTMLDivElement;
const fixture = () => ({
  id: 1,
  merchantId: 20,
  revision: "a".repeat(64),
  canManage: true,
  keyword: "الشحن <img src=x>",
  category: "shipping",
  frequency: 4,
  status: "new",
  suggestedResponse: "اقتراح طويل للمراجعة",
  sampleMessages: '["السؤال الأول", "<script>alert(1)</script>"]',
  firstSeenAt: "2026-09-01T00:00:00.000Z",
  lastSeenAt: "2026-09-29T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-29T00:00:00.000Z",
  reviewedAt: null,
});
const render = () =>
  act(async () =>
    root.render(
      React.createElement(KeywordReviewDialog, {
        keywordId: 1,
        merchantId: 20,
        onClose: m.close,
        onChanged: m.changed,
      })
    )
  );
const buttons = (label: string) =>
  [...document.querySelectorAll("button")].filter(
    el => el.textContent?.trim() === label
  );
const button = (label: string) => {
  const el = buttons(label).at(-1);
  if (!el) throw Error("Missing " + label);
  return el;
};
const click = (label: string) => act(async () => button(label).click());
const select = (value: string) =>
  act(async () => {
    const el = document.querySelector("select")!;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const toggle = (selector: string) =>
  act(async () => {
    (document.querySelector(selector) as HTMLInputElement).click();
  });
const fail = (code: string) => ({ data: { code } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.fetch.mockResolvedValue(fixture());
  m.save.mockImplementation(async input => ({
    success: true,
    row: { ...fixture(), revision: "b".repeat(64), status: input.status },
  }));
  m.remove.mockResolvedValue({ success: true, deleted: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("keyword review dialog", () => {
  it("reads a fresh scoped record and renders full escaped suggestions and message samples", async () => {
    await render();
    expect(m.fetch).toHaveBeenCalledWith({ keywordId: 1 }, { staleTime: 0 });
    expect(document.body.textContent).toContain("السؤال الأول");
    expect(document.body.textContent).toContain("<script>alert(1)</script>");
    expect(document.querySelector("img,script")).toBeNull();
    expect(button(ar.keywordReview.save).disabled).toBe(true);
  });
  it("saves exactly the reviewed revision and updates the visible saved status", async () => {
    await render();
    await select("reviewed");
    await click(ar.keywordReview.save);
    expect(m.save).toHaveBeenCalledWith({
      keywordId: 1,
      expectedRevision: "a".repeat(64),
      status: "reviewed",
    });
    expect(m.changed).toHaveBeenCalledOnce();
    expect(button(ar.keywordReview.save).disabled).toBe(true);
    expect(toast.success).toHaveBeenCalledWith(ar.keywordReview.saved);
  });
  it("holds unsaved selection on close and supports returning or explicitly discarding it", async () => {
    await render();
    await select("ignored");
    await click(ar.common.close);
    expect(m.close).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(ar.keywordReview.unsaved);
    await click(ar.keywordReview.keepEditing);
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe(
      "ignored"
    );
    await click(ar.common.close);
    await click(ar.keywordReview.discard);
    expect(m.close).toHaveBeenCalledOnce();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("reviews divergent status without writing and requires a separate save", async () => {
    m.save.mockRejectedValueOnce(fail("CONFLICT"));
    await render();
    await select("reviewed");
    await click(ar.keywordReview.save);
    expect(button(ar.keywordReview.save).disabled).toBe(true);
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe(
      "reviewed"
    );
    m.fetch.mockResolvedValue({
      ...fixture(),
      revision: "c".repeat(64),
      status: "ignored",
      suggestedResponse: "نسخة اقتراح جديدة",
      frequency: 7,
    });
    await click(ar.keywordReview.loadLatest);
    expect(document.body.textContent).toContain("نسخة اقتراح جديدة");
    expect(button(ar.keywordReview.acceptLatest).disabled).toBe(true);
    await toggle("input[type=radio][value=mine]");
    await click(ar.keywordReview.acceptLatest);
    expect(m.save).toHaveBeenCalledTimes(1);
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe(
      "reviewed"
    );
    await click(ar.keywordReview.save);
    expect(m.save).toHaveBeenLastCalledWith({
      keywordId: 1,
      expectedRevision: "c".repeat(64),
      status: "reviewed",
    });
  });
  it("adopts the current status if the user made no status change", async () => {
    await render();
    await click(ar.keywordReview.deleteAction);
    await toggle("input[type=checkbox]");
    m.remove.mockRejectedValueOnce(fail("CONFLICT"));
    await click(ar.keywordReview.deleteAction);
    m.fetch.mockResolvedValue({
      ...fixture(),
      status: "ignored",
      revision: "c".repeat(64),
    });
    await click(ar.keywordReview.loadLatest);
    await click(ar.keywordReview.acceptLatest);
    expect((document.querySelector("select") as HTMLSelectElement).value).toBe(
      "ignored"
    );
    expect(
      (document.querySelector("input[type=checkbox]") as HTMLInputElement)
        .checked
    ).toBe(false);
    expect(button(ar.keywordReview.deleteAction).disabled).toBe(true);
    await toggle("input[type=checkbox]");
    await click(ar.keywordReview.deleteAction);
    expect(m.remove).toHaveBeenLastCalledWith({
      keywordId: 1,
      expectedRevision: "c".repeat(64),
      reviewed: true,
    });
    expect(m.close).toHaveBeenCalledOnce();
  });
  it("cancels deletion without any write and does not delete without the checkbox", async () => {
    await render();
    await click(ar.keywordReview.deleteAction);
    expect(document.body.textContent).toContain(ar.keywordReview.deleteHelp);
    expect(button(ar.keywordReview.deleteAction).disabled).toBe(true);
    await click(ar.keywordReview.deleteAction);
    expect(m.remove).not.toHaveBeenCalled();
    await click(ar.keywordReview.cancelDelete);
    expect(document.querySelector("input[type=checkbox]")).toBeNull();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("does not accept an unsuccessful reload or revive a deleted record", async () => {
    m.save.mockRejectedValueOnce(fail("CONFLICT"));
    await render();
    await select("reviewed");
    await click(ar.keywordReview.save);
    m.fetch.mockRejectedValueOnce(Error("network"));
    await click(ar.keywordReview.loadLatest);
    expect(document.body.textContent).toContain(ar.keywordReview.readFailed);
    expect(button(ar.keywordReview.save).disabled).toBe(true);
    expect(buttons(ar.keywordReview.acceptLatest)).toHaveLength(0);
    m.fetch.mockRejectedValueOnce(fail("NOT_FOUND"));
    await click(ar.keywordReview.loadLatest);
    expect(document.body.textContent).toContain(ar.keywordReview.missing);
    expect(buttons(ar.keywordReview.save)).toHaveLength(0);
    expect(buttons(ar.keywordReview.deleteAction)).toHaveLength(0);
  });
  it.each([{ merchantId: 21 }, { id: 9 }])(
    "rejects a mismatched record %j before rendering or saving",
    async patch => {
      m.fetch.mockResolvedValue({ ...fixture(), ...patch });
      await render();
      expect(document.body.textContent).toContain(ar.keywordReview.readFailed);
      expect(document.body.textContent).not.toContain(
        fixture().suggestedResponse
      );
      expect(buttons(ar.keywordReview.save)).toHaveLength(0);
      expect(m.save).not.toHaveBeenCalled();
    }
  );
  it("removes management actions when permission is lost in the current version", async () => {
    await render();
    await select("reviewed");
    m.save.mockRejectedValueOnce(fail("FORBIDDEN"));
    await click(ar.keywordReview.save);
    m.fetch.mockResolvedValue({ ...fixture(), canManage: false });
    await click(ar.keywordReview.loadLatest);
    await click(ar.keywordReview.acceptLatest);
    expect(document.body.textContent).toContain(ar.keywordReview.readOnly);
    expect(document.querySelector("select")).toBeNull();
    expect(buttons(ar.keywordReview.save)).toHaveLength(0);
  });
  it("allows closing during a slow initial read and ignores completion after unmount", async () => {
    let resolve!: (value: any) => void;
    m.fetch.mockImplementation(() => new Promise(r => (resolve = r)));
    await render();
    await click(ar.common.close);
    expect(m.close).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => resolve(fixture()));
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("locks duplicate saves and closing during the write until it is confirmed", async () => {
    let resolve!: (value: any) => void;
    m.save.mockImplementation(() => new Promise(r => (resolve = r)));
    await render();
    await select("reviewed");
    await click(ar.keywordReview.save);
    await click(ar.keywordReview.save);
    await click(ar.common.close);
    expect(m.save).toHaveBeenCalledOnce();
    expect(m.close).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    await act(async () =>
      resolve({
        success: true,
        row: { ...fixture(), status: "reviewed", revision: "b".repeat(64) },
      })
    );
    expect(button(ar.common.close).disabled).toBe(false);
    expect(toast.success).toHaveBeenCalledOnce();
  });
});
describe("legacy keyword samples", () => {
  it("preserves plain, malformed, or structured legacy text without executing or silently discarding it", () => {
    for (const value of [
      "plain message",
      "[invalid",
      '{"body":"text"}',
      '[1,"text"]',
    ])
      expect(keywordSamples(value)).toEqual([value]);
    expect(keywordSamples('["first","second"]')).toEqual(["first", "second"]);
    expect(keywordSamples(null)).toEqual([]);
  });
});
