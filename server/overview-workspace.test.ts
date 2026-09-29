import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./overview-workspace", () => ({ readOverviewWorkspace: m.read }));
import { overviewWorkspaceRouter } from "./routers-overview-workspace";
const caller = () =>
  overviewWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
});
describe("overview workspace access", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "uses selected membership for %s",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role, memberId: 4 });
      await caller().read({});
      expect(m.access).toHaveBeenCalledWith(7, 20);
      expect(m.read).toHaveBeenCalledWith(20, { period: "30d" });
    }
  );
  it.each([
    { merchantId: 21 },
    { period: "all" },
    { period: 30 },
    { period: "1y" },
    { from: "2026-09-01" },
  ])("rejects extra or invalid input %j", async input => {
    await expect(caller().read(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("denies missing membership", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().read({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("sanitizes source failure and never substitutes zero", async () => {
    m.read.mockRejectedValue(Error("SQL password secret"));
    await expect(caller().read({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Overview unavailable",
    });
  });
});
