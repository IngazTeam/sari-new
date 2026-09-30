import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db/connection", () => ({ getDb: mocks.db }));
import { readProductCatalog } from "./product-catalog";
import {
  productCatalogInput,
  productInventoryState,
} from "../shared/product-catalog";

let results: any[], transaction: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  results = [
    [{ id: 20, currency: "SAR", integrationSource: "none" }],
    [{ all: 0, out: 0, low: 0, untracked: 0, unknown: 0, priceReview: 0 }],
    [{ total: 0 }],
    [],
  ];
  transaction = vi.fn(async run =>
    run({
      select: () => {
        const query: any = {
          then: (resolve: any, reject: any) =>
            Promise.resolve(results.shift()).then(resolve, reject),
        };
        for (const method of ["from", "where", "orderBy", "limit", "offset"])
          query[method] = () => query;
        return query;
      },
    })
  );
  mocks.db.mockResolvedValue({ transaction });
});
describe("product catalog source", () => {
  it("returns an explicit empty scoped snapshot with all defaults", async () => {
    expect(await readProductCatalog(20)).toMatchObject({
      merchantId: 20,
      items: [],
      total: 0,
      totalPages: 0,
      selection: productCatalogInput.parse(undefined),
      summary: { all: 0, unknown: 0 },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });
  it("fails closed if storage is unavailable", async () => {
    mocks.db.mockResolvedValue(null);
    await expect(readProductCatalog(20)).rejects.toThrow("unavailable");
  });
  it.each([[], [{ id: 30 }]])(
    "rejects missing or mismatched merchant %j",
    async merchant => {
      results[0] = merchant;
      await expect(readProductCatalog(20)).rejects.toThrow();
    }
  );
  it.each([null, undefined, false, "", -1, 1.5, "bad", Number.MAX_SAFE_INTEGER + 1])(
    "rejects malformed totals %j",
    async total => {
      results[2] = [{ total }];
      await expect(readProductCatalog(20)).rejects.toThrow();
    }
  );
  it("rejects rows from another tenant", async () => {
    results[3] = [{ id: 1, merchantId: 30 }];
    await expect(readProductCatalog(20)).rejects.toThrow("scope mismatch");
  });
  it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid scope %s before storage",
    async id => {
      await expect(readProductCatalog(id)).rejects.toThrow();
      expect(mocks.db).not.toHaveBeenCalled();
    }
  );
  it("validates the clock and trims literal search", async () => {
    await expect(readProductCatalog(20, {}, new Date(NaN))).rejects.toThrow();
    expect(mocks.db).not.toHaveBeenCalled();
    expect(productCatalogInput.parse({ search: "  50%_off  " }).search).toBe(
      "50%_off"
    );
  });
  it.each([
    [0, null, 5, "untracked"],
    [1, null, 5, "unknown"],
    [2, 2, 5, "unknown"],
    [1, -1, 5, "unknown"],
    [1, 1.5, 5, "unknown"],
    [1, 0, 5, "out"],
    [1, 5, 5, "low"],
    [1, 6, 5, "available"],
    [1, 1, null, "available"],
  ])(
    "classifies inventory (%s,%s,%s) as %s",
    (trackInventory, stock, lowStockAlert, expected) => {
      expect(
        productInventoryState({
          trackInventory: trackInventory as number,
          stock: stock as number | null,
          lowStockAlert: lowStockAlert as number | null,
        })
      ).toBe(expected);
    }
  );
});
