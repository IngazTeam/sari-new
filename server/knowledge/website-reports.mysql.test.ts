import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  listWebsiteReports,
  readWebsiteReport,
  deleteReviewedWebsiteReport,
} from "./website-reports";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed website reports on MySQL",
  () => {
    const users: number[] = [];
    let merchantId: number, id: number;
    const q = async (query: string, args: unknown[] = []) =>
      (await (await getPool())!.execute<any>(query, args))[0];
    const list = (patch: Record<string, unknown> = {}) =>
      listWebsiteReports(merchantId, {
        search: "",
        state: "all",
        page: 1,
        ...patch,
      } as any);
    const read = () => readWebsiteReport(merchantId, id);
    const remove = async (patch: Record<string, unknown> = {}) =>
      deleteReviewedWebsiteReport(merchantId, {
        id,
        expectedRevision: (await read()).revision,
        acknowledged: true,
        ...patch,
      });
    beforeEach(async () => {
      const m = await createDisposableMerchant("reports");
      users.push(m.userId);
      merchantId = m.merchantId;
      id = (
        await q(
          "INSERT INTO website_analyses(merchant_id,url,title,status,scraped_content,seo_issues) VALUES(?,'https://example.test/100%','Stored title','completed','Full source <script>inert</script>','legacy invalid JSON')",
          [merchantId]
        )
      ).insertId;
      await q(
        "INSERT INTO website_insights(analysis_id,merchant_id,category,type,title,description) VALUES(?,?,'content','recommendation','Insight','Full insight')",
        [id, merchantId]
      );
      await q(
        "INSERT INTO extracted_products(analysis_id,merchant_id,name,price) VALUES(?,?,'Extracted only',0)",
        [id, merchantId]
      );
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    it("returns full text and malformed historical metadata without crashing", async () => {
      const r = await read();
      expect(r.report.scrapedContent).toContain("<script>inert</script>");
      expect(r.report.seoIssues).toBe("legacy invalid JSON");
      expect(r.products[0].price).toBe("0.00");
      expect(r.insights[0].description).toBe("Full insight");
    });
    it("uses metadata-only pagination, clamps and searches literal wildcards", async () => {
      for (let i = 0; i < 9; i++)
        await q(
          "INSERT INTO website_analyses(merchant_id,url,title,status) VALUES(?,'https://example.test/plain',?,'failed')",
          [merchantId, `Report ${i}`]
        );
      const first = await list();
      expect(first.items).toHaveLength(8);
      expect(first.items[0]).not.toHaveProperty("scrapedContent");
      expect(await list({ page: 999 })).toMatchObject({
        page: 2,
        totalPages: 2,
        total: 10,
      });
      expect((await list({ state: "failed" })).total).toBe(9);
      expect((await list({ search: "%" })).total).toBe(1);
      expect((await list({ search: "_" })).total).toBe(0);
    });
    it("does not read, list or remove another tenant's reports", async () => {
      const m = await createDisposableMerchant("reports_other");
      users.push(m.userId);
      expect(
        (
          await listWebsiteReports(m.merchantId, {
            search: "",
            state: "all",
            page: 1,
          })
        ).total
      ).toBe(0);
      await expect(readWebsiteReport(m.merchantId, id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        deleteReviewedWebsiteReport(m.merchantId, {
          id,
          expectedRevision: (await read()).revision,
          acknowledged: true,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await read()).products).toHaveLength(1);
    });
    it.each(["pending", "analyzing"])(
      "blocks deletion of %s reports",
      async status => {
        await q("UPDATE website_analyses SET status=? WHERE id=?", [
          status,
          id,
        ]);
        await expect(remove()).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
        expect((await read()).insights).toHaveLength(1);
      }
    );
    it.each(["report", "product", "insight"])(
      "rejects stale %s snapshots",
      async target => {
        const revision = (await read()).revision;
        if (target === "report")
          await q("UPDATE website_analyses SET title='Changed' WHERE id=?", [
            id,
          ]);
        if (target === "product")
          await q("UPDATE extracted_products SET price=7 WHERE analysis_id=?", [
            id,
          ]);
        if (target === "insight")
          await q(
            "UPDATE website_insights SET description='Changed' WHERE analysis_id=?",
            [id]
          );
        await expect(
          remove({ expectedRevision: revision })
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await read()).products).toHaveLength(1);
      }
    );
    it("requires review and acknowledgement", async () => {
      for (const patch of [
        { acknowledged: false },
        { expectedRevision: undefined },
        { id: 0 },
      ])
        await expect(remove(patch)).rejects.toThrow();
      expect((await list()).total).toBe(1);
    });
    it("deletes report children and audits once, preserving imported knowledge", async () => {
      await q(
        "INSERT INTO discovered_pages(merchant_id,url,title,content) VALUES(?,'https://example.test/100%','Imported','Saved content')",
        [merchantId]
      );
      await q(
        "INSERT INTO knowledge_sections(merchant_id,section_type,title,content,source,status) VALUES(?,'custom','Imported','Saved content','website','approved')",
        [merchantId]
      );
      await remove();
      expect(
        await q("SELECT id FROM website_analyses WHERE id=?", [id])
      ).toHaveLength(0);
      expect(
        await q("SELECT id FROM website_insights WHERE analysis_id=?", [id])
      ).toHaveLength(0);
      expect(
        await q("SELECT id FROM extracted_products WHERE analysis_id=?", [id])
      ).toHaveLength(0);
      expect(
        await q("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(1);
      expect(
        await q("SELECT id FROM knowledge_sections WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(1);
      expect(
        await q(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='website_report_delete'",
          [merchantId]
        )
      ).toHaveLength(1);
    });
    it("serializes double deletion without duplicate audit", async () => {
      const input = {
        id,
        expectedRevision: (await read()).revision,
        acknowledged: true,
      };
      const r = await Promise.allSettled([
        deleteReviewedWebsiteReport(merchantId, input),
        deleteReviewedWebsiteReport(merchantId, input),
      ]);
      expect(r.filter(x => x.status === "fulfilled")).toHaveLength(1);
      expect(
        await q(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='website_report_delete'",
          [merchantId]
        )
      ).toHaveLength(1);
    });
    it("blocks cross-tenant child corruption instead of cascading it", async () => {
      const m = await createDisposableMerchant("reports_child");
      users.push(m.userId);
      await q(
        "UPDATE extracted_products SET merchant_id=? WHERE analysis_id=?",
        [m.merchantId, id]
      );
      await expect(remove()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      expect(
        await q("SELECT id FROM extracted_products WHERE analysis_id=?", [id])
      ).toHaveLength(1);
    });
    it("clears cached answers on successful deletion", async () => {
      await q(
        "INSERT INTO sari_response_cache(merchant_id,question_text,response_text) VALUES(?,'Q','Old report answer')",
        [merchantId]
      );
      await remove();
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
    it("rolls back children, report and cache on audit failure", async () => {
      await q(
        "INSERT INTO sari_response_cache(merchant_id,question_text,response_text) VALUES(?,'Q','Keep')",
        [merchantId]
      );
      const trigger = `test_report_audit_${merchantId}`;
      await (await getPool())!.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON sari_activity_log FOR EACH ROW BEGIN IF NEW.merchant_id=${merchantId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END`
      );
      try {
        await expect(remove()).rejects.toThrow();
      } finally {
        await (await getPool())!.query(`DROP TRIGGER ${trigger}`);
      }
      const r = await read();
      expect(r.products).toHaveLength(1);
      expect(r.insights).toHaveLength(1);
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(1);
    });
  }
);
