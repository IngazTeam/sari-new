// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  send: vi.fn(),
  deal: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    testSari: Object.fromEntries(
      Object.entries({
        createConversation: mocks.create,
        saveMessage: mocks.save,
        sendMessage: mocks.send,
        markAsDeal: mocks.deal,
      }).map(([key, fn]) => [
        key,
        { useMutation: () => ({ mutateAsync: fn, isPending: false }) },
      ])
    ),
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce((value: any, part) => value?.[part], ar) ?? key,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import TestSari from "../client/src/pages/merchant/TestSari";
import PreviewChat from "../client/src/components/PreviewChat";
let container: HTMLDivElement, root: Root;
const flush = () =>
  act(async () => {
    await new Promise(done => setTimeout(done, 0));
  });
function button(text: string) {
  const result = Array.from(document.querySelectorAll("button")).find(
    el => el.textContent?.trim() === text
  );
  if (!result) throw Error(`Button missing: ${text}`);
  return result;
}
async function click(el: HTMLElement) {
  await act(async () => el.click());
  await flush();
}
async function fill(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  mocks.create.mockResolvedValue({ conversationId: 41 });
  mocks.save.mockResolvedValue({ messageId: 1 });
  mocks.send.mockResolvedValue({
    response: "<script>alert(1)</script> رد الاختبار",
  });
  mocks.deal.mockResolvedValue({ dealId: 2, dealValue: 149.5 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function renderPage() {
  await act(async () => root.render(React.createElement(TestSari)));
  await flush();
}
async function send() {
  const input = container.querySelector("input")!;
  await fill(input, "رسالة تجريبية");
  await click(
    container.querySelector(
      'button[aria-label="merchantUx.actions.sendMessage"]'
    )!
  );
}
describe("rendered production test workspace", () => {
  it("waits for a real session and keeps the deal action disabled before a reply", async () => {
    let resolve!: (value: { conversationId: number }) => void;
    mocks.create.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await renderPage();
    expect(container.querySelector("input")!.disabled).toBe(true);
    expect(button(ar.testSariPage.dealButton).disabled).toBe(true);
    await act(async () => resolve({ conversationId: 41 }));
    expect(container.querySelector("input")!.disabled).toBe(false);
  });
  it("renders reply content as text and retries failed persistence without regenerating it", async () => {
    await renderPage();
    mocks.save
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("lost acknowledgement"));
    await send();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain(ar.testSariPage.messageSaveFailed);
    await click(button(ar.testSariPage.retry));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(
      ar.testSariPage.messageSaveFailed
    );
  });
  it("shows an amount field error and keeps failed deal registration visibly unconfirmed", async () => {
    await renderPage();
    await send();
    await click(button(ar.testSariPage.dealButton));
    await click(button(ar.testSariPage.confirm));
    const input = document.getElementById("dealValue") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(mocks.deal).not.toHaveBeenCalled();
    await fill(input, "149.50");
    mocks.deal.mockRejectedValueOnce(new Error("lost ack"));
    await click(button(ar.testSariPage.confirm));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).not.toContain(ar.testSariPage.dealDone);
    await click(
      Array.from(document.querySelectorAll('[role="dialog"] button')).find(
        el => el.textContent === ar.testSariPage.retry
      ) as HTMLElement
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain(ar.testSariPage.dealDone);
  });
  it("keeps the onboarding visual preview local and labels the fixed greeting truthfully", async () => {
    await act(async () =>
      root.render(React.createElement(PreviewChat, { useAI: false }))
    );
    await flush();
    await click(button("وش عندكم؟"));
    expect(container.textContent).toContain(ar.previewChat.localPreview);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    await click(
      container.querySelector(
        'button[aria-label="' + ar.testSariPage.reset + '"]'
      )!
    );
    expect(container.querySelectorAll(".whitespace-pre-wrap")).toHaveLength(1);
  });
});
