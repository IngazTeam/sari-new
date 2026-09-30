// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  scope: "7:20:quick-preview",
}));
vi.mock("../client/src/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(mocks.scope),
}));
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
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
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
  mocks.scope = "7:20:quick-preview";
  clearKnowledgeWorkspace();
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
  clearKnowledgeWorkspace();
  vi.unstubAllGlobals();
});
describe("rendered quick assistant preview", () => {
  it("has a labelled bounded editor, independent-scope notice and safe rendered responses", async () => {
    await render();
    expect(container.querySelector("label")?.htmlFor).toBe(
      container.querySelector("textarea")!.id
    );
    expect(container.querySelector("textarea")!.hasAttribute("maxlength")).toBe(
      false
    );
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
    expect(container.querySelector("textarea")!.value).toBe("saved question");
    expect(container.textContent).toContain(ar.playgroundRepairUx.uncertain);
    await click(ar.playgroundRepairUx.newAttempt);
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
      { key: "Enter", repeat: true },
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
  it("retains oversized pasted text and presents an inline error without submitting", async () => {
    await render();
    await fill("x".repeat(2001));
    expect(container.querySelector("textarea")!.value.length).toBe(2001);
    expect(
      container.querySelector("textarea")!.getAttribute("aria-invalid")
    ).toBe("true");
    expect(container.textContent).toContain(ar.playgroundRepairUx.tooLong);
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not overwrite a typed question with an example", async () => {
    await render();
    await fill("draft");
    await click(ar.sariPlayground.productsExample);
    expect(container.querySelector("textarea")!.value).toBe("draft");
  });
  it("restores drafts by verified scope and ignores the late reply from a different store", async () => {
    let resolve!: (value: typeof reply) => void;
    mocks.send.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await render();
    await fill("Store A question");
    await click(ar.sariPlayground.ask);
    mocks.scope = "7:21:quick-preview";
    await render();
    await act(async () => resolve(reply));
    expect(container.textContent).not.toContain(reply.response);
    expect(container.querySelector("textarea")!.value).toBe("");
    mocks.scope = "7:20:quick-preview";
    await render();
    expect(container.querySelector("textarea")!.value).toBe("Store A question");
    mocks.scope = "8:20:quick-preview";
    await render();
    expect(container.querySelector("textarea")!.value).toBe("");
    clearKnowledgeWorkspace();
    mocks.scope = "7:20:quick-preview";
    await render();
    expect(container.querySelector("textarea")!.value).toBe("");
  });
  it("validates provider result shape and retains the original question", async () => {
    mocks.send.mockResolvedValue({ response: "fake", source: "unrecognized" });
    await render();
    await fill("Original");
    await click(ar.sariPlayground.ask);
    expect(container.textContent).toContain(ar.playgroundRepairUx.uncertain);
    expect(container.textContent).not.toContain("fake");
    expect(container.querySelector("textarea")!.value).toBe("Original");
  });
  it("distinguishes rate limits and only retries on an explicit new attempt", async () => {
    mocks.send.mockRejectedValueOnce({ data: { code: "TOO_MANY_REQUESTS" } });
    await render();
    await fill("Question");
    await click(ar.sariPlayground.ask);
    expect(container.textContent).toContain(ar.playgroundRepairUx.rate);
    expect(mocks.send).toHaveBeenCalledOnce();
    await click(ar.playgroundRepairUx.newAttempt);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
