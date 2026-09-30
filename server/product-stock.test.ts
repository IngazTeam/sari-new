import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn(), access: vi.fn(), read: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { readProductStock } from "./product-stock";
import {
  productStockInput,
  productStockRow,
  productStockSnapshot,
} from "../shared/product-stock";
beforeEach(() => {
  vi.resetAllMocks();
});
describe("stock read validation and failure", () => {
  it.each([
    { page: 0 },
    { page: 1.5 },
    { pageSize: 101 },
    { merchantId: 3 },
    { kind: "all OR 1=1" },
    { state: "available" },
    { search: "a".repeat(201) },
  ])("rejects invalid input %j before storage", async input => {
    await expect(readProductStock(1, input)).rejects.toThrow();
    expect(m.pool).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 2147483648, NaN])(
    "rejects invalid tenant %s",
    async id => {
      await expect(readProductStock(id)).rejects.toThrow();
      expect(m.pool).not.toHaveBeenCalled();
    }
  );
  it("does not replace failed storage with empty stock", async () => {
    m.pool.mockResolvedValue(null);
    await expect(readProductStock(1)).rejects.toThrow("unavailable");
  });
  it("rolls back a failed read and releases the connection", async () => {
    const c = {
      query: vi.fn(),
      beginTransaction: vi.fn(),
      execute: vi.fn().mockRejectedValue(Error("db failure")),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    m.pool.mockResolvedValue({ getConnection: async () => c });
    await expect(readProductStock(1)).rejects.toThrow("db failure");
    expect(c.commit).not.toHaveBeenCalled();
    expect(c.rollback).toHaveBeenCalledOnce();
    expect(c.release).toHaveBeenCalledOnce();
  });
  it.each([{ variantId: 2 }, { state: "low" }, { merchantId: 2 }])(
    "rejects inconsistent snapshot %j",
    patch => {
      const row = {
        merchantId: 1,
        productId: 1,
        variantId: null,
        kind: "product",
        productName: "Item",
        name: "Item",
        sku: null,
        stock: 0,
        threshold: 5,
        state: "out",
        issue: null,
        ...patch,
      };
      expect(
        productStockSnapshot.safeParse({
          merchantId: 1,
          readAt: new Date().toISOString(),
          selection: productStockInput.parse({}),
          items: [row],
          total: 1,
          totalPages: 1,
          summary: { total: 1, out: 1, low: 0, unknown: 0 },
        }).success
      ).toBe(false);
    }
  );
});
