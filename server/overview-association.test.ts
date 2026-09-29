// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { overviewWorkspaceFixture } from "./tests/helpers/overview-workspace-fixture";
import {
  overviewReportRows,
  overviewCsv,
} from "../client/src/lib/overview-export";
const m = vi.hoisted(() => ({
  data: undefined as any,
  merchantId: 20,
  error: null as any,
  fetching: false,
  query: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  filename: "",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchantId } }) },
    },
    overviewWorkspace: {
      read: {
        useQuery: (input: any, options: any) => {
          m.query(input, options);
          return {
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          };
        },
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.failure } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string) => key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key,
  }),
}));
import { OverviewWorkspace } from "../client/src/components/merchant/OverviewWorkspace";
const t = (key: string) =>
  key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key;
const l = ar.overviewWorkspace;
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(OverviewWorkspace)));
const click = (text: string) =>
  act(async () => {
    [...container.querySelectorAll("button")]
      .find(el => el.textContent === text)!
      .click();
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = overviewWorkspaceFixture();
  m.merchantId = 20;
  m.error = null;
  m.fetching = false;
  m.filename = "";
  m.refetch.mockResolvedValue({ data: m.data });
  URL.createObjectURL = vi.fn(() => "blob:overview");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    expect(this.isConnected).toBe(true);
    m.filename = this.download;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("overview evidence and recovery", () => {
  it("uses one scoped period and retains every section with all statuses and rating bins", async () => {
    await render();
    expect(m.query).toHaveBeenCalledWith(
      { period: "30d" },
      { staleTime: 0, refetchOnMount: "always" }
    );
    expect(container.querySelectorAll(".ov-panel")).toHaveLength(7);
    expect(
      [...container.querySelectorAll("tbody")].map(el => el.children.length)
    ).toEqual([6, 3, 5]);
    for (const key of [
      "valueNote",
      "paidNote",
      "ratingNote",
      "cartNote",
      "referralNote",
      "associationNote",
      "evidenceNote",
      "unmeasured",
    ] as const)
      expect(container.textContent).toContain(l[key]);
    expect(container.textContent).not.toContain(
      ar.overviewAnalyticsPage.text32
    );
  });
  it("formats minor values once and keeps currencies separate", async () => {
    await render();
    const values = container.querySelector("[aria-labelledby=ov-values]")!;
    expect(values.textContent).toContain(
      new Intl.NumberFormat("ar-SA", {
        style: "currency",
        currency: "SAR",
      }).format(1234.56)
    );
    expect(values.textContent).toContain(
      new Intl.NumberFormat("ar-SA", {
        style: "currency",
        currency: "USD",
      }).format(120)
    );
    expect(values.querySelectorAll("article")).toHaveLength(2);
  });
  it("shows empty samples as unavailable while keeping true counts zero", async () => {
    m.data.reviews = {
      ...m.data.reviews,
      average: null,
      valid: 0,
      total: 0,
      invalid: 0,
      distribution: m.data.reviews.distribution.map((r: any) => ({
        ...r,
        count: 0,
        share: null,
      })),
    };
    m.data.carts = {
      ...m.data.carts,
      total: 0,
      share: null,
      markedRecovered: 0,
      other: 0,
      invalidFlags: 0,
    };
    m.data.referrals.share = null;
    m.data.association = {
      ...m.data.association,
      total: 0,
      positive: 0,
      ratio: null,
    };
    await render();
    expect(
      container.querySelector("[aria-labelledby=ov-reviews]")?.textContent
    ).toContain(l.unavailable);
    expect(
      container.querySelector("[aria-labelledby=ov-association]")?.textContent
    ).toContain(l.unavailable);
    expect(
      container.querySelector("[aria-labelledby=ov-carts]")?.textContent
    ).not.toContain("%");
  });
  it.each([
    "error",
    "forbidden",
    "foreign",
    "stale-period",
    "fetching",
    "missing",
  ])("hides stale data and disables export for %s", async kind => {
    if (kind === "error") m.error = Error("failed");
    if (kind === "forbidden") m.error = { data: { code: "FORBIDDEN" } };
    if (kind === "foreign") m.data.merchantId = 21;
    if (kind === "stale-period") m.data.period = "7d";
    if (kind === "fetching") m.fetching = true;
    if (kind === "missing") m.data = undefined;
    await render();
    expect(container.querySelector(".ov-report")).toBeNull();
    expect(
      [...container.querySelectorAll("button")].find(
        el => el.textContent === l.export
      )?.disabled
    ).toBe(true);
    if (kind === "forbidden")
      expect(container.querySelector("[data-state=forbidden]")).not.toBeNull();
  });
  it("changes the input without displaying data from the previous period", async () => {
    await render();
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = "7d";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(m.query).toHaveBeenLastCalledWith(
      { period: "7d" },
      expect.any(Object)
    );
    expect(container.querySelector(".ov-report")).toBeNull();
  });
  it("exports all sections with definitions from the displayed snapshot", async () => {
    await render();
    await click(l.export);
    expect(m.filename).toBe("sary-overview-20-30d.csv");
    expect(m.success).toHaveBeenCalledWith(l.exportReady);
    const rows = overviewReportRows(m.data, t);
    for (const key of [
      "values",
      "orders",
      "reviews",
      "carts",
      "referrals",
      "association",
      "evidenceNote",
    ] as const)
      expect(rows.some(row => row[0] === l[key])).toBe(true);
    expect(rows).toContainEqual([l.SAR, l.totalValue, "1234.56"]);
    expect(overviewCsv(m.data, t)).toContain(l.periodNote);
  });
  it("reports export failure without a success toast", async () => {
    URL.createObjectURL = vi.fn(() => {
      throw Error("blocked");
    });
    await render();
    await click(l.export);
    expect(m.failure).toHaveBeenCalledWith(l.exportFailed);
    expect(m.success).not.toHaveBeenCalled();
  });
  it("does not report a failed refresh as success", async () => {
    m.refetch.mockResolvedValue({ data: m.data, error: Error("failed") });
    await render();
    await click(l.refresh);
    expect(m.failure).toHaveBeenCalledWith(l.refreshFailed);
    expect(m.success).not.toHaveBeenCalled();
  });
  it("discards refresh completion after unmount", async () => {
    let resolve!: (v: any) => void;
    m.refetch.mockReturnValue(
      new Promise(r => {
        resolve = r;
      })
    );
    await render();
    await click(l.refresh);
    await act(async () => root.unmount());
    await act(async () => resolve({ data: m.data }));
    expect(m.success).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});
