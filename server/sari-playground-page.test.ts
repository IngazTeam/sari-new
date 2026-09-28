// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { ai: { chat: { useMutation: () => ({ mutateAsync: mocks.send }) } } },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { dir: () => "rtl" },
    t: (key: string, values?: any) => {
      const value =
        key.split(".").reduce((value: any, part) => value?.[part], ar) ?? key;
      return values ? value.replace("{{count}}", values.count) : value;
    },
  }),
}));
import SariPlayground from "../client/src/pages/SariPlayground";
let root: Root, container: HTMLDivElement;
const reply = {
  response: "<script>alert(1)</script> جواب",
  source: "model",
  historyMessageCount: 0,
  historyTruncated: false,
};
async function render() {
  await act(async () => root.render(React.createElement(SariPlayground)));
}
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    b => b.textContent === label
  );
  if (!button) throw Error(`Missing button: ${label}`);
  await act(async () => button.click());
}
async function fill(text: string) {
  await act(async () => {
    const editor = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(editor, text);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.send.mockResolvedValue(reply);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("rendered quick assistant preview", () => {
  it("has a labelled bounded editor, independent-scope notice and safe rendered responses", async () => {
    await render();
    expect(container.querySelector("label")?.htmlFor).toBe(
      container.querySelector("textarea")!.id
    );
    expect(container.querySelector("textarea")!.maxLength).toBe(2000);
    expect(container.textContent).toContain(ar.sariPlayground.independent);
    await fill("سؤال");
    await click(ar.sariPlayground.ask);
    expect(mocks.send).toHaveBeenCalledWith({ message: "سؤال" });
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain(reply.response);
    expect(
      [...container.querySelectorAll("dd")].map(el => el.textContent)
    ).toEqual(["1", "1", "2"]);
  });
  it("locks duplicate sends, reset and examples until the pending response settles", async () => {
    let resolve!: (value: typeof reply) => void;
    mocks.send.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await render();
    await fill("pending");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(
      [...container.querySelectorAll("button")].every(b => b.disabled)
    ).toBe(true);
    await act(async () => resolve(reply));
    expect(container.textContent).toContain(reply.response);
  });
  it("keeps a failed question, retries it once without duplicate cards and hides raw provider errors", async () => {
    mocks.send.mockRejectedValueOnce(new Error("secret vendor failure"));
    await render();
    await fill("saved question");
    await click(ar.sariPlayground.ask);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain("secret vendor failure");
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    await click(ar.testSariPage.retry);
    expect(mocks.send.mock.calls.map(c => c[0])).toEqual([
      { message: "saved question" },
      { message: "saved question" },
    ]);
    expect(container.querySelectorAll("section > div")).toHaveLength(1);
    expect(
      [...container.querySelectorAll("dd")].map(el => el.textContent)
    ).toEqual(["1", "1", "2"]);
  });
  it("requires explicit confirmation to clear replies and draft", async () => {
    await render();
    await fill("draft");
    await click(ar.sariPlayground.clear);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click(ar.testSariPage.cancel);
    expect(container.querySelector("textarea")!.value).toBe("draft");
    await click(ar.sariPlayground.clear);
    const confirm = [
      ...document.querySelectorAll('[role="dialog"] button'),
    ].find(b => b.textContent === ar.sariPlayground.clear)!;
    await act(async () => (confirm as HTMLButtonElement).click());
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("does not send during IME composition or Shift+Enter", async () => {
    await render();
    await fill("composing");
    const editor = container.querySelector("textarea")!;
    for (const init of [
      { key: "Enter", isComposing: true },
      { key: "Enter", shiftKey: true },
      { key: "Enter", keyCode: 229 },
    ])
      await act(async () => {
        editor.dispatchEvent(
          new KeyboardEvent("keydown", {
            ...init,
            bubbles: true,
            cancelable: true,
          })
        );
      });
    expect(mocks.send).not.toHaveBeenCalled();
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("labels guardrail responses and disables retry on missing permissions", async () => {
    mocks.send.mockResolvedValueOnce({ ...reply, source: "guardrail" });
    await render();
    await fill("first");
    await click(ar.sariPlayground.ask);
    expect(container.textContent).toContain(ar.testSariPage.guardrailSource);
    mocks.send.mockRejectedValueOnce({ data: { code: "FORBIDDEN" } });
    await fill("second");
    await click(ar.sariPlayground.ask);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      ar.testSariPage.accessDenied
    );
    expect(container.querySelector('[role="alert"] button')).toBeNull();
  });
});
