// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import legacyAr from "../client/src/locales/ar.json";
import merchantAr from "../client/src/locales/merchant-ux.ar";
const ar = { ...legacyAr, merchantUx: merchantAr };
vi.mock(
  "../client/src/lib/trpc",
  () =>
    import("../prototypes/tenant-dashboard/src/assistant-settings-preview-api")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const v = key.split(".").reduce((n: any, k) => n?.[k], ar);
      return typeof v === "string"
        ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? ""))
        : key;
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import BotSettings from "../client/src/pages/merchant/BotSettings";
import { AssistantSettingsPreviewContext } from "../prototypes/tenant-dashboard/src/assistant-settings-preview-api";
import { AssistantSettingsPreviewModel } from "../prototypes/tenant-dashboard/src/assistant-settings-preview-model";
import { clearAssistantDrafts } from "../client/src/lib/assistant-draft-cache";
let root: Root, container: HTMLDivElement, model: AssistantSettingsPreviewModel;
const render = () =>
  act(async () =>
    root.render(
      React.createElement(
        AssistantSettingsPreviewContext.Provider,
        { value: model },
        React.createElement(BotSettings)
      )
    )
  );
function button(text: string) {
  const node = Array.from(container.querySelectorAll("button")).find(
    b => b.textContent?.trim() === text
  );
  if (!node) throw Error(text);
  return node;
}
const click = (text: string) => act(async () => button(text).click());
async function fill(id: string, value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "#" + id
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
async function check(id: string) {
  await act(async () =>
    container.querySelector<HTMLInputElement>("#" + id)!.click()
  );
}
beforeEach(() => {
  clearAssistantDrafts();
  sessionStorage.clear();
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  model = new AssistantSettingsPreviewModel(181, sessionStorage);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  clearAssistantDrafts();
  vi.unstubAllGlobals();
});
it.each(["discount", "margin"] as const)(
  "uses the real %s policy controls and keeps the behaviour form separate",
  async kind => {
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "30");
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled
    ).toBe(true);
    await check(kind + "-policy-reviewed");
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled
    ).toBe(false);
    await fill(kind + "-policy-percent", "25");
    expect(
      container.querySelector<HTMLInputElement>(
        "#" + kind + "-policy-reviewed"
      )!.checked
    ).toBe(false);
    await check(kind + "-policy-reviewed");
    const baseline = model.settings();
    await check(kind + "-policy-save");
    expect(model.policy(kind).revision).toBe(2);
    expect(model.settings()).toEqual(baseline);
    expect(model.writes).toBe(1);
    expect(container.textContent).toContain(
      ar.merchantUx[kind === "margin" ? "marginPolicy" : "discountPolicy"].saved
    );
  }
);
it("preserves an unconfirmed behaviour draft through a storage-only reload and review without another save", async () => {
  model.reset("lost-after");
  await render();
  await fill("welcomeMessage", "uncertain draft");
  await click(ar.botSettingsPage.saveSettings);
  expect(container.textContent).toContain(
    ar.assistantSettingsScopeUx.uncertain
  );
  const key = "sary:assistant-settings-draft:v1:900181:181",
    raw = sessionStorage.getItem(key)!;
  await act(async () => root.render(null));
  clearAssistantDrafts();
  sessionStorage.setItem(key, raw);
  model = new AssistantSettingsPreviewModel(181, sessionStorage);
  await render();
  expect(container.textContent).toContain(
    ar.assistantSettingsScopeUx.pendingFound
  );
  await click(ar.assistantDraftUx.restore);
  await click(ar.assistantDraftUx.reviewLatest);
  await act(async () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")
    )
      .find(b => b.textContent === ar.assistantDraftUx.applyReview)!
      .click()
  );
  expect(model.writes).toBe(0);
  expect(model.reads).toBe(1);
  expect(
    container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value
  ).toBe("uncertain draft");
});
it("shows policy read errors explicitly and recovers without a policy write", async () => {
  model.reset("policy-load-error");
  await render();
  await click(ar.assistantSectionsUx.sales);
  expect(container.textContent).toContain(
    ar.merchantUx.discountPolicy.loadFailed
  );
  await click(ar.merchantUx.discountPolicy.refresh);
  expect(container.querySelector("#discount-policy-percent")).not.toBeNull();
  expect(model.writes).toBe(0);
});
it("shows both policies read-only and blocks the reply preview for a viewer", async () => {
  model.reset("viewer");
  await render();
  await click(ar.assistantSectionsUx.sales);
  expect(container.textContent).toContain(
    ar.merchantUx.discountPolicy.readOnly
  );
  expect(container.textContent).toContain(ar.merchantUx.marginPolicy.readOnly);
  expect(container.querySelector("#discount-policy-save")).toBeNull();
  await click(ar.assistantSectionsUx.preview);
  expect(container.querySelector("#saved-preview-question")).toBeNull();
  expect(model.writes + model.sends + model.previews).toBe(0);
});
