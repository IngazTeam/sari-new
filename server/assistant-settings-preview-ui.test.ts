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
    import("../prototypes/tenant-dashboard/src/assistant-settings-preview-api"),
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
import {
  clearSalesPolicyDrafts,
  readSalesPolicyDraft,
} from "../client/src/lib/sales-policy-draft";
let root: Root, container: HTMLDivElement, model: AssistantSettingsPreviewModel;
const render = () =>
  act(async () =>
    root.render(
      React.createElement(
        AssistantSettingsPreviewContext.Provider,
        { value: model },
        React.createElement(BotSettings),
      ),
    ),
  );
function button(text: string) {
  const node = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!node) throw Error(text);
  return node;
}
const click = (text: string) => act(async () => button(text).click());
async function fill(id: string, value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "#" + id,
    )!;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function check(id: string) {
  await act(async () =>
    container.querySelector<HTMLInputElement>("#" + id)!.click(),
  );
}
beforeEach(() => {
  clearSalesPolicyDrafts();
  clearAssistantDrafts();
  sessionStorage.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
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
  clearSalesPolicyDrafts();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["discount", "margin"] as const)(
  "uses the real %s policy controls and keeps the behaviour form separate",
  async (kind) => {
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "30");
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled,
    ).toBe(true);
    await check(kind + "-policy-reviewed");
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled,
    ).toBe(false);
    await fill(kind + "-policy-percent", "25");
    expect(
      container.querySelector<HTMLInputElement>(
        "#" + kind + "-policy-reviewed",
      )!.checked,
    ).toBe(false);
    await check(kind + "-policy-reviewed");
    const baseline = model.settings();
    await check(kind + "-policy-save");
    expect(model.policy(kind).revision).toBe(2);
    expect(model.settings()).toEqual(baseline);
    expect(model.writes).toBe(1);
    expect(container.textContent).toContain(
      ar.merchantUx[kind === "margin" ? "marginPolicy" : "discountPolicy"]
        .saved,
    );
  },
);
it("preserves an unconfirmed behaviour draft through a storage-only reload and review without another save", async () => {
  model.reset("lost-after");
  await render();
  await fill("welcomeMessage", "uncertain draft");
  await click(ar.botSettingsPage.saveSettings);
  expect(container.textContent).toContain(
    ar.assistantSettingsScopeUx.uncertain,
  );
  const key = "sary:assistant-settings-draft:v1:900181:181",
    raw = sessionStorage.getItem(key)!;
  await act(async () => root.render(null));
  clearAssistantDrafts();
  sessionStorage.setItem(key, raw);
  model = new AssistantSettingsPreviewModel(181, sessionStorage);
  await render();
  expect(container.textContent).toContain(
    ar.assistantSettingsScopeUx.pendingFound,
  );
  await click(ar.assistantDraftUx.restore);
  await click(ar.assistantDraftUx.reviewLatest);
  await act(async () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>("[role=dialog] button"),
    )
      .find((b) => b.textContent === ar.assistantDraftUx.applyReview)!
      .click(),
  );
  expect(model.writes).toBe(0);
  expect(model.reads).toBe(1);
  expect(
    container.querySelector<HTMLTextAreaElement>("#welcomeMessage")!.value,
  ).toBe("uncertain draft");
});
it("shows policy read errors explicitly and recovers without a policy write", async () => {
  model.reset("policy-load-error");
  await render();
  await click(ar.assistantSectionsUx.sales);
  expect(container.textContent).toContain(
    ar.merchantUx.discountPolicy.loadFailed,
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
    ar.merchantUx.discountPolicy.readOnly,
  );
  expect(container.textContent).toContain(ar.merchantUx.marginPolicy.readOnly);
  expect(container.querySelector("#discount-policy-save")).toBeNull();
  await click(ar.assistantSectionsUx.preview);
  expect(container.querySelector("#saved-preview-question")).toBeNull();
  expect(model.writes + model.sends + model.previews).toBe(0);
});

