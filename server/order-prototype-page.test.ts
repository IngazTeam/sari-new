// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import uxAr from "../client/src/locales/merchant-ux.ar";
import uxEn from "../client/src/locales/merchant-ux.en";
vi.mock(
  "../client/src/lib/trpc",
  async () =>
    await import("../prototypes/tenant-dashboard/src/order-preview-api")
);
vi.mock("react-i18next", async () => {
  const s =
    await import("../prototypes/tenant-dashboard/src/order-preview-state");
  return {
    useTranslation: () => {
      s.useOrderLanguage();
      return {
        i18n: { language: s.orderLanguage },
        t: (key: string, values: any = {}) =>
          String(
            key
              .split(".")
              .reduce(
                (v: any, k) => v?.[k],
                s.orderLanguage === "en"
                  ? { ...en, merchantUx: uxEn }
                  : { ...ar, merchantUx: uxAr }
              ) ?? key
          ).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")),
      };
    },
  };
});
import { OrderWorkspace } from "../client/src/components/merchant/OrderWorkspace";
import {
  finances,
  platforms,
  orders,
  setOrderLanguage,
} from "../prototypes/tenant-dashboard/src/order-preview-state";
import { orderPreviewScope } from "../prototypes/tenant-dashboard/src/order-model";
import { readOrderStatusCache } from "../client/src/lib/order-status-cache";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  orders.reset();
  setOrderLanguage("ar");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const render = () =>
  act(async () => {
    root.render(
      React.createElement(OrderWorkspace, { scope: orderPreviewScope })
    );
  });
const click = async (text: string) => {
  const node = Array.from(host.querySelectorAll("button")).find(
    v => v.textContent?.trim() === text || v.getAttribute("aria-label") === text
  );
  expect(node, text).toBeTruthy();
  await act(async () => node!.click());
};
const l = ar.orderWorkspace;
const expand = async (selector: string) => {
  const node = host.querySelector<HTMLDetailsElement>(selector)!;
  expect(node, selector).toBeTruthy();
  await act(async () => {
    node.open = true;
    node.dispatchEvent(new Event("toggle", { bubbles: false }));
  });
};
const openSalla = async () => {
  await render();
  await expand("[data-salla-checkout-review]");
};
const edit = async (selector: string, value: string) => {
  const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector
  )!;
  expect(node, selector).toBeTruthy();
  const prototype =
    node.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const press = (selector: string) =>
  act(async () => {
    const node = host.querySelector<HTMLElement>(selector);
    expect(node, selector).toBeTruthy();
    node!.click();
  });
