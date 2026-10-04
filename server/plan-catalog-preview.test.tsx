// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const state = vi.hoisted(() => ({ language: "en", navigate: vi.fn() }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("@/lib/subscription-checkout-navigation", () => ({
  openSubscriptionCheckout: state.navigate,
}));
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
import Plans from "../client/src/pages/merchant/SubscriptionPlans";
import Compare from "../client/src/pages/ComparePlans";
import Checkout from "../client/src/pages/merchant/Checkout";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  type ServiceMode,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
import {
  catalogSelection,
  scopedCatalog,
  scopedCheckoutReview,
  annualSaving,
  safeTapCheckoutUrl,
} from "../client/src/lib/plan-catalog-view";
import {
  planCatalogPreview,
  checkoutPreview,
} from "../prototypes/tenant-dashboard/src/plan-catalog-preview-model";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
const c = () => (state.language === "ar" ? ar.planCatalogUx : en.planCatalogUx);
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, action: () => unknown) => action() } });
  state.language = "en";
  state.navigate.mockReset();
  history.replaceState(null, "", "/?path=/merchant/subscription/plans");
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
const render = (view: "plans" | "compare" | "checkout" = "plans") =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        {view === "checkout" ? (
          <Checkout />
        ) : view === "compare" ? (
          <Compare />
        ) : (
          <Plans />
        )}
      </ServicePreviewContext.Provider>
    )
  );
