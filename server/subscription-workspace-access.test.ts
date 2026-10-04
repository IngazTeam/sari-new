import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), cancel: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./subscriptions/cancel-subscription", () => ({
  cancelCurrentSubscription: mocks.cancel,
  SubscriptionCancellationConflictError: class extends Error {},
}));
import { merchantSubscriptionRouter } from "./routers/subscriptions";
import { SubscriptionCancellationConflictError } from "./subscriptions/cancel-subscription";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
const expected = {
  id: 9,
  planId: 3,
  status: "active" as const,
  billingCycle: "monthly" as const,
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: "2026-11-01T00:00:00.000Z",
};
const caller = (user: unknown = { id: 21, role: "user" }) =>
  merchantSubscriptionRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "73" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 73, role: "owner" });
  mocks.cancel.mockResolvedValue({ success: true, subscriptionId: 9 });
});
it("passes the whole review with the resolved actor and selected tenant", async () => {
  expect(
    await caller().cancelSubscription({ expected, reason: " test " })
  ).toEqual({ success: true, subscriptionId: 9 });
  expect(mocks.cancel).toHaveBeenCalledWith(21, 73, {
    expected,
    reason: "test",
  });
});
it.each([
  {},
  { expectedSubscriptionId: 9 },
  { expected: { ...expected, id: -1 } },
  { expected: { ...expected, id: 1.5 } },
  { expected, reason: "x".repeat(501) },
  { expected, merchantId: 999 },
  { expected: { ...expected, actorId: 8 } },
  { expected: { ...expected, endDate: expected.startDate } },
])("rejects missing review, malformed or forged input %j", async input => {
  await expect(caller().cancelSubscription(input as any)).rejects.toMatchObject(
    { code: "BAD_REQUEST" }
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it("blocks anonymous and revoked selection", async () => {
  await expect(
    caller(null).cancelSubscription({ expected })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  mocks.access.mockResolvedValue(null);
  await expect(caller().cancelSubscription({ expected })).rejects.toMatchObject(
    { code: "FORBIDDEN" }
  );
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it("maps live owner revocation, stale review and unknown storage without leaking details", async () => {
  for (const [error, code, message] of [
    [
      new MerchantSettingsAuthorityError("forbidden"),
      "FORBIDDEN",
      "Cancellation requires owner access",
    ],
    [
      new SubscriptionCancellationConflictError(),
      "CONFLICT",
      "Subscription changed; refresh before cancelling",
    ],
    [
      Error("PRIVATE_SQL"),
      "INTERNAL_SERVER_ERROR",
      "Could not cancel subscription",
    ],
    [
      new MerchantSettingsAuthorityError("unknown"),
      "INTERNAL_SERVER_ERROR",
      "Could not cancel subscription",
    ],
  ] as const) {
    mocks.cancel.mockRejectedValueOnce(error);
    await expect(
      caller().cancelSubscription({ expected })
    ).rejects.toMatchObject({ code, message });
  }
});
