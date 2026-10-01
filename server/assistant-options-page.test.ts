// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({
  settings: {} as any,
  queryError: false,
  listingError: false,
  merchant: 20,
  write: vi.fn(),
  refetch: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7 } }) } },
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) },
    },
    useUtils: () => ({ botSettings: { get: { invalidate: m.invalidate } } }),
    botSettings: {
      get: {
        useQuery: () => ({
          data: m.settings,
          isError: m.queryError,
          refetch: m.refetch,
        }),
      },
      updateOption: { useMutation: () => ({ mutateAsync: m.write }) },
      takeoverWorkspace: {
        useQuery: () => ({
          data: {
            rows: [],
            total: 0,
            directReplyHours: 24,
            manualMaxHours: 24,
          },
          isError: m.listingError,
          refetch: vi.fn(),
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string, values?: any) => {
      const value = key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key;
      return typeof value === "string"
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, k: string) => values?.[k] ?? ""
          )
        : value;
    },
  }),
}));
import HumanTakeover from "../client/src/pages/merchant/HumanTakeoverSettings";
import Language from "../client/src/pages/merchant/LanguageSettings";
import { toast } from "sonner";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
let root: Root, container: HTMLDivElement, Page: typeof Language;
const version = (c: string) => ({
  language: c.repeat(64),
  takeover: c.repeat(64),
});
async function render() {
  await act(async () => root.render(React.createElement(Page)));
}
function button(label: string) {
  const el = [...container.querySelectorAll("button")].find(
    b => b.textContent?.trim() === label
  );
  if (!el) throw Error("Missing button " + label);
  return el;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function language(code: string) {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>(
        `input[name="assistant-language"][value="${code}"]`
      )!
      .click()
  );
}
async function minutes(value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement>("#takeover-minutes")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  clearKnowledgeWorkspace();
  sessionStorage.clear();
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
  m.queryError = false;
  m.listingError = false;
  m.merchant = 20;
  m.settings = {
    merchantId: 20,
    language: "ar",
    takeoverTimeoutMinutes: 90,
    takeoverCommandsEnabled: 1,
    takeoverResumeMessage: "legacy text",
    canManage: true,
    optionRevisions: version("a"),
  };
  m.refetch.mockImplementation(async () => ({ data: m.settings }));
  m.invalidate.mockResolvedValue(undefined);
  m.write.mockImplementation(async (input: any) => ({
    ...m.settings,
    ...(input.kind === "language" ? { language: input.language } : input.draft),
    optionRevisions: version("b"),
  }));
  Page = Language;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("reviewed assistant options UI", () => {
  const remount = async () => {
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
  };
  it("restores a language draft after remount, reviews latest data and saves only on a separate action", async () => {
    await render();
    await language("fr");
    await remount();
    expect(container.textContent).toContain(ar.assistantOptionDraftUx.found);
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    await click(ar.assistantOptionDraftUx.restore);
    expect(
      container.querySelector<HTMLInputElement>('input[value="fr"]')!.checked
    ).toBe(true);
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    expect(m.write).not.toHaveBeenCalled();
    await click(ar.languageSettingsPage.text7);
    expect(m.write).toHaveBeenCalledTimes(1);
    await remount();
    expect(container.textContent).not.toContain(
      ar.assistantOptionDraftUx.found
    );
  });
  it("recovers an empty duration without substituting a valid default", async () => {
    Page = HumanTakeover;
    await render();
    await minutes("");
    await remount();
    await click(ar.assistantOptionDraftUx.restore);
    expect(
      container.querySelector<HTMLInputElement>("#takeover-minutes")!.value
    ).toBe("");
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    await click(ar.humanTakeoverPage.saveSettings);
    expect(container.textContent).toContain(
      ar.takeoverWorkspaceUx.invalidMinutes
    );
    expect(m.write).not.toHaveBeenCalled();
  });
  it("does not resend an uncertain save after restoring it", async () => {
    m.write.mockRejectedValueOnce(Error("lost response"));
    await render();
    await language("it");
    await click(ar.languageSettingsPage.text7);
    await remount();
    expect(container.textContent).toContain(
      ar.assistantOptionDraftUx.pendingFound
    );
    await click(ar.assistantOptionDraftUx.restore);
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    m.settings = {
      ...m.settings,
      language: "it",
      optionRevisions: version("b"),
    };
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
    expect(container.textContent).not.toContain(
      ar.assistantOptionDraftUx.uncertain
    );
  });
  it("blocks a new save when a durable local draft cannot be kept", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await language("en");
    await click(ar.languageSettingsPage.text7);
    expect(m.write).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      ar.assistantOptionDraftUx.storageFailed
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="en"]')!.checked
    ).toBe(true);
  });
  it("discards only the local copy without calling a settings mutation", async () => {
    await render();
    await language("fr");
    await remount();
    await click(ar.assistantOptionDraftUx.discard);
    expect(
      container.querySelector<HTMLInputElement>('input[value="ar"]')!.checked
    ).toBe(true);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("rejects a save response belonging to another store and retains the pending draft", async () => {
    await render();
    await language("en");
    m.write.mockResolvedValueOnce({
      ...m.settings,
      merchantId: 999,
      language: "en",
      optionRevisions: version("b"),
    });
    await click(ar.languageSettingsPage.text7);
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      ar.assistantOptionDraftUx.uncertain
    );
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
  });
  it("does not restore a previous tenant draft into the next tenant", async () => {
    await render();
    await language("fr");
    m.merchant = 21;
    m.settings = { ...m.settings, merchantId: 21, language: "en" };
    await render();
    expect(container.textContent).not.toContain(
      ar.assistantOptionDraftUx.found
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="en"]')!.checked
    ).toBe(true);
    m.merchant = 20;
    m.settings = { ...m.settings, merchantId: 20, language: "ar" };
    await render();
    expect(container.textContent).toContain(ar.assistantOptionDraftUx.found);
    await click(ar.assistantOptionDraftUx.restore);
    expect(
      container.querySelector<HTMLInputElement>('input[value="fr"]')!.checked
    ).toBe(true);
  });
  it("does not initialize the new store from old cached settings while its query refreshes", async () => {
    await render();
    m.merchant = 21;
    await render();
    expect(
      container.querySelector('input[name="assistant-language"]')
    ).toBeNull();
    expect(m.write).not.toHaveBeenCalled();
    m.settings = { ...m.settings, merchantId: 21, language: "it" };
    await render();
    expect(
      container.querySelector<HTMLInputElement>('input[value="it"]')!.checked
    ).toBe(true);
  });
  it("offers seven native choices and shows both languages with explicit static preview disclosure", async () => {
    await render();
    expect(
      container.querySelectorAll('input[name="assistant-language"]')
    ).toHaveLength(7);
    await language("both");
    expect(container.querySelectorAll('[lang="ar"]')).toHaveLength(4);
    expect(container.querySelectorAll('[lang="en"]')).toHaveLength(4);
    expect(container.textContent).toContain(
      ar.assistantOptionUx.languagePreview
    );
    await click(ar.languageSettingsPage.text7);
    expect(m.write).toHaveBeenCalledWith({
      kind: "language",
      language: "both",
      expectedRevision: "a".repeat(64),
    });
  });
  it("keeps dirty drafts on query refresh and fetch failure, disabling saves without current access", async () => {
    await render();
    await language("fr");
    m.settings = {
      ...m.settings,
      language: "en",
      optionRevisions: version("b"),
    };
    await render();
    expect(
      container.querySelector<HTMLInputElement>('input[value="fr"]')!.checked
    ).toBe(true);
    m.queryError = true;
    await render();
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
    expect(
      container.querySelector<HTMLInputElement>('input[value="fr"]')!.checked
    ).toBe(true);
  });
  it("preserves failed saves and locks double submissions while a request is pending", async () => {
    let reject!: (e: any) => void;
    m.write.mockImplementation(() => new Promise((_, no) => (reject = no)));
    await render();
    await language("it");
    await act(async () => {
      const form = container.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    await act(async () => reject(Error("network")));
    expect(container.textContent).toContain(
      ar.assistantOptionDraftUx.uncertain
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="it"]')!.checked
    ).toBe(true);
  });
  it("requires explicit conflict review and a separate save with the newly reviewed revision", async () => {
    m.write.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await language("fr");
    await click(ar.languageSettingsPage.text7);
    m.settings = {
      ...m.settings,
      language: "en",
      optionRevisions: version("b"),
    };
    await click(ar.virtualTeamReview.load);
    expect(button(ar.virtualTeamReview.applyReview).disabled).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLInputElement>(
          'input[name="option-review-language"]:last-of-type'
        )
        ?.click()
    );
    // Select the labeled personal draft choice, not the default saved value.
    await act(async () =>
      [...container.querySelectorAll("label")]
        .find(l => l.textContent === ar.virtualTeamReview.chooseMine)!
        .querySelector("input")!
        .click()
    );
    await click(ar.virtualTeamReview.applyReview);
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector<HTMLInputElement>('input[value="fr"]')!.checked
    ).toBe(true);
    await click(ar.languageSettingsPage.text7);
    expect(m.write).toHaveBeenLastCalledWith({
      kind: "language",
      language: "fr",
      expectedRevision: "b".repeat(64),
    });
  });
  it("rejects cached stale review data when refetch fails", async () => {
    m.write.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await language("en");
    await click(ar.languageSettingsPage.text7);
    m.refetch.mockResolvedValue({ data: m.settings, error: Error("failed") });
    await click(ar.virtualTeamReview.load);
    expect(container.textContent).toContain(ar.assistantOptionUx.failed);
    expect(
      container.querySelector(
        '[aria-label="' + ar.assistantOptionUx.review + '"]'
      )
    ).toBeNull();
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
  });
  it("ignores a late save from a previous tenant and does not publish its toast or invalidate the new store", async () => {
    let resolve!: (v: any) => void;
    m.write.mockImplementation(() => new Promise(yes => (resolve = yes)));
    await render();
    await language("en");
    await click(ar.languageSettingsPage.text7);
    const old = m.settings;
    m.merchant = 21;
    m.settings = { ...m.settings, merchantId: 21, language: "it" };
    await render();
    await act(async () =>
      resolve({ ...old, language: "en", optionRevisions: version("b") })
    );
    expect(
      container.querySelector<HTMLInputElement>('input[value="it"]')!.checked
    ).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("blocks read-only saves for both option pages", async () => {
    m.settings.canManage = false;
    await render();
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(button(ar.languageSettingsPage.text7).disabled).toBe(true);
    Page = HumanTakeover;
    await render();
    expect(container.querySelector("fieldset")!.disabled).toBe(true);
    expect(button(ar.humanTakeoverPage.saveSettings).disabled).toBe(true);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("retains a 90-minute value, labels both takeover sources and keeps unsupported resume text read-only", async () => {
    Page = HumanTakeover;
    await render();
    expect(
      container.querySelector<HTMLInputElement>("#takeover-minutes")!.value
    ).toBe("90");
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("legacy text");
    expect(container.textContent).toContain(ar.takeoverWorkspaceUx.resumeHelp);
    expect(
      Array.from(container.querySelectorAll("code")).map(
        node => node.textContent
      )
    ).toEqual(["#stop", "#start"]);
    expect(container.textContent).toContain(
      ar.takeoverWorkspaceUx.commandsHelp
    );
    expect(container.textContent).not.toContain("يسعدنا خدمتكم");
    expect(container.textContent).not.toContain("I'll take over");
    expect(container.textContent).toContain(
      ar.takeoverWorkspaceUx.dashboardTitle
    );
    expect(container.textContent).toContain(
      ar.takeoverWorkspaceUx.whatsappTitle
    );
    await minutes("5.5");
    await click(ar.humanTakeoverPage.saveSettings);
    expect(m.write).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("takeover-minutes");
    await minutes("120");
    await click(ar.humanTakeoverPage.saveSettings);
    expect(m.write).toHaveBeenCalledWith({
      kind: "takeover",
      expectedRevision: "a".repeat(64),
      draft: { takeoverTimeoutMinutes: 120, takeoverCommandsEnabled: true },
    });
  });
  it("distinguishes a failed conversation load from an empty list and keeps settings available", async () => {
    Page = HumanTakeover;
    await render();
    expect(container.textContent).toContain(
      ar.humanTakeoverPage.noActiveConversations
    );
    m.listingError = true;
    await render();
    expect(container.textContent).not.toContain(
      ar.humanTakeoverPage.noActiveConversations
    );
    expect(
      container.querySelector<HTMLInputElement>("#takeover-minutes")!.value
    ).toBe("90");
  });
});