const go = (path: string, query = "") =>
  act(async () => {
    history.replaceState(null, "", "/?path=" + path + query);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
const clickText = (text: string) =>
  act(async () => {
    const node = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).find(n => n.textContent === text);
    expect(node).toBeTruthy();
    node!.click();
  });
it.each(["en", "ar"])(
  "renders every plan, all five limits, exact currencies and translated controls in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.querySelectorAll(".pc-plan")).toHaveLength(3);
    expect(host.querySelectorAll(".pc-limits dt")).toHaveLength(15);
    expect(host.textContent).toContain(c().quotaNote);
    expect(host.textContent).not.toContain("planCatalogUx.");
    expect(host.querySelector(".pc-plan-current")?.textContent).toContain(
      c().current
    );
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  }
);
it("preserves yearly prices and selection in every review link", async () => {
  await go("/merchant/subscription/compare", "&cycle=yearly");
  await render("compare");
  expect(host.textContent).toContain(c().annualTotal);
  expect(host.querySelectorAll(".pc-saving")).toHaveLength(2);
  expect(
    Array.from(
      host.querySelectorAll<HTMLAnchorElement>(".pc-plan-action a")
    ).every(a => a.href.includes("cycle=yearly"))
  ).toBe(true);
  expect(host.textContent).not.toContain("20%");
});
it("searches the complete catalog and distinguishes an empty search from no plans", async () => {
  await go("/merchant/subscription/plans", "&q=Growth");
  await render();
  expect(host.querySelectorAll(".pc-plan")).toHaveLength(1);
  await go("/merchant/subscription/plans", "&q=absent");
  expect(host.textContent).toContain(c().noResults);
  await clickText(c().reset);
  expect(host.querySelectorAll(".pc-plan")).toHaveLength(3);
});
it.each([
  "empty",
  "loading",
  "failure",
  "forbidden",
  "session",
  "foreign",
  "stale-error",
] as ServiceMode[])(
  "hides prices and checkout actions in %s state",
  async mode => {
    model.dispose();
    model = new ServicePreviewModel(269, mode);
    await render();
    expect(host.querySelectorAll(".pc-plan")).toHaveLength(0);
    expect(host.querySelectorAll(".pc-plan-action a")).toHaveLength(0);
  }
);
it.each(["readonly", "legacy", "unavailable-reference"] as ServiceMode[])(
  "does not enable checkout in %s state",
  async mode => {
    model.dispose();
    model = new ServicePreviewModel(269, mode);
    await render();
    expect(host.querySelectorAll(".pc-plan-action a")).toHaveLength(0);
  }
);
it("shows the yearly reviewed amount and requires deliberate acknowledgement before payment", async () => {
  await go("/merchant/checkout", "&planId=11&cycle=yearly");
  await render("checkout");
  expect(host.textContent).toContain(c().yearly);
  expect(host.textContent).toContain("2,440.00");
  const pay = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find(n => n.textContent === c().pay)!;
  expect(pay.disabled).toBe(true);
  expect(model.operations).toBe(0);
  await act(async () =>
    (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()
  );
  expect(pay.disabled).toBe(false);
  await clickText(c().pay);
  expect(model.operations).toBe(1);
  expect(state.navigate).toHaveBeenCalledWith(
    "https://sandbox.payments.tap.company/preview-only"
  );
});
it.each(["action-failure", "save-conflict", "uncertain-save"] as ServiceMode[])(
  "does not redirect or claim success on %s",
  async mode => {
    model.dispose();
    model = new ServicePreviewModel(269, mode);
    await go("/merchant/checkout", "&planId=11");
    await render("checkout");
    await act(async () =>
      (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()
    );
    await clickText(c().pay);
    expect(state.navigate).not.toHaveBeenCalled();
    expect(host.textContent).toContain(
      mode === "uncertain-save" ? c().attempt_pending : c().attempt_not_found
    );
    expect(host.textContent).not.toContain(c().completed);
  }
);
it.each([
  "?cycle=weekly",
  "?cycle=monthly&cycle=yearly",
  "?q=" + "x".repeat(101),
])("rejects malformed catalog URL %s", value =>
  expect(catalogSelection(value)).toBeNull()
);
it.each([
  "?planId=1.5",
  "?planId=1x",
  "?planId=-1",
  "?planId=2147483648",
  "?planId=1&planId=2",
  "",
])("rejects malformed checkout identity %s", value =>
  expect(catalogSelection(value, true)).toBeNull()
);
it("validates scoped source and review identity before presenting financial values", () => {
  const snapshot = planCatalogPreview(269, 1269, "normal");
  expect(scopedCatalog(snapshot, 1269, 270)).toBeNull();
  expect(scopedCatalog(snapshot, 1270, 269)).toBeNull();
  const review = checkoutPreview(269, 1269, "normal", {
    planId: 11,
    billingCycle: "yearly",
  });
  expect(scopedCheckoutReview(review, 1269, 269, 11, "yearly")).not.toBeNull();
  expect(scopedCheckoutReview(review, 1269, 269, 11, "monthly")).toBeNull();
  expect(
    scopedCheckoutReview({ ...review, chargeMinor: 0 }, 1269, 269, 11, "yearly")
  ).toBeNull();
});
it("calculates only positive documented annual saving", () => {
  expect(annualSaving(999, 9990)).toBe(1998);
  expect(annualSaving(100, 1200)).toBeNull();
  expect(annualSaving(100, 1300)).toBeNull();
  expect(annualSaving(null, 100)).toBeNull();
});
it.each([
  "javascript:alert(1)",
  "http://tap.company/a",
  "https://tap.company.evil.test/a",
  "https://evil.test/tap.company",
  "https://user:pass@tap.company/a",
  "https://tap.company:444/a",
  null,
])("rejects unsafe payment redirects %s", url =>
  expect(safeTapCheckoutUrl(url)).toBeNull()
);

it("ignores a late successful payment handoff after the component unmounts", async () => {
  let resolve!: (value: any) => void;
  vi.spyOn(model, "mutate").mockImplementation(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  await go("/merchant/checkout", "&planId=11");
  await render("checkout");
  await act(async () =>
    (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()
  );
  await clickText(c().pay);
  await act(async () => root.render(<div>Another tenant</div>));
  await act(async () =>
    resolve({
      success: true,
      paymentUrl: "https://sandbox.payments.tap.company/preview-only",
    })
  );
  expect(state.navigate).not.toHaveBeenCalled();
  expect(host.textContent).toBe("Another tenant");
});


it("keeps the same attempt across remount and checks it without making another payment", async () => {
  await go("/merchant/checkout", "&planId=11&cycle=yearly"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click());
  await clickText(c().pay);
  const raw = window.localStorage.getItem("sari.subscription-checkout.v1:1269:269");
  expect(raw).toBeTruthy(); expect(model.operations).toBe(1);
  await act(async () => root.render(<div />)); await render("checkout");
  expect(host.textContent).toContain(c().attempt_pending);
  expect(host.querySelector<HTMLAnchorElement>('a[href="./#/page/merchant/subscription"]')).toBeTruthy();
  expect(host.querySelector('a[href*="payments%2F"]')).toBeNull();
  expect(host.querySelector("input[type=checkbox]")).toBeNull();
  await clickText(c().checkAttempt); expect(model.operations).toBe(1);
  expect(window.localStorage.getItem("sari.subscription-checkout.v1:1269:269")).toBe(raw);
  expect(state.navigate).toHaveBeenCalledTimes(1);
  await clickText(c().openAttempt); expect(state.navigate).toHaveBeenCalledTimes(2); expect(model.operations).toBe(1);
});
it("recovers the simulated server record when both the component and preview model restart", async () => {
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  await act(async () => root.render(<div />)); model.dispose(); model = new ServicePreviewModel(269); await render("checkout");
  expect(host.textContent).toContain(c().attempt_pending); expect(model.operations).toBe(0);
  expect(host.textContent).toContain(c().openAttempt);
});
it("does not create a different attempt when the URL plan or billing cycle changes", async () => {
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  await go("/merchant/checkout", "&planId=12&cycle=yearly");
  expect(host.textContent).toContain(c().returnAttempt); expect(host.querySelector("input[type=checkbox]")).toBeNull(); expect(model.operations).toBe(1);
  expect(host.querySelector<HTMLAnchorElement>('a[href*="planId=11"]')?.href).toContain("cycle=monthly");
});
it("blocks payment when writes are denied or browser locking is unavailable", async () => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  expect(model.operations).toBe(0); expect(state.navigate).not.toHaveBeenCalled(); expect(host.textContent).toContain(c().storageBlocked);
});
it("shows a storage error before displaying a new payment form for a corrupt checkpoint", async () => {
  window.localStorage.setItem("sari.subscription-checkout.v1:1269:269", "broken");
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  expect(host.textContent).toContain(c().storageBlocked); expect(host.querySelector("input[type=checkbox]")).toBeNull(); expect(model.operations).toBe(0);
});
it("retries only the original UUID after a request failed before recording", async () => {
  model.dispose(); model = new ServicePreviewModel(269, "save-conflict");
  const mutate = vi.spyOn(model, "mutate");
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  const first = mutate.mock.calls[0][1].checkoutAttemptId;
  expect(host.textContent).toContain(c().attempt_not_found); expect(model.operations).toBe(0);
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().retryAttempt);
  expect(mutate.mock.calls[1][1].checkoutAttemptId).toBe(first); expect(model.operations).toBe(1);
});
it.each(["failure", "foreign", "wrong-attempt", "wrong-account"])("blocks stale or mismatched recovery source: %s", async reason => {
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  await act(async () => root.render(<div />));
  const read = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) => {
    const result = read(name, input); if (name !== "merchantSubscription.checkoutAttempt") return result;
    return reason === "failure" ? { ...result, error: Error("offline"), isError: true } : { ...result, data: { ...result.data, ...(reason === "foreign" ? { merchantId: 270 } : reason === "wrong-account" ? { actorId: 1270 } : { checkoutAttemptId: crypto.randomUUID() }) } };
  });
  await render("checkout"); expect(host.textContent).toContain(c().recoveryUnavailable); expect(host.querySelector("input[type=checkbox]")).toBeNull();
  expect(host.textContent).not.toContain(c().openAttempt); expect(model.operations).toBe(1);
});
it.each(["completed", "failed", "refunded"])("allows a new plan selection only after explicit resolution of %s", async status => {
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  await act(async () => root.render(<div />));
  const read = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) => { const result = read(name, input); return name === "merchantSubscription.checkoutAttempt" ? { ...result, data: { ...result.data, state: status, recordedCheckoutUrl: null, linkExpiresAt: null } } : result; });
  await render("checkout"); expect(host.textContent).toContain((c() as any)["attempt_" + status]);
  expect(host.querySelector("input[type=checkbox]")).toBeNull(); expect(window.localStorage.getItem("sari.subscription-checkout.v1:1269:269")).toBeTruthy();
  await clickText(c().chooseAgain); expect(window.localStorage.getItem("sari.subscription-checkout.v1:1269:269")).toBeNull(); expect(model.operations).toBe(1);
});
it("hides a recorded checkout link whose expiry has passed", async () => {
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  await act(async () => root.render(<div />)); model.dispose(); model = new ServicePreviewModel(269);
  const key = Object.keys(window.localStorage).find(k => k.startsWith("sari.preview.checkout-record"))!;
  const raw = JSON.parse(window.localStorage.getItem(key)!); raw.linkExpiresAt = new Date(Date.now()-1).toISOString(); window.localStorage.setItem(key, JSON.stringify(raw));
  await render("checkout"); expect(host.textContent).toContain(c().noRecordedLink); expect(host.textContent).not.toContain(c().openAttempt); expect(model.operations).toBe(0);
});

it("does not send a payment when browser storage rejects the write", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "QuotaExceededError"); });
  await go("/merchant/checkout", "&planId=11"); await render("checkout");
  await act(async () => (host.querySelector("input[type=checkbox]") as HTMLInputElement).click()); await clickText(c().pay);
  expect(model.operations).toBe(0); expect(state.navigate).not.toHaveBeenCalled(); expect(host.textContent).toContain(c().storageBlocked);
});
