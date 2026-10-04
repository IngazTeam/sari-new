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
