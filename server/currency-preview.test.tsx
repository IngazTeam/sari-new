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
import CurrencySettings from "../client/src/pages/CurrencySettings";
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
  history.replaceState(null, "", "/?path=/merchant/currency-settings");
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
        <CurrencySettings />
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

const snapshot = () => model.read("merchants.currencyWorkspace").data;
const choose = (code = "USD") =>
  act(async () => {
    host.querySelector<HTMLInputElement>(`input[value="${code}"]`)!.click();
  });
it.each(["ar", "en"])(
  "renders and saves the actual currency page in %s",
  async language => {
    state.language = language;
    await render();
    const c = (language === "ar" ? ar : en).currencyWorkspaceUx;
    expect(host.textContent).toContain(c.title);
    expect(host.textContent).toContain(c.impactAmounts);
    expect(
      host.querySelector("section.cw-workspace")?.getAttribute("dir")
    ).toBe(language === "ar" ? "rtl" : "ltr");
    await choose();
    expect(model.operations).toBe(0);
    expect(host.textContent).toContain(c.dirty);
    await click(c.save);
    expect(model.operations).toBe(1);
    expect(snapshot().currency).toBe("USD");
    expect(host.textContent).toContain(c.saved);
    expect(button(c.save).disabled).toBe(true);
    expect(host.textContent).not.toContain("currencyWorkspaceUx.");
  }
);
it.each([
  "foreign",
  "failure",
  "stale-error",
  "forbidden",
  "session",
  "loading",
])("blocks stale editable content in %s", async mode => {
  model = new ServicePreviewModel(269, mode as any);
  await render();
  expect(host.querySelector("form")).toBeNull();
  expect(model.operations).toBe(0);
});
it("keeps read-only users from saving", async () => {
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(button(en.currencyWorkspaceUx.save)).toBeUndefined();
  expect(
    Array.from(host.querySelectorAll("input")).every(i =>
      i.matches(":disabled")
    )
  ).toBe(true);
});
it("shows an unknown stored currency without preselecting SAR", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await render();
  expect(host.querySelectorAll("input:checked")).toHaveLength(0);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.unknown);
  expect(button(en.currencyWorkspaceUx.save).disabled).toBe(true);
  await choose();
  await click(en.currencyWorkspaceUx.save);
  expect(snapshot().currency).toBe("USD");
});
it("reconciles an unknown response by reading without a second save", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await render();
  await choose();
  await click(en.currencyWorkspaceUx.save);
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.uncertain);
  await click(en.currencyWorkspaceUx.check);
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.verified);
  expect(button(en.currencyWorkspaceUx.save).disabled).toBe(true);
});
it("requires an explicit reload after conflict without replaying the write", async () => {
  model = new ServicePreviewModel(269, "save-conflict");
  await render();
  await choose();
  await click(en.currencyWorkspaceUx.save);
  expect(model.operations).toBe(0);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.conflict);
  await click(en.currencyWorkspaceUx.check);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.different);
  await click(en.currencyWorkspaceUx.discard);
  expect(
    host.querySelector<HTMLInputElement>('input[value="SAR"]')?.checked
  ).toBe(true);
  expect(model.operations).toBe(0);
});
it("discards only after the explicit discard action", async () => {
  await render();
  await choose();
  await click(en.currencyWorkspaceUx.discard);
  expect(
    host.querySelector<HTMLInputElement>('input[value="SAR"]')?.checked
  ).toBe(true);
  expect(model.operations).toBe(0);
});
it("does not accept identity for another actor", async () => {
  const original = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) =>
    name === "merchants.workspaceIdentity"
      ? { ...original(name, input), data: { id: 269, actorId: 1270 } }
      : original(name, input)
  );
  await render();
  expect(host.querySelector("form")).toBeNull();
  expect(model.operations).toBe(0);
});
it("does not use the owner profile endpoint", async () => {
  const spy = vi.spyOn(model, "read");
  await render();
  expect(spy.mock.calls.some(([name]) => name === "merchants.getCurrent")).toBe(
    false
  );
});
it("keeps another tenant unchanged", async () => {
  const other = new ServicePreviewModel(270);
  const before = other.read("merchants.currencyWorkspace").data;
  await render();
  await choose();
  await click(en.currencyWorkspaceUx.save);
  expect(other.read("merchants.currencyWorkspace").data).toEqual(before);
  other.dispose();
});
it("updates feedback when the language changes", async () => {
  await render();
  await choose();
  await click(en.currencyWorkspaceUx.save);
  state.language = "ar";
  await render();
  expect(host.textContent).toContain(ar.currencyWorkspaceUx.saved);
  expect(host.textContent).not.toContain(en.currencyWorkspaceUx.saved);
});
import {
  scopedCurrency,
  verifiedCurrencySave,
} from "../client/src/lib/currency-workspace";
it("rejects foreign or contradictory save evidence", () => {
  const data = snapshot();
  expect(scopedCurrency({ ...data, merchantId: 270 }, 1269, 269)).toBeNull();
  expect(
    verifiedCurrencySave(
      { changed: true, workspace: { ...data, actorId: 1270 } },
      1269,
      269,
      "SAR"
    )
  ).toBeNull();
  expect(
    verifiedCurrencySave({ changed: true, workspace: data }, 1269, 269, "USD")
  ).toBeNull();
});
it("aligns every new translation and interpolation in both languages", () => {
  expect(Object.keys(ar.currencyWorkspaceUx).sort()).toEqual(
    Object.keys(en.currencyWorkspaceUx).sort()
  );
  for (const lang of [ar, en])
    for (const value of Object.values(lang.currencyWorkspaceUx))
      expect(value.trim().length).toBeGreaterThan(0);
});
it("locks a pending save against duplicate submit events", async () => {
  model = new ServicePreviewModel(269, "pending-save");
  await render(); await choose();
  await act(async () => {
    host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    host.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
  });
  expect(model.pending).toBe(1);
  await act(async () => model.finishPending());
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(en.currencyWorkspaceUx.saved);
});
it("does not display success for a late response after the session changes", async () => {
  const {clearKnowledgeWorkspace}=await import('../client/src/lib/knowledge-workspace-cache');
  model = new ServicePreviewModel(269, "pending-save");
  await render(); await choose(); await click(en.currencyWorkspaceUx.save);
  clearKnowledgeWorkspace();
  await act(async () => model.finishPending());
  expect(host.textContent).not.toContain(en.currencyWorkspaceUx.saved);
});
