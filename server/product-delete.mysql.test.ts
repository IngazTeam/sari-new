import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  reviewProductDeletion,
  deleteReviewedProducts,
  readProductDeletionReceipt,
} from "./product-delete";
import {
  ProductEditorConflict,
  ProductEditorMissing,
  ProductEditorForbidden,
  ProductEditorLocked,
} from "./product-editor";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed product deletion MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (statement: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(statement, values))[0];
    const product = async (merchantId = owner.merchantId) =>
      Number(
        (
          await q(
            "INSERT INTO products (merchantId,name,price,price_unit) VALUES (?,'Review product',125,'minor')",
            [merchantId]
          )
        ).insertId
      );
    const review = (ids: number[]) =>
      reviewProductDeletion(owner.merchantId, owner.userId, { ids });
    const remove = (
      ids: number[],
      expectedDigest: string,
      requestId = randomUUID()
    ) =>
      deleteReviewedProducts(owner.merchantId, owner.userId, {
        ids,
        expectedDigest,
        requestId,
        reviewed: true,
      });
    beforeEach(async () => {
      owner = await createDisposableMerchant("delete80");
      other = await createDisposableMerchant("delete80-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("reviews options and variants, deletes a reviewed group atomically, and recovers the same receipt", async () => {
      const ids = [await product(), await product()];
      await q(
        "INSERT INTO product_variants (merchant_id,product_id,name) VALUES (?,?,'Variant')",
        [owner.merchantId, ids[0]]
      );
      await q(
        "INSERT INTO product_options (merchant_id,product_id,name,`values`) VALUES (?,?,'Color','[\"Red\"]')",
        [owner.merchantId, ids[0]]
      );
      const preview = await review(ids);
      expect(preview.canDelete).toBe(true);
      expect(preview.items[0]).toMatchObject({ variants: 1, options: 1 });
      const requestId = randomUUID(),
        saved = await remove(ids, preview.digest, requestId);
      expect(saved.ids).toEqual(ids);
      expect(
        await remove([...ids].reverse(), preview.digest, requestId)
      ).toEqual(saved);
      expect(
        await readProductDeletionReceipt(owner.merchantId, owner.userId, {
          requestId,
        })
      ).toEqual(saved);
      expect(
        (
          await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].n
      ).toBe(0);
      expect(
        (
          await q(
            "SELECT COUNT(*) AS n FROM product_variants WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ).toBe(0);
      expect(
        (
          await q(
            "SELECT COUNT(*) AS n FROM product_options WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ).toBe(0);
    });
    it("rejects a changed product or variant after review without deleting any selected item", async () => {
      const ids = [await product(), await product()];
      let preview = await review(ids);
      await q("UPDATE products SET name='New name' WHERE id=?", [ids[1]]);
      await expect(remove(ids, preview.digest)).rejects.toBeInstanceOf(
        ProductEditorConflict
      );
      await q(
        "INSERT INTO product_variants (merchant_id,product_id,name) VALUES (?,?,'Variant')",
        [owner.merchantId, ids[0]]
      );
      preview = await review(ids);
      await q(
        "UPDATE product_variants SET name='Changed variant' WHERE product_id=?",
        [ids[0]]
      );
      await expect(remove(ids, preview.digest)).rejects.toBeInstanceOf(
        ProductEditorConflict
      );
      expect(
        (
          await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].n
      ).toBe(2);
    });
    it("serializes concurrent retries into one confirmed deletion", async () => {
      const ids = [await product()],
        preview = await review(ids),
        requestId = randomUUID();
      const results = await Promise.all([
        remove(ids, preview.digest, requestId),
        remove(ids, preview.digest, requestId),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(
        (
          await q(
            "SELECT COUNT(*) AS n FROM product_editor_receipts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ).toBe(1);
    });
    it("blocks loyalty links, product promotions and unreadable promotion selections", async () => {
      const id = await product();
      await q(
        "INSERT INTO loyalty_rewards (merchant_id,title,title_ar,type,points_cost,product_id) VALUES (?,'Reward','مكافأة','free_product',10,?)",
        [owner.merchantId, id]
      );
      let preview = await review([id]);
      expect(preview.items[0].references.rewards).toBe(1);
      await expect(remove([id], preview.digest)).rejects.toBeInstanceOf(
        ProductEditorLocked
      );
      await q("DELETE FROM loyalty_rewards WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      await q(
        "INSERT INTO promotions (merchant_id,title,type,scope,product_ids) VALUES (?,'Offer','custom','products',?)",
        [owner.merchantId, JSON.stringify([id, String(id)])]
      );
      preview = await review([id]);
      expect(preview.items[0].references.promotions).toBe(1);
      expect(preview.canDelete).toBe(false);
      await q(
        "UPDATE promotions SET product_ids='bad json' WHERE merchant_id=?",
        [owner.merchantId]
      );
      preview = await review([id]);
      expect(preview.items[0].references.unreadablePromotions).toBe(1);
      expect(preview.canDelete).toBe(false);
    });
    it("blocks cross-tenant child rows and external identity even if the global source is local", async () => {
      const id = await product();
      await q(
        "INSERT INTO product_variants (merchant_id,product_id,name) VALUES (?,?,'Foreign child')",
        [other.merchantId, id]
      );
      let preview = await review([id]);
      expect(preview.items[0].references.foreignDetails).toBe(1);
      await expect(remove([id], preview.digest)).rejects.toBeInstanceOf(
        ProductEditorLocked
      );
      await q("DELETE FROM product_variants WHERE product_id=?", [id]);
      await q(
        "UPDATE products SET sallaProductId='external-course' WHERE id=?",
        [id]
      );
      preview = await review([id]);
      expect(preview.items[0].locked).toBe(true);
      await expect(remove([id], preview.digest)).rejects.toBeInstanceOf(
        ProductEditorLocked
      );
    });
    it("rejects a missing or foreign target instead of silently partially deleting a group", async () => {
      const id = await product(),
        foreign = await product(other.merchantId),
        preview = await review([id]);
      await expect(review([id, foreign])).rejects.toBeInstanceOf(
        ProductEditorMissing
      );
      await expect(
        remove([id, foreign], preview.digest)
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        remove([id, 2147483647], preview.digest)
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      expect(
        (
          await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].n
      ).toBe(1);
    });
    it("rechecks current role before deletion and does not expose another actor's receipt", async () => {
      const id = await product(),
        preview = await review([id]);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      expect((await review([id])).canDelete).toBe(false);
      await expect(remove([id], preview.digest)).rejects.toBeInstanceOf(
        ProductEditorForbidden
      );
      await q(
        "UPDATE merchant_members SET role='manager' WHERE merchant_id=?",
        [owner.merchantId]
      );
      const saved = await remove([id], preview.digest);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readProductDeletionReceipt(owner.merchantId, other.userId, {
          requestId: saved.requestId,
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("rolls back the entire group if a later delete fails", async () => {
      const ids = [await product(), await product()],
        preview = await review(ids);
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let writes = 0;
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, prop) {
              if (prop === "execute")
                return async (statement: string, values: any[]) => {
                  if (
                    statement.startsWith("DELETE FROM products") &&
                    ++writes === 2
                  )
                    throw Error("delete failed");
                  return target.execute(statement, values);
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      try {
        await expect(remove(ids, preview.digest)).rejects.toThrow(
          "delete failed"
        );
      } finally {
        spy.mockRestore();
      }
      expect(
        (
          await q("SELECT COUNT(*) AS n FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].n
      ).toBe(2);
      expect(
        (
          await q(
            "SELECT COUNT(*) AS n FROM product_editor_receipts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ).toBe(0);
    });
    it("recovers a committed deletion after acknowledgement loss without repeating it", async () => {
      const ids = [await product()],
        preview = await review(ids),
        requestId = randomUUID();
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, prop) {
              if (prop === "commit")
                return async () => {
                  await target.commit();
                  throw Error("ack lost");
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      try {
        await expect(remove(ids, preview.digest, requestId)).rejects.toThrow(
          "ack lost"
        );
      } finally {
        spy.mockRestore();
      }
      const receipt = await readProductDeletionReceipt(
        owner.merchantId,
        owner.userId,
        { requestId }
      );
      expect(receipt?.ids).toEqual(ids);
      expect(await remove(ids, preview.digest, requestId)).toEqual(receipt);
    });
  }
);
