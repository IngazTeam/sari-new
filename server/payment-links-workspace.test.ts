import { paymentLinkCreateResult } from "../shared/payment-links-workspace";
import { createReviewedPaymentLink } from "./payment/payment-links-workspace";
import { paymentLinkCreateInput } from "../shared/payment-links-workspace";
import { disableReviewedPaymentLink } from "./payment/payment-links-workspace";
import {
  paymentLinkDisableInput,
  paymentLinkDisableResult,
} from "../shared/payment-links-workspace";
import { beforeEach, expect, it, vi } from "vitest";
const authority = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./accounts/merchant-settings-authority", () => ({
  withMerchantOwnerSettings: authority.run,
}));
import {
  projectPaymentLinkRecord,
  paymentLinksFilter,
  readPaymentLinksWorkspace,
  readPaymentLinkDetail,
} from "./payment/payment-links-workspace";
import {
  paymentLinkRecord,
  paymentLinksInput,
  paymentLinksWorkspace,
  paymentLinksTotals,
} from "../shared/payment-links-workspace";
const now = new Date("2026-10-04T12:00:00Z");
const row = () => ({
  id: 1,
  merchant_id: 7,
  link_id: "link_" + "a".repeat(32),
  title: "Local link",
  description: null,
  amount: 12550,
  currency: "SAR",
  is_fixed_amount: 1,
  min_amount: null,
  max_amount: null,
  tap_payment_url: "https://sary.live/pay/link_" + "a".repeat(32),
  status: "active",
  is_active: 1,
  usage_count: 0,
  max_usage_count: null,
  expires_at: null,
  order_id: null,
  booking_id: null,
  total_collected: 0,
  successful_payments: 0,
  failed_payments: 0,
  created_at: "2026-10-04 00:00:00",
  updated_at: "2026-10-04 00:00:00",
  metadata: "private raw metadata",
  tap_charge_id: "private provider reference",
});
const project = (patch: any = {}) =>
  projectPaymentLinkRecord(21, 7, { ...row(), ...patch }, now);
