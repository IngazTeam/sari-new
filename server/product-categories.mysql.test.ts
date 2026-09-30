import { randomUUID } from "node:crypto";
import {
  beforeEach,
  afterEach,
  afterAll,
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
import {
  readProductCategories,
  writeProductCategory,
  readProductCategoryReceipt,
} from "./product-categories";
const fields = {
  name: "قهوة",
  nameEn: "Coffee",
  parentId: null,
  sortOrder: 2,
  isActive: 1,
};
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed category transactions",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const read = () => readProductCategories(owner.merchantId, owner.userId);
    const write = async (
      partial: any,
      expectedDigest?: string,
      requestId = randomUUID()
    ) =>
      writeProductCategory(owner.merchantId, owner.userId, {
        requestId,
        reviewed: true,
        expectedDigest: expectedDigest ?? (await read()).digest,
        ...partial,
      });
    const create = (patch = {}) =>
      write({ kind: "create", fields: { ...fields, ...patch } });
    beforeEach(async () => {
      owner = await createDisposableMerchant("categories122");
      other = await createDisposableMerchant("categories-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("creates, renames and deletes with durable scoped receipts", async () => {
      const a = await create();
      expect((await read()).rows[0]).toMatchObject({
        ...fields,
        id: a.categoryId,
        merchantId: owner.merchantId,
      });
      const b = await write({
        kind: "update",
        id: a.categoryId,
        fields: { name: "Coffee beans" },
      });
      expect(b.digest).not.toBe(a.digest);
      expect(
        await readProductCategoryReceipt(owner.merchantId, owner.userId, {
          requestId: b.requestId,
        })
      ).toEqual(b);
      const c = await write({ kind: "delete", id: a.categoryId });
      expect(c.kind).toBe("delete");
      expect((await read()).rows).toEqual([]);
    });
    it("serializes duplicate requests and rejects UUID reuse with different content", async () => {
      const expectedDigest = (await read()).digest,
        requestId = randomUUID(),
        input = { kind: "create", fields };
      const [a, b] = await Promise.all([
        write(input, expectedDigest, requestId),
        write(input, expectedDigest, requestId),
      ]);
      expect(a).toEqual(b);
      expect((await read()).rows).toHaveLength(1);
      await expect(
        write(
          { ...input, fields: { ...fields, name: "different" } },
          expectedDigest,
          requestId
        )
      ).rejects.toThrow();
    });
    it("rejects competing stale changes and observes legacy writes in the digest", async () => {
      const a = await create(),
        digest = (await read()).digest;
      const results = await Promise.allSettled([
        write(
          { kind: "update", id: a.categoryId, fields: { name: "A" } },
          digest
        ),
        write(
          { kind: "update", id: a.categoryId, fields: { name: "B" } },
          digest
        ),
      ]);
      expect(results.filter(v => v.status === "fulfilled")).toHaveLength(1);
      const now = await read();
      await q("UPDATE product_categories SET name=? WHERE id=?", [
        "Legacy",
        a.categoryId,
      ]);
      await expect(
        write(
          { kind: "update", id: a.categoryId, fields: { name: "C" } },
          now.digest
        )
      ).rejects.toThrow();
    });
    it("isolates reads, receipts and foreign category/parent IDs", async () => {
      const a = await create();
      expect(
        (await readProductCategories(other.merchantId, other.userId)).rows
      ).toEqual([]);
      expect(
        await readProductCategoryReceipt(other.merchantId, other.userId, {
          requestId: a.requestId,
        })
      ).toBeNull();
      await expect(
        readProductCategories(owner.merchantId, other.userId)
      ).rejects.toThrow();
      const foreign = await q(
        "INSERT INTO product_categories (merchant_id,name) VALUES (?,?)",
        [other.merchantId, "Foreign"]
      );
      await expect(
        write({ kind: "update", id: foreign.insertId, fields: { name: "x" } })
      ).rejects.toThrow("category:missing");
      await expect(
        write({
          kind: "update",
          id: a.categoryId,
          fields: { parentId: foreign.insertId },
        })
      ).rejects.toThrow("category:parent_missing");
    });
    it("blocks linked and archived products and leaves category text untouched on rename", async () => {
      const a = await create();
      await q(
        "INSERT INTO products (merchantId,name,price,category_id,category,status,isActive) VALUES (?,?,0,?,?,'archived',0)",
        [owner.merchantId, "Test product", a.categoryId, "Original label"]
      );
      expect((await read()).rows[0].productCount).toBe(1);
      await expect(write({ kind: "delete", id: a.categoryId })).rejects.toThrow(
        "category:in_use"
      );
      await write({
        kind: "update",
        id: a.categoryId,
        fields: { name: "New category" },
      });
      expect(
        (
          await q("SELECT category FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].category
      ).toBe("Original label");
    });
    it("blocks deletion of corrupt foreign references without exposing their count", async () => {
      const a = await create();
      await q(
        "INSERT INTO products (merchantId,name,price,category_id) VALUES (?,?,0,?)",
        [other.merchantId, "Foreign product", a.categoryId]
      );
      expect((await read()).rows[0].productCount).toBe(0);
      await expect(
        write({ kind: "delete", id: a.categoryId })
      ).rejects.toThrow();
      expect((await read()).rows).toHaveLength(1);
    });
    it("checks child deletion, ancestor cycle and active descendants in the same transaction", async () => {
      const a = await create(),
        b = await create({ name: "Child", parentId: a.categoryId });
      await expect(write({ kind: "delete", id: a.categoryId })).rejects.toThrow(
        "category:in_use"
      );
      await expect(
        write({
          kind: "update",
          id: a.categoryId,
          fields: { parentId: b.categoryId },
        })
      ).rejects.toThrow("category:cycle");
      await expect(
        write({ kind: "update", id: a.categoryId, fields: { isActive: 0 } })
      ).rejects.toThrow("category:inactive_parent");
      await write({
        kind: "update",
        id: b.categoryId,
        fields: { isActive: 0 },
      });
      await write({
        kind: "update",
        id: a.categoryId,
        fields: { isActive: 0 },
      });
    });
    it("locks externally managed catalogs and rejects revoked membership and inactive account", async () => {
      const old = (await read()).digest;
      await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
        owner.merchantId,
      ]);
      expect((await read()).locked).toBe(true);
      await expect(write({ kind: "create", fields }, old)).rejects.toThrow();
      await q("UPDATE merchants SET integration_source='none' WHERE id=?", [
        owner.merchantId,
      ]);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      expect((await read()).canManage).toBe(false);
      await expect(create()).rejects.toThrow();
      await q("UPDATE merchant_members SET is_active=0 WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      await expect(read()).rejects.toThrow();
      await q("DELETE FROM merchant_members WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toThrow();
    });
    it("rejects another authorized actor replaying the same receipt", async () => {
      const a = await create();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readProductCategoryReceipt(owner.merchantId, other.userId, {
          requestId: a.requestId,
        })
      ).rejects.toThrow();
    });
    it("rolls back the category when receipt persistence fails", async () => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get(),
          execute = c.execute.bind(c);
        vi.spyOn(c, "execute").mockImplementation((...args: any[]) => {
          if (
            String(args[0]).startsWith("INSERT INTO product_category_receipts")
          )
            return Promise.reject(Error("Injected receipt failure"));
          return (execute as any)(...args);
        });
        return c;
      });
      await expect(create()).rejects.toThrow("Injected receipt failure");
      vi.restoreAllMocks();
      expect((await read()).rows).toEqual([]);
      expect(
        await q(
          "SELECT id FROM product_category_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toEqual([]);
    });
    it("recovers a committed request after commit acknowledgement is lost", async () => {
      const input = { kind: "create", fields },
        digest = (await read()).digest,
        requestId = randomUUID();
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let injected = false;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get(),
          commit = c.commit.bind(c);
        vi.spyOn(c, "commit").mockImplementation(async () => {
          await commit();
          if (!injected) {
            injected = true;
            throw Error("Commit response lost");
          }
        });
        return c;
      });
      await expect(write(input, digest, requestId)).rejects.toThrow(
        "Commit response lost"
      );
      vi.restoreAllMocks();
      const receipt = await readProductCategoryReceipt(
        owner.merchantId,
        owner.userId,
        { requestId }
      );
      expect(receipt).not.toBeNull();
      expect(await write(input, digest, requestId)).toEqual(receipt);
      expect((await read()).rows).toHaveLength(1);
    });
  }
);
