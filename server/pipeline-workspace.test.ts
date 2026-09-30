import { beforeEach, describe, expect, it, vi } from "vitest";
import { pipelineInput, pipelineWindows } from "../shared/pipeline-workspace";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./pipeline-workspace", () => ({ readPipelineWorkspace: m.read }));
vi.mock("./ai/loss-detector", () => ({ getPipelineSummary: vi.fn() }));
import { salesPipelineRouter } from "./routers-sales-pipeline";
const caller = (user: any = { id: 7, role: "user" }) =>
  salesPipelineRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
});
describe("pipeline workspace boundary", () => {
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "uses selected tenant and permissions for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().workspace({});
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.read).toHaveBeenCalledWith(20, {
        queue: "ready",
        page: 1,
        pageSize: 20,
      });
    }
  );
  it.each([null, { merchantId: 20, role: "support_agent", memberId: 4 }])(
    "denies unavailable membership %j",
    async access => {
      m.access.mockResolvedValue(access);
      await expect(caller().workspace({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(m.read).not.toHaveBeenCalled();
    }
  );
  it("denies anonymous readers", async () => {
    await expect(caller(null).workspace({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 30 },
    { queue: "made-up" },
    { queue: "stage" },
    { queue: "all", stage: "paid" },
    { queue: "stage", stage: "x' OR 1=1" },
    { page: 0 },
    { page: 1.5 },
    { page: 100001 },
    { pageSize: 51 },
    { pageSize: 0 },
  ])("rejects invalid scope and pagination %j", async input => {
    await expect(caller().workspace(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("accepts unknown stages explicitly", async () => {
    await caller().workspace({
      queue: "stage",
      stage: "unknown",
      page: 2,
      pageSize: 5,
    });
    expect(m.read).toHaveBeenCalledWith(20, {
      queue: "stage",
      stage: "unknown",
      page: 2,
      pageSize: 5,
    });
  });
  it("sanitizes failed reads without fabricated empty results", async () => {
    m.read.mockRejectedValue(Error("secret SQL password"));
    await expect(caller().workspace({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Pipeline unavailable",
    });
  });
  it("uses disjoint equal weeks with explicit inclusive-second endpoints", () => {
    const w = pipelineWindows(new Date("2026-09-30T10:00:00.999Z"));
    expect(w.through).toBe("2026-09-30T10:00:00.000Z");
    expect(Date.parse(w.through) - Date.parse(w.weekFrom) + 1000).toBe(
      7 * 86400000
    );
    expect(
      Date.parse(w.previousThrough) - Date.parse(w.previousFrom) + 1000
    ).toBe(7 * 86400000);
    expect(Date.parse(w.weekFrom) - Date.parse(w.previousThrough)).toBe(1000);
    expect(Date.parse(w.through) - Date.parse(w.monthFrom) + 1000).toBe(
      30 * 86400000
    );
    expect(() => pipelineWindows(new Date("bad"))).toThrow();
    expect(pipelineInput.parse({}).pageSize).toBe(20);
  });
});
