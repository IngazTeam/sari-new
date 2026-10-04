// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
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
import Payments from "../client/src/pages/merchant/Payments";
import PaymentDetails from "../client/src/pages/PaymentDetails";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  type ServiceMode,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
import {
  paymentHistoryExport,
  readPaymentHistorySearch,
} from "../client/src/lib/payment-history-view";
import { formatPaymentTotalMoney } from "../shared/payment-money";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.language = "en";
  history.replaceState(null, "", "/?path=/merchant/payments");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  model = new ServicePreviewModel(269);
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const c = () =>
  state.language === "ar" ? ar.paymentHistoryUx : en.paymentHistoryUx;
const render = (detail = false) =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        {detail ? <PaymentDetails /> : <Payments />}
      </ServicePreviewContext.Provider>
    )
  );
const go = async (path: string, extra = "") =>
  act(async () => {
    history.replaceState(null, "", "/?path=" + path + extra);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
const button = (text: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    x => x.textContent?.trim() === text
  )!;
const click = async (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });
const change = async (id: string, value: string) =>
  act(async () => {
    const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
      "#ph-" + id
    )!;
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
const submit = () =>
  act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
it.each(["ar", "en"])(
  "renders real history and pages all 52 records in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.querySelector(".ph-workspace")?.getAttribute("dir")).toBe(
      language === "ar" ? "rtl" : "ltr"
    );
    expect(host.textContent).toContain(c().financialHint);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
    await click(c().next);
    expect(
      readPaymentHistorySearch(new URLSearchParams(location.search).toString())
        .success
    ).toBe(true);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
    await click(c().next);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(button(c().next).disabled).toBe(true);
    await click(c().previous);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
  }
);
it("submits server-wide filters and resets page when changing them", async () => {
  await render();
  await click(c().next);
  await change("search", "chg_local_269_52");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
  await submit();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(host.textContent).toContain("#52");
  expect(button(c().previous).disabled).toBe(true);
  await click(c().reset);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
});
it("keeps authorized records distinct from captured when filtering", async () => {
  await render();
  await change("status", "authorized");
  await submit();
  expect(
    Array.from(host.querySelectorAll("tbody .ph-status")).every(
      x => x.textContent === c().authorized
    )
  ).toBe(true);
  expect(host.textContent).toContain(c().captured);
  const data = model.read("payments.workspace.list", {
    search: "",
    status: "authorized",
    page: 1,
    pageSize: 25,
  }).data;
  expect(data.totals.currencies.every((x: any) => x.capturedMinor === 0)).toBe(
    true
  );
});
it("rejects invalid date ranges and exposes filter errors instead of fetching another period", async () => {
  await render();
  await change("from", "2026-10-05");
  await change("to", "2026-10-04");
  await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    c().invalidFilter
  );
  expect(location.search).not.toContain("from=");
  expect(host.querySelector(".ph-filter-details")?.hasAttribute("open")).toBe(
    true
  );
  expect(document.activeElement?.id).toBe("ph-to");
  expect(host.querySelector("#ph-to")?.getAttribute("aria-describedby")).toBe(
    "ph-filter-error"
  );
  expect(
    host.querySelector("#ph-from")?.getAttribute("aria-invalid")
  ).toBeNull();
  await change("to", "2026-10-06");
  expect(host.querySelector("#ph-to")?.getAttribute("aria-invalid")).toBeNull();
});
it("distinguishes empty records, unmatched filters and an out-of-range page", async () => {
  model = new ServicePreviewModel(269, "empty");
  await render();
  expect(host.textContent).toContain(c().empty);
  model = new ServicePreviewModel(269);
  await go("/merchant/payments", "&search=unmatched");
  await render();
  expect(host.textContent).toContain(c().noMatches);
  await go("/merchant/payments", "&page=9999");
  expect(host.textContent).toContain(c().pageEmpty);
  expect(button(c().previous).disabled).toBe(false);
});
it.each([
  "loading",
  "failure",
  "forbidden",
  "session",
  "foreign",
  "stale-error",
] as ServiceMode[])("hides financial records in %s", async mode => {
  model = new ServicePreviewModel(269, mode);
  await render();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(0);
  expect(host.textContent).not.toContain("chg_local");
  await go("/merchant/payments/1");
  await render(true);
  expect(host.querySelector("[data-payment-amount]")).toBeNull();
});
it("does not let a restricted actor view either surface", async () => {
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(host.textContent).toContain(c().ownerOnly);
  await go("/merchant/payments/1");
  await render(true);
  expect(host.textContent).toContain(c().ownerOnly);
  expect(host.querySelector("[data-payment-amount]")).toBeNull();
});
it("shows invalid legacy money and status without inventing zero or pending", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await go("/merchant/payments/1");
  await render(true);
  expect(host.querySelector("[data-payment-amount]")?.textContent).toBe(
    c().moneyUnknown
  );
  expect(host.querySelector(".ph-status")?.textContent).toBe(c().unknownStatus);
});
it.each(["ar", "en"])(
  "renders complete translated details, a correct amount and a safe booking link in %s",
  async language => {
    state.language = language;
    await go("/merchant/payments/2", "&status=authorized&page=2");
    await render(true);
    expect(host.textContent).toContain(c().detailTitle);
    expect(host.textContent).toContain(c().customerName);
    expect(host.textContent).toContain(c().chargeId);
    expect(host.querySelectorAll(".ph-timeline dl>div")).toHaveLength(7);
    expect(host.querySelector('a[href*="booking%3D"]')).toBeNull();
    expect(
      Array.from(host.querySelectorAll("a")).some(a =>
        a.href.includes("booking=1")
      )
    ).toBe(true);
    expect(host.querySelector(".ph-back")?.getAttribute("href")).toContain(
      "status=authorized"
    );
    expect(host.querySelector(".ph-back")?.getAttribute("href")).toContain(
      "page=2"
    );
    expect(host.textContent).not.toContain("paymentDetailsPage.");
  }
);
it("hides conflicting target identifiers and explains their absence", async () => {
  model = new ServicePreviewModel(269, "unavailable-reference");
  await go("/merchant/payments/1");
  await render(true);
  expect(host.textContent).toContain(c().relatedUnavailable);
  expect(
    Array.from(host.querySelectorAll("a")).some(a =>
      a.href.includes("orders/1")
    )
  ).toBe(false);
});
it.each(["99999", "1garbage", "0"])(
  "does not coerce an invalid or missing detail %s",
  async id => {
    await go("/merchant/payments/" + id);
    await render(true);
    expect(host.querySelector("[data-payment-amount]")).toBeNull();
  }
);
it("exports only validated record evidence and never claims a completed file save", async () => {
  await go("/merchant/payments/1");
  await render(true);
  const snapshot = model.read("payments.workspace.detail", { id: 1 }).data;
  const json = paymentHistoryExport(snapshot);
  expect(JSON.parse(json)).toHaveProperty("payment.amountMinor", 12550);
  expect(json).not.toContain('"merchantId"');
  expect(() =>
    paymentHistoryExport({
      ...snapshot,
      payment: { ...snapshot.payment, metadata: "private" },
    })
  ).toThrow();
  const create = vi.fn(() => "blob:synthetic");
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = vi.fn();
    }
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await click(c().export);
  expect(create).toHaveBeenCalledOnce();
  expect(host.textContent).toContain(c().downloadStarted);
});
it("reports export failure and offers browser printing without a fake WhatsApp action", async () => {
  await go("/merchant/payments/1");
  await render(true);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = () => {
        throw Error("synthetic");
      };
    }
  );
  await click(c().export);
  expect(host.textContent).toContain(c().actionFailed);
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  await click(c().print);
  expect(print).toHaveBeenCalledOnce();
  expect(
    Array.from(host.querySelectorAll("button")).some(b =>
      /whatsapp|واتساب/i.test(b.textContent ?? "")
    )
  ).toBe(false);
});
it("uses the selected tenant and keeps aggregate amounts above one row's storage limit", async () => {
  model = new ServicePreviewModel(270);
  await render();
  expect(host.textContent).toContain("Madar");
  expect(host.textContent).not.toContain("Nawa");
  expect(formatPaymentTotalMoney(3000000000, "SAR", "en")).toContain(
    "30,000,000.00"
  );
});
