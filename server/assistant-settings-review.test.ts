// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
import { parseWorkingDays, toggleWorkingDay } from "../shared/bot-working-days";
const m = vi.hoisted(() => ({
  settings: {} as any,
  update: vi.fn(),
  send: vi.fn(),
  callbacks: {} as any,
  query: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      botSettings: {
        get: { invalidate: vi.fn() },
        shouldRespond: { invalidate: vi.fn() },
      },
    }),
    botSettings: {
      get: { useQuery: () => ({ data: m.settings, isLoading: false }) },
      shouldRespond: { useQuery: () => ({ data: { shouldRespond: true } }) },
      update: {
        useMutation: (callbacks: any) => {
          m.callbacks = callbacks;
          return { mutate: m.update, isPending: false };
        },
      },
      sendTestMessage: {
        useMutation: () => ({ mutate: m.send, isPending: false }),
      },
    },
    ai: { chat: { useMutation: () => ({ mutateAsync: m.query }) } },
    virtualAgents: {
      preview: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));
vi.mock("../client/src/components/CheckoutMarginPolicySettings", () => ({
  CheckoutMarginPolicySettings: () => null,
}));
vi.mock("../client/src/components/DiscountPolicySettings", () => ({
  DiscountPolicySettings: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: any) => {
      const value =
        key.split(".").reduce((value: any, part) => value?.[part], ar) ?? key;
      return typeof value === "string"
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, name: string) => values?.[name] ?? ""
          )
        : value;
    },
  }),
}));
import BotSettings from "../client/src/pages/merchant/BotSettings";
let root: Root, container: HTMLDivElement;
async function render() {
  await act(async () => root.render(React.createElement(BotSettings)));
}
function button(label: string) {
  const result = [...container.querySelectorAll("button")].find(
    button => button.textContent?.trim() === label
  );
  if (!result) throw Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(id: string, value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `#${id}`
    )!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(el, value);
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
  m.settings = {
    autoReplyEnabled: 1,
    workingHoursEnabled: 1,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    workingDays: "",
    welcomeMessage: "saved welcome",
    outOfHoursMessage: "saved away",
    responseDelay: 2,
    maxResponseLength: 200,
    tone: "friendly",
    language: "ar",
    customInstructions: null,
    groupMode: "disabled",
    groupKeywords: "[]",
    groupRedirectMessage: "",
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("assistant settings review", () => {
  it("shows a local field error, selects the schedule section, and preserves the draft without sending invalid endpoints", async () => {
    await render();
    await fill("endTime", "09:00");
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLElement>(
        '[data-assistant-section="schedule"]'
      )!.hidden
    ).toBe(false);
    expect(
      container.querySelector("#endTime")!.getAttribute("aria-invalid")
    ).toBe("true");
    expect(container.querySelector("#endTime-error")!.textContent).toBe(
      ar.assistantSaveUx.differentTimes
    );
    await fill("endTime", "02:00");
    expect(container.querySelector("#endTime-error")).toBeNull();
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ workingHoursEnd: "02:00" })
    );
  });
  it("requires a cleared time to be corrected and keeps errors reachable when scheduling is disabled", async () => {
    await render();
    await fill("startTime", "");
    await act(async () =>
      container.querySelector<HTMLButtonElement>("#workingHours")!.click()
    );
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).not.toHaveBeenCalled();
    expect(container.querySelector("#startTime-error")!.textContent).toBe(
      ar.assistantSaveUx.time
    );
    expect(container.querySelector("#startTime")).not.toBeNull();
  });
  it("explains an empty week and never renders server internals on a failed save", async () => {
    await render();
    expect(container.querySelector("#workingDays-hint")!.textContent).toBe(
      ar.assistantSaveUx.emptyWeek
    );
    await fill("welcomeMessage", "keep my draft");
    await click(ar.botSettingsPage.saveSettings);
    await act(async () => {
      m.callbacks.onError(new Error("SQL password=secret"));
      m.callbacks.onSettled();
    });
    expect(container.textContent).not.toContain("password=secret");
    expect(container.textContent).toContain(ar.assistantSaveUx.failed);
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("keep my draft");
  });
  it("selects a day from an empty schedule without saving NaN and exposes native button state", async () => {
    await render();
    await click(ar.assistantSectionsUx.schedule);
    const monday = button(ar.botSettingsPage.monday);
    expect(monday.getAttribute("aria-pressed")).toBe("false");
    expect(monday.type).toBe("button");
    await click(ar.botSettingsPage.monday);
    expect(monday.getAttribute("aria-pressed")).toBe("true");
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ workingDays: "1" })
    );
    expect(JSON.stringify(m.update.mock.calls[0][0])).not.toContain("NaN");
  });
  it("keeps an intentionally empty working week and cleans malformed legacy values when toggled", () => {
    expect(toggleWorkingDay("1", 1)).toBe("");
    expect(toggleWorkingDay("", 0)).toBe("0");
    expect(toggleWorkingDay("NaN,1,1,9", 2)).toBe("1,2");
    expect(parseWorkingDays("1,,2,NaN")).toEqual([1, 2]);
  });
  it("separates draft text from saved AI settings and prevents sending an unsaved WhatsApp test", async () => {
    await render();
    expect(button(ar.assistantSettingsReviewUx.sendWhatsApp).disabled).toBe(
      false
    );
    await fill("welcomeMessage", "draft welcome");
    await click(ar.assistantSectionsUx.preview);
    const preview = container.querySelector(
      '[data-assistant-section="preview"]'
    )!;
    expect(preview.textContent).toContain("draft welcome");
    expect(preview.textContent).toContain(
      ar.assistantSettingsReviewUx.unsavedPreview
    );
    expect(preview.textContent).toContain(
      ar.assistantSettingsReviewUx.noQualityScore
    );
    expect(button(ar.assistantSettingsReviewUx.sendWhatsApp).disabled).toBe(
      true
    );
    expect(m.send).not.toHaveBeenCalled();
    expect(preview.querySelector("form")).toBeNull();
  });
  it("does not portray a disabled auto-reply as an active welcome", async () => {
    m.settings.autoReplyEnabled = 0;
    await render();
    await click(ar.assistantSectionsUx.preview);
    const preview = container.querySelector(
      '[data-assistant-section="preview"]'
    )!;
    expect(preview.textContent).toContain(
      ar.assistantSettingsReviewUx.replyOff
    );
    expect(preview.textContent).not.toContain("saved welcome");
    expect(preview.textContent).not.toContain("saved away");
  });
  it("does not show an out-of-hours reply when scheduling is disabled", async () => {
    m.settings.workingHoursEnabled = 0;
    await render();
    await click(ar.assistantSectionsUx.preview);
    const preview = container.querySelector(
      '[data-assistant-section="preview"]'
    )!;
    expect(preview.textContent).toContain("saved welcome");
    expect(preview.textContent).toContain(
      ar.assistantSettingsReviewUx.scheduleOff
    );
    expect(preview.textContent).not.toContain("saved away");
  });
  it("locks duplicate save events and releases the lock after a failed request", async () => {
    await render();
    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(m.update).toHaveBeenCalledTimes(1);
    await act(async () => {
      m.callbacks.onError(new Error("failed"));
      m.callbacks.onSettled();
    });
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledTimes(2);
  });
});
