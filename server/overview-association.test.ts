// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({ data: undefined as any, error: null as any }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    merchants: { getCurrent: { useQuery: () => ({ data: { id: 20 } }) } },
    messageAnalytics: {
      getConversionRate: {
        useQuery: () => ({ data: m.data, error: m.error, isLoading: false }),
      },
    },
    abandonedCarts: {
      getStats: {
        useQuery: () => ({
          data: { totalAbandoned: 0, recovered: 0 },
          isLoading: false,
        }),
      },
    },
    referrals: {
      getStats: {
        useQuery: () => ({
          data: { totalReferrals: 0, completedReferrals: 0 },
          isLoading: false,
        }),
      },
    },
    orders: {
      getStats: {
        useQuery: () => ({
          data: { total: 0, totalRevenue: 0 },
          isLoading: false,
        }),
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split(".").reduce((value: any, k) => value?.[k], ar) ?? key,
  }),
}));
import OverviewAnalytics from "../client/src/pages/merchant/OverviewAnalytics";
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(OverviewAnalytics)));
const card = () =>
  [...container.querySelectorAll("[data-slot=card]")].find(
    el =>
      el.querySelector("[data-slot=card-title]")?.textContent ===
      ar.messageWorkspace.associationShare
  )!;
beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = {
    merchantId: 20,
    rate: null,
    associationShare: 50,
    totalConversations: 4,
    conversationsWithOrders: 2,
    from: "2026-09-01T00:00:00Z",
    through: "2026-09-30T10:00:00Z",
  };
  m.error = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("overview legacy association card", () => {
  it("shows the measured association sample and period without claiming sales conversion", async () => {
    await render();
    expect(card().textContent).toContain("50.0%");
    expect(card().textContent).toContain("2 / 4");
    expect(card().textContent).toContain(m.data.from);
    expect(card().textContent).toContain(ar.messageWorkspace.orderNote);
    expect(container.textContent).not.toContain(
      ar.overviewAnalyticsPage.text32
    );
    expect(container.textContent).toContain(ar.messageWorkspace.unmeasured);
  });
  it.each(["empty", "error", "wrong-tenant", "loading-data"])(
    "uses unavailable rather than a false zero after %s",
    async kind => {
      if (kind === "empty") m.data.associationShare = null;
      if (kind === "error") m.error = Error("failed");
      if (kind === "wrong-tenant") m.data.merchantId = 21;
      if (kind === "loading-data") m.data = undefined;
      await render();
      expect(card().textContent).toContain(ar.messageWorkspace.unavailable);
      expect(card().querySelector("[role=progressbar]")).toBeNull();
      expect(card().textContent).not.toContain("50.0%");
      if (kind === "error")
        expect(card().querySelector("[role=alert]")?.textContent).toContain(
          ar.overviewAnalyticsPage.associationFailed
        );
    }
  );
});
