// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { TrialBanner } from "../client/src/components/TrialBanner";
import { SubscriptionBadge } from "../client/src/components/SubscriptionBadge";
import { SubscriptionBillingPreviewStore } from "../prototypes/tenant-dashboard/src/subscription-billing-preview-model";
const api = vi.hoisted(() => ({
  query: {} as any,
  user: {} as any,
  identity: {} as any,
  retry: vi.fn(),
  userRetry: vi.fn(),
  identityRetry: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ ...api.user, refetch: api.userRetry }) } },
    merchants: {
      workspaceIdentity: {
        useQuery: () => ({ ...api.identity, refetch: api.identityRetry }),
      },
    },
    merchantSubscription: {
      workspace: { useQuery: () => ({ ...api.query, refetch: api.retry }) },
    },
  },
}));
let lng: "ar" | "en" = "en";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce((v: any, k) => v?.[k], { ar, en }[lng]) ?? key,
    i18n: { language: lng, dir: () => (lng === "ar" ? "rtl" : "ltr") },
  }),
}));
let root: Root, container: HTMLDivElement;
const now = Date.parse("2026-10-01T12:00:00Z");
const fixture = () => {
  const data = new SubscriptionBillingPreviewStore(
    7,
    20,
    new Date(now).toISOString(),
    () => "ready"
  ).summary();
  data.state = "trial";
  data.subscription!.recordedStatus = "trial";
  data.subscription!.endDate = "2026-10-03T12:00:00.000Z";
  data.subscription!.daysRemaining = 99;
  return data;
};
beforeEach(() => {
  lng = "en";
  vi.clearAllMocks();
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  vi.setSystemTime(now);
  api.query = {
    data: fixture(),
    dataUpdatedAt: now,
    isFetching: false,
    isLoading: false,
  };
  api.user = { data: { id: 7 } };
  api.identity = { data: { id: 20, actorId: 7 } };
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = async () => {
  await act(async () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(TrialBanner),
        React.createElement(SubscriptionBadge)
      )
    )
  );
};
const banner = () => container.querySelector(".sn-banner");
const badge = () => container.querySelector("a.sn-badge");
describe("scoped subscription notices", () => {
  it.each(["ar", "en"] as const)(
    "shares the recorded expiry and translated units in %s",
    async lang => {
      lng = lang;
      await mount();
      expect(container.querySelector("time")?.dateTime).toBe(
        "2026-10-03T12:00:00.000Z"
      );
      expect(banner()?.getAttribute("dir")).toBe(lang === "ar" ? "rtl" : "ltr");
      expect(container.textContent).not.toMatch(
        /99|trialNoticeUx|subscriptionBillingUx|NaN|undefined/
      );
      expect(
        container.querySelector('a[href="/merchant/subscription/compare"]')
      ).toBeTruthy();
      expect(badge()?.getAttribute("href")).toBe("/merchant/my-subscription");
      expect(container.querySelector("a button")).toBeNull();
      if (lang === "en") {
        expect(banner()?.textContent).toContain("2 days");
        expect(badge()?.textContent).toContain("2 days");
        expect(container.querySelector("time")?.textContent).toContain("UTC");
      }
    }
  );
  it.each([
    "failed",
    "loading",
    "missing",
    "foreign-actor",
    "foreign-tenant",
    "identity-fetch",
    "identity-error",
    "signed-out",
  ])("hides old state for %s", async state => {
    if (state === "failed") api.query.error = Error("PRIVATE");
    if (state === "loading") api.query.isFetching = true;
    if (state === "missing") api.query.data = undefined;
    if (state === "foreign-actor") api.query.data.actorId = 99;
    if (state === "foreign-tenant") api.query.data.merchantId = 99;
    if (state === "identity-fetch") api.identity.isFetching = true;
    if (state === "identity-error") api.identity.error = Error("PRIVATE");
    if (state === "signed-out") api.user.data = null;
    await mount();
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).not.toMatch(
      /You are in the trial|No active subscription|PRIVATE|2 days/
    );
  });
  it("rereads all three sources and distinguishes no record from a missing response", async () => {
    api.query.error = Error("PRIVATE");
    await mount();
    await act(async () => container.querySelector("button")!.click());
    expect(api.retry).toHaveBeenCalledOnce();
    expect(api.userRetry).toHaveBeenCalledOnce();
    expect(api.identityRetry).toHaveBeenCalledOnce();
    api.query.error = null;
    api.query.data = { ...api.query.data, state: "none", subscription: null };
    await mount();
    expect(container.textContent).toContain("No active subscription recorded");
  });
  it("does not invent a deadline for an unknown trial period", async () => {
    api.query.data.state = "unknown";
    await mount();
    expect(container.textContent).toContain(
      "reliable expiry time is unavailable"
    );
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).not.toContain("has ended");
  });
  it("expires both notices using monotonic elapsed time despite a wall-clock change", async () => {
    api.query.data.subscription.endDate = "2026-10-01T12:00:01.000Z";
    await mount();
    expect(container.textContent).toContain("Less than a minute");
    vi.setSystemTime(now - 86400000);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(banner()?.textContent).toContain("recorded trial period has ended");
    expect(badge()?.textContent).toBe(en.subscriptionBillingUx.expired);
    expect(container.textContent).not.toContain("Time remaining");
  });
  it("accounts for an already cached snapshot and does not restart it on a remount", async () => {
    api.query.data.subscription.endDate = "2026-10-01T12:00:01.000Z";
    api.query.dataUpdatedAt = now - 600;
    await mount();
    await act(async () => vi.advanceTimersByTime(500));
    await act(async () => root.render(null));
    await mount();
    expect(badge()?.textContent).toBe(en.subscriptionBillingUx.expired);
  });
  it("hides a paid active banner and labels paid expiry correctly", async () => {
    api.query.data.state = "active";
    api.query.data.subscription.recordedStatus = "active";
    await mount();
    expect(banner()).toBeNull();
    expect(badge()?.textContent).toContain(en.subscriptionBillingUx.active);
    api.query.data = { ...api.query.data, state: "expired" };
    await mount();
    expect(banner()?.textContent).toContain(
      "recorded subscription period has ended"
    );
    expect(container.textContent).not.toContain("trial period");
  });
  it.each([
    "none",
    "ambiguous",
    "unknown",
    "pending",
    "cancelled",
    "expired",
  ] as const)("labels %s without an active countdown", async state => {
    api.query.data = {
      ...api.query.data,
      state,
      subscription: ["none", "ambiguous"].includes(state)
        ? null
        : {
            ...api.query.data.subscription,
            recordedStatus: state === "unknown" ? "trial" : state,
          },
    };
    await mount();
    expect(badge()?.textContent).toBe(en.subscriptionBillingUx[state]);
    expect(container.querySelector("time")).toBeNull();
    expect(badge()?.textContent).not.toContain("days");
  });
  it("updates language and tenant without reusing old countdown text", async () => {
    await mount();
    lng = "ar";
    api.identity.data = { id: 21, actorId: 7 };
    api.query.data = {
      ...fixture(),
      merchantId: 21,
      subscription: {
        ...fixture().subscription,
        id: 2,
        endDate: "2026-10-01T12:30:00.000Z",
      },
    };
    await mount();
    expect(container.textContent).not.toContain("days");
    expect(container.querySelector("time")?.dateTime).toBe(
      "2026-10-01T12:30:00.000Z"
    );
    expect(container.textContent).not.toMatch(
      /trialNoticeUx|subscriptionBillingUx/
    );
  });
});
