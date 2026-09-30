// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import en from "../client/src/locales/en.json";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { dir: () => "ltr" },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const s = (en.brainPreviewUx as any)[key.split(".").at(-1)!] || key;
      return s.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
        String(args[k] ?? "")
      );
    },
  }),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
import { BrainQuickPreviewView } from "../client/src/components/BrainQuickPreview";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
let root: Root, container: HTMLDivElement;
const send = vi.fn();
const c = en.brainPreviewUx;
const render = (scopeKey = "7:20:brain-quick-preview") =>
  act(async () =>
    root.render(
      React.createElement(BrainQuickPreviewView, {
        key: scopeKey,
        scopeKey,
        send,
      })
    )
  );
const editor = () => container.querySelector("textarea")!;
const submit = () =>
  act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const fill = (value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(editor(), value);
    editor().dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clearKnowledgeWorkspace();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  send.mockImplementation(async ({ question }) => ({
    success: true,
    question,
    answer: "Sample answer",
    source: "model",
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearKnowledgeWorkspace();
  vi.unstubAllGlobals();
});
it("labels the field and its limits without promising knowledge or sales accuracy", async () => {
  await render();
  expect(container.querySelector("label")?.htmlFor).toBe(editor().id);
  for (const key of ["scope", "usage", "draft", "independent"])
    expect(container.textContent).toContain((c as any)[key]);
  expect(editor().hasAttribute("maxlength")).toBe(false);
});
it("keeps overlength pasted text and blocks sending; whitespace has an inline error", async () => {
  await render();
  await fill("x".repeat(501));
  await submit();
  expect(editor().value.length).toBe(501);
  expect(editor().getAttribute("aria-invalid")).toBe("true");
  expect(container.textContent).toContain(c.tooLong);
  await fill(" ");
  await submit();
  expect(container.textContent).toContain(c.required);
  expect(send).not.toHaveBeenCalled();
});
it("locks simultaneous submissions and examples while preserving the exact question", async () => {
  let resolve!: (x: any) => void;
  send.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await fill("  First question  ");
  await submit();
  await submit();
  expect(send).toHaveBeenCalledTimes(1);
  expect(editor().disabled).toBe(true);
  expect(editor().value).toBe("  First question  ");
  expect(
    [...container.querySelectorAll("details button")].every(
      b => (b as HTMLButtonElement).disabled
    )
  ).toBe(true);
  await act(async () =>
    resolve({
      success: true,
      question: "First question",
      answer: "Reply",
      source: "model",
    })
  );
  await fill("Second question");
  expect(container.querySelector("section")?.textContent).toContain(
    "First question"
  );
  expect(container.querySelector("section")?.textContent).not.toContain(
    "Second question"
  );
});
it("does not submit IME, held Enter or Shift+Enter; ordinary Enter sends", async () => {
  await render();
  await fill("Hello");
  for (const args of [
    { isComposing: true },
    { repeat: true },
    { shiftKey: true },
    { keyCode: 229 },
  ]) {
    await act(async () =>
      editor().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
          ...args,
        })
      )
    );
  }
  expect(send).not.toHaveBeenCalled();
  await act(async () =>
    editor().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    )
  );
  expect(send).toHaveBeenCalledOnce();
});
it("retains questions across route remounts with actor and tenant isolation, cleared at logout", async () => {
  await render();
  await fill("Private draft");
  await render("7:21:brain-quick-preview");
  expect(editor().value).toBe("");
  await render();
  expect(editor().value).toBe("Private draft");
  await render("8:20:brain-quick-preview");
  expect(editor().value).toBe("");
  clearKnowledgeWorkspace();
  await render();
  expect(editor().value).toBe("");
});
it("displays an explicit uncertain attempt and never resends automatically", async () => {
  send.mockRejectedValue(Error("secret provider failure"));
  await render();
  await fill("Hello");
  await submit();
  expect(container.textContent).toContain(c.failed);
  expect(container.textContent).not.toContain("secret provider");
  expect(editor().value).toBe("Hello");
  expect(send).toHaveBeenCalledOnce();
  expect(container.querySelector("button[type=submit]")?.textContent).toContain(
    c.generateAgain
  );
});
it.each(["FORBIDDEN", "TOO_MANY_REQUESTS"])(
  "explains %s without showing stale answers",
  async code => {
    await render();
    await fill("Hello");
    await submit();
    send.mockRejectedValue({ data: { code } });
    await submit();
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).toContain(
      code === "FORBIDDEN" ? c.forbidden : c.rate
    );
  }
);
it("escapes answers and distinguishes a guardrail message", async () => {
  send.mockImplementation(async ({ question }) => ({
    success: true,
    question,
    answer: "<img src=x onerror=alert(1)>",
    source: "guardrail",
  }));
  await render();
  await fill("Hello");
  await submit();
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain(c.guardrail);
  expect(container.textContent).toContain(c.evidence);
});
it("rejects mismatched or malformed responses instead of presenting them as answers", async () => {
  send.mockResolvedValue({
    success: true,
    question: "other",
    answer: "wrong answer",
    source: "model",
  });
  await render();
  await fill("Hello");
  await submit();
  expect(container.querySelector("section")).toBeNull();
  expect(container.textContent).toContain(c.failed);
});
it("ignores late results from a previous scope", async () => {
  let resolve!: (x: any) => void;
  send.mockImplementation(() => new Promise(r => (resolve = r)));
  await render();
  await fill("Hello");
  await submit();
  await render("7:21:brain-quick-preview");
  await act(async () =>
    resolve({
      success: true,
      question: "Hello",
      answer: "Old store response",
      source: "model",
    })
  );
  expect(container.textContent).not.toContain("Old store response");
  expect(editor().value).toBe("");
});
