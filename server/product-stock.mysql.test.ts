import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readProductStock } from "./product-stock";
describe.skipIf(!process.env.DATABASE_URL)(
  "product and variant stock snapshot",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const query = async (sql: string, values: unknown[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const insert = async (patch: Record<string, unknown> = {}) => {
      const row = {
        merchantId: owner.merchantId,
        name: "Product",
        price: 100,
        price_unit: "minor",
        status: "active",
        isActive: 1,
        product_type: "physical",
        track_inventory: 1,
        stock: 0,
        has_variants: 0,
        low_stock_alert: 5,
        ...patch,
      };
      return Number(
        (
          await query(
            `INSERT INTO products (${Object.keys(row)
              .map(k => "`" + k + "`")
              .join(",")}) VALUES (${Object.keys(row)
              .map(() => "?")
              .join(",")})`,
            Object.values(row)
          )
        ).insertId
      );
    };
    const variant = async (
      productId: number,
      patch: Record<string, unknown> = {}
    ) => {
      const row = {
        merchant_id: owner.merchantId,
        product_id: productId,
        name: "Variant",
        stock: 0,
        is_active: 1,
        ...patch,
      };
      return Number(
        (
          await query(
            `INSERT INTO product_variants (${Object.keys(row)
              .map(k => "`" + k + "`")
              .join(",")}) VALUES (${Object.keys(row)
              .map(() => "?")
              .join(",")})`,
            Object.values(row)
          )
        ).insertId
      );
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("stock134");
      other = await createDisposableMerchant("stock134-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    const read = (input = {}) => readProductStock(owner.merchantId, input);
    it("distinguishes out, low, unknown and healthy stock, using the parent threshold for variants", async () => {
      await insert();
      await insert({ stock: 2, low_stock_alert: 2 });
      await insert({ stock: null });
      await insert({ stock: -1 });
      await insert({ stock: 8 });
      const p = await insert({
        has_variants: 1,
        stock: 0,
        low_stock_alert: 10,
      });
      await variant(p, { stock: 7 });
      await variant(p, { stock: 0 });
      await variant(p, { stock: null });
      await variant(p, { stock: 11 });
      const result = await read();
      expect(result.summary).toEqual({ total: 7, out: 2, low: 2, unknown: 3 });
      expect(result.items.filter(r => r.productId === p)).toHaveLength(3);
      expect(result.items.find(r => r.stock === 7)).toMatchObject({
        kind: "variant",
        state: "low",
        threshold: 10,
      });
      expect((await read({ state: "low" })).total).toBe(2);
      expect((await read({ kind: "variant" })).total).toBe(3);
    });
    it("scopes both sides of the parent-child join and never exposes a foreign variant name", async () => {
      await insert({ merchantId: other.merchantId, name: "Other product" });
      const own = await insert({ has_variants: 1 });
      const foreign = await insert({
        merchantId: other.merchantId,
        has_variants: 1,
      });
      await variant(own, {
        merchant_id: other.merchantId,
        name: "Private child",
      });
      await variant(foreign, { name: "Wrong parent" });
      const result = await read();
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        kind: "product",
        productId: own,
        stock: null,
        state: "unknown",
        issue: "no_available_variants",
      });
      expect(JSON.stringify(result)).not.toContain("Private");
      expect(JSON.stringify(result)).not.toContain("Wrong parent");
    });
    it("excludes inactive, draft, untracked, digital/service and hidden-provider parents and their children", async () => {
      for (const patch of [
        { isActive: 0 },
        { status: "draft" },
        { status: "archived" },
        { track_inventory: 0 },
        { product_type: "digital" },
        { product_type: "service" },
        { sallaProductId: "salla:123:1" },
        { sallaProductId: "zid:123:1" },
        { sallaProductId: "123456" },
      ]) {
        const p = await insert({ ...patch, has_variants: 1 });
        await variant(p);
        await insert(
          "sallaProductId" in patch
            ? { ...patch, sallaProductId: patch.sallaProductId + "9" }
            : patch
        );
      }
      const live = await insert({ has_variants: 1 });
      await variant(live, { is_active: 0, name: "Disabled" });
      const result = await read();
      expect(result.total).toBe(1);
      expect(result.items[0].issue).toBe("no_available_variants");
      expect(JSON.stringify(result)).not.toContain("Disabled");
    });
    it("treats missing variants and invalid flags as unresolved instead of falling back to parent stock", async () => {
      await insert({ has_variants: 1, stock: 100 });
      await insert({ has_variants: 2, stock: 100 });
      const result = await read();
      expect(result.summary).toEqual({ total: 2, out: 0, low: 0, unknown: 2 });
      expect(result.items.map(r => r.issue).sort()).toEqual([
        "invalid_variant_setup",
        "no_available_variants",
      ]);
    });
    it("uses deterministic pages and literal search without changing global counters", async () => {
      const ids = [];
      for (let i = 0; i < 6; i++) ids.push(await insert({ name: `Same ${i}` }));
      await insert({ name: "50%_off\\", sku: "CODE_123" });
      const first = await read({ pageSize: 3 }),
        second = await read({ pageSize: 3, page: 2 });
      expect([...first.items, ...second.items].map(r => r.productId)).toEqual(
        ids
      );
      for (const search of ["%_", "\\", "CODE_123"])
        expect(await read({ search })).toMatchObject({
          total: 1,
          summary: { total: 7 },
        });
      expect((await read({ search: "' OR 1=1 --" })).total).toBe(0);
      expect((await read({ page: 20 })).items).toEqual([]);
    });
    it("does not interpret zero or absent alert thresholds as the old global five", async () => {
      for (const threshold of [null, -1, 0]) {
        await insert({ low_stock_alert: threshold, stock: 2 });
        const p = await insert({ has_variants: 1, low_stock_alert: threshold });
        await variant(p, { stock: 2 });
      }
      await insert({ stock: 0, low_stock_alert: 0 });
      expect(await read()).toMatchObject({
        total: 1,
        summary: { out: 1, low: 0 },
      });
    });
    it("keeps counters and rows in a repeatable read snapshot under concurrent insertion", async () => {
      await insert();
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let injected = false;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original();
        const execute = c.execute.bind(c);
        c.execute = (async (...args: any[]) => {
          const result = await (execute as any)(...args);
          if (!injected && String(args[0]).includes("AS outCount")) {
            injected = true;
            await insert({ name: "Concurrent" });
          }
          return result;
        }) as any;
        const release = c.release.bind(c);
        c.release = () => {
          c.execute = execute as any;
          c.release = release;
          release();
        };
        return c;
      });
      const first = await read();
      expect(first.total).toBe(1);
      expect(first.items).toHaveLength(1);
      expect(first.summary.total).toBe(1);
      expect((await read()).total).toBe(2);
    });
    it("rejects a nonexistent merchant instead of returning an empty successful catalog", async () => {
      await expect(readProductStock(2147483647)).rejects.toThrow("unavailable");
    });
  }
);
