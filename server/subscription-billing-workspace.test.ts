import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock("./accounts/merchant-settings-authority", async original => ({
  ...(await original<any>()),
  withMerchantOwnerSettings: m.authority,
}));
import {
  projectBillingSubscription,
  projectBillingPayment,
  readSubscriptionBilling,
  readBillingHistory,
} from "./subscriptions/billing-workspace";
import {
  billingHistoryInput,
  billingHistorySchema,
  subscriptionBillingSchema,
} from "../shared/subscription-billing-workspace";
const now = "2026-10-04T00:00:00.000Z",
  authority = { canManage: true, isOwner: true };
const row = () => ({
  id: 5,
  plan_id: 2,
  status: "active",
  billing_cycle: "monthly",
  start_date: "2026-10-01 00:00:00",
  end_date: "2026-11-01 00:00:00",
  last_reset_at: "2026-10-01 00:00:00",
  conversations_used: 7,
  messages_used: 0,
  voice_messages_used: 1,
  secret: "PRIVATE",
});
const plan = {
  id: 2,
  name: "باقة",
  name_en: "Plan",
  conversation_limit: 100,
  message_limit: -1,
  voice_message_limit: 0,
  max_customers: 999999,
  max_whatsapp_numbers: 2,
};
const project = (selected = [row()], p: any = plan) =>
  projectBillingSubscription(7, 20, authority, now, selected, p);
