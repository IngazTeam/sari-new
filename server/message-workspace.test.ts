import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageWindow } from "../shared/message-workspace";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./message-workspace", () => ({ readMessageWorkspace: m.read }));
import { messageWorkspaceRouter } from "./routers-message-workspace";
const caller = () =>
  messageWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner", memberId: 4 });
  m.read.mockResolvedValue({ merchantId: 20 });
});
describe("message analytics scope and window", () => {
  it.each(["owner", "manager", "viewer", "sales_supervisor"])(
    "reads selected tenant for %s",
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
    { period: "1y" },
    { period: 30 },
    { startDate: "bad" },
  ])("rejects unknown or forged input %j", async input => {
    await expect(caller().read(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("denies missing membership before data access", async () => {
    m.access.mockResolvedValue(null);
    await expect(caller().read({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("returns failure instead of an empty snapshot or SQL details", async () => {
    m.read.mockRejectedValue(Error("secret database detail"));
    await expect(caller().read({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Message analytics unavailable",
    });
  });
  it.each(["7d", "30d", "90d"] as const)(
    "includes exactly %s UTC calendar days with the current day partial",
    period => {
      const result = messageWindow(
        period,
        new Date("2026-09-29T10:11:12.789Z")
      );
      expect(result.dates).toHaveLength(Number(period.slice(0, -1)));
      expect(result.through).toBe("2026-09-29T10:11:12.000Z");
      expect(result.from).toMatch(/T00:00:00.000Z$/);
      expect(result.dates.at(-1)).toBe("2026-09-29");
    }
  );
  it("handles year and local offset boundaries as UTC", () => {
    const result = messageWindow("7d", new Date("2026-01-01T00:01:00+03:00"));
    expect(result.from).toBe("2025-12-25T00:00:00.000Z");
    expect(result.through).toBe("2025-12-31T21:01:00.000Z");
  });
});
