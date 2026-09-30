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
  prepareProductImport,
  readProductImport,
  commitProductImport,
  readProductImportReceipt,
  discardProductImport,
  ProductImportExpired,
  ProductImportLimit,
} from "./product-import";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
  ProductEditorInvalid,
} from "./product-editor";
import {
  productImportReviewSchema,
  productImportReceiptSchema,
} from "../shared/product-import";

describe.skipIf(!process.env.DATABASE_URL)(
  "product import transactions on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (statement: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(statement, values))[0];
    const file = (
      csvData = "name,price,sku,stock,status\nFirst,12.34,SKU-1,,draft\nSecond,0,SKU-2,0,active"
    ) => ({
      format: "csv",
      fileName: "products.csv",
      currency: "SAR",
      csvData,
    });
    const prepare = (csvData?: string, reviewId = randomUUID()) =>
      prepareProductImport(owner.merchantId, owner.userId, {
        reviewId,
        file: file(csvData),
      });
    const commit = (review: any, requestId = randomUUID()) =>
      commitProductImport(owner.merchantId, owner.userId, {
        reviewId: review.reviewId,
        expectedDigest: review.preview.digest,
        reviewed: true,
        requestId,
      });
    const counts = async () => ({
      products: Number(
        (
          await q("SELECT COUNT(*) n FROM products WHERE merchantId=?", [
            owner.merchantId,
          ])
        )[0].n
      ),
      receipts: Number(
        (
          await q(
            "SELECT COUNT(*) n FROM product_editor_receipts WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ),
    });
    beforeEach(async () => {
      owner = await createDisposableMerchant("import85");
      other = await createDisposableMerchant("import85-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("persists a scoped preview without creating products, then commits exact fields and one durable receipt", async () => {
      const review = await prepare();
      expect(productImportReviewSchema.safeParse(review).success).toBe(true);
      expect(review.canCommit).toBe(true);
      expect(review.preview.valid).toBe(2);
      expect(await counts()).toEqual({ products: 0, receipts: 0 });
      const receipt = await commit(review);
      expect(productImportReceiptSchema.safeParse(receipt).success).toBe(true);
      expect(receipt.count).toBe(2);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      const rows = await q(
        "SELECT name,price,price_unit AS priceUnit,currency,stock,status,isActive FROM products WHERE merchantId=? ORDER BY id",
        [owner.merchantId]
      );
      expect(rows).toEqual([
        expect.objectContaining({
          name: "First",
          price: 1234,
          priceUnit: "minor",
          currency: "SAR",
          stock: null,
          status: "draft",
          isActive: 0,
        }),
        expect.objectContaining({
          name: "Second",
          price: 0,
          stock: 0,
          status: "active",
          isActive: 1,
        }),
      ]);
      expect(
        await readProductImportReceipt(owner.merchantId, owner.userId, {
          requestId: receipt.requestId,
        })
      ).toEqual(receipt);
      const read = await readProductImport(owner.merchantId, owner.userId, {
        reviewId: review.reviewId,
      });
      expect(read.receipt).toEqual(receipt);
      expect(read.canCommit).toBe(false);
    });
    it("paginates the immutable review and separately filters invalid rows", async () => {
      const review = await prepare(
        "name,price\n" +
          Array.from(
            { length: 25 },
            (_, i) => `Row ${i},${i === 21 ? "" : i}`
          ).join("\n")
      );
      expect(review.preview.rows).toHaveLength(20);
      expect(review.preview.totalPages).toBe(2);
      expect(review.preview.invalid).toBe(1);
      expect(review.canCommit).toBe(false);
      const page = await readProductImport(owner.merchantId, owner.userId, {
        reviewId: review.reviewId,
        page: 2,
      });
      expect(page.preview.rows).toHaveLength(5);
      expect(page.preview.rows[0].number).toBe(22);
      const errors = await readProductImport(owner.merchantId, owner.userId, {
        reviewId: review.reviewId,
        filter: "errors",
      });
      expect(errors.preview.filteredTotal).toBe(1);
      expect(errors.preview.rows[0].issues[0].code).toBe("missing_price");
      await expect(commit(review)).rejects.toBeInstanceOf(ProductEditorInvalid);
      expect(await counts()).toEqual({ products: 0, receipts: 0 });
    });
    it("replays prepare without consuming a second slot and rejects changed contents under the same id", async () => {
      const reviewId = randomUUID(),
        results = await Promise.all([
          prepare(undefined, reviewId),
          prepare(undefined, reviewId),
        ]);
      expect(results[0]).toEqual(results[1]);
      expect(
        Number(
          (
            await q(
              "SELECT COUNT(*) n FROM product_import_reviews WHERE merchant_id=?",
              [owner.merchantId]
            )
          )[0].n
        )
      ).toBe(1);
      await expect(
        prepare("name,price\nChanged,1", reviewId)
      ).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("serializes concurrent commits and rejects a second request for an already imported review", async () => {
      const review = await prepare(),
        requestId = randomUUID(),
        receipts = await Promise.all([
          commit(review, requestId),
          commit(review, requestId),
        ]);
      expect(receipts[0]).toEqual(receipts[1]);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      await expect(commit(review)).rejects.toBeInstanceOf(
        ProductEditorConflict
      );
      await expect(
        commitProductImport(owner.merchantId, owner.userId, {
          reviewId: review.reviewId,
          requestId,
          expectedDigest: "a".repeat(64),
          reviewed: true,
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("does not expose another tenant or actor review or receipt", async () => {
      const review = await prepare(),
        receipt = await commit(review);
      await expect(
        readProductImport(other.merchantId, other.userId, {
          reviewId: review.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      expect(
        await readProductImportReceipt(other.merchantId, other.userId, {
          requestId: receipt.requestId,
        })
      ).toBeNull();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readProductImport(owner.merchantId, other.userId, {
          reviewId: review.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        readProductImportReceipt(owner.merchantId, other.userId, {
          requestId: receipt.requestId,
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      await expect(
        commitProductImport(other.merchantId, other.userId, {
          reviewId: review.reviewId,
          requestId: randomUUID(),
          expectedDigest: review.preview.digest,
          reviewed: true,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
    });
    it("rechecks membership, account state and source at commit", async () => {
      const review = await prepare();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      expect(
        (
          await readProductImport(owner.merchantId, owner.userId, {
            reviewId: review.reviewId,
          })
        ).canCommit
      ).toBe(false);
      await expect(commit(review)).rejects.toBeInstanceOf(
        ProductEditorForbidden
      );
      await expect(prepare()).rejects.toBeInstanceOf(ProductEditorForbidden);
      await q(
        "UPDATE merchant_members SET role='manager' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
        owner.merchantId,
      ]);
      await expect(commit(review)).rejects.toBeInstanceOf(ProductEditorLocked);
      await expect(prepare()).rejects.toBeInstanceOf(ProductEditorLocked);
      await q("UPDATE merchants SET integration_source='none' WHERE id=?", [
        owner.merchantId,
      ]);
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(commit(review)).rejects.toBeInstanceOf(
        ProductEditorForbidden
      );
      expect(await counts()).toEqual({ products: 0, receipts: 0 });
    });
    it("rejects a stale digest, expiry and corrupted stored rows", async () => {
      const review = await prepare();
      await expect(
        commitProductImport(owner.merchantId, owner.userId, {
          reviewId: review.reviewId,
          requestId: randomUUID(),
          expectedDigest: "b".repeat(64),
          reviewed: true,
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      await q(
        "UPDATE product_import_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE review_id=?",
        [review.reviewId]
      );
      expect(
        (
          await readProductImport(owner.merchantId, owner.userId, {
            reviewId: review.reviewId,
          })
        ).expired
      ).toBe(true);
      await expect(commit(review)).rejects.toBeInstanceOf(ProductImportExpired);
      await q(
        "UPDATE product_import_reviews SET expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),preview=JSON_SET(preview,'$.rows[0].fields.price','88') WHERE review_id=?",
        [review.reviewId]
      );
      await expect(commit(review)).rejects.toThrow(
        "Invalid import review digest"
      );
      expect(await counts()).toEqual({ products: 0, receipts: 0 });
    });
    it("marks existing SKU only in the current tenant and refuses a new collision after review", async () => {
      await q(
        "INSERT INTO products (merchantId,name,price,sku) VALUES (?,'Foreign',100,'SKU-1')",
        [other.merchantId]
      );
      const review = await prepare();
      expect(review.canCommit).toBe(true);
      await q(
        "INSERT INTO products (merchantId,name,price,sku) VALUES (?,'Existing',100,' sku-1 ')",
        [owner.merchantId]
      );
      await expect(commit(review)).rejects.toBeInstanceOf(
        ProductEditorConflict
      );
      const refreshed = await prepare();
      expect(refreshed.canCommit).toBe(false);
      expect(refreshed.preview.rows[0].issues).toContainEqual({
        code: "existing_sku",
        field: "sku",
        column: 2,
      });
      expect(refreshed.preview.valid).toBe(1);
      expect((await counts()).products).toBe(1);
    });
    it("rolls back every inserted product when a later insert or receipt write fails", async () => {
      const review = await prepare(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      for (const fail of ["product", "receipt"]) {
        let inserts = 0;
        const spy = vi.spyOn(pool, "getConnection").mockImplementation(
          async () =>
            new Proxy(await original(), {
              get(target, prop) {
                if (prop === "query" || prop === "execute")
                  return async (statement: any, values: any[]) => {
                    const sql =
                      typeof statement === "string" ? statement : statement.sql;
                    if (
                      fail === "product" &&
                      /^insert into `products`/i.test(sql) &&
                      ++inserts === 2
                    )
                      throw Error("Injected product failure");
                    if (
                      fail === "receipt" &&
                      sql.startsWith("INSERT INTO product_editor_receipts")
                    )
                      throw Error("Injected receipt failure");
                    return (target[prop] as Function).call(
                      target,
                      statement,
                      values
                    );
                  };
                const value = Reflect.get(target, prop);
                return typeof value === "function" ? value.bind(target) : value;
              },
            })
        );
        try {
          await expect(commit(review)).rejects.toThrow(/Injected|Failed query/);
        } finally {
          spy.mockRestore();
        }
        expect(await counts()).toEqual({ products: 0, receipts: 0 });
        expect(
          (
            await readProductImport(owner.merchantId, owner.userId, {
              reviewId: review.reviewId,
            })
          ).receipt
        ).toBeNull();
      }
      expect((await commit(review)).count).toBe(2);
    });
    it("recovers an acknowledged-lost commit without inserting duplicates, even after expiry/source change", async () => {
      const review = await prepare(),
        requestId = randomUUID(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      const spy = vi.spyOn(pool, "getConnection").mockImplementation(
        async () =>
          new Proxy(await original(), {
            get(target, prop) {
              if (prop === "commit")
                return async () => {
                  await target.commit();
                  throw Error("Lost acknowledgement");
                };
              const value = Reflect.get(target, prop);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
      );
      try {
        await expect(commit(review, requestId)).rejects.toThrow(
          "Lost acknowledgement"
        );
      } finally {
        spy.mockRestore();
      }
      await q("UPDATE merchants SET integration_source='salla' WHERE id=?", [
        owner.merchantId,
      ]);
      await q(
        "UPDATE product_import_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE review_id=?",
        [review.reviewId]
      );
      const receipt = await readProductImportReceipt(
        owner.merchantId,
        owner.userId,
        { requestId }
      );
      expect(receipt?.count).toBe(2);
      expect(await commit(review, requestId)).toEqual(receipt);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("bounds saved reviews and allows explicit discard without losing committed receipts", async () => {
      const a = await prepare(),
        b = await prepare(),
        c = await prepare();
      await expect(prepare()).rejects.toBeInstanceOf(ProductImportLimit);
      await expect(
        discardProductImport(owner.merchantId, owner.userId, {
          reviewId: b.reviewId,
          expectedDigest: "f".repeat(64),
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      await discardProductImport(owner.merchantId, owner.userId, {
        reviewId: b.reviewId,
        expectedDigest: b.preview.digest,
      });
      await expect(
        readProductImport(owner.merchantId, owner.userId, {
          reviewId: b.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await prepare();
      const receipt = await commit(a);
      await discardProductImport(owner.merchantId, owner.userId, {
        reviewId: a.reviewId,
        expectedDigest: a.preview.digest,
      });
      expect(
        await readProductImportReceipt(owner.merchantId, owner.userId, {
          requestId: receipt.requestId,
        })
      ).toEqual(receipt);
      await q(
        "UPDATE product_import_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE review_id=?",
        [c.reviewId]
      );
      await prepare();
      expect(
        Number(
          (
            await q(
              "SELECT COUNT(*) n FROM product_import_reviews WHERE merchant_id=?",
              [owner.merchantId]
            )
          )[0].n
        )
      ).toBe(2);
    });
  }
);