const payment = (id = 8) => ({
  id,
  type: "subscription",
  status: "completed",
  amount: "99.90",
  currency: "SAR",
  created_at: now,
  paid_at: now,
  tap_response: "PRIVATE",
  metadata: "PRIVATE",
  checkout_attempt_id: "PRIVATE",
});
beforeEach(() => {
  vi.resetAllMocks();
  m.authority.mockImplementation(async (_a, _m, _w, work) =>
    work({ execute: m.execute }, authority)
  );
});
it("projects exact limits and periods without storage fields or invented resource usage", () => {
  const result = project();
  expect(result).toMatchObject({
    state: "active",
    canManage: true,
    subscription: {
      daysRemaining: 28,
      nameAr: "باقة",
      limitsSource: "plan",
      quotas: {
        conversations: { used: 7, remaining: 93 },
        messages: { unlimited: true },
        voiceMessages: { limit: 0, percentage: 100 },
      },
      resources: { customers: { used: null, unlimited: true } },
    },
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("does not select one of multiple live subscriptions or confuse absence with failure", () => {
  expect(project([])).toMatchObject({ state: "none", subscription: null });
  expect(project([row(), { ...row(), id: 6 }])).toMatchObject({
    state: "ambiguous",
    subscription: null,
  });
});
it.each(["expired", "cancelled", "pending", "other"])(
  "preserves historical state %s",
  status => {
    expect(project([{ ...row(), status }])).toMatchObject({
      state: status === "other" ? "unknown" : status,
    });
  }
);
it("derives elapsed time without writing an active record", () => {
  const result = project([{ ...row(), end_date: now }]);
  expect(result).toMatchObject({
    state: "expired",
    subscription: { recordedStatus: "active", daysRemaining: 0 },
  });
});
it.each([
  { start_date: "2026-12-01" },
  { end_date: "bad" },
  { end_date: "2026-09-01" },
  { start_date: "2026-02-30" },
])("keeps malformed periods unknown %j", change =>
  expect(project([{ ...row(), ...change }]).state).toBe("unknown")
);
it("requires both trial end timestamps and uses the earlier one and trial quotas", () => {
  expect(
    project([{ ...row(), status: "trial", plan_id: null }], undefined).state
  ).toBe("unknown");
  expect(
    project(
      [
        {
          ...row(),
          status: "trial",
          plan_id: null,
          trial_ends_at: "2026-10-08 00:00:00",
        } as any,
      ],
      undefined
    )
  ).toMatchObject({
    state: "trial",
    subscription: {
      daysRemaining: 4,
      limitsSource: "trial",
      quotas: { conversations: { limit: 100 } },
    },
  });
});
it("does not borrow another plan or coerce corrupt quota values", () => {
  expect(project([row()], { ...plan, id: 99 }).subscription?.limitsSource).toBe(
    "unknown"
  );
  expect(
    project([{ ...row(), conversations_used: "7" } as any], {
      ...plan,
      message_limit: "10",
    }).subscription?.quotas
  ).toMatchObject({
    conversations: { used: null },
    messages: { limit: null, unlimited: null },
  });
});
it("strictly checks response envelopes", () => {
  expect(
    subscriptionBillingSchema.safeParse({ ...project(), state: "none" }).success
  ).toBe(false);
  expect(
    subscriptionBillingSchema.safeParse({
      ...project(),
      canReadPayments: false,
    }).success
  ).toBe(false);
  expect(
    subscriptionBillingSchema.safeParse({ ...project(), metadata: "extra" })
      .success
  ).toBe(false);
});
it("reads current records with tenant authority and bounded explicit SELECTs only", async () => {
  m.execute
    .mockResolvedValueOnce([[{ checked_at: now }]])
    .mockResolvedValueOnce([[row()]])
    .mockResolvedValueOnce([[plan]]);
  expect((await readSubscriptionBilling(7, 20)).state).toBe("active");
  expect(m.authority).toHaveBeenCalledWith(7, 20, false, expect.any(Function));
  expect(m.execute.mock.calls[1]).toEqual([
    expect.stringContaining(
      "WHERE merchant_id=? AND status IN ('active','trial')"
    ),
    [20],
  ]);
  expect(
    m.execute.mock.calls.every(
      ([sql]) => sql.startsWith("SELECT") && !sql.includes("SELECT *")
    )
  ).toBe(true);
});
it("reads a latest cancelled record when no current subscription exists", async () => {
  m.execute
    .mockResolvedValueOnce([[{ checked_at: now }]])
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([
      [{ ...row(), status: "cancelled", plan_id: null }],
    ]);
  expect((await readSubscriptionBilling(7, 20)).state).toBe("cancelled");
  expect(m.execute).toHaveBeenLastCalledWith(
    expect.stringContaining("LIMIT 1"),
    [20]
  );
});
it.each([{}, null])("rejects invalid storage envelopes %j", envelope => {
  m.execute
    .mockResolvedValueOnce([[{ checked_at: now }]])
    .mockResolvedValueOnce([envelope]);
  return expect(readSubscriptionBilling(7, 20)).rejects.toThrow();
});
it("rejects invalid database clock", async () => {
  m.execute.mockResolvedValue([[{ checked_at: "bad" }]]);
  await expect(readSubscriptionBilling(7, 20)).rejects.toThrow();
  expect(m.execute).toHaveBeenCalledTimes(1);
});
it("projects exact subscription money and omits all private fields", () => {
  expect(projectBillingPayment(payment())).toMatchObject({
    amountMinor: 9990,
    currency: "SAR",
  });
  expect(JSON.stringify(projectBillingPayment(payment()))).not.toMatch(
    /PRIVATE|metadata|tap_|checkout_/
  );
  expect(
    projectBillingPayment({ ...payment(), amount: "0.00" }).amountMinor
  ).toBe(0);
});
it.each(["-1", "1e2", "2.345", "", "100000000", null, 99.9])(
  "does not coerce invalid monetary value %j",
  amount =>
    expect(
      projectBillingPayment({ ...payment(), amount }).amountMinor
    ).toBeNull()
);
it("keeps unsupported currency and unknown record values honest", () =>
  expect(
    projectBillingPayment({
      ...payment(),
      currency: "EUR",
      status: "x",
      type: "x",
      created_at: "bad",
    })
  ).toMatchObject({
    amountMinor: null,
    currency: null,
    status: "unknown",
    type: "unknown",
    createdAt: null,
  }));
it("keeps a captured payment requiring review distinct from applied or pending payments", () => {
  expect(billingHistoryInput.parse({ status: "requires_review" }).status).toBe("requires_review");
  expect(projectBillingPayment({ ...payment(), status: "requires_review", paid_at: now })).toMatchObject({ status: "requires_review", paidAt: now });
});
it.each([
  { pageSize: 1000 },
  { beforeId: -1 },
  { merchantId: 21 },
  { status: "pending' OR 1=1" },
  { type: "secret" },
])("rejects unbounded or forged history request %j", input =>
  expect(billingHistoryInput.safeParse(input).success).toBe(false)
);
it("paginates exact scoped history and never selects provider payloads", async () => {
  m.execute
    .mockResolvedValueOnce([[{ checked_at: now }]])
    .mockResolvedValueOnce([
      Array.from({ length: 26 }, (_, i) => payment(80 - i)),
    ]);
  const result = await readBillingHistory(7, 20, {
    beforeId: 100,
    status: "completed",
    type: "subscription",
  });
  expect(result.rows).toHaveLength(25);
  expect(result.nextBeforeId).toBe(56);
  expect(m.execute).toHaveBeenLastCalledWith(
    expect.stringContaining(
      "WHERE merchant_id=? AND id<? AND status=? AND type=? ORDER BY id DESC LIMIT 26"
    ),
    [20, 100, "completed", "subscription"]
  );
  expect(m.execute.mock.calls[1][0]).not.toMatch(/tap_|metadata|SELECT \*/);
});
it("denies payment reads to a member before selecting any records", async () => {
  m.authority.mockImplementation(async (_a, _m, _w, work) =>
    work({ execute: m.execute }, { canManage: false, isOwner: false })
  );
  await expect(readBillingHistory(7, 20, {})).rejects.toThrow("forbidden");
  expect(m.execute).not.toHaveBeenCalled();
});
it("distinguishes an empty successful page from an unavailable source", async () => {
  m.execute
    .mockResolvedValueOnce([[{ checked_at: now }]])
    .mockResolvedValueOnce([[]]);
  expect(await readBillingHistory(7, 20, {})).toMatchObject({
    rows: [],
    nextBeforeId: null,
  });
  m.execute.mockRejectedValue(Error("storage failed"));
  await expect(readBillingHistory(7, 20, {})).rejects.toThrow();
});
it("rejects duplicate, unsorted, out-of-filter or contradicting history pages", () => {
  const base = {
    actorId: 7,
    merchantId: 20,
    checkedAt: now,
    timezone: "UTC",
    input: billingHistoryInput.parse({}),
    rows: [projectBillingPayment(payment())],
    nextBeforeId: null,
  };
  for (const change of [
    { rows: [...base.rows, ...base.rows] },
    { input: { ...base.input, beforeId: 8 } },
    { input: { ...base.input, status: "pending" } },
    { nextBeforeId: 8 },
  ])
    expect(billingHistorySchema.safeParse({ ...base, ...change }).success).toBe(
      false
    );
});