let tx: any;
beforeEach(() => {
  vi.resetAllMocks();
  tx = { execute: vi.fn() };
  authority.run.mockImplementation(async (_a, _m, _w, work) =>
    work(tx, { isOwner: true, canManage: true })
  );
});
it("projects bounded data and canonical URLs without stored metadata or provider references", () => {
  const value = project({ tap_payment_url: "javascript:private" });
  expect(value).toMatchObject({
    id: 1,
    amountMinor: 12550,
    availability: "available",
    publicUrl: "https://sary.live/pay/" + row().link_id,
  });
  expect(value.warnings).toContain("url");
  expect(JSON.stringify(value)).not.toContain("private");
  expect(value).not.toHaveProperty("merchant_id");
  expect(value).not.toHaveProperty("metadata");
});
it("binds review revisions to actor, tenant and every stored field", () => {
  const value = project();
  expect(projectPaymentLinkRecord(22, 7, row(), now).revision).not.toBe(
    value.revision
  );
  expect(
    projectPaymentLinkRecord(21, 8, { ...row(), merchant_id: 8 }, now).revision
  ).not.toBe(value.revision);
  for (const patch of [
    { metadata: "changed" },
    { amount: 12551 },
    { usage_count: 1 },
    { is_active: 0 },
    { tap_payment_url: "https://other.test" },
    { expires_at: "2026-10-05 00:00:00" },
  ])
    expect(project(patch).revision).not.toBe(value.revision);
  expect(() => project({ merchant_id: 8 })).toThrow("foreign");
});
it.each([
  [{ amount: -1 }, "amountMinor", "amount"],
  [{ currency: "sar" }, "currency", "currency"],
  [{ title: "x".repeat(256) }, "title", "text"],
  [{ link_id: "javascript:unsafe" }, "linkId", "identity"],
  [{ usage_count: -1 }, "usageCount", "counters"],
  [{ max_usage_count: 0 }, "maxUsageCount", "counters"],
  [{ is_fixed_amount: 2 }, "fixedAmount", "configuration"],
  [{ created_at: "2026-02-30 00:00:00" }, "createdAt", "timestamps"],
] as const)(
  "marks invalid stored fields without invented values %j",
  (patch, key, warning) => {
    const value = project(patch);
    expect((value as any)[key]).toBeNull();
    expect(value.warnings).toContain(warning);
  }
);
it("hides foreign and ambiguous target identities and public links", () => {
  for (const patch of [
    { order_id: 9 },
    { order_id: 9, booking_id: 10, owned_order_id: 9 },
    {
      booking_id: 10,
      owned_booking_id: 10,
      booking_service_id: 11,
      owned_service_id: 12,
    },
  ])
    expect(project(patch)).toMatchObject({
      related: { kind: "unavailable" },
      publicUrl: null,
      warnings: expect.arrayContaining(["target"]),
    });
  expect(project({ order_id: 9, owned_order_id: 9 }).related).toEqual({
    kind: "order",
    id: 9,
  });
  expect(
    project({
      booking_id: 10,
      owned_booking_id: 10,
      booking_service_id: 11,
      owned_service_id: 11,
    }).related
  ).toEqual({ kind: "booking", id: 10 });
});
it.each([
  {},
  { search: "100%_!" },
  { availability: "expired" },
  { availability: "expired", search: "' OR 1=1 --" },
])("scopes and parameterizes filter %j", filter => {
  const f = paymentLinksFilter(7, filter, now);
  expect(f.where).toContain("p.merchant_id=?");
  expect(f.args[0]).toBe(7);
  expect(f.where).not.toContain("OR 1=1");
  if ("search" in filter && filter.search === "100%_!")
    expect(f.args).toContain("%100!%!_!!%");
});
it.each([
  { merchantId: 99 },
  { page: 0 },
  { pageSize: 100 },
  { search: "x".repeat(101) },
  { availability: "fake" },
])("rejects invalid input %j", v =>
  expect(paymentLinksInput.safeParse(v).success).toBe(false)
);
it("returns the full page and aggregates for the authenticated scope", async () => {
  tx.execute
    .mockResolvedValueOnce([[{ availability: "available", total: "1" }]])
    .mockResolvedValueOnce([[row()]]);
  const value = await readPaymentLinksWorkspace(21, 7, {});
  expect(value).toMatchObject({
    actorId: 21,
    merchantId: 7,
    state: "ready",
    totals: { total: 1, states: { available: 1 } },
    items: [{ id: 1 }],
    hasNext: false,
  });
  expect(authority.run).toHaveBeenCalledWith(
    21,
    7,
    false,
    expect.any(Function)
  );
  expect(tx.execute.mock.calls[1][0]).toContain("LIMIT 25 OFFSET 0");
});
it("keeps restricted members from querying links at all", async () => {
  authority.run.mockImplementation(async (_a, _m, _w, work) =>
    work(tx, { isOwner: false, canManage: false })
  );
  expect(await readPaymentLinksWorkspace(21, 7, {})).toMatchObject({
    state: "restricted",
    items: [],
    totals: null,
  });
  expect(await readPaymentLinkDetail(21, 7, { id: 1 })).toMatchObject({
    state: "restricted",
    link: null,
  });
  expect(tx.execute).not.toHaveBeenCalled();
});
it("distinguishes missing detail from unavailable source", async () => {
  tx.execute.mockResolvedValueOnce([[]]);
  expect(await readPaymentLinkDetail(21, 7, { id: 1 })).toMatchObject({
    state: "missing",
    link: null,
  });
  tx.execute.mockRejectedValueOnce(Error("offline"));
  await expect(readPaymentLinkDetail(21, 7, { id: 1 })).rejects.toThrow(
    "offline"
  );
});
it("refuses impossible totals, duplicate rows, wrong filtered evidence and unsafe URLs", async () => {
  expect(
    paymentLinksTotals.safeParse({
      total: 2,
      states: {
        available: 1,
        disabled: 0,
        expired: 0,
        exhausted: 0,
        invalid: 0,
      },
    }).success
  ).toBe(false);
  for (const publicUrl of [
    "javascript:alert(1)",
    "https://user:pass@example.test/pay/" + row().link_id,
    "https://example.test/pay/wrong",
    "https://example.test/pay/" + row().link_id + "?private=1",
  ])
    expect(
      paymentLinkRecord.safeParse({ ...project(), publicUrl }).success
    ).toBe(false);
  tx.execute
    .mockResolvedValueOnce([[{ availability: "available", total: 1 }]])
    .mockResolvedValueOnce([[row()]]);
  const value = await readPaymentLinksWorkspace(21, 7, {});
  expect(
    paymentLinksWorkspace.safeParse({
      ...value,
      items: [...value.items, ...value.items],
    }).success
  ).toBe(false);
  expect(
    paymentLinksWorkspace.safeParse({
      ...value,
      filters: { ...value.filters, availability: "expired" },
    }).success
  ).toBe(false);
  expect(
    paymentLinkRecord.safeParse({ ...project(), metadata: "private" }).success
  ).toBe(false);
});

