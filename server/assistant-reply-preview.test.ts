// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({ quick: vi.fn(), persona: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    ai: { chat: { useMutation: () => ({ mutateAsync: m.quick }) } },
    virtualAgents: {
      preview: { useMutation: () => ({ mutateAsync: m.persona }) },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: any) => {
      const value =
        key.split(".").reduce((value: any, part) => value?.[part], ar) ?? key;
      return value.replace(
        /\{\{(\w+)\}\}/g,
        (_: string, name: string) => values?.[name] ?? ""
      );
    },
  }),
}));
import {
  AssistantReplyPreview,
  type PreviewSelection,
} from "../client/src/components/merchant/AssistantReplyPreview";
let root: Root, container: HTMLDivElement;
const reply = {
  response: "<script>alert(1)</script> جواب",
  source: "model",
  historyMessageCount: 0,
  historyTruncated: false,
};
const busy = vi.fn();
async function render(
  selection: PreviewSelection = { mode: "store" },
  enabled = true,
  key = "scope-1"
) {
  await act(async () =>
    root.render(
      React.createElement(AssistantReplyPreview, {
        key,
        enabled,
        selection,
        onBusyChange: busy,
      })
    )
  );
}
async function fill(value: string) {
  await act(async () => {
    const editor = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(editor, value);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function send() {
  await act(async () => container.querySelector("button")!.click());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.quick.mockResolvedValue(reply);
  m.persona.mockResolvedValue({
    ...reply,
    persona: {
      id: 12,
      name: "نورة",
      role: "دعم",
      isActive: false,
      reason: "manual",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("embedded saved-settings preview", () => {
  it("does not expose test controls or call the model when management permission is absent", async () => {
    await render({ mode: "store" }, false);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain(ar.testSariPage.accessDenied);
    expect(m.quick).not.toHaveBeenCalled();
  });
  it("ignores an old store's late response and busy callback after the scope changes", async () => {
    let resolve!: (value: typeof reply) => void;
    m.quick.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    await render();
    await fill("old scope");
    await send();
    await render({ mode: "store" }, true, "scope-2");
    await fill("new scope");
    const calls = busy.mock.calls.length;
    await act(async () => resolve(reply));
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("textarea")!.value).toBe("new scope");
    expect(busy).toHaveBeenCalledTimes(calls);
  });
  it("hides a pending result after permission is withdrawn", async () => {
    let resolve!: (value: typeof reply) => void;
    m.quick.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    await render();
    await fill("question");
    await send();
    await render({ mode: "store" }, false);
    await act(async () => resolve(reply));
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).toContain(ar.testSariPage.accessDenied);
  });
  it("discloses that older dialogue has left the bounded context", async () => {
    await render({ mode: "automatic", time: "10:00" });
    for (let i = 0; i < 11; i++) {
      await fill(`question ${i}`);
      await send();
    }
    expect(container.textContent).toContain(ar.testSariPage.contextTruncated);
    await fill("next");
    await send();
    expect(m.persona.mock.calls.at(-1)![0]).toMatchObject({
      historyTruncated: true,
    });
    expect(m.persona.mock.calls.at(-1)![0].history).toHaveLength(20);
  });
  it("uses a bounded labelled editor and sends only the current independent question", async () => {
    await render();
    expect(container.querySelector("label")!.htmlFor).toBe(
      container.querySelector("textarea")!.id
    );
    expect(container.querySelector("textarea")!.maxLength).toBe(2000);
    expect(container.textContent).toContain(ar.personaPreviewUx.independent);
    await fill("  سؤال  ");
    await send();
    expect(m.quick).toHaveBeenCalledWith({ message: "سؤال" });
    expect(m.persona).not.toHaveBeenCalled();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain(reply.response);
    await fill("سؤال جديد");
    expect(container.querySelector("section")!.textContent).toContain("سؤال");
    expect(container.querySelector("section")!.textContent).not.toContain(
      "سؤال جديد"
    );
  });
  it("shows the actual returned persona and paused/manual scope", async () => {
    await render({ mode: "manual", agentId: 12 });
    await fill("سؤال");
    await send();
    expect(m.persona).toHaveBeenCalledWith({
      mode: "manual",
      agentId: 12,
      message: "سؤال",
    });
    expect(m.quick).not.toHaveBeenCalled();
    expect(container.textContent).toContain("نورة · دعم");
    expect(container.textContent).toContain(ar.personaPreviewUx.paused);
    expect(container.textContent).toContain(ar.personaPreviewUx.manual);
  });
  it("passes the chosen Riyadh time without a client-selected agent for automatic routing", async () => {
    await render({ mode: "automatic", time: "22:30" });
    await fill("help");
    await send();
    expect(m.persona).toHaveBeenCalledWith({
      mode: "automatic",
      time: "22:30",
      message: "help",
      history: [],
      currentAgentId: null,
      historyTruncated: false,
    });
    expect(container.textContent).toContain("22:30");
  });
  it("continues automatic dialogue with both speakers and resets its local identity and history", async () => {
    m.persona.mockResolvedValue({
      ...reply,
      response: "ما خبرة الفريق؟",
      persona: {
        id: 42,
        name: "نورة",
        role: "تدريب",
        isActive: true,
        reason: "context",
      },
    });
    await render({ mode: "automatic", time: "10:00" });
    expect(container.textContent).toContain(ar.personaPreviewUx.contextual);
    await fill("قارن لي الدورات");
    await send();
    expect(container.querySelector("textarea")!.value).toBe("");
    expect(container.textContent).toContain(ar.personaPreviewUx.matchContext);
    await fill("مبتدئون");
    await send();
    expect(m.persona.mock.calls[1][0]).toMatchObject({
      message: "مبتدئون",
      currentAgentId: 42,
      history: [
        { role: "user", content: "قارن لي الدورات" },
        { role: "assistant", content: "ما خبرة الفريق؟" },
      ],
    });
    expect(container.querySelector("details")!.textContent).toContain(
      "قارن لي الدورات"
    );
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find(b => b.textContent === ar.personaPreviewUx.reset)!
        .click()
    );
    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    await fill("تجربة ثانية");
    await send();
    expect(m.persona.mock.calls[2][0]).toMatchObject({
      history: [],
      currentAgentId: null,
      historyTruncated: false,
    });
  });
  it("does not append failed automatic requests to the next context and keeps previous dialogue visible", async () => {
    await render({ mode: "automatic", time: "10:00" });
    await fill("سؤال أول");
    await send();
    m.persona.mockRejectedValueOnce(Error("provider unavailable"));
    await fill("سؤال فشل");
    await send();
    expect(container.querySelector("details")!.textContent).toContain(
      "سؤال أول"
    );
    expect(container.querySelector("textarea")!.value).toBe("سؤال فشل");
    await send();
    expect(m.persona.mock.calls[2][0].history).toEqual(
      m.persona.mock.calls[1][0].history
    );
    expect(m.persona.mock.calls[2][0].history).toHaveLength(2);
  });
  it("locks synchronous duplicate clicks until completion and informs the containing dialog", async () => {
    let resolve!: (value: typeof reply) => void;
    m.quick.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await render();
    await fill("pending");
    await act(async () => {
      container.querySelector("button")!.click();
      container.querySelector("button")!.click();
    });
    expect(m.quick).toHaveBeenCalledTimes(1);
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(busy).toHaveBeenLastCalledWith(true);
    await act(async () => resolve(reply));
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(container.querySelector("textarea")!.disabled).toBe(false);
  });
  it("preserves a failed question and retries without exposing provider details or inventing a result", async () => {
    m.quick.mockRejectedValueOnce(new Error("private provider error"));
    await render();
    await fill("retry me");
    await send();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.querySelector("section")).toBeNull();
    expect(container.textContent).not.toContain("private provider error");
    expect(container.querySelector("textarea")!.value).toBe("retry me");
    await send();
    expect(m.quick.mock.calls.map(c => c[0])).toEqual([
      { message: "retry me" },
      { message: "retry me" },
    ]);
    expect(container.querySelectorAll("section")).toHaveLength(1);
  });
  it.each([
    ["FORBIDDEN", "testSariPage", "accessDenied"],
    ["NOT_FOUND", "personaPreviewUx", "missing"],
    ["PRECONDITION_FAILED", "personaPreviewUx", "unavailable"],
    ["TOO_MANY_REQUESTS", "personaPreviewUx", "rateLimit"],
  ])("explains %s without a fake answer", async (code, group, key) => {
    m.quick.mockRejectedValueOnce({ data: { code } });
    await render();
    await fill("hello");
    await send();
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      (ar as any)[group][key]
    );
    expect(container.querySelector("section")).toBeNull();
  });
  it("does not submit while composing text or inserting a newline", async () => {
    await render();
    await fill("compose");
    for (const init of [
      { isComposing: true },
      { keyCode: 229 },
      { shiftKey: true },
    ])
      await act(async () => {
        container.querySelector("textarea")!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            ...init,
            bubbles: true,
            cancelable: true,
          })
        );
      });
    expect(m.quick).not.toHaveBeenCalled();
    await act(async () => {
      container.querySelector("textarea")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(m.quick).toHaveBeenCalledTimes(1);
  });
});
