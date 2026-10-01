// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
import { parseWorkingDays, toggleWorkingDay } from "../shared/bot-working-days";
import {
  clearAssistantDrafts,
  readAssistantDraft,
  readAssistantDraftStatus,
} from "../client/src/lib/assistant-draft-cache";
const m = vi.hoisted(() => ({
  settings: {} as any,
  update: vi.fn(),
  send: vi.fn(),
  callbacks: {} as any,
  query: vi.fn(),
  refetch: vi.fn(),
  merchant: 20,
  user: 7,
  isError: false,
  responseMerchant: 20,
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: m.user } }) } },
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) },
    },
    useUtils: () => ({
      botSettings: {
        get: { invalidate: vi.fn() },
        shouldRespond: { invalidate: vi.fn() },
      },
    }),
    botSettings: {
      get: {
        useQuery: () => ({
          data: m.settings,
          isLoading: false,
          isError: m.isError,
          refetch: m.refetch,
        }),
      },
      shouldRespond: {
        useQuery: () => ({
          data: { shouldRespond: true, merchantId: m.responseMerchant },
        }),
      },
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
    i18n: { language: "ar" },
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
  clearAssistantDrafts();
  sessionStorage.clear();
  m.merchant = 20;
  m.user = 7;
  m.isError = false;
  m.responseMerchant = 20;
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
    canManage: true,
    merchantId: 20,
    formRevision: "a".repeat(64),
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
  m.refetch.mockImplementation(async () => ({ data: m.settings }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearAssistantDrafts();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("assistant settings review", () => {
  it("restores persisted text and empty numeric fields after a reload without sending", async () => {
    await render();
    await fill("welcomeMessage", "durable draft");
    await fill("responseDelay", "");
    await fill("maxLength", "");
    const key = "sary:assistant-settings-draft:v1:7:20";
    const raw = sessionStorage.getItem(key)!;
    await act(async () => root.render(null));
    clearAssistantDrafts();
    sessionStorage.setItem(key, raw);
    await render();
    expect(container.textContent).toContain(ar.assistantDraftUx.restoreHelp);
    await click(ar.assistantDraftUx.restore);
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("durable draft");
    expect(
      container.querySelector<HTMLInputElement>("#responseDelay")!.value
    ).toBe("");
    expect(container.querySelector<HTMLInputElement>("#maxLength")!.value).toBe(
      ""
    );
    expect(
      container.querySelector<HTMLInputElement>("#responseDelay")!.validity
        .valueMissing
    ).toBe(true);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("keeps an invalid local record untouched until explicit removal and never saves it", async () => {
    const key = "sary:assistant-settings-draft:v1:7:20";
    sessionStorage.setItem(key, "corrupt draft");
    await render();
    expect(container.textContent).toContain(
      ar.assistantSettingsDraftUx.unavailable
    );
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(sessionStorage.getItem(key)).toBe("corrupt draft");
    await click(ar.assistantSettingsDraftUx.discardLocal);
    expect(readAssistantDraftStatus("7:20").state).toBe("missing");
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("saved welcome");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("keeps an unsent draft and blocks writes when session storage fails", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await fill("welcomeMessage", "unsent draft");
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).not.toHaveBeenCalled();
    expect(readAssistantDraft("7:20")?.submitted).toBe(false);
    expect(container.textContent).toContain(
      ar.assistantSettingsDraftUx.storageFailed
    );
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => root.render(null));
    await render();
    expect(container.textContent).toContain(ar.assistantDraftUx.restoreHelp);
    expect(container.textContent).not.toContain(
      ar.assistantSettingsScopeUx.pendingFound
    );
  });
  it("keeps recovery blocked when removing the local record fails", async () => {
    sessionStorage.setItem("sary:assistant-settings-draft:v1:7:20", "corrupt");
    await render();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw Error("denied");
    });
    await click(ar.assistantSettingsDraftUx.discardLocal);
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(container.textContent).toContain(
      ar.assistantSettingsDraftUx.unavailable
    );
    expect(m.update).not.toHaveBeenCalled();
  });
  it("keeps saved settings readable while blocking editing, AI preview and external test sends for a reader", async () => {
    m.settings.canManage = false;
    await render();
    expect(container.textContent).toContain(ar.virtualTeamReview.readOnly);
    expect(
      (button(ar.botSettingsPage.saveSettings) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (button(ar.assistantSettingsReviewUx.sendWhatsApp) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(m.update).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
    await click(ar.assistantSectionsUx.preview);
    expect(container.textContent).toContain(ar.testSariPage.accessDenied);
    expect(container.querySelector("#saved-preview-question")).toBeNull();
    expect(m.query).not.toHaveBeenCalled();
  });
  it("retains legacy personality fields through navigation and saves them alongside operating instructions", async () => {
    Object.assign(m.settings, {
      tone: "enthusiastic",
      style: "formal_arabic",
      emojiUsage: "none",
      brandVoice: "old brand",
      personalityInstructions: "old personality",
      customInstructions: "operating rules",
    });
    await render();
    expect(
      container.querySelector<HTMLSelectElement>("#personalityStyle")!.value
    ).toBe("formal_arabic");
    expect(
      container.querySelector<HTMLSelectElement>("#personalityEmoji")!.options
    ).toHaveLength(4);
    expect(
      container.querySelector<HTMLTextAreaElement>("#personalityInstructions")!
        .value
    ).toBe("old personality");
    await fill("brandVoice", "new brand");
    await act(async () => root.render(null));
    await render();
    await click(ar.assistantDraftUx.restore);
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "enthusiastic",
        style: "formal_arabic",
        emojiUsage: "none",
        brandVoice: "new brand",
        personalityInstructions: "old personality",
        customInstructions: "operating rules",
      })
    );
  });
  it("clears the recoverable draft only when the displayed values were saved", async () => {
    await render();
    await fill("welcomeMessage", "saved from draft");
    await click(ar.botSettingsPage.saveSettings);
    const submitted = m.update.mock.calls[0][0];
    await act(async () => {
      m.settings = {
        ...m.settings,
        ...submitted,
        formRevision: "b".repeat(64),
      };
      m.callbacks.onSuccess(m.settings, submitted);
      m.callbacks.onSettled();
    });
    expect(readAssistantDraft("7:20")).toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(container.textContent).not.toContain(
      ar.assistantDraftUx.restoreHelp
    );
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("saved from draft");
  });
  it("keeps edits made while a save is pending against the newly saved revision", async () => {
    await render();
    await fill("welcomeMessage", "first edit");
    await click(ar.botSettingsPage.saveSettings);
    const submitted = m.update.mock.calls[0][0];
    await fill("welcomeMessage", "later edit");
    await act(async () => {
      m.settings = {
        ...m.settings,
        ...submitted,
        formRevision: "b".repeat(64),
      };
      m.callbacks.onSuccess(m.settings, submitted);
      m.callbacks.onSettled();
    });
    const recovered = readAssistantDraft("7:20")!;
    expect(recovered.base.welcomeMessage).toBe("first edit");
    expect(recovered.draft.welcomeMessage).toBe("later edit");
    expect(recovered.revision).toBe("b".repeat(64));
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        welcomeMessage: "later edit",
        expectedRevision: "b".repeat(64),
      })
    );
  });
  it("restores a draft after navigating away without saving or sharing it with another tenant", async () => {
    await render();
    await fill("welcomeMessage", "my private draft");
    await act(async () => root.render(null));
    await render();
    expect(container.textContent).toContain(ar.assistantDraftUx.restoreHelp);
    await click(ar.assistantDraftUx.restore);
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("my private draft");
    expect(m.update).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    m.merchant = 21;
    m.settings = { ...m.settings, merchantId: 21 };
    await render();
    expect(container.textContent).not.toContain(
      ar.assistantDraftUx.restoreHelp
    );
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("saved welcome");
  });
  it("requires review of same-field conflicts and merges independent changes without saving automatically", async () => {
    await render();
    await fill("welcomeMessage", "my edit");
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: "a".repeat(64) })
    );
    await act(async () => {
      m.callbacks.onError({ data: { code: "CONFLICT" } });
      m.callbacks.onSettled();
    });
    expect(button(ar.botSettingsPage.saveSettings).disabled).toBe(true);
    m.refetch.mockResolvedValue({
      data: {
        ...m.settings,
        welcomeMessage: "someone else's edit",
        language: "en",
        formRevision: "b".repeat(64),
      },
    });
    await click(ar.assistantDraftUx.reviewLatest);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("my edit");
    expect(dialog.textContent).toContain("someone else's edit");
    const apply = [...dialog.querySelectorAll("button")].find(
      b => b.textContent === ar.assistantDraftUx.applyReview
    )!;
    expect(apply.disabled).toBe(true);
    await act(async () =>
      dialog.querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    );
    await act(async () => apply.click());
    expect(m.update).toHaveBeenCalledTimes(1);
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        welcomeMessage: "my edit",
        language: "en",
        expectedRevision: "b".repeat(64),
      })
    );
  });
  it("keeps the draft after review loading fails and permits a later retry", async () => {
    await render();
    await fill("welcomeMessage", "keep this");
    await click(ar.botSettingsPage.saveSettings);
    await act(async () => {
      m.callbacks.onError({ data: { code: "CONFLICT" } });
      m.callbacks.onSettled();
    });
    m.refetch.mockRejectedValueOnce(Error("offline"));
    await click(ar.assistantDraftUx.reviewLatest);
    expect(container.textContent).toContain(ar.assistantDraftUx.reviewFailed);
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("keep this");
    await click(ar.assistantDraftUx.reviewLatest);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
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
    expect(container.textContent).toContain(
      ar.assistantSettingsScopeUx.uncertain
    );
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
  it("locks duplicate saves and requires review before retrying an unconfirmed request", async () => {
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
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(readAssistantDraft("7:20")?.submitted).toBe(true);
    await click(ar.assistantDraftUx.reviewLatest);
    await act(async () =>
      [...document.querySelectorAll('[role="dialog"] button')]
        .find(b => b.textContent === ar.assistantDraftUx.applyReview)!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(m.update).toHaveBeenCalledTimes(1);
    await click(ar.botSettingsPage.saveSettings);
    expect(m.update).toHaveBeenCalledTimes(2);
  });
  it("does not initialize another store from an old cached settings response", async () => {
    await render();
    await fill("welcomeMessage", "store20 draft");
    m.merchant = 21;
    await render();
    expect(container.querySelector("#welcomeMessage")).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
    m.settings = {
      ...m.settings,
      merchantId: 21,
      welcomeMessage: "store21 saved",
    };
    await render();
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("store21 saved");
    expect(readAssistantDraft("7:21")).toBeNull();
    expect(readAssistantDraft("7:20")?.draft.welcomeMessage).toBe(
      "store20 draft"
    );
  });
  it("ignores a late save callback after tenant navigation", async () => {
    await render();
    await fill("welcomeMessage", "old store edit");
    await click(ar.botSettingsPage.saveSettings);
    const callbacks = m.callbacks,
      submitted = m.update.mock.calls[0][0],
      old = m.settings;
    m.merchant = 21;
    m.settings = { ...m.settings, merchantId: 21, welcomeMessage: "new store" };
    await render();
    await act(async () => {
      callbacks.onSuccess(
        { ...old, ...submitted, formRevision: "b".repeat(64) },
        submitted
      );
      callbacks.onSettled();
    });
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("new store");
    expect(readAssistantDraft("7:20")?.submitted).toBe(true);
    expect(readAssistantDraft("7:21")).toBeNull();
  });
  it("rejects a save result belonging to another tenant", async () => {
    await render();
    await fill("welcomeMessage", "mine");
    await click(ar.botSettingsPage.saveSettings);
    await act(async () => {
      m.callbacks.onSuccess(
        { ...m.settings, merchantId: 21, formRevision: "b".repeat(64) },
        m.update.mock.calls[0][0]
      );
      m.callbacks.onSettled();
    });
    expect(container.textContent).toContain(
      ar.assistantSettingsScopeUx.uncertain
    );
    expect(readAssistantDraft("7:20")?.submitted).toBe(true);
    expect(button(ar.botSettingsPage.saveSettings).disabled).toBe(true);
  });
  it("restores an uncertain request without resending even when its values match the baseline", async () => {
    await render();
    await click(ar.botSettingsPage.saveSettings);
    await act(async () => {
      m.callbacks.onError(Error("lost acknowledgement"));
      m.callbacks.onSettled();
      root.render(null);
    });
    await render();
    expect(container.textContent).toContain(
      ar.assistantSettingsScopeUx.pendingFound
    );
    await click(ar.assistantDraftUx.restore);
    expect(button(ar.botSettingsPage.saveSettings).disabled).toBe(true);
    expect(m.update).toHaveBeenCalledTimes(1);
  });
  it("ignores a late review response after an account change", async () => {
    let resolve!: (value: any) => void;
    await render();
    await fill("welcomeMessage", "account7");
    await click(ar.botSettingsPage.saveSettings);
    await act(async () => {
      m.callbacks.onError({ data: { code: "CONFLICT" } });
      m.callbacks.onSettled();
    });
    m.refetch.mockImplementationOnce(
      () =>
        new Promise(yes => {
          resolve = yes;
        })
    );
    await click(ar.assistantDraftUx.reviewLatest);
    m.user = 8;
    await render();
    await act(async () =>
      resolve({
        data: {
          ...m.settings,
          welcomeMessage: "late account7",
          formRevision: "b".repeat(64),
        },
      })
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
    ).toBe("saved welcome");
    expect(readAssistantDraft("8:20")).toBeNull();
  });
  it("does not initialize stale settings after a failed first read", async () => {
    m.isError = true;
    await render();
    expect(container.querySelector("#welcomeMessage")).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not display a previous store's response status", async () => {
    m.responseMerchant = 21;
    await render();
    expect(container.textContent).not.toContain(ar.botSettingsPage.botActive);
    m.responseMerchant = 20;
    await render();
    expect(container.textContent).toContain(ar.botSettingsPage.botActive);
  });
  it("cannot repopulate the draft cache from a callback after logout clears the epoch", async () => {
    await render();
    await fill("welcomeMessage", "old session");
    await click(ar.botSettingsPage.saveSettings);
    const submitted = m.update.mock.calls[0][0];
    clearAssistantDrafts();
    await act(async () => {
      m.callbacks.onSuccess(
        { ...m.settings, ...submitted, formRevision: "b".repeat(64) },
        submitted
      );
      m.callbacks.onSettled();
    });
    expect(readAssistantDraft("7:20")).toBeNull();
  });
});
