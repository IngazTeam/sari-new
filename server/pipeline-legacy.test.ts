import { beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineFixture } from "./tests/helpers/pipeline-fixture";
import { pipelineWindows } from "../shared/pipeline-workspace";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  bundle: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./pipeline-workspace", () => ({
  readPipelineWorkspace: m.read,
  readPipelineBundle: m.bundle,
}));
import { salesPipelineRouter } from "./routers-sales-pipeline";
import {
  legacyPipelineCounts,
  legacyPipelineKPIs,
  legacyPipelineSummary,
  legacyPipelineLosses,
} from "./pipeline-legacy";
const caller = () =>
  salesPipelineRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
const call = (name: string, input: any = undefined) =>
  (caller() as any)[name](input);
const names = ["getPipeline", "getKPIs", "getActionCounts", "getLossBreakdown"];
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue(pipelineFixture());
  m.bundle.mockResolvedValue({
    snapshot: pipelineFixture(),
    previews: { ready: [], pending: [], stalled: [], paid: [], lost: [] },
  });
});
describe("legacy pipeline contract", () => {
  it.each(["__proto__", "constructor", "toString"])(
    "treats stored label %s as untrusted text",
    reason => {
      const d = pipelineFixture();
      d.losses = [{ reason, count: 1, share: 100 }];
      expect(legacyPipelineLosses(d)[0].label).toBe(reason);
    }
  );
  it.each(names)("uses selected tenant for %s", async name => {
    await call(name, name === "getLossBreakdown" ? { days: 30 } : undefined);
    expect(m.access).toHaveBeenCalledWith(7, 20);
    const calls = [...m.read.mock.calls, ...m.bundle.mock.calls];
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(20);
  });
  it.each(names)(
    "does not retain an old permission bypass on %s",
    async name => {
      m.access.mockResolvedValue(null);
      await expect(
        call(name, name === "getLossBreakdown" ? { days: 30 } : undefined)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(m.read).not.toHaveBeenCalled();
      expect(m.bundle).not.toHaveBeenCalled();
    }
  );
  it.each(names)("returns a sanitized failure for %s", async name => {
    m.read.mockRejectedValue(Error("secret SQL"));
    m.bundle.mockRejectedValue(Error("secret SQL"));
    await expect(
      call(name, name === "getLossBreakdown" ? { days: 30 } : undefined)
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pipeline unavailable",
    });
  });
  it.each([0, 1.5, 366, Infinity])(
    "rejects invalid lookback %s",
    async days => {
      await expect(caller().getLossBreakdown({ days })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
      expect(m.bundle).not.toHaveBeenCalled();
      expect(() => pipelineWindows(new Date(), days)).toThrow();
    }
  );
  it.each([1, 30, 365])("retains bounded lookback %s", async days => {
    await caller().getLossBreakdown({ days });
    expect(m.bundle).toHaveBeenCalledWith(
      20,
      { queue: "ready", page: 1, pageSize: 20 },
      expect.any(Date),
      { days }
    );
    const w = pipelineWindows(new Date("2026-09-30T10:00:00Z"), days);
    expect(Date.parse(w.through) - Date.parse(w.monthFrom) + 1000).toBe(
      days * 86400000
    );
  });
  it("rejects forged tenant parameters", async () => {
    await expect(
      caller().getLossBreakdown({ days: 30, merchantId: 30 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.bundle).not.toHaveBeenCalled();
  });
  it("keeps unsupported conversion, revenue and time unmeasured", () => {
    const d = pipelineFixture(),
      r = legacyPipelineKPIs(d);
    expect(r).toMatchObject({
      conversionRate: null,
      totalRevenue: null,
      avgTimeToClose: null,
      observedPaidStageShare: 50,
      thisWeekWins: 1,
      lastWeekWins: 0,
      weeklyTrend: "up",
      topLossReason: "price",
      topLossCount: 1,
    });
    expect(r.evidence).toBe(d);
    expect(legacyPipelineCounts(d)).toMatchObject({
      readyToPay: 2,
      needsHuman: 1,
      paymentPending: 23,
      stalled: 0,
    });
  });
  it("retains old list field names, discloses preview limits and preserves every stage", () => {
    const d = pipelineFixture(),
      r = legacyPipelineSummary(d, {
        ready: d.list.items,
        pending: [],
        stalled: [],
        paid: [],
        lost: [],
      });
    expect(r.stages.purchased).toBe(0);
    expect(r.stages.payment_failed).toBe(0);
    expect(r.stages.unknown).toBe(0);
    expect(r.hotLeads[0]).toMatchObject({
      id: 100,
      customerName: d.list.items[0].customerName,
      lastMessage: d.list.items[0].preview,
      previewTruncated: false,
      deal_stage: "ready",
    });
    expect(r.sampleLimit).toBe(10);
    expect(r.evidence).toBe(d);
    expect(legacyPipelineLosses(d)[0]).toMatchObject({
      reason: "price",
      count: 1,
      share: 100,
      from: d.windows.monthFrom,
      through: d.windows.through,
      basis: "current_lost_stage_by_last_activity",
    });
  });
});
