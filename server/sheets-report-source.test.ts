import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  collectSheetReportData,
  projectSheetReportOrders,
} from "./sheets-report-source";
import {
  sheetReportPeriod,
  sheetOrderValuesText,
} from "../shared/sheets-report-data";
const record = (patch: any = {}) => ({
    totalAmount: 1000,
    currency: "SAR",
    status: "paid",
    payment_status: "paid",
    items: JSON.stringify([{ name: "Synthetic", quantity: 2 }]),
    ...patch,
  }),
  start = new Date("2026-10-01T00:00:00Z"),
  end = new Date("2026-10-02T00:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ getConnection: async () => m });
  m.execute.mockImplementation(async sql =>
    sql.includes("AS records")
      ? [[{ records: 1, bytes: 100 }]]
      : sql.startsWith("SELECT totalAmount")
        ? [[record()]]
        : sql.includes("FROM customer_profiles")
          ? [[{ total: 3 }]]
          : sql.includes("FROM messages")
            ? [[{ total: 4 }]]
            : [[{ total: 2 }]]
  );
});
it("reads a single bounded consistent snapshot and distinguishes customer profiles from conversations", async () => {
  const data = await collectSheetReportData(7, start, end);
  expect(data).toMatchObject({
    merchantId: 7,
    totalOrders: 1,
    totalConversations: 2,
    totalMessages: 4,
    newCustomers: 3,
    timeZone: "UTC",
    orderValues: [
      { currency: "SAR", totalMinor: 1000, markedPaidMinor: 1000, count: 1 },
    ],
  });
  expect(sheetOrderValuesText(data)).toContain("10.00 SAR");
  expect(m.execute.mock.calls.every(c => c[1][0] === 7)).toBe(true);
  expect(m.query).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
  expect(m.commit).toHaveBeenCalledOnce();
});
it("separates currencies, excludes cancellations and uses payment status independently from order status", () => {
  const data = projectSheetReportOrders([
    record(),
    record({ currency: "USD", totalAmount: 2000, payment_status: "unpaid" }),
    record({ status: "cancelled", totalAmount: 9000 }),
    record({ payment_status: "refunded", totalAmount: 3000 }),
  ]);
  expect(data.orderValues).toEqual([
    { currency: "SAR", count: 2, totalMinor: 4000, markedPaidMinor: 1000 },
    { currency: "USD", count: 1, totalMinor: 2000, markedPaidMinor: 0 },
  ]);
  expect(data.totalOrders).toBe(4);
  expect(data.topProducts).toEqual([{ name: "Synthetic", count: 6 }]);
});
it.each([-1, NaN, null, "invalid", 1.5])(
  "records excluded monetary input %s rather than inventing a price",
  amount => {
    expect(
      projectSheetReportOrders([record({ totalAmount: amount })])
    ).toMatchObject({ orderValues: [], excludedAmounts: 1 });
  }
);
it("does not silently assign unknown currency to SAR", () => {
  expect(projectSheetReportOrders([record({ currency: "XYZ" })])).toMatchObject(
    { orderValues: [], excludedAmounts: 1 }
  );
});
it.each([
  "bad",
  "{}",
  "[null]",
  '[{"name":"X"}]',
  '[{"name":"X","quantity":0}]',
  '[{"name":"X","quantity":1.5}]',
])("reports malformed order items without guessed quantity: %s", items => {
  expect(projectSheetReportOrders([record({ items })])).toMatchObject({
    topProducts: [],
    excludedItemOrders: 1,
  });
});
it("safely handles product names resembling prototype keys", () => {
  expect(
    projectSheetReportOrders([
      record({
        items: JSON.stringify([
          { name: "__proto__", quantity: 2 },
          { name: "constructor", quantity: 1 },
        ]),
      }),
    ]).topProducts
  ).toEqual([
    { name: "__proto__", count: 2 },
    { name: "constructor", count: 1 },
  ]);
});
it.each([
  { records: 5001, bytes: 1 },
  { records: 1, bytes: 2097153 },
  { records: "bad", bytes: 0 },
])("refuses oversized or unavailable sources %j", async size => {
  m.execute.mockResolvedValue([[size]]);
  await expect(collectSheetReportData(7, start, end)).rejects.toThrow();
  expect(m.execute).toHaveBeenCalledOnce();
  expect(m.commit).not.toHaveBeenCalled();
});
it("propagates database failure instead of writing a successful zero report", async () => {
  m.execute.mockRejectedValue(Error("PRIVATE"));
  await expect(collectSheetReportData(7, start, end)).rejects.toThrow();
  expect(m.rollback).toHaveBeenCalledOnce();
  expect(m.commit).not.toHaveBeenCalled();
});
it("destroys a connection whose read transaction commit could not be confirmed", async () => {
  m.commit.mockRejectedValue(Error());
  await expect(collectSheetReportData(7, start, end)).rejects.toThrow();
  expect(m.destroy).toHaveBeenCalledOnce();
  expect(m.release).not.toHaveBeenCalled();
});
it("defines today in UTC and uses exact 7/30-day windows at month boundaries", () => {
  const now = new Date("2026-03-31T23:00:00Z");
  expect(sheetReportPeriod("daily", now).start.toISOString()).toBe(
    "2026-03-31T00:00:00.000Z"
  );
  expect(sheetReportPeriod("weekly", now).start.toISOString()).toBe(
    "2026-03-24T23:00:00.000Z"
  );
  expect(sheetReportPeriod("monthly", now).start.toISOString()).toBe(
    "2026-03-01T23:00:00.000Z"
  );
});
it.each([0, -1, 1.5])("rejects invalid tenant %s before storage", async id => {
  await expect(collectSheetReportData(id, start, end)).rejects.toThrow();
  expect(m.pool).not.toHaveBeenCalled();
});
