import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  list: vi.fn(),
  stats: vi.fn(),
  current: vi.fn(),
  history: vi.fn(),
  status: vi.fn(),
  target: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
}));
vi.mock("./db/sales-quotations", () => ({
  getQuotations: m.list,
  getQuotationStats: m.stats,
  getCurrentTarget: m.current,
  getTargetHistory: m.history,
  updateQuotationStatus: m.status,
  setMonthlyTarget: m.target,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.merchant.mockResolvedValue({ id: 20 });
});
describe("legacy quotation read permissions and reviewed inputs", () => {
  it("routes every summary read through selected membership", async () => {
    await caller().getQuotations({ limit: 50 });
    await caller().getQuotationStats();
    await caller().getCurrentTarget();
    await caller().getTargetHistory({ limit: 12 });
    expect(m.list).toHaveBeenCalledWith(20, 50);
    expect(m.stats).toHaveBeenCalledWith(20);
    expect(m.current).toHaveBeenCalledWith(20);
    expect(m.history).toHaveBeenCalledWith(20, 12);
  });
  it.each([
    "getQuotations",
    "getQuotationStats",
    "getCurrentTarget",
    "getTargetHistory",
    "formatQuotationForWhatsApp",
  ])("denies unknown roles on %s", async name => {
    m.access.mockResolvedValue({ merchantId: 20, role: "support_agent" });
    await expect((caller() as any)[name]({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.merchant).not.toHaveBeenCalled();
  });
  it("does not pretend a failed source is zero or empty", async () => {
    m.stats.mockRejectedValue(Error("SQL password"));
    await expect(caller().getQuotationStats()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Quotations unavailable",
    });
  });
  it("requires reviewed state on the legacy status and target routes", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
    await expect(
      caller().updateQuotationStatus({
        quotationId: 1,
        status: "accepted",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().setMonthlyTarget({ targetAmount: 100 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.status).not.toHaveBeenCalled();
    expect(m.target).not.toHaveBeenCalled();
  });
});