function policySection(kind: string) {
  return container.querySelector<HTMLElement>(
    `section[aria-labelledby="${kind}-policy-title"]`,
  )!;
}
async function policyClick(kind: string, text: string) {
  await act(async () => {
    const button = Array.from(
      policySection(kind).querySelectorAll("button"),
    ).find((b) => b.textContent?.trim() === text);
    if (!button) throw Error(text);
    button.click();
  });
}
const policyKey = (kind: string, merchant = 181) =>
  `900181:${merchant}:sales-${kind}`;
const restoreStorage = async (kind: string) => {
  const key = "sary:sales-policy-draft:v1:" + policyKey(kind),
    raw = sessionStorage.getItem(key)!;
  await act(async () => root.render(null));
  clearSalesPolicyDrafts();
  sessionStorage.setItem(key, raw);
  model = new AssistantSettingsPreviewModel(181, sessionStorage);
  await render();
  await click(ar.assistantSectionsUx.sales);
};
it.each(["discount", "margin"] as const)(
  "retains an empty %s numeric field through section changes and restores after remount",
  async (kind) => {
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "");
    await click(ar.assistantSectionsUx.basics);
    await click(ar.assistantSectionsUx.sales);
    expect(
      container.querySelector<HTMLInputElement>("#" + kind + "-policy-percent")!
        .value,
    ).toBe("");
    await act(async () => root.render(null));
    await render();
    await click(ar.assistantSectionsUx.sales);
    expect(policySection(kind).textContent).toContain(
      ar.salesPolicyDraftUx.found,
    );
    await policyClick(kind, ar.salesPolicyDraftUx.restore);
    expect(
      container.querySelector<HTMLInputElement>("#" + kind + "-policy-percent")!
        .value,
    ).toBe("");
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled,
    ).toBe(true);
    expect(model.writes).toBe(0);
  },
);
it.each(["discount", "margin"] as const)(
  "restores an unconfirmed %s write after reload and compares without repeating it",
  async (kind) => {
    model.reset("lost-after");
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "28");
    await check(kind + "-policy-reviewed");
    await check(kind + "-policy-save");
    expect(model.writes).toBe(1);
    expect(model.policy(kind).revision).toBe(2);
    expect(policySection(kind).textContent).toContain(
      ar.salesPolicyDraftUx.uncertain,
    );
    await restoreStorage(kind);
    expect(policySection(kind).textContent).toContain(
      ar.salesPolicyDraftUx.pendingFound,
    );
    await policyClick(kind, ar.salesPolicyDraftUx.restore);
    await policyClick(kind, ar.salesPolicyDraftUx.reviewLatest);
    expect(policySection(kind).querySelector("[role=region]")).not.toBeNull();
    await policyClick(kind, ar.salesPolicyDraftUx.keepDraft);
    expect(model.writes).toBe(0);
    expect(model.reads).toBe(1);
    expect(
      container.querySelector<HTMLButtonElement>("#" + kind + "-policy-save")!
        .disabled,
    ).toBe(true);
    expect(policySection(kind).textContent).not.toContain(
      ar.merchantUx[kind === "discount" ? "discountPolicy" : "marginPolicy"]
        .saved,
    );
  },
);
it.each(["discount", "margin"] as const)(
  "preserves the %s draft through a conflict and saves only after a separate review",
  async (kind) => {
    model.reset("conflict");
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "28");
    await check(kind + "-policy-reviewed");
    await check(kind + "-policy-save");
    expect(model.writes).toBe(1);
    await policyClick(kind, ar.salesPolicyDraftUx.reviewLatest);
    await policyClick(kind, ar.salesPolicyDraftUx.keepDraft);
    expect(model.writes).toBe(1);
    expect(
      container.querySelector<HTMLInputElement>("#" + kind + "-policy-percent")!
        .value,
    ).toBe("28");
    expect(
      container.querySelector<HTMLInputElement>(
        "#" + kind + "-policy-reviewed",
      )!.checked,
    ).toBe(false);
    await check(kind + "-policy-reviewed");
    await check(kind + "-policy-save");
    expect(model.writes).toBe(2);
    expect(model.policy(kind).revision).toBe(3);
  },
);
it.each(["discount", "margin"] as const)(
  "rejects foreign %s save responses and stale data returned with a read error",
  async (kind) => {
    model.reset("foreign-result");
    await render();
    await click(ar.assistantSectionsUx.sales);
    await fill(kind + "-policy-percent", "28");
    await check(kind + "-policy-reviewed");
    await check(kind + "-policy-save");
    expect(policySection(kind).textContent).toContain(
      ar.salesPolicyDraftUx.uncertain,
    );
    vi.spyOn(model, "reviewPolicy").mockResolvedValue({
      data: model.policy(kind),
      isError: true,
    });
    await policyClick(kind, ar.salesPolicyDraftUx.reviewLatest);
    expect(policySection(kind).querySelector("[role=region]")).toBeNull();
    expect(model.writes).toBe(1);
    expect(
      container.querySelector<HTMLInputElement>("#" + kind + "-policy-percent")!
        .disabled,
    ).toBe(true);
  },
);
it.each(["discount", "margin"] as const)(
  "blocks %s writes when tab storage fails and retains an unsent draft",
  async (kind) => {
    await render();
    await click(ar.assistantSectionsUx.sales);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await fill(kind + "-policy-percent", "28");
    await check(kind + "-policy-reviewed");
    await check(kind + "-policy-save");
    expect(model.writes).toBe(0);
    expect(readSalesPolicyDraft(policyKey(kind), kind)).toMatchObject({
      state: "ready",
      persisted: false,
      value: { submitted: false, form: { percent: "28" } },
    });
    expect(policySection(kind).textContent).toContain(
      ar.salesPolicyDraftUx.storageFailed,
    );
  },
);
it("isolates both policy drafts across stores and keeps them distinct from behaviour", async () => {
  await render();
  await click(ar.assistantSectionsUx.sales);
  await fill("discount-policy-percent", "28");
  await fill("margin-policy-percent", "35");
  const baseline = model.settings();
  model = new AssistantSettingsPreviewModel(182, sessionStorage);
  await render();
  await click(ar.assistantSectionsUx.sales);
  expect(container.textContent).not.toContain(ar.salesPolicyDraftUx.found);
  expect(
    container.querySelector<HTMLInputElement>("#discount-policy-percent")!
      .value,
  ).toBe("15");
  model = new AssistantSettingsPreviewModel(181, sessionStorage);
  await render();
  await click(ar.assistantSectionsUx.sales);
  await policyClick("discount", ar.salesPolicyDraftUx.restore);
  await policyClick("margin", ar.salesPolicyDraftUx.restore);
  expect(
    container.querySelector<HTMLInputElement>("#discount-policy-percent")!
      .value,
  ).toBe("28");
  expect(
    container.querySelector<HTMLInputElement>("#margin-policy-percent")!.value,
  ).toBe("35");
  expect(model.settings()).toEqual(baseline);
});
it("ignores a late policy callback after switching stores and leaves the original request for review", async () => {
  await render();
  await click(ar.assistantSectionsUx.sales);
  await fill("discount-policy-percent", "28");
  await check("discount-policy-reviewed");
  let release!: (v: any) => void;
  const original = model;
  vi.spyOn(original, "savePolicy").mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await check("discount-policy-save");
  model = new AssistantSettingsPreviewModel(182, sessionStorage);
  await render();
  await click(ar.assistantSectionsUx.sales);
  await act(async () =>
    release({
      ...original.policy("discount"),
      policy: { enabled: false, maxPercent: 28, expireHours: 48 },
      revision: 2,
    }),
  );
  expect(
    container.querySelector<HTMLInputElement>("#discount-policy-percent")!
      .value,
  ).toBe("15");
  expect(readSalesPolicyDraft(policyKey("discount"), "discount")).toMatchObject(
    { state: "ready", value: { submitted: true } },
  );
});
it("discards only the local policy draft and clears review without a write", async () => {
  await render();
  await click(ar.assistantSectionsUx.sales);
  await fill("discount-policy-percent", "28");
  await policyClick("discount", ar.salesPolicyDraftUx.discard);
  expect(
    container.querySelector<HTMLInputElement>("#discount-policy-percent")!
      .value,
  ).toBe("15");
  expect(readSalesPolicyDraft(policyKey("discount"), "discount").state).toBe(
    "missing",
  );
  expect(model.writes).toBe(0);
});
