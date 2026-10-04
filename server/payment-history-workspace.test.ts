import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  paymentHistoryInput,
  paymentHistoryWorkspace,
  paymentHistoryDetail,
  paymentHistoryItem,
  paymentHistoryTotals,
} from "../shared/payment-history-workspace";
import {
  projectPaymentHistoryItem,
  projectPaymentHistoryTotals,
  projectPaymentHistoryDetail,
  paymentHistoryFilter,
  readPaymentHistoryWorkspace,
  readPaymentHistoryDetail,
} from "./payment/payment-history-workspace";
const row = () => ({
  id: 7,
  amount: 12550,
  currency: "SAR",
  status: "captured",
  customer_name: "Local",
  customer_phone: "synthetic",
  tap_charge_id: "chg_synthetic",
  payment_method: "card",
  created_at: "2026-10-04 10:00:00",
  order_id: null,
  booking_id: null,
  customer_email: null,
  description: "local",
  updated_at: null,
});
const group = (
  currency: any,
  status: any,
  records = 1,
  amount = 12550,
  invalid = 0
) => ({
  currency,
  status,
  records,
  amount_minor: amount,
  invalid_amounts: invalid,
});
let tx: any,
  role: string,
  active: number,
  account: string,
  records: any[],
  groups: any[];
beforeEach(() => {
  vi.resetAllMocks();
  role = "owner";
  active = 1;
  account = "active";
  records = [row()];
  groups = [group("SAR", "captured")];
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT id,userId"))
        return [[{ id: 2, userId: 1, status: "active" }]];
      if (sql.includes("FROM users"))
        return [[{ id: 1, account_status: account }]];
      if (sql.includes("FROM merchant_members"))
        return [[{ role, is_active: active }]];
      if (sql.includes("COUNT(*)")) return [groups];
      if (sql.includes("FROM order_payments")) return [records];
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
it("keeps authorized and captured money separate and never mixes currencies", () => {
  const d = projectPaymentHistoryTotals([
    group("SAR", "authorized", 1, 30000),
    group("SAR", "captured", 1, 10000),
    group("USD", "captured", 1, 7000),
    group("USD", "refunded", 1, 5000),
  ]);
  expect(d).toMatchObject({
    total: 4,
    states: { authorized: 1, captured: 2, refunded: 1 },
    currencies: [
      {
        currency: "SAR",
        totalMinor: 40000,
        authorizedMinor: 30000,
        capturedMinor: 10000,
        refundedMinor: 0,
      },
      {
        currency: "USD",
        totalMinor: 12000,
        capturedMinor: 7000,
        refundedMinor: 5000,
      },
    ],
  });
});
it("counts invalid money without including it in currency totals", () => {
  expect(
    projectPaymentHistoryTotals([
      group(null, "captured", 2, 800),
      group("SAR", "failed", 2, 400, 1),
    ])
  ).toMatchObject({
    total: 4,
    excludedAmounts: 3,
    currencies: [
      { currency: "SAR", records: 1, totalMinor: 400, capturedMinor: 0 },
    ],
  });
});
it.each(["NaN", "12.5", -1, null, Number.MAX_SAFE_INTEGER + 1])(
  "rejects unsafe aggregate %s instead of reporting zero",
  records =>
    expect(() =>
      projectPaymentHistoryTotals([{ ...group("SAR", "captured"), records }])
    ).toThrow()
);
it.each([null, -1, 1.1, "100", Number.MAX_SAFE_INTEGER])(
  "marks invalid row money %s explicitly",
  amount =>
    expect(projectPaymentHistoryItem({ ...row(), amount })).toMatchObject({
      amountMinor: null,
      warnings: ["amount"],
    })
);
it("retains known zero and marks unknown status/currency/date without inventing pending or SAR", () => {
  expect(
    projectPaymentHistoryItem({
      ...row(),
      amount: 0,
      status: "legacy",
      currency: "sar",
      created_at: "broken",
    })
  ).toMatchObject({
    amountMinor: 0,
    currency: null,
    status: "unknown",
    createdAt: null,
    warnings: ["currency", "status", "createdAt"],
  });
});
it("returns only bounded fields, never metadata, redirect URLs or provider diagnostic text", () => {
  const d = projectPaymentHistoryDetail({
    ...row(),
    metadata: '{"secret":"private"}',
    tap_payment_url: "https://private.invalid",
    error_message: "private provider secret",
    error_code: "private",
    order_id: 19,
    owned_order_id: null,
  });
  expect(d.related).toEqual({ kind: "unavailable" });
  expect(d.hasRecordedError).toBe(true);
  expect(JSON.stringify(d)).not.toContain("private");
  expect(d).not.toHaveProperty("order_id");
});
it.each([
  {
    order_id: 3,
    owned_order_id: 3,
    booking_id: 4,
    owned_booking_id: 4,
    booking_service_id: 5,
    owned_service_id: 5,
  },
  { order_id: 3, owned_order_id: null },
  {
    booking_id: 4,
    owned_booking_id: 4,
    booking_service_id: 5,
    owned_service_id: null,
  },
  {
    booking_id: 4,
    owned_booking_id: null,
    booking_service_id: 5,
    owned_service_id: 5,
  },
])("hides a conflicting or incomplete target %j", patch =>
  expect(projectPaymentHistoryDetail({ ...row(), ...patch }).related).toEqual({
    kind: "unavailable",
  })
);
it("allows exact same-tenant order and full booking/service chains", () => {
  expect(
    projectPaymentHistoryDetail({ ...row(), order_id: 3, owned_order_id: 3 })
      .related
  ).toEqual({ kind: "order", id: 3 });
  expect(
    projectPaymentHistoryDetail({
      ...row(),
      booking_id: 4,
      owned_booking_id: 4,
      booking_service_id: 5,
      owned_service_id: 5,
    }).related
  ).toEqual({ kind: "booking", id: 4 });
});
it.each([
  { page: 0 },
  { page: 1.2 },
  { pageSize: 100 },
  { from: "2026-02-30" },
  { from: "2026-10-04", to: "2026-10-03" },
  { merchantId: 3 },
  { status: "CAPTURED" },
  { search: "x".repeat(101) },
])("rejects invalid filter %j before SQL", async input => {
  await expect(async () =>
    readPaymentHistoryWorkspace(1, 2, input)
  ).rejects.toThrow();
  expect(m.pool).not.toHaveBeenCalled();
});
it("binds search literally and uses an inclusive UTC end day", () => {
  const d = paymentHistoryFilter(2, {
    search: "a!_%' OR 1=1",
    from: "2026-10-01",
    to: "2026-10-04",
  });
  expect(d.where).not.toContain("1=1");
  expect(d.args).toEqual([
    2,
    "2026-10-01 00:00:00",
    "2026-10-04 00:00:00",
    ...Array(4).fill("%a!!!_!%' OR 1=1%"),
  ]);
  expect(d.where).toContain("DATE_ADD(?, INTERVAL 1 DAY)");
});
it("reads matching page and aggregates in one transaction", async () => {
  const d = await readPaymentHistoryWorkspace(1, 2, {});
  expect(d).toMatchObject({
    actorId: 1,
    merchantId: 2,
    state: "ready",
    items: [{ id: 7 }],
    totals: { total: 1 },
    hasNext: false,
  });
  expect(tx.commit).toHaveBeenCalledOnce();
  const calls = tx.execute.mock.calls.filter(([sql]: any[]) =>
    sql.includes("FROM order_payments")
  );
  expect(calls).toHaveLength(2);
  for (const [sql, args] of calls) {
    expect(sql).toContain("p.merchant_id=?");
    expect(args).toEqual([2]);
  }
});
it.each(["manager", "sales_supervisor", "viewer"])(
  "preserves owner-only financial access for %s without reading payment rows",
  async memberRole => {
    role = memberRole;
    expect(await readPaymentHistoryWorkspace(1, 2, {})).toMatchObject({
      state: "restricted",
      totals: null,
      items: [],
    });
    expect(await readPaymentHistoryDetail(1, 2, { id: 7 })).toMatchObject({
      state: "restricted",
      payment: null,
    });
    expect(
      tx.execute.mock.calls.some(([sql]: any[]) =>
        sql.includes("FROM order_payments")
      )
    ).toBe(false);
  }
);
it("refuses explicit revocation and inactive accounts before financial reads", async () => {
  active = 0;
  await expect(readPaymentHistoryWorkspace(1, 2, {})).rejects.toThrow();
  active = 1;
  account = "suspended";
  await expect(readPaymentHistoryDetail(1, 2, { id: 7 })).rejects.toThrow();
  expect(
    tx.execute.mock.calls.some(([sql]: any[]) =>
      sql.includes("FROM order_payments")
    )
  ).toBe(false);
});
it("does not convert database failure into a zero-state result", async () => {
  m.pool.mockResolvedValue(null);
  await expect(readPaymentHistoryWorkspace(1, 2, {})).rejects.toThrow();
});
it("discards a connection when read transaction completion is uncertain", async () => {
  tx.commit.mockRejectedValue(Error("private db diagnostic"));
  await expect(readPaymentHistoryWorkspace(1, 2, {})).rejects.toThrow(
    "unknown"
  );
  expect(tx.destroy).toHaveBeenCalled();
  expect(tx.release).not.toHaveBeenCalled();
});
it("distinguishes missing details and validates contradiction in response contracts", async () => {
  records = [];
  groups = [];
  expect(await readPaymentHistoryDetail(1, 2, { id: 9 })).toMatchObject({
    state: "missing",
    payment: null,
  });
  const list = await readPaymentHistoryWorkspace(1, 2, {});
  expect(
    paymentHistoryWorkspace.safeParse({ ...list, state: "restricted" }).success
  ).toBe(false);
  const detail = await readPaymentHistoryDetail(1, 2, { id: 7 });
  expect(
    paymentHistoryDetail.safeParse({ ...detail, state: "found" }).success
  ).toBe(false);
  expect(paymentHistoryInput.parse({}).pageSize).toBe(25);
});
it.each(["2026-02-30 12:00:00", "2026-10-04T24:00:00Z", "not-a-date"])(
  "rejects a malformed date %s instead of rolling it into a different day",
  created_at => {
    expect(projectPaymentHistoryItem({ ...row(), created_at })).toMatchObject({
      createdAt: null,
      warnings: ["createdAt"],
    });
  }
);
it("treats stored timestamps as UTC and keeps explicit offsets", () => {
  expect(
    projectPaymentHistoryItem({ ...row(), created_at: "2026-10-04T12:00:00" })
      .createdAt
  ).toBe("2026-10-04T12:00:00.000Z");
  expect(
    projectPaymentHistoryItem({
      ...row(),
      created_at: "2026-10-04T12:00:00+03:00",
    }).createdAt
  ).toBe("2026-10-04T09:00:00.000Z");
});
it("rejects partial-page and contradictory money evidence", async () => {
  const list = await readPaymentHistoryWorkspace(1, 2, {});
  expect(
    paymentHistoryWorkspace.safeParse({ ...list, items: [] }).success
  ).toBe(false);
  expect(
    paymentHistoryItem.safeParse({ ...list.items[0], amountMinor: null })
      .success
  ).toBe(false);
  expect(
    paymentHistoryItem.safeParse({ ...list.items[0], status: "unknown" })
      .success
  ).toBe(false);
  const totals = list.totals!;
  expect(
    paymentHistoryTotals.safeParse({
      ...totals,
      currencies: [{ ...totals.currencies[0], capturedMinor: 999999 }],
    }).success
  ).toBe(false);
});
