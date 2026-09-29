import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  listPageWorkspace,
  readPageWorkspace,
  changePageWorkspace,
} from "./page-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed website pages on MySQL",
  () => {
    const users: number[] = [];
    let merchantId: number,
      id: number,
      root: number,
      child: number,
      faq: number;
    const q = async (query: string, args: unknown[] = []) =>
      (await (await getPool())!.execute<any>(query, args))[0];
    const list = (patch: Record<string, unknown> = {}) =>
      listPageWorkspace(merchantId, {
        search: "",
        state: "all",
        page: 1,
        ...patch,
      } as any);
    const read = () => readPageWorkspace(merchantId, id);
    const change = async (action: "enable" | "pause" | "delete") =>
      changePageWorkspace(merchantId, {
        id,
        action,
        expectedRevision: (await read()).revision,
        acknowledged: true,
      });
    beforeEach(async () => {
      const m = await createDisposableMerchant("pages");
      users.push(m.userId);
      merchantId = m.merchantId;
      id = (
        await q(
          "INSERT INTO discovered_pages(merchant_id,url,title,content) VALUES(?,'https://example.test/shipping','Synthetic shipping','Full stored page text')",
          [merchantId]
        )
      ).insertId;
      root = (
        await q(
          "INSERT INTO knowledge_sections(merchant_id,section_type,title,content,source,source_url,status,inject_as) VALUES(?,'policies','Root','Root content','website','https://example.test/shipping','approved','fact')",
          [merchantId]
        )
      ).insertId;
      child = (
        await q(
          "INSERT INTO knowledge_sections(merchant_id,parent_id,section_type,title,content,source,status,inject_as) VALUES(?,?,'custom','Child','Child content','manual','approved','fact')",
          [merchantId, root]
        )
      ).insertId;
      faq = (
        await q(
          "INSERT INTO extracted_faqs(merchant_id,page_id,question,answer) VALUES(?,?,'Question','Answer')",
          [merchantId, id]
        )
      ).insertId;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    it("lists pages without an analysis record and returns exact stored text", async () => {
      const content =
        "<script>Stored untrusted text</script> " + "ع".repeat(10000) + " END";
      await q("UPDATE discovered_pages SET content=? WHERE id=?", [
        content,
        id,
      ]);
      expect(await list()).toMatchObject({ saved: 1, enabled: 1, total: 1 });
      expect((await read()).page.content).toBe(content);
    });
    it("paginates, searches and distinguishes empty, inactive and paused", async () => {
      for (let i = 0; i < 9; i++)
        await q(
          "INSERT INTO discovered_pages(merchant_id,url,title,content,use_in_bot) VALUES(?,?,?,?,0)",
          [merchantId, `https://example.test/${i}`, `Title ${i}`, "Text"]
        );
      expect((await list()).items).toHaveLength(8);
      expect((await list({ page: 99 })).page).toBe(2);
      expect((await list({ search: "Title 5" })).total).toBe(1);
      expect((await list({ state: "paused" })).total).toBe(9);
      await q("UPDATE discovered_pages SET content=NULL WHERE id=?", [id]);
      expect((await list({ state: "empty" })).total).toBe(1);
      await q("UPDATE discovered_pages SET is_active=0 WHERE id=?", [id]);
      expect((await list({ state: "inactive" })).total).toBe(1);
    });
    it('keeps whitespace-only content empty in both list and review',async()=>{
      await q('UPDATE discovered_pages SET content=? WHERE id=?',[' \n\t\r\u00a0 ',id]);
      expect((await list({state:'empty'})).total).toBe(1);
      expect((await read()).page.state).toBe('empty');expect((await read()).canEnable).toBe(false);
    });
    it("previews descendants and FAQ then pauses and enables all reviewed records atomically", async () => {
      const r = await read();
      expect(r.sections.map(s => s.id)).toEqual([root, child]);
      expect(r.faqs.map(f => f.id)).toEqual([faq]);
      await change("pause");
      expect((await read()).page.state).toBe("paused");
      expect((await read()).sections.every(r => r.state === "paused")).toBe(
        true
      );
      expect((await read()).faqs[0].enabled).toBe(false);
      await change("enable");
      expect((await read()).sections.every(r => r.state === "eligible")).toBe(
        true
      );
      expect((await read()).faqs[0].enabled).toBe(true);
    });
    it.each([
      "status='pending_review'",
      "inject_as='none'",
      "valid_until='2020-01-01'",
      "content='' ",
    ])(
      "does not auto-approve or enable ineligible descendant %s",
      async setting => {
        await q(`UPDATE knowledge_sections SET ${setting} WHERE id=?`, [child]);
        expect((await read()).canEnable).toBe(false);
        await expect(change("enable")).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
        await change("pause");
      }
    );
    it.each(["is_active=0", "source_status='archived'", "answer=''"])(
      "blocks enabling an ineligible FAQ %s",
      async setting => {
        await q(`UPDATE extracted_faqs SET ${setting} WHERE id=?`, [faq]);
        await expect(change("enable")).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
      }
    );
    it.each(["is_active=0", "content=''"])(
      "blocks enabling an ineligible page %s",
      async setting => {
        await q(`UPDATE discovered_pages SET ${setting} WHERE id=?`, [id]);
        await expect(change("enable")).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
        });
      }
    );
    it.each(["page", "section", "faq", "descendant", "duplicate"])(
      "rejects a stale review after %s changes",
      async kind => {
        const r = await read();
        if (kind === "page")
          await q("UPDATE discovered_pages SET content=? WHERE id=?", [
            "New text",
            id,
          ]);
        if (kind === "section")
          await q("UPDATE knowledge_sections SET content=? WHERE id=?", [
            "New text",
            child,
          ]);
        if (kind === "faq")
          await q("UPDATE extracted_faqs SET answer=? WHERE id=?", [
            "New answer",
            faq,
          ]);
        if (kind === "descendant")
          await q(
            "INSERT INTO knowledge_sections(merchant_id,parent_id,section_type,title,content) VALUES(?,?,'custom','New','New')",
            [merchantId, child]
          );
        if (kind === "duplicate")
          await q(
            "INSERT INTO discovered_pages(merchant_id,url,title) VALUES(?,'https://example.test/shipping','Duplicate')",
            [merchantId]
          );
        await expect(
          changePageWorkspace(merchantId, {
            id,
            action: "delete",
            expectedRevision: r.revision,
            acknowledged: true,
          })
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await read()).page.id).toBe(id);
      }
    );
    it("blocks ambiguous duplicate URLs even after fresh review", async () => {
      await q(
        "INSERT INTO discovered_pages(merchant_id,url,title) VALUES(?,'https://example.test/shipping','Duplicate')",
        [merchantId]
      );
      expect((await read()).duplicateCount).toBe(1);
      await expect(change("pause")).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });
    it("allows only one concurrent decision on the same reviewed state", async () => {
      const r = await read();
      const outcomes = await Promise.allSettled(
        ["pause", "delete"].map(action =>
          changePageWorkspace(merchantId, {
            id,
            action,
            expectedRevision: r.revision,
            acknowledged: true,
          })
        )
      );
      expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    });
    it("deletes exact linked records and preserves other URLs, sources, tenants and creation receipts", async () => {
      const other = await createDisposableMerchant("foreign-page");
      users.push(other.userId);
      const foreign = (
        await q(
          "INSERT INTO knowledge_sections(merchant_id,parent_id,section_type,title,content,source,source_url) VALUES(?,?,'custom','Foreign','Foreign','website','https://example.test/shipping')",
          [other.merchantId, root]
        )
      ).insertId;
      const unrelated = (
        await q(
          "INSERT INTO knowledge_sections(merchant_id,section_type,title,content,source,source_url) VALUES(?,'custom','Other query','Keep','website','https://example.test/shipping?lang=en')",
          [merchantId]
        )
      ).insertId;
      const manual = (
        await q(
          "INSERT INTO knowledge_sections(merchant_id,section_type,title,content,source,source_url) VALUES(?,'custom','Manual','Keep','manual','https://example.test/shipping')",
          [merchantId]
        )
      ).insertId;
      await q(
        "INSERT INTO knowledge_section_creations(merchant_id,request_id,input_hash,section_id) VALUES(?,'12345678-1234-4234-8234-123456789abc',?,?)",
        [merchantId, "a".repeat(64), child]
      );
      await expect(
        readPageWorkspace(other.merchantId, id)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        changePageWorkspace(other.merchantId, {
          id,
          action: "delete",
          expectedRevision: (await read()).revision,
          acknowledged: true,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await change("delete");
      expect((await list()).saved).toBe(0);
      expect(
        await q("SELECT id FROM extracted_faqs WHERE id=?", [faq])
      ).toEqual([]);
      expect(
        (
          await q(
            "SELECT id FROM knowledge_sections WHERE id IN (?,?,?) ORDER BY id",
            [foreign, unrelated, manual]
          )
        ).map((r: any) => r.id)
      ).toEqual([foreign, unrelated, manual]);
      expect(
        await q(
          "SELECT section_id FROM knowledge_section_creations WHERE merchant_id=?",
          [merchantId]
        )
      ).toEqual([{ section_id: child }]);
    });
    it("invalidates cached answers in the transaction", async () => {
      await q(
        "INSERT INTO sari_response_cache(merchant_id,question_text,response_text) VALUES(?,'Q','Old answer')",
        [merchantId]
      );
      await change("pause");
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toEqual([]);
    });
    it("rolls back page, FAQ, descendants and cache when the final audit write fails", async () => {
      await q(
        "INSERT INTO sari_response_cache(merchant_id,question_text,response_text) VALUES(?,'Q','Keep')",
        [merchantId]
      );
      const trigger = `test_page_audit_${merchantId}`;
      await (await getPool())!.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON sari_activity_log FOR EACH ROW BEGIN IF NEW.merchant_id=${merchantId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='synthetic audit failure'; END IF; END`
      );
      try {
        await expect(change("delete")).rejects.toThrow();
      } finally {
        await (await getPool())!.query(`DROP TRIGGER ${trigger}`);
      }
      const r = await read();
      expect(r.page.state).toBe("enabled");
      expect(r.sections).toHaveLength(2);
      expect(r.faqs).toHaveLength(1);
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(1);
    });
    it("blocks a page action while reviewed knowledge intake is processing", async () => {
      await q(
        "INSERT INTO knowledge_intake_receipts(merchant_id,request_id,input_hash,content_type,state) VALUES(?,'12345678-1234-4234-8234-123456789abc',?,'document','processing')",
        [merchantId, "a".repeat(64)]
      );
      await expect(change("pause")).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await read()).page.state).toBe("enabled");
    });
    it("requires revision and explicit acknowledgement before any storage changes", async () => {
      await expect(
        changePageWorkspace(merchantId, { id, action: "delete" })
      ).rejects.toThrow();
      expect((await read()).page.id).toBe(id);
    });
  }
);
