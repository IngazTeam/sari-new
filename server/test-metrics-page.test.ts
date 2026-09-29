// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { testMetricsFixture } from "./tests/helpers/test-metrics-fixture";
import { testMetricsRows } from "../client/src/lib/test-metrics-report";
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
    testMetricsWorkspace: {
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
import { TestMetricsWorkspace } from "../client/src/components/merchant/TestMetricsWorkspace";
const t = (key: string) =>
  key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key;
const l = ar.testMetricsWorkspace,
  c = ar.overviewWorkspace;
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(TestMetricsWorkspace)));
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
  m.data = testMetricsFixture();
  m.merchantId = 20;
  m.error = null;
  m.fetching = false;
  m.filename = "";
  m.refetch.mockResolvedValue({ data: m.data });
  URL.createObjectURL = vi.fn(() => "blob:metrics");
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
describe("test metrics evidence UI", () => {
  it("shows all fifteen metrics with supported observations separated from unmeasured outcomes", async () => {
    await render();
    expect(m.query).toHaveBeenCalledWith(
      { period: "day" },
      { staleTime: 0, refetchOnMount: "always" }
    );
    expect(container.querySelectorAll("[data-metric]")).toHaveLength(15);
    expect(
      container
        .querySelector("[aria-labelledby=tm-observed]")
        ?.querySelectorAll("[data-metric]")
    ).toHaveLength(7);
    expect(
      container
        .querySelector("[aria-labelledby=tm-unmeasured]")
        ?.querySelectorAll("[data-metric]")
    ).toHaveLength(8);
    for (const key of [
      "scope",
      "valueNote",
      "latencyNote",
      "feedbackNote",
      "missingNote",
    ] as const)
      expect(container.textContent).toContain(l[key]);
    expect(
      container.querySelector("[data-metric=referralRate]")?.textContent
    ).toContain(c.unmeasured);
    expect(
      container.querySelector("[data-metric=csatScore]")?.textContent
    ).not.toContain("/5");
  });
  it("preserves trial decimals and timing units without converting them to revenue or seconds implicitly", async () => {
    await render();
    expect(
      container.querySelector("[data-metric=avgDealValue]")?.textContent
    ).toContain("١٤٩٫٥");
    expect(
      container.querySelector("[data-metric=avgDealValue]")?.textContent
    ).toContain(l.unitValue);
    expect(
      container.querySelector("[data-metric=avgResponseTime]")?.textContent
    ).toContain("١٬٥٠٠");
    expect(
      container.querySelector("[data-metric=avgResponseTime]")?.textContent
    ).toContain(l.ms);
  });
  it.each([
    "error",
    "forbidden",
    "foreign",
    "stale-period",
    "fetching",
    "missing",
  ])("hides old values and blocks export for %s", async kind => {
    if (kind === "error") m.error = Error("failed");
    if (kind === "forbidden") m.error = { data: { code: "FORBIDDEN" } };
    if (kind === "foreign") m.data.merchantId = 21;
    if (kind === "stale-period") m.data.period = "week";
    if (kind === "fetching") m.fetching = true;
    if (kind === "missing") m.data = undefined;
    await render();
    expect(container.querySelector(".tm-report")).toBeNull();
    expect(
      [...container.querySelectorAll("button")].find(
        el => el.textContent === c.export
      )?.disabled
    ).toBe(true);
  });
  it("changes period without showing the old cohort", async () => {
    await render();
    await act(async () => {
      const select = container.querySelector("select")!;
      select.value = "month";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(m.query).toHaveBeenLastCalledWith(
      { period: "month" },
      expect.any(Object)
    );
    expect(container.querySelector(".tm-report")).toBeNull();
  });
  it("keeps an empty denominator unavailable", async () => {
    m.data.metrics.conversionRate = {
      ...m.data.metrics.conversionRate,
      value: null,
      sample: 0,
      denominator: 0,
    };
    m.data.feedback.positiveShare = null;
    await render();
    expect(
      container.querySelector("[data-metric=conversionRate]")?.textContent
    ).toContain(c.unavailable);
    expect(
      container.querySelector("[data-metric=conversionRate]")?.textContent
    ).not.toContain("%");
  });
  it("exports all metric definitions and samples with correctly aligned columns", async () => {
    await render();
    await click(c.export);
    expect(m.filename).toBe("sary-test-metrics-20-day.csv");
    expect(m.success).toHaveBeenCalledWith(c.exportReady);
    const rows = testMetricsRows(m.data, t),
      header = rows.findIndex(row => row[0] === l.metric);
    expect(rows[header]).toHaveLength(6);
    expect(rows.slice(header + 1, header + 16)).toHaveLength(15);
    expect(
      rows.slice(header + 1, header + 16).every(row => row.length === 6)
    ).toBe(true);
    expect(rows).toContainEqual([l.feedbackNote]);
    expect(rows).toContainEqual([l.eligibleReplies, 3]);
    expect(rows).toContainEqual([l.excludedGuardrails, 1]);
    expect(rows).toContainEqual([l.unknownSourceReplies, 1]);
    expect(rows).toContainEqual([c.salesSkill, c.unmeasured]);
  });
  it("reports export failure truthfully", async () => {
    URL.createObjectURL = vi.fn(() => {
      throw Error("blocked");
    });
    await render();
    await click(c.export);
    expect(m.failure).toHaveBeenCalledWith(c.exportFailed);
    expect(m.success).not.toHaveBeenCalled();
  });
  it("does not mark a failed refresh successful", async () => {
    m.refetch.mockResolvedValue({ data: m.data, error: Error("failed") });
    await render();
    await click(c.refresh);
    expect(m.failure).toHaveBeenCalledWith(c.refreshFailed);
    expect(m.success).not.toHaveBeenCalled();
  });
});
