import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getPool } from "./db/connection";
import {
  assertDisposableDatabase,
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  readCompetitorWorkspace,
  readCompetitorDetail,
} from "./competitor-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "competitor selected-tenant read source",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) => {
      assertDisposableDatabase();
      return (await (await getPool())!.execute<any>(sql, args))[0];
    };
    const create = async (
      name = "Synthetic report",
      status = "completed",
      merchant = owner.merchantId
    ) =>
      Number(
        (
          await q(
            "INSERT INTO competitor_analyses (merchant_id,name,url,status,overall_score) VALUES (?,?,?,?,75)",
            [merchant, name, "https://example.test/report", status]
          )
        ).insertId
      );
    const product = async (
      id: number,
      price: number | null,
      currency = "SAR",
      merchant = owner.merchantId,
      name = "Synthetic product"
    ) =>
      Number(
        (
          await q(
            "INSERT INTO competitor_products (competitor_id,merchant_id,name,price,currency) VALUES (?,?,?,?,?)",
            [id, merchant, name, price, currency]
          )
        ).insertId
      );
    const read = (
      input = {},
      actor = owner.userId,
      merchant = owner.merchantId
    ) => readCompetitorWorkspace(actor, merchant, input);
    const detail = (id: number, productPage = 1) =>
      readCompetitorDetail(owner.userId, owner.merchantId, { id, productPage });
    beforeEach(async () => {
      owner = await createDisposableMerchant("competitors");
      other = await createDisposableMerchant("competitors-other");
    });
    afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId]));
    afterAll(closeDb);
    it("covers 106 reports and literal filters with independent full statistics and stable ordering", async () => {
      const first = await create("Needle_%_", "failed");
      for (let i = 0; i < 105; i++)
        await create(
          "Report " + i,
          i === 0 ? "analyzing" : i === 1 ? "pending" : "completed"
        );
      await create("FOREIGN_PRIVATE", "completed", other.merchantId);
      const pages = [];
      for (let page = 1; page <= 5; page++) pages.push(await read({ page }));
      expect(pages[0]).toMatchObject({
        matched: 106,
        pages: 5,
        stats: { total: 106, completed: 103, running: 2, failed: 1 },
      });
      expect(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size).toBe(106);
      expect(pages[4].rows.at(-1)?.id).toBe(first);
      expect((await read({ page: 800 })).currentPage).toBe(5);
      expect(JSON.stringify(pages)).not.toContain("FOREIGN_PRIVATE");
      expect((await read({ query: "%" })).rows.map(r => r.id)).toEqual([first]);
      expect((await read({ state: "failed" })).stats.total).toBe(106);
      expect((await read({ sort: "oldest" })).rows[0].id).toBe(first);
      expect((await read({ query: "' OR 1=1 --" })).matched).toBe(0);
    });
    it("does not invent empty results or zero estimates", async () => {
      expect(await read({ page: 90 })).toMatchObject({
        rows: [],
        pages: 0,
        currentPage: 1,
        stats: { total: 0 },
      });
      const id = await create("Running", "analyzing");
      expect((await detail(id)).report.scores.overall).toBeNull();
      await q(
        "UPDATE competitor_analyses SET status='completed',overall_score=0,seo_score=150,performance_score=-1 WHERE id=?",
        [id]
      );
      expect((await detail(id)).report).toMatchObject({
        scores: { overall: 0, seo: null, performance: null },
        salesProficiency: null,
        scoreEvidence: "website_estimate",
      });
    });
    it("pages every product, keeps full notes and separates currency evidence over the whole report", async () => {
      const id = await create();
      const note = "<script>literal</script>".repeat(300);
      await q(
        "UPDATE competitor_analyses SET product_count=999,strengths=?,weaknesses='broken',opportunities='null',industry='Retail',avg_price=99999 WHERE id=?",
        [JSON.stringify([note, "Last note"]), id]
      );
      for (let i = 0; i < 27; i++) await product(id, i + 1, "SAR");
      await product(id, 200, "USD");
      for (const [price, currency] of [
        [0, "SAR"],
        [-1, "SAR"],
        [null, "SAR"],
        [50, "sar"],
        [20, "USD!"],
      ] as const)
        await product(id, price, currency);
      const d = await detail(id),
        second = await detail(id, 2);
      expect(d.report).toMatchObject({
        products: 33,
        recordedProductCount: 999,
        industry: "Retail",
      });
      expect(d.products).toHaveLength(25);
      expect(second.products).toHaveLength(8);
      expect(
        new Set([...d.products, ...second.products].map(p => p.id)).size
      ).toBe(33);
      expect(d.pricing).toMatchObject({
        pricedCount: 28,
        unverifiedCount: 5,
        evidence: "extracted_not_current",
        groups: [
          { currency: "SAR", count: 27, minimum: "1.00", maximum: "27.00" },
          { currency: "USD", count: 1, minimum: "200.00", maximum: "200.00" },
        ],
      });
      expect(d.notes).toEqual({
        strengths: { items: [note, "Last note"], invalid: false },
        weaknesses: { items: [], invalid: true },
        opportunities: { items: [], invalid: true },
      });
      expect(
        second.products
          .slice(-5)
          .every(
            p =>
              p.price === null &&
              p.currency === null &&
              p.priceEvidence === "unverified"
          )
      ).toBe(true);
      expect((await detail(id, 500)).productPage).toBe(2);
      expect(JSON.stringify(d)).not.toContain("99999");
    });
    it("excludes contradictory children and foreign comparison references, with no foreign content or stored error", async () => {
      const id = await create(),
        foreign = await create("OTHER_PRIVATE", "completed", other.merchantId);
      await product(id, 999, "EUR", other.merchantId, "CHILD_PRIVATE");
      const own = await product(id, 12);
      const foreignProduct = Number(
        (
          await q(
            "INSERT INTO products (merchantId,name,price) VALUES (?,'MATCH_PRIVATE',800)",
            [other.merchantId]
          )
        ).insertId
      );
      await q(
        "UPDATE competitor_products SET similar_to_merchant_product=?,price_difference=9999,product_url='javascript:alert(1)',image_url='https://u:p@example.test' WHERE id=?",
        [foreignProduct, own]
      );
      await q(
        "UPDATE competitor_analyses SET error_message='PROVIDER_PRIVATE',url='https://127.0.0.1',strengths='[]' WHERE id=?",
        [id]
      );
      const d = await detail(id);
      expect(d.report).toMatchObject({
        products: 1,
        excludedProducts: 1,
        url: null,
      });
      expect(d.products[0]).toMatchObject({
        matchedProduct: null,
        url: null,
        imageUrl: null,
        comparisonEvidence: "not_verified",
      });
      expect(JSON.stringify(d)).not.toMatch(/PRIVATE|9999|javascript|127\.0/);
      expect((await read()).rows[0].products).toBe(1);
      await expect(detail(foreign)).rejects.toMatchObject({
        reason: "missing",
      });
      const localProduct = Number(
        (
          await q(
            "INSERT INTO products (merchantId,name,price) VALUES (?,'Own match',800)",
            [owner.merchantId]
          )
        ).insertId
      );
      await q(
        "UPDATE competitor_products SET similar_to_merchant_product=? WHERE id=?",
        [localProduct, own]
      );
      expect((await detail(id)).products[0].matchedProduct).toEqual({
        id: localProduct,
        name: "Own match",
      });
    });
    it("uses current membership and owner state, not requested or stale roles", async () => {
      await expect(
        read({}, owner.userId, other.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",
        [other.merchantId, owner.userId]
      );
      expect((await read({}, owner.userId, other.merchantId)).canManage).toBe(
        false
      );
      await q(
        "UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",
        [other.merchantId, owner.userId]
      );
      expect((await read({}, owner.userId, other.merchantId)).canManage).toBe(
        true
      );
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        other.userId,
      ]);
      await expect(
        read({}, owner.userId, other.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
      await q("UPDATE users SET account_status='active' WHERE id=?", [
        other.userId,
      ]);
      await q(
        "UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?",
        [other.merchantId, owner.userId]
      );
      await expect(
        read({}, owner.userId, other.merchantId)
      ).rejects.toMatchObject({ reason: "forbidden" });
    });
    it("honors explicit owner revocation, pending and suspended merchants and inactive accounts", async () => {
      await q(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
      await q(
        "DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?",
        [owner.merchantId, owner.userId]
      );
      await q("UPDATE merchants SET status='pending' WHERE id=?", [
        owner.merchantId,
      ]);
      expect((await read()).canManage).toBe(false);
      await q("UPDATE merchants SET status='suspended' WHERE id=?", [
        owner.merchantId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
      await q("UPDATE merchants SET status='active' WHERE id=?", [
        owner.merchantId,
      ]);
      await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [
        owner.userId,
      ]);
      await expect(read()).rejects.toMatchObject({ reason: "forbidden" });
    });
  }
);
