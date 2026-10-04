import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  subscription: vi.fn(),
  plan: vi.fn(),
  increment: vi.fn(),
  all: vi.fn(),
  update: vi.fn(),
  schema: vi.fn(),
  lock: vi.fn(),
  tx: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./db", () => ({
  getActiveSubscriptionByMerchantId: m.subscription,
  getPlanById: m.plan,
  incrementSubscriptionUsage: m.increment,
  getAllMerchants: m.all,
  updateSubscription: m.update,
}));
vi.mock("./ai/reply-usage-quota", () => ({
  assertReplyUsageSchema: m.schema,
  lockReplyUsageCapacity: m.lock,
}));
vi.mock("./ai/checkout-agreements", () => ({ checkoutTransaction: m.tx }));
import * as usage from "./usage-tracking";
const checks = [
  [
    "conversations",
    usage.hasReachedConversationLimit,
    "conversationsUsed",
    "conversationLimit",
  ],
  [
    "voice",
    usage.hasReachedVoiceMessageLimit,
    "voiceMessagesUsed",
    "voiceMessageLimit",
  ],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  m.subscription.mockResolvedValue({
    id: 3,
    merchantId: 20,
    planId: 2,
    status: "active",
    conversationsUsed: 1,
    voiceMessagesUsed: 1,
  });
  m.plan.mockResolvedValue({ conversationLimit: 10, voiceMessageLimit: 5 });
  m.tx.mockImplementation(fn => fn({ execute: m.execute }));
  m.schema.mockResolvedValue(undefined);
  m.lock.mockResolvedValue({ subscriptionId: 3 });
});
afterEach(() => vi.restoreAllMocks());
it.each(checks)(
  "keeps finite, zero and unlimited %s limits distinct",
  async (_name, check, counter, limit) => {
    for (const [used, max, reached] of [
      [1, 10, false],
      [10, 10, true],
      [12, 10, true],
      [0, 0, true],
      [12, -1, false],
    ] as const) {
      m.subscription.mockResolvedValue({
        id: 3,
        merchantId: 20,
        planId: 2,
        status: "active",
        [counter]: used,
      });
      m.plan.mockResolvedValue({ [limit]: max });
      expect(await check(20)).toBe(reached);
    }
  }
);
it.each(checks)(
  "fails closed on malformed %s counters",
  async (_name, check, counter) => {
    for (const value of [
      undefined,
      null,
      -1,
      NaN,
      Infinity,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
    ]) {
      m.subscription.mockResolvedValue({
        id: 3,
        merchantId: 20,
        planId: 2,
        status: "active",
        [counter]: value,
      });
      expect(await check(20)).toBe(true);
    }
  }
);
it.each(checks)(
  "fails closed on malformed %s limits",
  async (_name, check, _counter, limit) => {
    for (const value of [
      undefined,
      null,
      -2,
      NaN,
      Infinity,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      "10",
    ]) {
      m.plan.mockResolvedValue({ [limit]: value });
      expect(await check(20)).toBe(true);
    }
  }
);
it.each(checks)(
  "uses explicit planless trial %s limits",
  async (_name, check, counter) => {
    m.subscription.mockResolvedValue({
      id: 3,
      merchantId: 20,
      planId: null,
      status: "trial",
      [counter]: 0,
    });
    expect(await check(20)).toBe(false);
    expect(m.plan).not.toHaveBeenCalled();
  }
);
it.each(checks)(
  "does not grant %s capacity without active subscription or a valid plan",
  async (_name, check) => {
    for (const status of ["pending", "expired", "cancelled"]) {
      m.subscription.mockResolvedValue({ status, planId: 2 });
      expect(await check(20)).toBe(true);
    }
    m.subscription.mockResolvedValue(null);
    expect(await check(20)).toBe(true);
    m.subscription.mockResolvedValue({
      id: 3,
      merchantId: 20,
      planId: null,
      status: "active",
    });
    expect(await check(20)).toBe(true);
  }
);
it.each([
  ["conversations", usage.incrementConversationUsage, [3, 1, 0, 0]],
  ["messages", usage.incrementMessageUsage, [3, 0, 0, 1]],
  ["voice", usage.incrementVoiceMessageUsage, [3, 0, 1, 0]],
] as const)(
  "increments only the selected subscription's %s counter",
  async (_name, increment, args) => {
    await increment(20);
    expect(m.subscription).toHaveBeenCalledWith(20);
    expect(m.increment).toHaveBeenCalledWith(...args);
    expect(m.all).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  }
);
it("uses the atomic reply capacity gate for message admission", async () => {
  expect(await usage.hasReachedMessageLimit(20)).toBe(false);
  expect(m.schema).toHaveBeenCalledOnce();
  expect(m.execute).toHaveBeenCalledWith(
    "SELECT id FROM merchants WHERE id=? FOR UPDATE",
    [20]
  );
  expect(m.lock).toHaveBeenCalledWith(
    expect.objectContaining({ execute: m.execute }),
    20
  );
  expect(m.plan).not.toHaveBeenCalled();
  m.lock.mockRejectedValue(Error("Capacity unavailable"));
  expect(await usage.hasReachedMessageLimit(20)).toBe(true);
});
it.each([0, -1, 1.5, NaN, Infinity, 2147483648])(
  "blocks invalid tenant %s without effects",
  async id => {
    for (const check of [
      usage.hasReachedMessageLimit,
      usage.hasReachedConversationLimit,
      usage.hasReachedVoiceMessageLimit,
    ])
      expect(await check(id)).toBe(true);
    expect(m.tx).not.toHaveBeenCalled();
    expect(m.subscription).not.toHaveBeenCalled();
  }
);
it("does not export superseded usage snapshots or silent warning readers", () => {
  expect(usage).not.toHaveProperty("getUsageStats");
  expect(usage).not.toHaveProperty("isApproachingLimit");
});
