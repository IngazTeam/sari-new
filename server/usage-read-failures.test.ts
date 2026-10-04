import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subscription: vi.fn(), plan: vi.fn() }));
vi.mock("./db", () => ({
  getActiveSubscriptionByMerchantId: m.subscription,
  getPlanById: m.plan,
}));
import { getUsageStats } from "./usage-tracking";
beforeEach(() => {
  vi.resetAllMocks();
});
it("preserves a confirmed absent subscription", async () => {
  m.subscription.mockResolvedValue(undefined);
  expect(await getUsageStats(20)).toBeNull();
  expect(m.plan).not.toHaveBeenCalled();
});
it("does not disguise a subscription query failure as an absent subscription", async () => {
  m.subscription.mockRejectedValue(new Error("PRIVATE_SUBSCRIPTION_SQL"));
  await expect(getUsageStats(20)).rejects.toThrow(
    "Usage statistics unavailable"
  );
});
it("does not disguise a plan query failure as an absent subscription", async () => {
  m.subscription.mockResolvedValue({ status: "active", planId: 1 });
  m.plan.mockRejectedValue(new Error("PRIVATE_PLAN_SQL"));
  await expect(getUsageStats(20)).rejects.toThrow(
    "Usage statistics unavailable"
  );
});
it("does not invent an unlimited plan when the selected plan is missing", async () => {
  m.subscription.mockResolvedValue({ status: "active", planId: 1 });
  m.plan.mockResolvedValue(undefined);
  await expect(getUsageStats(20)).rejects.toThrow(
    "Usage statistics unavailable"
  );
});