it.each([
  { enabled: false },
  { enabled: null },
  { storedStatus: "expired" },
  { storedStatus: "completed" },
  { storedStatus: null },
  { publicUrl: null },
])("rejects contradictory projected link availability %j", patch =>
  expect(paymentLinkRecord.safeParse({ ...project(), ...patch }).success).toBe(
    false
  )
);
it("rejects list evidence with counts in the wrong state or an already expired available link", async () => {
  tx.execute
    .mockResolvedValueOnce([[{ availability: "available", total: 1 }]])
    .mockResolvedValueOnce([[row()]]);
  const v = await readPaymentLinksWorkspace(21, 7, {});
  expect(
    paymentLinksWorkspace.safeParse({
      ...v,
      totals: {
        total: 1,
        states: {
          available: 0,
          disabled: 0,
          expired: 1,
          exhausted: 0,
          invalid: 0,
        },
      },
    }).success
  ).toBe(false);
  expect(
    paymentLinksWorkspace.safeParse({
      ...v,
      items: [{ ...v.items[0], expiresAt: "2020-01-01T00:00:00.000Z" }],
    }).success
  ).toBe(false);
});
it("requires a positive known service identity for a booking target", () =>
  expect(
    project({
      booking_id: 10,
      owned_booking_id: 10,
      booking_service_id: null,
      owned_service_id: null,
    }).related
  ).toEqual({ kind: "unavailable" }));

const disableInput = () => ({
  id: 1,
  expectedRevision: project().revision,
  reviewed: true as const,
});
it("disables only the reviewed tenant row, verifies one changed row and returns stored evidence", async () => {
  tx.execute
    .mockResolvedValueOnce([[row()]])
    .mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ ...row(), is_active: 0, status: "disabled" }]]);
  const result = await disableReviewedPaymentLink(21, 7, disableInput());
  expect(authority.run).toHaveBeenCalledWith(21, 7, true, expect.any(Function));
  expect(tx.execute.mock.calls[0][0]).toContain("FOR UPDATE");
  expect(tx.execute.mock.calls[1]).toEqual([
    "UPDATE payment_links SET is_active=0,status='disabled' WHERE id=? AND merchant_id=?",
    [1, 7],
  ]);
  expect(result).toMatchObject({
    outcome: "disabled",
    workspace: {
      link: {
        enabled: false,
        storedStatus: "disabled",
        availability: "disabled",
      },
    },
  });
});
it("returns already disabled only after re-reading a matching reviewed snapshot", async () => {
  const saved = { ...row(), is_active: 0, status: "disabled" };
  tx.execute.mockResolvedValue([[saved]]);
  const result = await disableReviewedPaymentLink(21, 7, {
    ...disableInput(),
    expectedRevision: project({ is_active: 0, status: "disabled" }).revision,
  });
  expect(result.outcome).toBe("already_disabled");
  expect(
    tx.execute.mock.calls.every((args: any) => args[0].startsWith("SELECT"))
  ).toBe(true);
});
it.each([0, 2, undefined])(
  "does not acknowledge an invalid affected-row result %s",
  async affectedRows => {
    tx.execute
      .mockResolvedValueOnce([[row()]])
      .mockResolvedValueOnce([{ affectedRows }]);
    await expect(
      disableReviewedPaymentLink(21, 7, disableInput())
    ).rejects.toThrow("unavailable");
    expect(tx.execute).toHaveBeenCalledTimes(2);
  }
);
it("rejects a stale revision before updating even if hidden metadata changed", async () => {
  tx.execute.mockResolvedValueOnce([[{ ...row(), metadata: "changed" }]]);
  await expect(
    disableReviewedPaymentLink(21, 7, disableInput())
  ).rejects.toThrow("stale");
  expect(tx.execute).toHaveBeenCalledTimes(1);
});
it("does not mistake a missing or unverified post-write row for success", async () => {
  tx.execute.mockResolvedValueOnce([[]]);
  await expect(
    disableReviewedPaymentLink(21, 7, disableInput())
  ).rejects.toThrow("missing");
  tx.execute
    .mockResolvedValueOnce([[row()]])
    .mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[row()]]);
  await expect(
    disableReviewedPaymentLink(21, 7, disableInput())
  ).rejects.toThrow();
});
it.each([
  { reviewed: false },
  { expectedRevision: "bad" },
  { merchantId: 8 },
  { id: -1 },
])("rejects invalid disable review %j", patch =>
  expect(
    paymentLinkDisableInput.safeParse({ ...disableInput(), ...patch }).success
  ).toBe(false)
);
it("rejects a disable result that is only optimistic or belongs to a restricted state", async () => {
  tx.execute
    .mockResolvedValueOnce([[row()]])
    .mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ ...row(), is_active: 0, status: "disabled" }]]);
  const result = await disableReviewedPaymentLink(21, 7, disableInput());
  expect(
    paymentLinkDisableResult.safeParse({
      ...result,
      workspace: { ...result.workspace, canManage: false },
    }).success
  ).toBe(false);
  expect(
    paymentLinkDisableResult.safeParse({
      ...result,
      workspace: { ...result.workspace, link: project() },
    }).success
  ).toBe(false);
});

