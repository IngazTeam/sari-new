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
import { readProductSheetGrid } from "./product-sheet-preview";
import { previewSheetInventory } from "./product-sheet-inventory";
import {
  prepareInventorySheetReview,
  readInventorySheetReview,
  commitInventorySheetReview,
  readInventorySheetReceipt,
  discardInventorySheetReview,
  InventorySheetReviewExpired,
  InventorySheetReviewLimit,
} from "./product-sheet-inventory-review";
import {
  inventorySheetReview,
  inventorySheetReceipt,
} from "../shared/product-sheet-inventory-review";
describe.skipIf(!process.env.DATABASE_URL)(
  "Sheet reviews on disposable MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      config: any,
      selection: any,
      values: (string | number)[][],
      failReceipt: boolean,
      loseWriteReply: boolean,
      teaId: number,
      waterId: number;
    const sheet = {
      id: 0,
      title: "Products",
      hidden: false,
      rows: 1000,
      columns: 26,
    };
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const prepare = (reviewId = randomUUID()) =>
      prepareInventorySheetReview(owner.merchantId, owner.userId, {
        reviewId,
        selection,
      });
    const commit = (r: any, requestId = randomUUID()) =>
      commitInventorySheetReview(owner.merchantId, owner.userId, {
        reviewId: r.reviewId,
        expectedDigest: r.digest,
        requestId,
        reviewed: true,
      });
    const read = (r: any, patch = {}) =>
      readInventorySheetReview(owner.merchantId, owner.userId, {
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
      owner = await createDisposableMerchant("stock105");
      other = await createDisposableMerchant("stock105-other");
      await q(
        "INSERT INTO google_integrations (merchant_id,integration_type,sheet_id,credentials,is_active) VALUES (?,'sheets','local-inventory-105',?,1)",
        [
          owner.merchantId,
          JSON.stringify({ refresh_token: "private-refresh-105" }),
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
      teaId = await insert();
      waterId = await insert("Water", "W1");
      values = [
        ["id", "stock"],
        [teaId, 20],
        [waterId, 7],
      ];
      m.provider.mockImplementation(async input => {
        await input.assertCurrent();
        return previewSheetInventory(
          readProductSheetGrid(
            {
              spreadsheetId: "local-inventory-105",
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
              spreadsheetId: "local-inventory-105",
              sheet,
              readAt: "2026-09-30T12:00:00.000Z",
            }
          ),
          input.selection.options
        );
      });
      selection = {
        expectedSourceDigest: (
          await readProductSheetConnection(owner.merchantId, owner.userId)
        ).source!.digest,
        sheet,
        options: {},
      };
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(
        [owner?.userId, other?.userId].filter(Boolean)
      );
    });
    afterAll(closeDb);
    it("persists stock-only before/after, preserves all other fields and records unchanged rows", async () => {
      // Legacy pricing is irrelevant to an inventory-only change and must be preserved.
      await q("UPDATE products SET price_unit='unverified' WHERE id=?", [
        teaId,
      ]);
      const before = (await q("SELECT * FROM products WHERE id=?", [teaId]))[0];
      const unchanged = (
        await q("SELECT * FROM products WHERE id=?", [waterId])
      )[0];
      const r = await prepare();
      expect(inventorySheetReview.safeParse(r).success).toBe(true);
      expect(r).toMatchObject({
        sourceCurrent: true,
        canCommit: true,
        counts: { update: 1, unchanged: 1, blocked: 0 },
      });
      expect(r.rows[0].change).toMatchObject({
        productId: teaId,
        before: 7,
        after: 20,
        action: "update",
      });
      expect(await counts()).toEqual({ products: 2, receipts: 0 });
      const saved = await commit(r);
      expect(inventorySheetReceipt.safeParse(saved).success).toBe(true);
      expect(saved.counts).toEqual({ update: 1, unchanged: 1 });
      const after = (await q("SELECT * FROM products WHERE id=?", [teaId]))[0];
      expect(after.stock).toBe(20);
      const { stock: _a, updatedAt: _b, ...otherAfter } = after;
      const { stock: _c, updatedAt: _d, ...otherBefore } = before;
      expect(otherAfter).toEqual(otherBefore);
      expect(
        (await q("SELECT * FROM products WHERE id=?", [waterId]))[0]
      ).toEqual(unchanged);
      expect((await read(r)).receipt).toEqual(saved);
      expect((await read(r)).canCommit).toBe(false);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      expect(m.provider).toHaveBeenCalledTimes(1);
      expect(m.provider.mock.calls[0][0].selection.kind).toBe("inventory");
      expect(JSON.stringify(r)).not.toContain("private-");
    });
    it("distinguishes unknown stock from an explicit zero", async () => {
      await q("UPDATE products SET stock=NULL WHERE id=?", [teaId]);
      values[1][1] = 0;
      const r = await prepare();
      expect(r.rows[0].change).toMatchObject({
        before: null,
        after: 0,
        action: "update",
      });
      expect((await commit(r)).rows[0]).toMatchObject({
        before: null,
        after: 0,
      });
      expect(
        (await q("SELECT stock FROM products WHERE id=?", [teaId]))[0].stock
      ).toBe(0);
    });
    it("paginates the immutable source together with its plan and filters blocked rows", async () => {
      values = [
        ["id", "stock"],
        ...Array.from({ length: 25 }, (_, i) => [2147483500 + i, i]),
      ];
      const r = await prepare();
      expect(r.rows).toHaveLength(20);
      expect(r.totalPages).toBe(2);
      expect(r.counts.blocked).toBe(25);
      expect(r.canCommit).toBe(false);
      const page = await read(r, { page: 2 });
      expect(page.rows).toHaveLength(5);
      expect(page.rows[0].source.number).toBe(22);
      expect(page.rows[0].change.number).toBe(22);
      expect((await read(r, { filter: "update" })).rows).toEqual([]);
      expect(
        (await read(r, { filter: "blocked", page: 2 })).filteredTotal
      ).toBe(25);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorInvalid);
      expect(await counts()).toEqual({ products: 2, receipts: 0 });
    });
    it("replays preparation without Google and rejects changed input under one UUID", async () => {
      const uuid = randomUUID(),
        r = await prepare(uuid);
      values[1][1] = 999;
      expect(await prepare(uuid)).toEqual(r);
      expect(m.provider).toHaveBeenCalledTimes(1);
      selection.options = { mapping: { productId: 0, stock: 1 } };
      await expect(prepare(uuid)).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("deduplicates concurrent preparations and commits", async () => {
      const uuid = randomUUID(),
        [a, b] = await Promise.all([prepare(uuid), prepare(uuid)]);
      expect(a).toEqual(b);
      const requestId = randomUUID(),
        saved = await Promise.all([commit(a, requestId), commit(a, requestId)]);
      expect(saved[0]).toEqual(saved[1]);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
      await expect(commit(a)).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("recovers a lost committed reply through its durable receipt and same request", async () => {
      const r = await prepare(),
        requestId = randomUUID();
      loseWriteReply = true;
      await expect(commit(r, requestId)).rejects.toThrow(
        "Lost committed reply"
      );
      const saved = await readInventorySheetReceipt(
        owner.merchantId,
        owner.userId,
        { requestId }
      );
      expect(saved?.counts).toEqual({ update: 1, unchanged: 1 });
      expect(await commit(r, requestId)).toEqual(saved);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("rolls back every stock change when receipt storage fails", async () => {
      values[2][1] = 99;
      const r = await prepare();
      failReceipt = true;
      await expect(commit(r)).rejects.toThrow(
        "Injected receipt storage failure"
      );
      expect(
        await q("SELECT stock FROM products WHERE merchantId=? ORDER BY id", [
          owner.merchantId,
        ])
      ).toEqual([{ stock: 7 }, { stock: 7 }]);
      expect(await counts()).toEqual({ products: 2, receipts: 0 });
      expect((await read(r)).receipt).toBeNull();
    });
    it.each(["price", "name", "sku", "stock", "deleted", "external"])(
      "rejects changed target %s atomically",
      async change => {
        const r = await prepare();
        const statements: Record<string, string> = {
          price: "UPDATE products SET price=999 WHERE id=?",
          name: "UPDATE products SET name='Changed' WHERE id=?",
          sku: "UPDATE products SET sku='changed' WHERE id=?",
          stock: "UPDATE products SET stock=99 WHERE id=?",
          deleted: "DELETE FROM products WHERE id=?",
          external: "UPDATE products SET sallaProductId='remote' WHERE id=?",
        };
        await q(statements[change], [waterId]);
        await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorConflict);
        expect(
          (await q("SELECT stock FROM products WHERE id=?", [teaId]))[0].stock
        ).toBe(7);
        expect((await counts()).receipts).toBe(0);
      }
    );
    it.each([
      "unknown",
      "foreign",
      "external",
      "duplicate",
      "negative",
      "empty",
    ])(
      "blocks %s rows without partial writes or foreign details",
      async kind => {
        if (kind === "unknown") values[2][0] = 2147483647;
        if (kind === "foreign")
          values[2][0] = await insert(
            "Secret foreign name",
            "other",
            100,
            other.merchantId
          );
        if (kind === "external")
          await q("UPDATE products SET sallaProductId='remote' WHERE id=?", [
            waterId,
          ]);
        if (kind === "duplicate") values[2][0] = teaId;
        if (kind === "negative")
          await q("UPDATE products SET stock=-1 WHERE id=?", [waterId]);
        if (kind === "empty") values[2][1] = "";
        const r = await prepare();
        expect(r.counts.blocked).toBeGreaterThan(0);
        expect(r.canCommit).toBe(false);
        expect(JSON.stringify(r)).not.toContain("Secret foreign name");
        await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorInvalid);
        expect(
          (await q("SELECT stock FROM products WHERE id=?", [teaId]))[0].stock
        ).toBe(7);
        expect((await counts()).receipts).toBe(0);
      }
    );
    it.each(["sheet", "credentials", "disabled", "oauth", "source"])(
      "rechecks changed connection %s",
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
            `UPDATE google_integrations SET ${change === "sheet" ? "sheet_id='changed105'" : change === "credentials" ? "credentials='{}'" : "is_active=0"} WHERE merchant_id=?`,
            [owner.merchantId]
          );
        await expect(commit(r)).rejects.toThrow();
        expect(await counts()).toEqual({ products: 2, receipts: 0 });
        if (change !== "credentials")
          expect((await read(r)).canCommit).toBe(false);
      }
    );
    it("rechecks source after provider even when its callback is ignored", async () => {
      const original = m.provider.getMockImplementation()!;
      m.provider.mockImplementation(async input => {
        const result = await original({
          ...input,
          assertCurrent: async () => {},
        });
        await q(
          "UPDATE google_integrations SET is_active=0 WHERE merchant_id=?",
          [owner.merchantId]
        );
        return result;
      });
      await expect(prepare()).rejects.toThrow();
      expect(
        (
          await q(
            "SELECT COUNT(*) n FROM inventory_sheet_reviews WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].n
      ).toBe(0);
    });
    it("rejects revoked actor and viewer for reviews, writes and receipts", async () => {
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
        readInventorySheetReceipt(owner.merchantId, owner.userId, {
          requestId: randomUUID(),
        })
      ).rejects.toBeInstanceOf(ProductEditorForbidden);
      await expect(prepare()).rejects.toBeInstanceOf(ProductEditorForbidden);
    });
    it("hides review and receipt from another tenant or authorized actor", async () => {
      const r = await prepare(),
        saved = await commit(r);
      await expect(
        readInventorySheetReview(other.merchantId, other.userId, {
          reviewId: r.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      expect(
        await readInventorySheetReceipt(other.merchantId, other.userId, {
          requestId: saved.requestId,
        })
      ).toBeNull();
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",
        [owner.merchantId, other.userId]
      );
      await expect(
        readInventorySheetReview(owner.merchantId, other.userId, {
          reviewId: r.reviewId,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        prepareInventorySheetReview(owner.merchantId, other.userId, {
          reviewId: r.reviewId,
          selection,
        })
      ).rejects.toBeInstanceOf(ProductEditorMissing);
      await expect(
        readInventorySheetReceipt(owner.merchantId, other.userId, {
          requestId: saved.requestId,
        })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
    });
    it("supports expiry and discard while retaining a durable receipt", async () => {
      const r = await prepare();
      await q(
        "UPDATE inventory_sheet_reviews SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect((await read(r)).expired).toBe(true);
      await expect(commit(r)).rejects.toBeInstanceOf(
        InventorySheetReviewExpired
      );
      await discardInventorySheetReview(owner.merchantId, owner.userId, {
        reviewId: r.reviewId,
        expectedDigest: r.digest,
      });
      const fresh = await prepare(),
        saved = await commit(fresh);
      await discardInventorySheetReview(owner.merchantId, owner.userId, {
        reviewId: fresh.reviewId,
        expectedDigest: fresh.digest,
      });
      expect(
        await readInventorySheetReceipt(owner.merchantId, owner.userId, {
          requestId: saved.requestId,
        })
      ).toEqual(saved);
      expect(await commit(fresh, saved.requestId)).toEqual(saved);
    });
    it("rejects stale digest and request reuse with changed input", async () => {
      const r = await prepare();
      await expect(
        commit({ ...r, digest: "b".repeat(64) })
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      const saved = await commit(r);
      await expect(
        commit({ ...r, digest: "b".repeat(64) }, saved.requestId)
      ).rejects.toBeInstanceOf(ProductEditorConflict);
      await expect(commit(r)).rejects.toBeInstanceOf(ProductEditorConflict);
      expect((await counts()).receipts).toBe(1);
    });
    it("serializes competing reviews and rejects the stale one", async () => {
      const a = await prepare(),
        b = await prepare(),
        results = await Promise.allSettled([commit(a), commit(b)]);
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (results.find(r => r.status === "rejected") as PromiseRejectedResult)
          .reason
      ).toBeInstanceOf(ProductEditorConflict);
      expect(await counts()).toEqual({ products: 2, receipts: 1 });
    });
    it("rejects forged pages, unsafe states and mismatched receipt rows", async () => {
      const r = await prepare();
      for (const patch of [
        { filteredTotal: 999 },
        { totalPages: 3 },
        { rows: r.rows.slice(0, 1) },
        { source: { ...r.source, spreadsheetId: "foreign" } },
        { canCommit: true, sourceCurrent: false },
        { counts: { ...r.counts, blocked: 1 } },
        {
          rows: r.rows.map((x, i) =>
            i ? x : { ...x, change: { ...x.change, after: 123 } }
          ),
        },
      ])
        expect(inventorySheetReview.safeParse({ ...r, ...patch }).success).toBe(
          false
        );
      const saved = await commit(r),
        view = await read(r);
      for (const patch of [
        { reviewId: randomUUID() },
        { actorId: other.userId },
        { sourceDigest: "b".repeat(64) },
        { rows: saved.rows.map((x, i) => (i ? x : { ...x, before: 6 })) },
      ])
        expect(
          inventorySheetReview.safeParse({
            ...view,
            receipt: { ...saved, ...patch },
          }).success
        ).toBe(false);
      await q(
        "UPDATE inventory_sheet_reviews SET receipt=JSON_SET(receipt,'$.reviewId',?) WHERE merchant_id=? AND review_id=?",
        [randomUUID(), owner.merchantId, r.reviewId]
      );
      await expect(read(r)).rejects.toThrow();
      expect(
        await readInventorySheetReceipt(owner.merchantId, owner.userId, {
          requestId: saved.requestId,
        })
      ).toEqual(saved);
    });
    it("bounds active reviews and detects stored tampering", async () => {
      const r = await prepare();
      await prepare();
      await prepare();
      await expect(prepare()).rejects.toBeInstanceOf(InventorySheetReviewLimit);
      await q(
        "UPDATE inventory_sheet_reviews SET payload=JSON_SET(payload,'$.plan.rows[0].before',6) WHERE merchant_id=? AND review_id=?",
        [owner.merchantId, r.reviewId]
      );
      await expect(read(r)).rejects.toThrow("Invalid Sheet review digest");
      await expect(commit(r)).rejects.toThrow("Invalid Sheet review digest");
      expect((await counts()).receipts).toBe(0);
    });
  }
);
