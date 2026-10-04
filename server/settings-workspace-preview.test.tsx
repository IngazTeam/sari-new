// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: state.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ||
      key,
  }),
}));
import MerchantSettings from "../client/src/pages/merchant/Settings";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  serviceModes,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.language = "en";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  model = new ServicePreviewModel(269);
  history.replaceState(null, "", "/?path=/merchant/settings");
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        <MerchantSettings />
      </ServicePreviewContext.Provider>
    )
  );
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(b =>
    b.textContent?.trim().startsWith(text)
  )!;
const click = (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });

const panel = (kind = "store") =>
  host.querySelector<HTMLElement>("#sw-panel-" + kind)!;
const labels = () =>
  state.language === "ar" ? ar.settingsWorkspaceUx : en.settingsWorkspaceUx;
const change = async (id: string, value: string) =>
  act(async () => {
    const input = host.querySelector<HTMLInputElement>("#sw-" + id)!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = async (kind = "store") =>
  act(async () => {
    panel(kind)
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const tab = async (kind: string) =>
  act(async () => {
    host.querySelector<HTMLButtonElement>("#sw-tab-" + kind)!.click();
  });
const action = async (text: string, kind = "store") =>
  act(async () => {
    const button = Array.from(
      panel(kind).querySelectorAll<HTMLButtonElement>("button")
    ).find(b => b.textContent?.trim() === text);
    expect(button).toBeTruthy();
    button!.click();
  });
it.each(["ar", "en"])(
  "saves each actual settings form independently in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.textContent).toContain(labels().title);
    expect(host.querySelector(".sw-workspace")?.getAttribute("dir")).toBe(
      language === "ar" ? "rtl" : "ltr"
    );
    await change("businessName", "Reviewed store");
    await submit();
    expect(model.operations).toBe(1);
    expect(
      model.read("merchants.profileWorkspace").data.values.businessName
    ).toBe("Reviewed store");
    expect(panel().textContent).toContain(labels().saved);
    await tab("account");
    await change("name", "Reviewed person");
    await submit("account");
    expect(model.operations).toBe(2);
    expect(model.read("auth.selfProfileWorkspace").data.name).toBe(
      "Reviewed person"
    );
    expect(panel("account").textContent).toContain(labels().saved);
    expect(host.textContent).not.toContain("settingsWorkspaceUx.");
  }
);
it("retains unsaved fields when changing tabs", async () => {
  await render();
  await change("businessName", "Still editing");
  await tab("account");
  await change("name", "Another draft");
  await tab("store");
  expect(host.querySelector<HTMLInputElement>("#sw-businessName")?.value).toBe(
    "Still editing"
  );
  expect(host.querySelector<HTMLInputElement>("#sw-name")?.value).toBe(
    "Another draft"
  );
  expect(model.operations).toBe(0);
});
it.each([
  "foreign",
  "failure",
  "stale-error",
  "forbidden",
  "session",
  "loading",
])("does not show editable stale fields in %s mode", async mode => {
  model = new ServicePreviewModel(269, mode as any);
  await render();
  expect(host.querySelectorAll("form")).toHaveLength(0);
  expect(model.operations).toBe(0);
});
it("lets a member rename themselves without exposing the owner store profile", async () => {
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(panel().querySelector("form")).toBeNull();
  expect(panel().textContent).toContain(labels().restricted);
  await tab("account");
  await change("name", "Member name");
  await submit("account");
  expect(model.operations).toBe(1);
  expect(model.read("auth.selfProfileWorkspace").data.name).toBe("Member name");
  await tab("tools");
  expect(host.textContent).not.toContain(en.setupApprovalUx.resetOpen);
});
it.each([
  ["businessName", ""],
  ["phone", "invalid"],
  ["logoUrl", "javascript:alert(1)"],
])("shows an error next to invalid %s without saving", async (field, value) => {
  await render();
  await change(field, value);
  await submit();
  expect(model.operations).toBe(0);
  expect(host.querySelector("#sw-" + field)?.getAttribute("aria-invalid")).toBe(
    "true"
  );
  expect(panel().textContent).toContain(labels().invalid);
});
it("preserves unknown stored values for deliberate repair", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await render();
  expect(host.querySelector<HTMLSelectElement>("#sw-timezone")?.value).toBe("");
  expect(
    host.querySelector<HTMLInputElement>("#sw-autoReplyEnabled")?.indeterminate
  ).toBe(true);
  await change("businessName", "Reviewed store");
  await submit();
  expect(model.operations).toBe(0);
  expect(panel().textContent).toContain(labels().invalid);
});
it("does not replay an uncertain store save during verification", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await render();
  await change("businessName", "Saved once");
  await submit();
  expect(model.operations).toBe(1);
  expect(panel().textContent).toContain(labels().uncertain);
  await action(labels().check);
  expect(model.operations).toBe(1);
  expect(panel().textContent).toContain(labels().verified);
});
it("does not replay an uncertain account rename during verification", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await render();
  await tab("account");
  await change("name", "Saved person");
  await submit("account");
  expect(model.operations).toBe(1);
  await action(labels().check, "account");
  expect(model.operations).toBe(1);
  expect(panel("account").textContent).toContain(labels().verified);
});
it("does not equate an accepted verification email with verified ownership", async () => {
  await render();
  await tab("account");
  await action(labels().emailSend, "account");
  expect(model.operations).toBe(1);
  expect(panel("account").textContent).toContain(labels().emailSent);
  expect(panel("account").textContent).toContain(labels().emailUnverified);
  expect(model.read("auth.selfProfileWorkspace").data.emailVerified).toBe(
    false
  );
});
it("shows a bounded message for verification delivery failure", async () => {
  await render();
  vi.spyOn(model, "mutate").mockRejectedValue({
    message: "private provider detail",
    data: { code: "TOO_MANY_REQUESTS" },
  });
  await tab("account");
  await action(labels().emailSend, "account");
  expect(panel("account").textContent).toContain(labels().emailRateLimited);
  expect(host.textContent).not.toContain("private provider detail");
});
it("keeps currency, knowledge, payments, team and privacy reachable", async () => {
  await render();
  expect(panel().querySelector('a[href*="currency-settings"]')).not.toBeNull();
  await tab("tools");
  for (const path of [
    "sari-brain",
    "payment-settings",
    "team",
    "privacy-center",
  ])
    expect(
      panel("tools").querySelector('a[href*="' + path + '"]')
    ).not.toBeNull();
});
it("opens the actual setup reset review without resetting immediately", async () => {
  await render();
  await tab("tools");
  await click(en.setupApprovalUx.resetOpen);
  expect(document.body.textContent).toContain(en.setupApprovalUx.resetConfirm);
  expect(model.operations).toBe(0);
});
it("rejects a changed actor at the entry point", async () => {
  const original = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) =>
    name === "merchants.workspaceIdentity"
      ? { ...original(name, input), data: { id: 269, actorId: 1270 } }
      : original(name, input)
  );
  await render();
  expect(host.querySelectorAll("form")).toHaveLength(0);
});
it("keeps the other simulated store and account unchanged", async () => {
  const other = new ServicePreviewModel(270),
    before = other.read("merchants.profileWorkspace").data;
  await render();
  await change("businessName", "Edited");
  await submit();
  expect(other.read("merchants.profileWorkspace").data).toEqual(before);
  other.dispose();
});
it("aligns all new Arabic and English labels", () => {
  expect(Object.keys(ar.settingsWorkspaceUx).sort()).toEqual(
    Object.keys(en.settingsWorkspaceUx).sort()
  );
  for (const lang of [ar, en])
    for (const value of Object.values(lang.settingsWorkspaceUx))
      expect(value.trim()).not.toBe("");
});
it("requires the reviewed setup digest and preserves profile fields during a local reset", async () => {
  const before = model.read("merchants.profileWorkspace").data,
    progress = model.read("setupWizard.getProgress").data;
  await expect(
    model.mutate("setupWizard.resetWizard", {
      expectedDigest: "f".repeat(64),
      reviewed: true,
    })
  ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  const result = await model.mutate("setupWizard.resetWizard", {
    expectedDigest: progress.digest,
    reviewed: true,
  });
  expect(result).toMatchObject({ currentStep: 1, isCompleted: 0 });
  expect(model.read("merchants.profileWorkspace").data).toEqual(before);
});
it("does not allow duplicate pending store submissions", async () => {
  model = new ServicePreviewModel(269, "pending-save");
  await render();
  await change("businessName", "Once");
  await submit();
  await submit();
  expect(model.pending).toBe(1);
  await act(async () => model.finishPending());
  expect(model.operations).toBe(1);
});
it("updates status language after a completed save", async () => {
  await render();
  await change("businessName", "Saved");
  await submit();
  state.language = "ar";
  await render();
  expect(panel().textContent).toContain(ar.settingsWorkspaceUx.saved);
  expect(panel().textContent).not.toContain(en.settingsWorkspaceUx.saved);
});
