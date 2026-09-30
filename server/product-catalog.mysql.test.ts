import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDb, getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readProductCatalog } from "./product-catalog";
import { productInventoryState } from "../shared/product-catalog";

describe.skipIf(!process.env.DATABASE_URL)("product catalog MySQL", () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
    other: typeof owner;
  const query = async (statement: string, values: unknown[] = []) =>
    (await (await getPool())!.execute<any>(statement, values))[0];
  const insert = async (changes: Record<string, unknown> = {}) => {
    const row = {
      merchantId: owner.merchantId,
      name: "Same name",
      price: 125,
      price_unit: "minor",
      stock: 0,
      createdAt: "2026-09-01 10:00:00",
      ...changes,
    };
    return Number(
      (
        await query(
          `INSERT INTO products (${Object.keys(row)
            .map(key => "`" + key + "`")
            .join(",")}) VALUES (${Object.keys(row)
            .map(() => "?")
            .join(",")})`,
          Object.values(row)
        )
      ).insertId
    );
  };
  const list = (input = {}) => readProductCatalog(owner.merchantId, input);
  beforeEach(async () => {
    owner = await createDisposableMerchant("catalog78");
    other = await createDisposableMerchant("catalog78-other");
  });
  afterEach(async () =>
    cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
  );
  afterAll(closeDb);
  it("keeps duplicate names and zero stock without writes, scopes tenants, and pages ties by ID", async () => {
    const ids = [];
    for (let i = 0; i < 6; i++) ids.push(await insert());
    await insert({ merchantId: other.merchantId, name: "Private" });
    const first = await list({ pageSize: 3 }),
      second = await list({ pageSize: 3, page: 2 });
    expect(first.total).toBe(6);
    expect(first.totalPages).toBe(2);
    expect([...first.items, ...second.items].map(p => p.id)).toEqual(
      ids.reverse()
    );
    expect(
      first.items.every(
        p => p.stock === 0 && p.price === 125 && p.priceUnit === "minor"
      )
    ).toBe(true);
    expect((await list({ page: 50 })).items).toEqual([]);
    expect(
      (
        await query("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
          owner.merchantId,
        ])
      )[0].n
    ).toBe(6);
  });
  it("searches literal %, _, backslashes, SKU, barcode and Arabic names without SQL injection", async () => {
    await insert({
      name: "50%_off\\",
      sku: "AB123",
      barcode: "XYZ123",
      nameAr: "منتج محلي",
      category: "تصنيف الاختبار",
    });
    await insert({ name: "50percentZoff" });
    for (const search of ["%_", "\\", "AB123", "XYZ123", "محلي", "تصنيف"])
      expect((await list({ search })).total).toBe(1);
    expect((await list({ search: "' OR 1=1 --" })).total).toBe(0);
  });
  it("keeps current store catalog visibility for both platforms without returning orphan imports", async () => {
    await insert();
    await insert({ sallaProductId: "zid:123:1" });
    await insert({ sallaProductId: "salla:123:1" });
    await insert({ sallaProductId: "123456" });
    const result = await list();
    expect(result.total).toBe(1);
    expect(result.summary.all).toBe(1);
  });
  it("distinguishes unknown, low, zero and untracked stock and preserves unverified prices", async () => {
    await insert();
    await insert({ stock: 2, low_stock_alert: 2 });
    await insert({ stock: null });
    await insert({ stock: -1 });
    await insert({ track_inventory: 2, stock: 20 });
    await insert({ track_inventory: 0, stock: null });
    await insert({
      stock: 30,
      price_unit: "unverified",
      price: 999,
      status: "draft",
    });
    await insert({ stock: 30, price: -25, status: "archived" });
    const result = await list();
    expect(result.summary).toEqual({
      all: 8,
      out: 1,
      low: 1,
      unknown: 3,
      untracked: 1,
      priceReview: 2,
    });
    for (const inventory of ["out", "low", "unknown", "untracked"] as const) {
      const selected = await list({ inventory });
      expect(selected.total).toBe(result.summary[inventory]);
      expect(
        selected.items.every(row => productInventoryState(row) === inventory)
      ).toBe(true);
    }
    expect((await list({ price: "review" })).total).toBe(2);
    expect((await list({ price: "verified" })).total).toBe(6);
    expect(
      (await list({ status: "draft", price: "review" })).items[0].price
    ).toBe(999);
  });
  it("returns stored integration identity without treating a failed read as editable", async () => {
    await query(
      "UPDATE merchants SET integration_source='byaan',currency='USD' WHERE id=?",
      [owner.merchantId]
    );
    expect(await list()).toMatchObject({
      integrationSource: "byaan",
      currency: "USD",
    });
    await expect(readProductCatalog(2147483647)).rejects.toThrow("unavailable");
  });
  it("keeps summary and page in one snapshot while another transaction inserts a row", async () => {
    await insert();
    const database = (await getDb())!,
      original = database.transaction.bind(database);
    let reads = 0;
    const spy = vi.spyOn(database, "transaction").mockImplementation(((
      run: any,
      options: any
    ) =>
      original(
        async tx =>
          run(
            new Proxy(tx, {
              get(target, key, receiver) {
                if (key === "select")
                  return (...args: any[]) => {
                    const builder: any = (target.select as any)(...args);
                    const originalFrom = builder.from.bind(builder);
                    builder.from = (...fromArgs: any[]) => {
                      const statement = originalFrom(...fromArgs),
                        originalThen = statement.then.bind(statement);
                      statement.then = (resolve: any, reject: any) =>
                        originalThen(async (result: any) => {
                          if (++reads === 2)
                            await insert({ name: "Concurrent" });
                          return result;
                        }).then(resolve, reject);
                      return statement;
                    };
                    return builder;
                  };
                return Reflect.get(target, key, receiver);
              },
            })
          ),
        options
      )) as typeof database.transaction);
    try {
      const result = await list();
      expect(result.summary.all).toBe(1);
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    expect((await list()).total).toBe(2);
  });
});
