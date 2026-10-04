import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock("./accounts/merchant-settings-authority", () => ({
  withMerchantOwnerSettings: m.authority,
}));
import {
  cancelCurrentSubscription,
  SubscriptionCancellationConflictError,
} from "./subscriptions/cancel-subscription";
import {
  cancellationReview,
  subscriptionCancellationInput,
} from "../shared/subscription-cancellation";
const expected = {
  id: 9,
  planId: 3,
  status: "active" as const,
  billingCycle: "monthly" as const,
  startDate: "2026-10-01T00:00:00.000Z",
  endDate: "2026-11-01T00:00:00.000Z",
};
let selected: any[], pointer: unknown, changed: any, saved: any, clock: unknown;
beforeEach(() => {
  vi.resetAllMocks();
  clock = "2026-10-04 12:00:00";
  selected = [
    {
      id: 9,
      plan_id: 3,
      status: "active",
      billing_cycle: "monthly",
      start_date: expected.startDate,
      end_date: expected.endDate,
      trial_ends_at: null,
    },
  ];
  pointer = 9;
  changed = { affectedRows: 1 };
  saved = {
    status: "cancelled",
    cancelled_at: "2026-10-04 12:00:00",
    cancellation_reason: null,
    current_subscription_id: null,
    subscription_status: "expired",
    max_customers_allowed: 0,
  };
  m.authority.mockImplementation((_actor, _merchant, _write, work) =>
    work({ execute: m.execute }, { canManage: true, isOwner: true })
  );
  m.execute.mockImplementation(async (sql: string) => [
    sql.startsWith("SELECT UTC")
      ? [{ checked_at: clock }]
      : sql.startsWith("SELECT id,plan")
        ? selected
        : sql.startsWith("SELECT current_")
          ? [{ current_subscription_id: pointer }]
          : sql.startsWith("UPDATE")
            ? changed
            : [saved],
  ]);
});
const run = (input: any = { expected }) =>
  cancelCurrentSubscription(21, 73, input);
const noWrite = () =>
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(
    false
  );
it("requires live write authority and verifies both write receipts and final entitlement", async () => {
  expect(await run()).toEqual({ success: true, subscriptionId: 9 });
  expect(m.authority).toHaveBeenCalledWith(21, 73, true, expect.any(Function));
  expect(
    m.execute.mock.calls.filter(([sql]) => sql.startsWith("UPDATE"))
  ).toHaveLength(2);
});
it.each([{ ids: [] }, { ids: [1, 2] }])(
  "rejects missing or ambiguous subscription selection %j",
  async ({ ids }) => {
    selected = ids.map(id => ({ ...selected[0], id }));
    await expect(run()).rejects.toBeInstanceOf(
      SubscriptionCancellationConflictError
    );
    noWrite();
  }
);
it.each([
  ["id", 10],
  ["plan_id", 4],
  ["status", "trial"],
  ["billing_cycle", "yearly"],
  ["start_date", "2026-10-02T00:00:00.000Z"],
  ["end_date", "2026-11-02T00:00:00.000Z"],
])("rejects changed %s under the lock", async (key, value) => {
  selected[0][key] = value;
  await expect(run()).rejects.toThrow();
  noWrite();
});
it.each([null, 10, "9"])(
  "rejects a mismatched canonical pointer %j",
  async value => {
    pointer = value;
    await expect(run()).rejects.toBeInstanceOf(
      SubscriptionCancellationConflictError
    );
    noWrite();
  }
);
it.each([
  "2026-09-30 12:00:00",
  "2026-11-01 00:00:00",
  "2026-11-02 00:00:00",
  "invalid",
  null,
])("rejects future, expired or unavailable period at %j", async value => {
  clock = value;
  await expect(run()).rejects.toThrow();
  noWrite();
});
it.each([
  undefined,
  {},
  { affectedRows: 0 },
  { affectedRows: 2 },
  { affectedRows: "1" },
  [],
])("rejects an unverified update receipt %j", async result => {
  changed = result;
  await expect(run()).rejects.toThrow();
});
it.each([
  ["status", "active"],
  ["cancelled_at", null],
  ["cancelled_at", "invalid"],
  ["cancellation_reason", "other"],
  ["current_subscription_id", 9],
  ["subscription_status", "active"],
  ["max_customers_allowed", 100],
])("rejects an inconsistent saved %s", async (key, value) => {
  saved[key] = value;
  await expect(run()).rejects.toThrow();
});
it.each([
  {},
  { expectedSubscriptionId: 9 },
  { expected, tenant: 1 },
  { expected: { ...expected, secret: "x" } },
])("rejects incomplete or extra input before authority %j", async input => {
  await expect(run(input)).rejects.toThrow();
  expect(m.authority).not.toHaveBeenCalled();
});
it("accepts no usage fields as a review and never compares usage counters", async () => {
  expect(
    subscriptionCancellationInput.safeParse({
      expected: { ...expected, messagesUsed: 10 },
    }).success
  ).toBe(false);
  selected[0].messages_used = 100;
  await expect(run()).resolves.toMatchObject({ success: true });
});
it("keeps trial cancellation bound to its earlier recorded end", async () => {
  selected[0].status = "trial";
  selected[0].trial_ends_at = "2026-10-10 00:00:00";
  await expect(
    run({
      expected: {
        ...expected,
        status: "trial",
        endDate: "2026-10-10T00:00:00.000Z",
      },
    })
  ).resolves.toMatchObject({ success: true });
});
it("cannot review an absent or incomplete subscription", () => {
  expect(cancellationReview(null)).toBeNull();
  expect(cancellationReview({ id: 9 } as any)).toBeNull();
});
