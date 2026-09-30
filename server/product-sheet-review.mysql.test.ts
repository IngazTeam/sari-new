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
const m = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock("./product-sheet-provider", async original => ({
  ...(await original<typeof import("./product-sheet-provider")>()),
  readProductSheetProvider: m.provider,
}));
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  productEditorStore as store,
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
  ProductEditorMissing,
  ProductEditorInvalid,
} from "./product-editor";
import { readProductSheetConnection } from "./product-sheet-source";
import { previewProductSheet } from "./product-sheet-preview";
import {
  prepareProductSheetReview,
  readProductSheetReview,
  commitProductSheetReview,
  readProductSheetReceipt,
  discardProductSheetReview,
  ProductSheetReviewExpired,
  ProductSheetReviewLimit,
} from "./product-sheet-review";
import {
  productSheetReview,
  productSheetReceipt,
} from "../shared/product-sheet-review";
describe.skipIf(!process.env.DATABASE_URL)(
  "Sheet reviews on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      config: any,
      selection: any,
      values: (string | number)[][],
      failReceipt: boolean,
      loseWriteReply: boolean;
    const sheet = {
      id: 0,
      title: "Products",
      hidden: false,
      rows: 1000,
      columns: 26,
    };
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const prepare = (mode = "sku", reviewId = randomUUID()) =>
      prepareProductSheetReview(owner.merchantId, owner.userId, {
        reviewId,
        selection,
        mode,
      });
    const commit = (r: any, requestId = randomUUID()) =>
      commitProductSheetReview(owner.merchantId, owner.userId, {
        reviewId: r.reviewId,
        expectedDigest: r.digest,
        requestId,
        reviewed: true,
      });
    const read = (r: any, patch = {}) =>
      readProductSheetReview(owner.merchantId, owner.userId, {
        reviewId: r.reviewId,
        ...patch,
      });
    const insert = async (
      name = "Tea",
      sku = "T1",
      price = 1234,
      merchantId = owner.merchantId
    ) =>
      Number(
        (
          await q(
            "INSERT INTO products (merchantId,name,sku,price,price_unit,currency,stock,description,status,isActive) VALUES (?,?,?,?,'minor','SAR',7,'Keep this','active',1)",
            [merchantId, name, sku, price]
          )
        ).insertId
      );
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
      vi.resetAllMocks();
      failReceipt = false;
      loseWriteReply = false;
      owner = await createDisposableMerchant("sheet99");
      other = await createDisposableMerchant("sheet99-other");
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,sheet_id,credentials,is_active) VALUES (?,'sheets','local-source-99',?,1)",
        [
          owner.merchantId,
          JSON.stringify({ refresh_token: "private-refresh-99" }),
        ]
      );
      config = {
        id: 99,
        clientId: "private-client-99",
        clientSecret: "private-secret-99",
        is_enabled: 1,
      };
      const transaction = store.transaction;
      vi.spyOn(store, "transaction").mockImplementation(
        async (writes, run, serial) => {
          const result = await transaction(
            writes,
            c =>
              run(
                new Proxy(c, {
                  get(target, key) {
                    if (key === "execute")
                      return async (sql: string, args: any[]) => {
                        if (
                          failReceipt &&
                          sql.startsWith("INSERT INTO product_editor_receipts")
                        )
                          throw Error("Injected receipt storage failure");
                        const result = await target.execute(sql, args);
                        return sql.includes("FROM google_oauth_settings")
                          ? [[config], []]
                          : result;
                      };
                    const v = Reflect.get(target, key);
                    return typeof v === "function" ? v.bind(target) : v;
                  },
                })
              ),
            serial
          );
          if (writes && loseWriteReply) {
            loseWriteReply = false;
            throw Error("Lost committed reply");
          }
          return result;
        }
      );
      values = [
        ["name", "price", "sku"],
        ["New Tea", 20, "T1"],
        ["Water", 0, "W1"],
      ];
      m.provider.mockImplementation(async input => {
        await input.assertCurrent();
        return previewProductSheet(
          {
            spreadsheetId: "local-source-99",
            sheets: [
              {
                properties: {
                  sheetId: 0,
                  title: "Products",
                  hidden: false,
                  sheetType: "GRID",
                  gridProperties: { rowCount: 1000, columnCount: 26 },
                },
                data: [
                  {
                    rowData: values.map(row => ({
                      values: row.map(x => ({
                        userEnteredValue:
                          typeof x === "number"
                            ? { numberValue: x }
                            : { stringValue: x },
                      })),
                    })),
                  },
                ],
              },
            ],
          },
          {
            spreadsheetId: "local-source-99",
            sheet,
            options: input.selection.options,
            readAt: "2026-09-30T12:00:00.000Z",
          }
        );
      });
      selection = {
        expectedSourceDigest: (
          await readProductSheetConnection(owner.merchantId, owner.userId)
        ).source!.digest,
        sheet,
        options: { sheetId: 0, currency: "SAR" },
      };
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("persists exact before/after review then atomically creates and updates while preserving unmapped fields", async () => {
      const id = await insert(),
        r = await prepare();
      expect(productSheetReview.safeParse(r).success).toBe(true);
      expect(r).toMatchObject({
        sourceCurrent: true,
        canCommit: true,
        counts: { create: 1, update: 1, unchanged: 0, blocked: 0 },
      });
      expect(r.rows[0].change).toMatchObject({
        productId: id,
        before: { price: "12.34" },
        after: {
          price: "20",
          stock: 7,
          description: "Keep this",
          status: "active",
        },
        changes: ["name", "price"],
      });
      expect(await counts()).toEqual({ products: 1, receipts: 0 });
      const result = await commit(r);
      expect(productSheetReceipt.safeParse(result).success).toBe(true);
      expect(result.counts).toEqual({ create: 1, update: 1, unchanged: 0 });
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      const products = await q(
        "SELECT name,price,price_unit,currency,stock,description,status,isActive FROM products WHERE merchantId=? ORDER BY id",
        [owner.merchantId]
      );
      expect(products[0]).toMatchObject({
        name: "New Tea",
        price: 2000,
        price_unit: "minor",
        currency: "SAR",
        stock: 7,
        description: "Keep this",
        status: "active",
        isActive: 1,
      });
      expect(products[1]).toMatchObject({
        name: "Water",
        price: 0,
        stock: null,
        status: "draft",
        isActive: 0,
      });
      expect((await read(r)).receipt).toEqual(result);
      expect((await read(r)).canCommit).toBe(false);
      expect(m.provider).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(r)).not.toContain("private-");
    });
    it("paginates and filters the fixed source and matching plan together", async () => {
      values = [
        ["name", "price"],
        ...Array.from({ length: 25 }, (_, i) => [
          `Row ${i}`,
          i === 21 ? "" : i,
        ]),
      ];
      const r = await prepare("create_only");
      expect(r.rows).toHaveLength(20);
      expect(r.totalPages).toBe(2);
      expect(r.counts.blocked).toBe(1);
      expect(r.canCommit).toBe(false);
      const page = await read(r, { page: 2 });
      expect(page.rows).toHaveLength(5);
      expect(page.rows[0].change.number).toBe(22);
      const blocked = await read(r, { filter: "blocked" });
      expect(blocked.filteredTotal).toBe(1);
      expect(blocked.rows[0].source.number).toBe(23);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorInvalid);
      expect(await counts()).toEqual({ products: 0, receipts: 0 });
    });
    it("replays preparation without another provider read and rejects changed input under its UUID", async () => {
      const uuid = randomUUID(),
        r = await prepare("sku", uuid);
      values[1][1] = 999;
      expect(await prepare("sku", uuid)).toEqual(r);
      expect(m.provider).toHaveBeenCalledTimes(1);
      await expect(prepare("name", uuid)).rejects.toBeInstanceOf(
        ProductEditorConflict
      );
    });
    it("deduplicates concurrent preparations and commits", async () => {
      const uuid = randomUUID(),
        [a, b] = await Promise.all([
          prepare("sku", uuid),
          prepare("sku", uuid),
        ]);
      expect(a).toEqual(b);
      const requestId = randomUUID(),
        receipts = await Promise.all([
          commit(a, requestId),
          commit(a, requestId),
        ]);
      expect(receipts[0]).toEqual(receipts[1]);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      await expect(commit(a)).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("recovers a lost committed reply with the same UUID or the durable receipt", async () => {
      const r = await prepare(),
        requestId = randomUUID();
      loseWriteReply = true;
      await expect(commit(r, requestId)).rejects.toThrow(
        "Lost committed reply"
      );
      const saved = await readProductSheetReceipt(
        owner.merchantId,
        owner.userId,
        { requestId }
      );
      expect(saved?.counts.create).toBe(2);
      expect(await commit(r, requestId)).toEqual(saved);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("rolls back creations and updates when receipt storage fails", async () => {
      const id = await insert(),
        r = await prepare();
      failReceipt = true;
      await expect(commit(r)).rejects.toThrow(
        "Injected receipt storage failure"
      );
      expect(await counts()).toEqual({ products: 1, receipts: 0 });
      expect(
        (await q("SELECT name,price FROM products WHERE id=?", [id]))[0]
      ).toEqual({ name: "Tea", price: 1234 });
      expect((await read(r)).receipt).toBeNull();
    });
    it.each(["price", "name", "sku", "stock", "deleted", "external"])(
      "rejects changed target %s without applying any other row",
      async change => {
        const id = await insert(),
          r = await prepare();
        const statements: Record<string, string> = {
          price: "UPDATE products SET price=999 WHERE id=?",
          name: "UPDATE products SET name='Changed' WHERE id=?",
          sku: "UPDATE products SET sku='different' WHERE id=?",
          stock: "UPDATE products SET stock=99 WHERE id=?",
          deleted: "DELETE FROM products WHERE id=?",
          external:
            "UPDATE products SET sallaProductId='external99' WHERE id=?",
        };
        await q(statements[change], [id]);
        await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorConflict);
        expect((await counts()).receipts).toBe(0);
        expect(
          (
            await q("SELECT id FROM products WHERE merchantId=? AND sku='W1'", [
              owner.merchantId,
            ])
          ).length
        ).toBe(0);
      }
    );
    it("rechecks newly inserted matching candidates and SKU collisions", async () => {
      const r = await prepare();
      await insert("Inserted meanwhile", "W1");
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorConflict);
      expect(await counts()).toEqual({ products: 1, receipts: 0 });
    });
    it("does not read or collide with another tenant's matching SKU", async () => {
      await insert("Other tenant", "T1", 100, other.merchantId);
      const r = await prepare();
      expect(r.counts.create).toBe(2);
      await commit(r);
      expect(
        (
          await q("SELECT price FROM products WHERE merchantId=?", [
            other.merchantId,
          ])
        )[0].price
      ).toBe(100);
    });
    it.each(["sheet", "credentials", "disabled", "oauth", "source"])(
      "rechecks changed connection %s and keeps historical review readable",
      async change => {
        const r = await prepare();
        if (change === "oauth") config.clientSecret = "changed-private";
        else if (change === "source")
          await q(
            "UPDATE merchants SET integration_source='salla' WHERE id=?",
            [owner.merchantId]
          );
        else
          await q(
            `UPDATE google_integrations SET ${change === "sheet" ? "sheet_id='changed99'" : change === "credentials" ? "credentials='{}'" : "is_active=0"} WHERE merchant_id=?`,
            [owner.merchantId]
          );
        await expect(commit(r)).rejects.toThrow();
        expect(await counts()).toEqual({ products: 0, receipts: 0 });
        if (change !== "credentials")
          expect((await read(r)).canCommit).toBe(false);
      }
    );
    it("rejects revoked actor and viewer for reading, applying and receipts", async () => {
      const r = await prepare();
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read(r)).rejects.toBeInstanceOf(ProductEditorForbidden);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorForbidden);
      await q("UPDATE users SET account_status='active' WHERE id=?", [
        owner.userId,
      ]);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [owner.merchantId, owner.userId]
      );
      await expect(
        readProductSheetReceipt(owner.merchantId, owner.userId, {
          requestId: randomUUID(),
        })
      ).rejects.toBeInstanceOf(ProductEditorForbidden);
      await expect(prepare()).rejects.toBeInstanceOf(ProductEditorForbidden);
    });
    it("hides review data from another tenant and another authorized actor", async () => {
      const r = await prepare();
      await expect(
        readProductSheetReview(other.merchantId, other.userId, {
          reviewId: r.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readProductSheetReview(owner.merchantId, other.userId, {
          reviewId: r.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        prepareProductSheetReview(owner.merchantId, other.userId, {
          reviewId: r.reviewId,
          selection,
          mode: "sku",
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
    });
    it("allows expiry/discard recovery but preserves the committed receipt", async () => {
      const r = await prepare();
      await q(
        "UPDATE product_sheet_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect((await read(r)).expired).toBe(true);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductSheetReviewExpired);
      await discardProductSheetReview(owner.merchantId, owner.userId, {
        reviewId: r.reviewId,
        expectedDigest: r.digest,
      });
      const fresh = await prepare(),
        saved = await commit(fresh);
      await discardProductSheetReview(owner.merchantId, owner.userId, {
        reviewId: fresh.reviewId,
        expectedDigest: fresh.digest,
      });
      expect(
        await readProductSheetReceipt(owner.merchantId, owner.userId, {
          requestId: saved.requestId,
        })
      ).toEqual(saved);
      expect(await commit(fresh, saved.requestId)).toEqual(saved);
    });
    it("rejects stale digest, another request for an imported review and UUID input changes", async () => {
      const r = await prepare();
      await expect(
        commit({ ...r, digest: "b".repeat(64) })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      const saved = await commit(r);
      await expect(
        commit({ ...r, digest: "b".repeat(64) }, saved.requestId)
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorConflict);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("blocks malformed legacy prices and external products already present during review", async () => {
      const id = await insert();
      await q("UPDATE products SET price_unit='unverified' WHERE id=?", [id]);
      let r = await prepare();
      expect(r.rows[0].change.issues).toContain("current_fields_invalid");
      await q("UPDATE products SET sallaProductId='external99' WHERE id=?", [
        id,
      ]);
      r = await prepare();
      expect(r.rows[0].change.issues).toContain("source_locked");
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorInvalid);
    });
    it("records unchanged products without altering their rows", async () => {
      const id = await insert();
      values = [
        ["name", "price", "sku"],
        ["Tea", 12.34, "T1"],
      ];
      const before = (await q("SELECT * FROM products WHERE id=?", [id]))[0],
        r = await prepare();
      expect(r.counts.unchanged).toBe(1);
      expect((await commit(r)).counts).toEqual({
        create: 0,
        update: 0,
        unchanged: 1,
      });
      expect((await q("SELECT * FROM products WHERE id=?", [id]))[0]).toEqual(
        before
      );
    });
    it("serializes competing reviews so the same SKU is never created twice", async () => {
      const a = await prepare(),
        b = await prepare();
      const results = await Promise.allSettled([commit(a), commit(b)]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const failure = results.find(
        r => r.status === "rejected"
      ) as PromiseRejectedResult;
      expect(failure.reason).toBeInstanceOf(ProductEditorConflict);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("rejects forged partial-page metadata and cross-review receipts", async () => {
      const r = await prepare();
      for (const patch of [
        { filteredTotal: 999 },
        { totalPages: 3 },
        { rows: r.rows.slice(0, 1) },
        { source: { ...r.source, spreadsheetId: "foreign" } },
        { canCommit: true, sourceCurrent: false },
        { counts: { ...r.counts, blocked: 1 } },
      ])
        expect(productSheetReview.safeParse({ ...r, ...patch }).success).toBe(
          false
        );
      const saved = await commit(r);
      await q(
        "UPDATE product_sheet_reviews SET receipt=JSON_SET(receipt,'$.reviewId',?) WHERE merchant_id=? AND review_id=?",
        [randomUUID(), owner.merchantId, r.reviewId]
      );
      await expect(read(r)).rejects.toThrow();
      expect(
        await readProductSheetReceipt(owner.merchantId, owner.userId, {
          requestId: saved.requestId,
        })
      ).toEqual(saved);
    });
    it("bounds active reviews and rejects corrupted stored content", async () => {
      const r = await prepare();
      await prepare();
      await prepare();
      await expect(prepare()).rejects.toBeInstanceOf(ProductSheetReviewLimit);
      await q(
        "UPDATE product_sheet_reviews SET payload=JSON_SET(payload,'$.plan.rows[0].after.price','999') WHERE merchant_id=? AND review_id=?",
        [owner.merchantId, r.reviewId]
      );
      await expect(read(r)).rejects.toThrow("Invalid Sheet review digest");
      await expect(commit(r)).rejects.toThrow("Invalid Sheet review digest");
      expect((await counts()).products).toBe(0);
    });
  }
);
