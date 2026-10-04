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
import NotificationSettings from "../client/src/pages/NotificationSettings";
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
  history.replaceState(null, "", "/?path=/merchant/notification-settings");
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
        <NotificationSettings />
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

import {
  scopedNotificationPreferences,
  scopedPreferenceSave,
} from "../client/src/lib/notification-preference-workspace";
import { defaultNotificationPreferences } from "../shared/notification-preferences-workspace";
const snapshot = () => model.read("notificationPreferences.workspace").data;
const toggle = () =>
  act(async () => {
    host.querySelector<HTMLInputElement>("#np-newOrdersEnabled")!.click();
  });
it.each(["ar", "en"])(
  "renders and saves the actual preferences page in %s",
  async language => {
    state.language = language;
    await render();
    const c = (language === "ar" ? ar : en).notificationPreferenceUx;
    expect(host.textContent).toContain(c.title);
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(7);
    expect(
      host.querySelector("section.np-workspace")?.getAttribute("dir")
    ).toBe(language === "ar" ? "rtl" : "ltr");
    await toggle();
    expect(model.operations).toBe(0);
    expect(host.textContent).toContain(c.dirty);
    await click(c.save);
    expect(model.operations).toBe(1);
    expect(snapshot().values.newOrdersEnabled).toBe(false);
    expect(host.textContent).toContain(c.saved);
    expect(button(c.save).disabled).toBe(true);
    expect(host.textContent).not.toContain("notificationPreferenceUx.");
  }
);
it.each([
  "foreign",
  "failure",
  "stale-error",
  "forbidden",
  "session",
  "loading",
])("never exposes editable stale data in %s mode", async mode => {
  model = new ServicePreviewModel(269, mode as any);
  await render();
  expect(host.querySelector("form")).toBeNull();
  expect(model.operations).toBe(0);
});
it("offers read-only fields to a viewer without a save action", async () => {
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(button(en.notificationPreferenceUx.save)).toBeUndefined();
  expect(
    Array.from(host.querySelectorAll<HTMLInputElement>("input")).every(e =>
      e.matches(":disabled")
    )
  ).toBe(true);
});
it("keeps invalid stored times visibly unknown rather than filling defaults", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await render();
  expect(
    host.querySelector<HTMLInputElement>("#np-quietHoursStart")!.value
  ).toBe("");
  expect(host.textContent).toContain(en.notificationPreferenceUx.invalid);
  await toggle();
  await click(en.notificationPreferenceUx.save);
  expect(model.operations).toBe(0);
  expect(host.querySelector('[aria-invalid="true"]')).not.toBeNull();
});
it("requires a refresh after a write conflict rather than replaying the mutation", async () => {
  model = new ServicePreviewModel(269, "save-conflict");
  await render();
  await toggle();
  await click(en.notificationPreferenceUx.save);
  expect(model.operations).toBe(0);
  expect(host.textContent).toContain(en.notificationPreferenceUx.conflict);
  await click(en.notificationPreferenceUx.check);
  expect(host.textContent).toContain(en.notificationPreferenceUx.different);
  expect(model.operations).toBe(0);
  await click(en.notificationPreferenceUx.discard);
  expect(
    host.querySelector<HTMLInputElement>("#np-newOrdersEnabled")!.checked
  ).toBe(true);
});
it("reconciles an uncertain saved response by reading without saving twice", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await render();
  await toggle();
  await click(en.notificationPreferenceUx.save);
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(en.notificationPreferenceUx.uncertain);
  await click(en.notificationPreferenceUx.check);
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(en.notificationPreferenceUx.saved);
  expect(button(en.notificationPreferenceUx.save).disabled).toBe(true);
});
it("rejects foreign or contradictory save evidence", () => {
  const data = snapshot();
  expect(
    scopedNotificationPreferences({ ...data, merchantId: 270 }, 1269, 269)
  ).toBeNull();
  expect(
    scopedPreferenceSave(
      { changed: true, workspace: { ...data, actorId: 1270 } },
      1269,
      269,
      defaultNotificationPreferences
    )
  ).toBeNull();
  expect(
    scopedPreferenceSave(
      {
        changed: true,
        workspace: {
          ...data,
          values: { ...data.values, newOrdersEnabled: false },
        },
      },
      1269,
      269,
      defaultNotificationPreferences
    )
  ).toBeNull();
});
it("does not mutate the other simulated tenant", async () => {
  const other = new ServicePreviewModel(270);
  const before = other.read("notificationPreferences.workspace").data;
  await render();
  await toggle();
  await click(en.notificationPreferenceUx.save);
  expect(other.read("notificationPreferences.workspace").data).toEqual(before);
  other.dispose();
});
it("discards unsaved edits only through the explicitly labelled reload action", async () => {
  await render();
  await toggle();
  await click(en.notificationPreferenceUx.discard);
  expect(
    host.querySelector<HTMLInputElement>("#np-newOrdersEnabled")!.checked
  ).toBe(true);
  expect(model.operations).toBe(0);
});
it("keeps a missing preference record marked as default until explicitly saved", async () => {
  model = new ServicePreviewModel(269, "empty");
  await render();
  expect(host.textContent).toContain(en.notificationPreferenceUx.defaults);
  expect(model.operations).toBe(0);
  await click(en.notificationPreferenceUx.save);
  expect(snapshot().status).toBe("saved");
  expect(model.operations).toBe(1);
});

it('opens a member workspace without using the owner-only merchant profile',async()=>{
 model=new ServicePreviewModel(269,'readonly');const original=model.read.bind(model);const reads=vi.spyOn(model,'read').mockImplementation((name,input)=>name==='merchants.getCurrent'?{data:undefined,isLoading:false,isFetching:false,error:null}:original(name,input));
 await render();expect(host.querySelector('h1')).not.toBeNull();expect(host.querySelector('section[data-state="missing"]')).toBeNull();expect(reads.mock.calls.some(([name])=>name==='merchants.getCurrent')).toBe(false);expect(reads.mock.calls.some(([name])=>name==='merchants.workspaceIdentity')).toBe(true);
});
it('does not accept an identity response for another actor',async()=>{
 const original=model.read.bind(model);vi.spyOn(model,'read').mockImplementation((name,input)=>name==='merchants.workspaceIdentity'?{...original(name,input),data:{id:269,actorId:1270}}:original(name,input));await render();expect(host.querySelector('section[data-state="missing"]')).not.toBeNull();expect(model.operations).toBe(0);
});
