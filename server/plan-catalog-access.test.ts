import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./subscriptions/plan-catalog-workspace", () => ({
  readPlanCatalogWorkspace: m.read,
}));
import { appRouter } from "./routers";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
const caller = (user: unknown = { id: 7, role: "user" }) =>
  appRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.read.mockResolvedValue({ fixture: "catalog" });
});
it.each(["owner", "manager", "sales_supervisor", "viewer"])(
  "allows selected tenant %s to read catalog",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await caller().subscriptionPlans.workspace();
    expect(m.read).toHaveBeenCalledWith(7, 20);
    expect(m.access).toHaveBeenCalledWith(7, 20);
  }
);
it("rejects anonymous and revoked access before reading prices", async () => {
  await expect(
    caller(null).subscriptionPlans.workspace()
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  m.access.mockResolvedValue(null);
  await expect(caller().subscriptionPlans.workspace()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.read).not.toHaveBeenCalled();
});
it.each([{ merchantId: 21 }, { actorId: 8 }, { canManage: true }, {}])(
  "rejects forged catalog input %j",
  async input => {
    await expect(
      (caller().subscriptionPlans.workspace as any)(input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.read).not.toHaveBeenCalled();
  }
);
it("maps live authority loss and redacts unavailable storage", async () => {
  m.read.mockRejectedValue(new MerchantSettingsAuthorityError("forbidden"));
  await expect(caller().subscriptionPlans.workspace()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  m.read.mockRejectedValue(Error("PRIVATE_PLAN_SQL"));
  await expect(caller().subscriptionPlans.workspace()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Plan catalog unavailable",
  });
});
