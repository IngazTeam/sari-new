import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ subscription: vi.fn(), plan: vi.fn() }));
vi.mock("./db", () => ({
  getActiveSubscriptionByMerchantId: m.subscription,
  getPlanById: m.plan,
  incrementSubscriptionUsage: vi.fn(),
  getAllMerchants: vi.fn(),
  updateSubscription: vi.fn(),
}));
import {
  hasReachedConversationLimit,
  hasReachedVoiceMessageLimit,
} from "./usage-tracking";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.subscription.mockResolvedValue({
    status: "active",
    planId: 1,
    conversationsUsed: 0,
    voiceMessagesUsed: 0,
  });
  m.plan.mockResolvedValue({ conversationLimit: 10, voiceMessageLimit: 5 });
});
afterEach(() => vi.restoreAllMocks());
it.each([hasReachedConversationLimit, hasReachedVoiceMessageLimit])(
  "does not grant capacity on subscription read failure",
  async check => {
    m.subscription.mockRejectedValue(Error("PRIVATE_SUBSCRIPTION_SQL"));
    expect(await check(20)).toBe(true);
    m.subscription.mockResolvedValue(undefined);
    expect(await check(20)).toBe(true);
  }
);
it.each([hasReachedConversationLimit, hasReachedVoiceMessageLimit])(
  "does not grant capacity on plan read failure or missing plan",
  async check => {
    m.plan.mockRejectedValue(Error("PRIVATE_PLAN_SQL"));
    expect(await check(20)).toBe(true);
    m.plan.mockResolvedValue(undefined);
    expect(await check(20)).toBe(true);
  }
);
