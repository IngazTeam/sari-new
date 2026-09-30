import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: m.db }));
import {
  exportCustomerWorkspace,
  CustomerExportLimit,
} from "./customer-workspace";
const now = new Date("2026-09-30T12:00:00Z");
let results: any[], calls: number;
const row = {
  customerKey: "966500000075",
  name: "=SUM(1,2)",
  firstRecordedAt: "2026-09-01 00:00:00",
  lastInteractionAt: "2026-09-30 10:00:00",
  activity: "active",
  conversationCount: 1,
  orderCount: 2,
  profileCount: 0,
  zidCount: 0,
  loyaltyCount: 2,
};
beforeEach(() => {
  calls = 0;
  results = [
    [{ id: 20 }],
    [{ total: 1 }],
    [row],
    [
      {
        customerKey: row.customerKey,
        currency: "SAR",
        totalMinor: 125,
        excludedAmounts: 1,
      },
      {
        customerKey: row.customerKey,
        currency: "USD",
        totalMinor: 250,
        excludedAmounts: 0,
      },
    ],
    [{ customerKey: row.customerKey, records: 2, points: 999 }],
  ];
  m.db.mockResolvedValue({
    transaction: async (run: any) =>
      run({
        execute: async () => {
          calls++;
          return [results.shift(), []];
        },
      }),
  });
});
describe("customer CSV snapshot", () => {
  it("uses separate currency columns, protects formula text and preserves identifiers", async () => {
    const result = await exportCustomerWorkspace(20, { language: "en" }, now);
    expect(result.count).toBe(1);
    expect(result.data.startsWith("\uFEFF")).toBe(true);
    expect(result.data).toContain('"\'=SUM(1,2)"');
    expect(result.data).toContain('"\'966500000075"');
    expect(result.data).toContain('"1.25","2.50","1","2",""');
    expect(result.filename).toContain("20");
  });
  it("rejects an oversized export before loading customer rows", async () => {
    results = [[{ id: 20 }], [{ total: 5001 }]];
    await expect(exportCustomerWorkspace(20, {}, now)).rejects.toBeInstanceOf(
      CustomerExportLimit
    );
    expect(calls).toBe(2);
  });
  it("does not export a count that disagrees with the snapshot", async () => {
    results[1] = [{ total: 2 }];
    await expect(exportCustomerWorkspace(20, {}, now)).rejects.toThrow(
      "snapshot mismatch"
    );
  });
  it("rejects unknown currency and invalid aggregates", async () => {
    results[3][0].currency = "EUR";
    await expect(exportCustomerWorkspace(20, {}, now)).rejects.toThrow(
      "currency"
    );
  });
  it("writes headers for a genuinely empty snapshot", async () => {
    results = [[{ id: 20 }], [{ total: 0 }], [], [], []];
    const result = await exportCustomerWorkspace(20, {}, now);
    expect(result.count).toBe(0);
    expect(result.data.split("\r\n")).toHaveLength(1);
  });
});