const createInput = {
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reviewed: true as const,
  title: "Local link",
  description: "",
  amountMinor: 12550,
  currency: "SAR",
  maxUsageCount: null,
  expiresAt: null,
};
it.each([
  { requestId: "aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa" },
  { reviewed: false },
  { title: " " },
  { amountMinor: 99 },
  { amountMinor: 100.5 },
  { amountMinor: 100000001 },
  { currency: "USD" },
  { maxUsageCount: 0 },
  { expiresAt: "2038-01-01T00:00:00.000Z" },
  { expiresAt: "2030-02-30T00:00:00.000Z" },
  { expiresAt: "2030-01-01T00:00:00.123Z" },
  { expiresAt: "2030-01-01 00:00:00" },
  { merchantId: 8 },
  { orderId: 7 },
  { bookingId: 9 },
  { isFixedAmount: false },
])("rejects unsafe or ambiguous generic creation %j", patch =>
  expect(
    paymentLinkCreateInput.safeParse({ ...createInput, ...patch }).success
  ).toBe(false)
);
it("accepts exact minor units, optional no-expiry and canonical whole-second UTC expiry", () => {
  expect(paymentLinkCreateInput.parse(createInput).amountMinor).toBe(12550);
  expect(
    paymentLinkCreateInput.parse({
      ...createInput,
      expiresAt: "2030-01-01T00:00:00.000Z",
    }).expiresAt
  ).toBe("2030-01-01T00:00:00.000Z");
});

it.each([0, 2, undefined])(
  "never acknowledges creation without exactly one insert %s",
  async affectedRows => {
    tx.execute
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows, insertId: 1 }]);
    await expect(createReviewedPaymentLink(21, 7, createInput)).rejects.toThrow(
      "unavailable"
    );
    expect(tx.execute).toHaveBeenCalledTimes(2);
  }
);
it("checks persisted amount against the reviewed creation rather than trusting the insert receipt", async () => {
  let metadata: string | undefined;
  tx.execute.mockImplementation(async (sql: string, args: any[]) => {
    if (sql.startsWith("INSERT")) {
      metadata = args.at(-1);
      return [{ affectedRows: 1, insertId: 1 }];
    }
    if (!metadata) return [[]];
    return [
      [
        {
          ...row(),
          link_id: "link_" + createInput.requestId.replaceAll("-", ""),
          metadata,
          amount: 12551,
        },
      ],
    ];
  });
  await expect(createReviewedPaymentLink(21, 7, createInput)).rejects.toThrow(
    "unavailable"
  );
});
it("does not claim a successful creation when the transaction result is unknown", async () => {
  authority.run.mockRejectedValueOnce(Error("merchant_settings:unknown"));
  await expect(createReviewedPaymentLink(21, 7, createInput)).rejects.toThrow(
    "unknown"
  );
});

it("distinguishes a newly created receipt from a recovered current state", () => {
  const link = project({
    link_id: "link_" + createInput.requestId.replaceAll("-", ""),
  });
  const receipt = {
    outcome: "created",
    requestId: createInput.requestId,
    workspace: {
      actorId: 21,
      merchantId: 7,
      canView: true,
      canManage: true,
      checkedAt: now.toISOString(),
      source: "local_payment_links",
      state: "found",
      link,
    },
  };
  expect(paymentLinkCreateResult.safeParse(receipt).success).toBe(true);
  expect(
    paymentLinkCreateResult.safeParse({
      ...receipt,
      workspace: { ...receipt.workspace, canManage: false },
    }).success
  ).toBe(false);
  const disabled = {
    ...link,
    enabled: false,
    storedStatus: "disabled",
    availability: "disabled",
  };
  expect(
    paymentLinkCreateResult.safeParse({
      ...receipt,
      workspace: { ...receipt.workspace, link: disabled },
    }).success
  ).toBe(false);
  expect(
    paymentLinkCreateResult.safeParse({
      ...receipt,
      outcome: "recovered",
      workspace: { ...receipt.workspace, link: disabled },
    }).success
  ).toBe(true);
});
