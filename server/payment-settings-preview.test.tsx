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
import PaymentSettings from "../client/src/pages/merchant/PaymentSettings";
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
  history.replaceState(null, "", "/?path=/merchant/payment-settings");
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
        <PaymentSettings />
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

const labels = () =>
  state.language === "ar" ? ar.paymentWorkspaceUx : en.paymentWorkspaceUx;
const change = async (id: string, value: string) =>
  act(async () => {
    const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
      "#pw-" + id
    )!;
    expect(el).toBeTruthy();
    Object.getOwnPropertyDescriptor(
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    );
  });
const submit = async () =>
  act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
it.each(["ar", "en"])(
  "saves, checks and enables the actual payment screen in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.textContent).toContain(labels().title);
    expect(host.textContent).toContain(labels().notReady);
    expect(host.querySelector("section[dir]")?.getAttribute("dir")).toBe(
      language === "ar" ? "rtl" : "ltr"
    );
    await change("public", "pk_test_new_fixture");
    await submit();
    expect(host.textContent).toContain(labels().saved);
    expect(model.operations).toBe(1);
    expect(host.textContent).toContain(labels().notReady);
    await click(labels().check);
    expect(host.textContent).toContain(labels().checkSuccess);
    expect(model.read("merchantPayments.workspace").data.ready).toBe(false);
    await change("enabled", "on");
    await submit();
    expect(model.read("merchantPayments.workspace").data.ready).toBe(true);
    expect(host.querySelector(".pw-readiness")?.textContent).toBe(
      labels().ready
    );
  }
);
it("replaces a secret explicitly, hides it by default and clears it after verified save", async () => {
  await render();
  expect(host.querySelector("#pw-secret")).toBeNull();
  await change("secret-action", "replace");
  await change("secret", "sk_test_temporary-fixture");
  expect(host.querySelector("#pw-secret")?.getAttribute("type")).toBe(
    "password"
  );
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="' + labels().show + '"]'
      )!
      .click();
  });
  expect(host.querySelector("#pw-secret")?.getAttribute("type")).toBe("text");
  await submit();
  expect(host.textContent).toContain(labels().saved);
  expect(host.querySelector("#pw-secret")).toBeNull();
  expect(
    JSON.stringify(model.read("merchantPayments.workspace").data)
  ).not.toContain("temporary-fixture");
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.length).toBe(0);
});
it("preserves a draft until explicit discard and blocks probing while dirty", async () => {
  await render();
  await change("public", "pk_test_draft");
  expect(button(labels().check).disabled).toBe(true);
  await click(labels().discard);
  expect((host.querySelector("#pw-public") as HTMLInputElement).value).toBe(
    "pk_test_preview_269"
  );
  expect(model.operations).toBe(0);
  expect(host.textContent).toContain(labels().refreshed);
});
it.each([
  ["public", "pk_live_wrong"],
  ["mode", "live"],
])(
  "shows a field error for incompatible %s without writing",
  async (id, value) => {
    await render();
    await change(id, value);
    await submit();
    expect(host.textContent).toContain(labels().invalid);
    expect(model.operations).toBe(0);
    expect(host.querySelector('[aria-invalid="true"]')).toBeTruthy();
    expect(document.activeElement).toBe(
      host.querySelector('[aria-invalid="true"]')
    );
  }
);
it("does not enable a missing key and does not silently default invalid values", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "empty");
  await render();
  expect(host.textContent).toContain(labels().missing);
  expect(model.operations).toBe(0);
  await change("public", "pk_test_fixture");
  await change("enabled", "on");
  await submit();
  expect(host.textContent).toContain(labels().keyRequired);
  expect(model.operations).toBe(0);
});
it("makes creation from unsaved defaults an explicit action", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "empty");
  await render();
  expect(button(labels().save).disabled).toBe(false);
  await submit();
  expect(model.operations).toBe(1);
  expect(model.read("merchantPayments.workspace").data).toMatchObject({
    state: "saved",
    secretState: "missing",
    ready: false,
  });
});
it("requires disable before explicitly clearing a saved secret", async () => {
  await render();
  await change("enabled", "on");
  await submit();
  await change("secret-action", "clear");
  await submit();
  expect(host.textContent).toContain(labels().invalid);
  expect(model.read("merchantPayments.workspace").data.secretState).toBe(
    "stored"
  );
  await change("enabled", "off");
  await submit();
  expect(model.read("merchantPayments.workspace").data.secretState).toBe(
    "missing"
  );
});
it.each([
  "loading",
  "failure",
  "forbidden",
  "session",
  "foreign",
  "stale-error",
] as const)("does not render writable or stale form in %s mode", async mode => {
  model.dispose();
  model = new ServicePreviewModel(269, mode);
  await render();
  expect(host.querySelector("form")).toBeNull();
  expect(model.operations).toBe(0);
});
it("does not show keys or a form to roles without settings access", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(host.textContent).toContain(labels().restricted);
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).not.toContain("pk_test");
});
it("shows legacy unknowns without picking an enabled mode or currency", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "legacy");
  await render();
  expect(host.textContent).toContain(labels().legacy);
  for (const id of ["mode", "enabled", "currency"])
    expect((host.querySelector("#pw-" + id) as HTMLSelectElement).value).toBe(
      ""
    );
  expect(host.textContent).toContain(labels().secretInvalid);
  expect(button(labels().check).disabled).toBe(true);
});
it("does not claim secret equality or repeat a write after an uncertain save", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "uncertain-save");
  await render();
  await change("secret-action", "replace");
  await change("secret", "sk_test_unknown-fixture");
  await submit();
  expect(host.textContent).toContain(labels().uncertain);
  expect(model.operations).toBe(1);
  expect(host.querySelector("#pw-secret")).toBeNull();
  await submit();
  expect(model.operations).toBe(1);
  await click(labels().refresh);
  expect(host.textContent).toContain(labels().refreshed);
  expect(host.textContent).not.toContain(labels().saved);
  expect(model.operations).toBe(1);
});
it("guards duplicate submission during a pending save", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "pending-save");
  await render();
  await change("public", "pk_test_pending");
  await submit();
  await submit();
  expect(model.pending).toBe(1);
  expect(model.operations).toBe(0);
  await act(async () => {
    model.finishPending();
  });
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(labels().saved);
});
it("does not show readiness for rejected credentials", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "credentials-invalid");
  await render();
  await click(labels().check);
  expect(host.textContent).toContain(labels().checkRejected);
  expect(model.read("merchantPayments.workspace").data.verified).toBe(false);
});
it("does not automatically retry a conflict or generic provider failure", async () => {
  model.dispose();
  model = new ServicePreviewModel(269, "save-conflict");
  await render();
  await change("public", "pk_test_conflict");
  await submit();
  expect(host.textContent).toContain(labels().conflict);
  expect(model.operations).toBe(0);
  await submit();
  expect(model.operations).toBe(0);
});
it("labels saved legacy options as unavailable and never exposes an edit control for them", async () => {
  await render();
  expect(host.textContent).toContain(labels().oldHint);
  expect(host.textContent).toContain(labels().oldOptions);
  expect(
    host.querySelector('[name="autoSendPaymentLink"],textarea')
  ).toBeNull();
});
it("keeps status text translated after changing language", async () => {
  await render();
  await change("public", "pk_test_local");
  await submit();
  state.language = "ar";
  await render();
  expect(host.textContent).toContain(ar.paymentWorkspaceUx.saved);
  expect(host.textContent).not.toContain(en.paymentWorkspaceUx.saved);
});
it("does not leak changes into another simulated tenant", async () => {
  await render();
  await change("public", "pk_test_own");
  await submit();
  const other = new ServicePreviewModel(270);
  expect(
    other.read("merchantPayments.workspace").data.values.tapPublicKey
  ).toBe("pk_test_preview_270");
  other.dispose();
});
it("keeps all related destinations and translation keys available", async () => {
  await render();
  const links = Array.from(host.querySelectorAll("a")).map(a =>
    a.getAttribute("href")
  );
  for (const route of ["settings", "payment-links", "payments"])
    expect(
      links.some(
        x =>
          x?.includes("/merchant/" + route) ||
          x?.includes(encodeURIComponent("/merchant/" + route))
      )
    ).toBe(true);
  expect(Object.keys(ar.paymentWorkspaceUx).sort()).toEqual(
    Object.keys(en.paymentWorkspaceUx).sort()
  );
  expect(host.textContent).not.toContain("paymentWorkspaceUx.");
});
