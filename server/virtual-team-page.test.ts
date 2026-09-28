// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
vi.hoisted(async () => {
  Object.assign(globalThis, { React: (await import("react")).default });
});
const m = vi.hoisted(() => ({
  data: [] as any[],
  create: vi.fn(),
  update: vi.fn(),
  preview: vi.fn(),
  callbacks: {} as any,
  pending: false,
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ virtualAgents: { list: { invalidate: vi.fn() } } }),
    ai: { chat: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    virtualAgents: {
      list: { useQuery: () => ({ data: m.data, refetch: vi.fn() }) },
      create: {
        useMutation: (callbacks: any) => {
          m.callbacks = callbacks;
          return { mutate: m.create, isPending: m.pending };
        },
      },
      update: { useMutation: () => ({ mutate: m.update, isPending: false }) },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reorder: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      seedTemplates: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      preview: { useMutation: () => ({ mutateAsync: m.preview }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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
import VirtualTeamPage from "../client/src/pages/merchant/VirtualTeamPage";
let root: Root, container: HTMLDivElement;
async function render() {
  await act(async () => root.render(React.createElement(VirtualTeamPage)));
}
function button(label: string) {
  const scope = document.querySelector('[role="dialog"]') ?? document;
  const result = [...scope.querySelectorAll("button")].find(
    button =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label
  );
  if (!result) throw Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(id: string, value: string) {
  await act(async () => {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    const prototype =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.pending = false;
  m.data = [
    {
      id: 12,
      name: "نورة",
      role: "دعم",
      department: "",
      personalityPrompt: "تعليمات محفوظة",
      tone: "friendly",
      avatarEmoji: "support",
      isActive: 1,
      isDefault: 1,
      sortOrder: 0,
      triggerKeywords: "[]",
      shiftStart: null,
      shiftEnd: null,
    },
  ];
  m.preview.mockResolvedValue({
    response: "رد تجريبي",
    source: "model",
    historyMessageCount: 0,
    historyTruncated: false,
    persona: {
      id: 12,
      name: "نورة",
      role: "دعم",
      isActive: true,
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
describe("rendered virtual team workflow", () => {
  it("shows availability only before AI and opens contextual routing without locally predicting an agent", async () => {
    m.data.push({
      ...m.data[0],
      id: 22,
      name: "محاسب خاص",
      isDefault: 0,
      triggerKeywords: '["محاسب"]',
    });
    await render();
    await fill("routing-message", "لا أريد محاسب");
    await fill("routing-time", "10:00");
    const status = document.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("2");
    expect(status.textContent).not.toContain("محاسب خاص");
    expect(m.preview).not.toHaveBeenCalled();
    await click(ar.personaPreviewUx.testRouting);
    await click(ar.sariPlayground.ask);
    expect(m.preview).toHaveBeenCalledWith({
      mode: "automatic",
      time: "10:00",
      message: "لا أريد محاسب",
      history: [],
      currentAgentId: null,
      historyTruncated: false,
    });
  });
  it("confirms dismissal of edited identity and keeps the draft when editing continues", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await fill("agent-name", "مسودة");
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain(
      ar.personaPreviewUx.discardHint
    );
    await click(ar.personaPreviewUx.keepEditing);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("مسودة");
    await click(ar.testSariPage.closeDialog);
    await click(ar.personaPreviewUx.discard);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("closes an unchanged form directly and validates required fields before a request", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(ar.virtualTeamUx.new);
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(m.create).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll('[aria-invalid="true"]').length
    ).toBeGreaterThanOrEqual(3);
  });
  it("blocks repeated saves and prevents editing or dismissing an in-flight save", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await fill("agent-name", "نورة");
    await fill("agent-role", "دعم");
    await fill("agent-personalityPrompt", "تعليمات");
    await act(async () => {
      const form = document.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(m.create).toHaveBeenCalledTimes(1);
    m.pending = true;
    await render();
    expect(document.querySelector("fieldset[disabled]")).not.toBeNull();
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    m.pending = false;
    await act(async () => {
      m.callbacks.onError();
      m.callbacks.onSettled();
    });
    await render();
    expect(document.body.textContent).toContain(ar.virtualTeamUx.saveFailed);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("نورة");
  });
  it("opens the correct saved persona preview without changing settings", async () => {
    await clickAfterRender(
      ar.personaPreviewUx.testNamed.replace("{{name}}", "نورة")
    );
    await fill("saved-preview-question", "سؤال");
    await click(ar.sariPlayground.ask);
    expect(m.preview).toHaveBeenCalledWith({
      mode: "manual",
      agentId: 12,
      message: "سؤال",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("رد تجريبي");
  });
  it("preserves a pending preview dialog and releases dismissal after its response", async () => {
    let resolve!: (value: any) => void;
    m.preview.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await clickAfterRender(
      ar.personaPreviewUx.testNamed.replace("{{name}}", "نورة")
    );
    await fill("saved-preview-question", "سؤال");
    await click(ar.sariPlayground.ask);
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () =>
      resolve({
        response: "رد",
        source: "model",
        historyMessageCount: 0,
        historyTruncated: false,
      })
    );
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
async function clickAfterRender(label: string) {
  await render();
  await click(label);
}
