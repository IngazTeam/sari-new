import { randomUUID } from "node:crypto";
import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock("./db/connection", () => ({
  getPool: async () => ({
    getConnection: async () => ({
      execute: m.execute,
      query: m.query,
      beginTransaction: m.begin,
      commit: m.commit,
      rollback: m.rollback,
      release: m.release,
      destroy: m.destroy,
    }),
  }),
}));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: vi.fn() }));
import { reviewOrderStatus, writeOrderStatus } from "./order-status-review";
const intent = { id: 3, status: "processing", notify: true };
beforeEach(() => {
  vi.resetAllMocks();
  m.execute.mockImplementation(async (q: string) => {
    if (q.startsWith("SELECT id,userId"))
      return [[{ id: 20, userId: 7, status: "active", businessName: "Local" }]];
    if (q.startsWith("SELECT account_status"))
      return [[{ account_status: "active" }]];
    if (q.startsWith("SELECT id,merchantId"))
      return [
        [
          {
            id: 3,
            merchantId: 20,
            orderNumber: "ORDER",
            customerName: "Local",
            customerPhone: "+12025550161",
            status: "pending",
            payment_status: "unpaid",
            currency: "USD",
            totalAmount: 3453,
            sallaOrderId: null,
            trackingNumber: null,
            checkout_review_required: 0,
            checkout_discount_released: 0,
          },
        ],
      ];
    if (q.startsWith("SELECT template"))
      return [[{ enabled: 1, template: "{{total}} {{currency}}" }]];
    if (q.startsWith("SELECT DATE_FORMAT"))
      return [[{ now: "2026-09-30T00:00:00.000000Z" }]];
    if (q.startsWith("UPDATE")) return [{ affectedRows: 1 }];
    return [[]];
  });
});
async function prepared() {
  const r = await reviewOrderStatus(20, 7, intent);
  m.commit.mockClear();
  m.rollback.mockClear();
  m.release.mockClear();
  return {
    requestId: randomUUID(),
    intent,
    expectedDigest: r.digest,
    reviewed: true,
  };
}
describe("atomic order status, notification and receipt", () => {
  it.each([
    "INSERT INTO order_notifications",
    "INSERT INTO order_status_receipts",
  ])("rolls back everything when %s fails", async prefix => {
    const input = await prepared(),
      impl = m.execute.getMockImplementation()!;
    m.execute.mockImplementation(async (q, ...args) => {
      if (q.startsWith(prefix)) throw Error("Storage failed");
      return impl(q, ...args);
    });
    await expect(writeOrderStatus(20, 7, input)).rejects.toThrow(
      "Storage failed"
    );
    expect(m.commit).not.toHaveBeenCalled();
    expect(m.rollback).toHaveBeenCalledTimes(1);
    expect(m.release).toHaveBeenCalledTimes(1);
  });
  it("destroys an uncertain commit connection and never reports a receipt as confirmed", async () => {
    const input = await prepared();
    m.commit.mockRejectedValue(Error("Commit response lost"));
    await expect(writeOrderStatus(20, 7, input)).rejects.toThrow(
      "Commit response lost"
    );
    expect(m.destroy).toHaveBeenCalledTimes(1);
    expect(m.release).not.toHaveBeenCalled();
    expect(m.rollback).not.toHaveBeenCalled();
  });
});
