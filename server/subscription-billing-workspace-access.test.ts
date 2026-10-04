import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  history: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./subscriptions/billing-workspace", () => ({
  readSubscriptionBilling: m.read,
  readBillingHistory: m.history,
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
});
it("uses resolved actor and selected tenant for both sources", async () => {
  await caller().merchantSubscription.workspace();
  await caller().merchantSubscription.paymentHistory({});
  expect(m.read).toHaveBeenCalledWith(7, 20);
  expect(m.history).toHaveBeenCalledWith(7, 20, {
    beforeId: null,
    pageSize: 25,
    status: "all",
    type: "all",
  });
});
it.each(["workspace", "paymentHistory"] as const)(
  "rejects forged scope on %s",
  async route => {
    await expect(
      (caller().merchantSubscription[route] as any)({ merchantId: 21 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.read).not.toHaveBeenCalled();
    expect(m.history).not.toHaveBeenCalled();
  }
);
it("rejects anonymous and revoked access", async () => {
  await expect(
    caller(null).merchantSubscription.workspace()
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  m.access.mockResolvedValue(null);
  await expect(
    caller().merchantSubscription.paymentHistory({})
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(m.read).not.toHaveBeenCalled();
  expect(m.history).not.toHaveBeenCalled();
});
it.each(["workspace", "paymentHistory"] as const)(
  "redacts storage failure and lost authority on %s",
  async route => {
    const mock = route === "workspace" ? m.read : m.history,
      run = () =>
        (caller().merchantSubscription[route] as any)(
          route === "workspace" ? undefined : {}
        );
    mock.mockRejectedValue(new MerchantSettingsAuthorityError("forbidden"));
    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    mock.mockRejectedValue(Error("PRIVATE_SQL"));
    await expect(run()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Subscription records unavailable",
    });
  }
);