const marginPreview = async () => {
  for (const field of ["tax", "shipping", "other"])
    await edit(`#invoice-${field}-2`, "0");
  await press("#invoice-margin-preview-2");
};
const start = async () => {
  await click("فتح الطلب DEMO-ORD-001");
  await click(l.statusChange);
  await click(l.prepare);
};
const approve = async () => {
  const checks = host.querySelectorAll<HTMLInputElement>(
    ".ow-form input[type=checkbox]"
  );
  await act(async () => checks[1].click());
  await click(l.save);
};
describe("actual order workspace with prototype API adapter", () => {
  it("paginates ready carts and restores the latest page", async () => {
    await openSalla();
    expect(host.querySelectorAll("[data-checkout-row]")).toHaveLength(20);
    await press("[data-checkout-older]");
    expect(host.querySelectorAll("[data-checkout-row]")).toHaveLength(2);
    await press("[data-checkout-browser] > div > [data-checkout-refresh]");
    expect(host.querySelectorAll("[data-checkout-row]")).toHaveLength(20);
  });
  it("keeps inspection mounted when a saved audit invalidates history", async () => {
    await openSalla();
    await press('[data-checkout-row="100"] [data-checkout-select]');
    await edit("[data-checkout-order]", "٧٧٠٠١");
    await edit("[data-checkout-transaction]", "88001");
    await press("[data-checkout-submit]");
    expect(
      host.querySelectorAll('[data-checkout-comparison="equal"]')
    ).toHaveLength(3);
    await press("[data-checkout-save]");
    expect(host.querySelector("[data-checkout-saved]")).toBeTruthy();
    await act(async () => setOrderLanguage("en"));
    expect(host.querySelector("[data-checkout-saved]")).toBeTruthy();
    expect(
      host.querySelector<HTMLInputElement>("[data-checkout-order]")?.value
    ).toBe("٧٧٠٠١");
    expect(host.textContent).not.toContain("merchantUx.");
    expect(
      host.querySelector<HTMLInputElement>("[data-checkout-order]")?.value
    ).toBe("٧٧٠٠١");
    await expand("[data-checkout-history]");
    expect(host.querySelectorAll("[data-checkout-audit]")).toHaveLength(1);
    expect(host.querySelector("[data-checkout-saved]")).toBeTruthy();
  });
  it("retries the same audit after lost response without duplication", async () => {
    platforms.setMode("lostAudit");
    await openSalla();
    await press('[data-checkout-row="100"] [data-checkout-select]');
    await edit("[data-checkout-order]", "77001");
    await press("[data-checkout-submit]");
    await press("[data-checkout-save]");
    expect(host.querySelector("[data-checkout-save-error]")).toBeTruthy();
    await press("[data-checkout-save]");
    expect(host.querySelector("[data-checkout-saved]")).toBeTruthy();
    expect(platforms.listAudits({}).items).toHaveLength(1);
  });
  it("keeps recovery confirmation until refresh then lists the recovered cart", async () => {
    await openSalla();
    await expand("[data-cart-problems]");
    await press('[data-cart-problem="200"] [data-cart-recover]');
    expect(host.querySelector("[data-cart-recovered]")).toBeTruthy();
    await press("[data-cart-problems-refresh]");
    expect(host.querySelector('[data-cart-problem="200"]')).toBeNull();
    expect(host.querySelector('[data-checkout-row="200"]')).toBeTruthy();
  });
  it("refreshes verified Zid rows without presenting a paid order", async () => {
    await render();
    await edit("#zid-order-366", "9900");
    await press("div:has(> label > #zid-order-366) input[type=checkbox]");
    await press("div:has(> label > #zid-order-366) button");
    expect(host.querySelector("#zid-order-366")).toBeNull();
    expect(host.textContent).toContain(uxAr.zidReconciliation.verified);
    expect(orders.detail(1)?.paymentStatus).toBe("unpaid");
  });
  it("reviews exact margin costs, invalidates editing, and refreshes the approved invoice", async () => {
    await render();
    await click("فتح الطلب DEMO-ORD-002");
    await marginPreview();
    expect(host.textContent).toContain(uxAr.invoiceMargin.pass);
    await press("#invoice-final-attested-2");
    expect(
      host.querySelector<HTMLButtonElement>("[data-invoice-approve]")?.disabled
    ).toBe(false);
    await edit("#invoice-tax-2", "1");
    expect(
      host.querySelector<HTMLButtonElement>("[data-invoice-approve]")?.disabled
    ).toBe(true);
    await press("#invoice-margin-preview-2");
    await press("#invoice-final-attested-2");
    await press("[data-invoice-approve]");
    expect(orders.detail(2)?.checkoutReviewRequired).toBe(false);
    expect(host.querySelector("[data-invoice-approve]")).toBeNull();
  });
  it("requires an explicit exception and preserves its reason in the refreshed detail", async () => {
    finances.setMode("below");
    await render();
    await click("فتح الطلب DEMO-ORD-002");
    await marginPreview();
    expect(host.querySelector("[data-margin-exception]")).toBeTruthy();
    await edit("#invoice-exception-reason-2", "استثناء توضيحي لعميل مستمر");
    await press("#invoice-exception-reviewed-2");
    await press("#invoice-final-attested-2");
    expect(
      host.querySelector<HTMLButtonElement>("[data-invoice-approve]")?.disabled
    ).toBe(false);
    await press("[data-invoice-approve]");
    expect(host.textContent).toContain("استثناء توضيحي لعميل مستمر");
  });
  it("records the verified checkout attempt without marking the order paid", async () => {
    await render();
    await click("فتح الطلب DEMO-ORD-001");
    await edit(
      "[data-checkout-review] input:not([type=checkbox])",
      "chg_demo000065"
    );
    await press("[data-checkout-review] input[type=checkbox]");
    await press("[data-checkout-reconcile]");
    expect(
      host.querySelector("[data-checkout-review-outcome]")?.textContent
    ).toBe(uxAr.checkoutAttempts.verified);
    expect(orders.detail(1)?.paymentStatus).toBe("unpaid");
  });
  it("refreshes discount release details after the reviewed write", async () => {
    await render();
    await click("فتح الطلب DEMO-ORD-006");
    await edit("#coupon-release-reason-6", "إلغاء المثال بطلب العميل");
    await press("[data-coupon-release-review] input[type=checkbox]");
    await press("[data-coupon-release-save]");
    expect(
      host.querySelector("[data-coupon-release-audit]")?.textContent
    ).toContain("إلغاء المثال بطلب العميل");
    expect(host.querySelector("[data-coupon-release-review]")).toBeNull();
  });
  it("navigates both pages and renders every scoped record", async () => {
    await render();
    expect(host.querySelectorAll(".ow-open")).toHaveLength(25);
    await click(uxAr.actions.nextPage);
    expect(host.querySelectorAll(".ow-open")).toHaveLength(2);
    expect(host.textContent).toContain("DEMO-ORD-027");
    expect(host.textContent).not.toContain("merchantUx.");
  });
  it("recovers the stored receipt after a simulated lost response", async () => {
    orders.setMode("lost");
    await render();
    await start();
    await approve();
    expect(readOrderStatusCache(orderPreviewScope).attempt).toBeTruthy();
    expect(host.querySelector<HTMLSelectElement>("#ow-status")?.value).toBe(
      "processing"
    );
    await click(l.checkReceipt);
    expect(readOrderStatusCache(orderPreviewScope).attempt).toBeUndefined();
    expect(host.textContent).toContain(l.receipt);
    expect(orders.detail(1)?.status).toBe("processing");
  });
  it("keeps the draft and requires a new review after a conflict", async () => {
    orders.setMode("conflict");
    await render();
    await start();
    await approve();
    expect(readOrderStatusCache(orderPreviewScope).draft).toBeTruthy();
    expect(host.querySelector(".ow-review")).toBeNull();
    expect(orders.detail(1)?.status).toBe("pending");
    await click(l.prepare);
    await approve();
    expect(orders.detail(1)?.status).toBe("processing");
  });
  it("renders genuine error and read-only UI states in both languages", async () => {
    orders.setMode("viewer");
    setOrderLanguage("en");
    await render();
    await click("Open order DEMO-ORD-001");
    const button = Array.from(host.querySelectorAll("button")).find(
      v => v.textContent === en.orderWorkspace.statusChange
    );
    expect(button?.disabled).toBe(true);
    await act(async () => orders.setMode("error"));
    expect(host.textContent).toContain("We could not load this page");
    expect(host.textContent).not.toContain("orderWorkspace.");
  });
});
