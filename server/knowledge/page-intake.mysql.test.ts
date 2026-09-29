import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, getDb, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  storePagePreview,
  readPageIntake,
  savePagePreview,
} from "./page-intake";
import { readPageWorkspace, changePageWorkspace } from "./page-workspace";
import { resetKnowledgeSources } from "./source-lifecycle";
describe.skipIf(!process.env.DATABASE_URL)(
  "immutable website preview on MySQL",
  () => {
    const users: number[] = [];
    let merchantId: number;
    const q = async (s: string, args: unknown[] = []) =>
      (await (await getPool())!.execute<any>(s, args))[0];
    const source = () => ({
      url: "https://example.test/review",
      title: "Reviewed source",
      content:
        "One two three four five six seven eight nine ten <script>plain text</script> " +
        "ع".repeat(10000),
      analysis: null,
    });
    const prepare = () => storePagePreview(merchantId, source());
    const save = (previewId: string) =>
      savePagePreview(merchantId, { previewId, acknowledged: true });
    beforeEach(async () => {
      const m = await createDisposableMerchant("page-intake");
      users.push(m.userId);
      merchantId = m.merchantId;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    it("stores a preview without creating knowledge, then atomically saves the exact text paused", async () => {
      const p = await prepare();
      expect(
        await q("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
      expect(await readPageIntake(merchantId, p.previewId)).toMatchObject({
        state: "review",
        preview: { content: source().content },
      });
      const r = await save(p.previewId);
      expect(r).toMatchObject({ state: "saved", replayed: false });
      const page = await readPageWorkspace(merchantId, r.pageId);
      expect(page.page.content).toBe(p.content);
      expect(page.page.state).toBe("paused");
      expect(page.sections).toMatchObject([
        { id: r.sectionId, content: p.content, state: "paused" },
      ]);
      expect(
        await q(
          "SELECT content,analysis FROM knowledge_page_previews WHERE preview_id=?",
          [p.previewId]
        )
      ).toEqual([{ content: null, analysis: null }]);
    });
    it("serializes simultaneous saves and preserves an immutable receipt after deletion", async () => {
      const p = await prepare();
      const both = await Promise.all([save(p.previewId), save(p.previewId)]);
      expect(both[0].pageId).toBe(both[1].pageId);
      expect(both.filter(r => r.replayed)).toHaveLength(1);
      const page = await readPageWorkspace(merchantId, both[0].pageId);
      await changePageWorkspace(merchantId, {
        id: page.page.id,
        action: "delete",
        acknowledged: true,
        expectedRevision: page.revision,
      });
      expect(await readPageIntake(merchantId, p.previewId)).toMatchObject({
        state: "deleted",
      });
      expect(await save(p.previewId)).toMatchObject({
        state: "deleted",
        replayed: true,
      });
      expect(
        await q("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
    it.each(["page", "section"])(
      "detects changed or partially deleted %s without recreating it",
      async part => {
        const p = await prepare(),
          r = await save(p.previewId),
          table = part === "page" ? "discovered_pages" : "knowledge_sections",
          id = part === "page" ? r.pageId : r.sectionId;
        await q(`UPDATE ${table} SET content='Changed' WHERE id=?`, [id]);
        expect(await readPageIntake(merchantId, p.previewId)).toMatchObject({
          state: "changed",
        });
        await q(`DELETE FROM ${table} WHERE id=?`, [id]);
        expect(await save(p.previewId)).toMatchObject({
          state: "changed",
          replayed: true,
        });
      }
    );
    it("prevents another tenant reading or consuming a guessed preview", async () => {
      const p = await prepare(),
        other = await createDisposableMerchant("other-page-intake");
      users.push(other.userId);
      expect(await readPageIntake(other.merchantId, p.previewId)).toEqual({
        state: "not_found",
      });
      await expect(
        savePagePreview(other.merchantId, {
          previewId: p.previewId,
          acknowledged: true,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await readPageIntake(merchantId, p.previewId)).state).toBe(
        "review"
      );
    });
    it("requires fresh acknowledgement and refuses expired previews", async () => {
      const p = await prepare();
      await expect(
        savePagePreview(merchantId, {
          previewId: p.previewId,
          acknowledged: false,
        })
      ).rejects.toThrow();
      await q(
        "UPDATE knowledge_page_previews SET expires_at='2020-01-01' WHERE preview_id=?",
        [p.previewId]
      );
      expect(await readPageIntake(merchantId, p.previewId)).toEqual({
        state: "expired",
      });
      await expect(save(p.previewId)).rejects.toMatchObject({
        message: "PREVIEW_EXPIRED",
      });
    });
    it("bounds pending snapshots and removes expired pending text on the next preparation", async () => {
      for (let i = 0; i < 5; i++) await prepare();
      await expect(prepare()).rejects.toMatchObject({
        message: "PREVIEW_LIMIT",
      });
      await q(
        "UPDATE knowledge_page_previews SET expires_at='2020-01-01' WHERE merchant_id=?",
        [merchantId]
      );
      await prepare();
      expect(
        await q("SELECT id FROM knowledge_page_previews WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(1);
    });
    it("rechecks duplicate URL at commit, including existing website-only sections", async () => {
      const a = await prepare(),
        b = await prepare();
      await save(a.previewId);
      await expect(save(b.previewId)).rejects.toMatchObject({
        message: "PAGE_EXISTS",
      });
      await q("DELETE FROM discovered_pages WHERE merchant_id=?", [merchantId]);
      await expect(prepare()).rejects.toMatchObject({ message: "PAGE_EXISTS" });
    });
    it("rechecks the page limit inside the save transaction", async () => {
      const p = await prepare();
      for (let i = 0; i < 50; i++)
        await q("INSERT INTO discovered_pages(merchant_id,url) VALUES(?,?)", [
          merchantId,
          `https://example.test/${i}`,
        ]);
      await expect(save(p.previewId)).rejects.toMatchObject({
        message: "PAGE_LIMIT",
      });
      expect((await readPageIntake(merchantId, p.previewId)).state).toBe(
        "review"
      );
    });
    it("rejects oversized UTF-8 text without truncating it", async () => {
      await expect(
        storePagePreview(merchantId, {
          ...source(),
          content: "word ".repeat(10) + "ع".repeat(32768),
        })
      ).rejects.toThrow();
      expect(
        await q("SELECT id FROM knowledge_page_previews WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
    it("rolls back page, section and receipt together when the final audit insert fails", async () => {
      const p = await prepare(),
        db = (await getDb())!;
      const original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async tx => {
          const insert = tx.insert.bind(tx);
          vi.spyOn(tx, "insert").mockImplementation(((table: any) => {
            if (
              String(table[Symbol.for("drizzle:Name")]) === "sari_activity_log"
            )
              throw Error("Synthetic audit failure");
            return insert(table);
          }) as any);
          return run(tx);
        }, config)) as any);
      await expect(save(p.previewId)).rejects.toThrow(
        "Synthetic audit failure"
      );
      vi.restoreAllMocks();
      expect((await readPageIntake(merchantId, p.previewId)).state).toBe(
        "review"
      );
      expect(
        await q("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
      expect(
        await q("SELECT id FROM knowledge_sections WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
    it("cancels pending previews on reset but preserves consumed receipts", async () => {
      const pending = await prepare(),
        consumed = await prepare();
      await save(consumed.previewId);
      await resetKnowledgeSources(merchantId);
      expect(await readPageIntake(merchantId, pending.previewId)).toEqual({
        state: "not_found",
      });
      expect(await save(consumed.previewId)).toMatchObject({
        state: "deleted",
        replayed: true,
      });
    });
    it("blocks a save while knowledge intake is processing", async () => {
      const p = await prepare();
      await q(
        "INSERT INTO knowledge_intake_receipts(merchant_id,request_id,input_hash,content_type,state) VALUES(?,'12345678-1234-4234-8234-123456789abc',?,'document','processing')",
        [merchantId, "a".repeat(64)]
      );
      await expect(save(p.previewId)).rejects.toMatchObject({
        message: "INTAKE_RUNNING",
      });
      expect((await readPageIntake(merchantId, p.previewId)).state).toBe(
        "review"
      );
    });
    it("invalidates cached answers on a successful save", async () => {
      const p = await prepare();
      await q(
        "INSERT INTO sari_response_cache(merchant_id,question_text,response_text) VALUES(?,'Question','Old answer')",
        [merchantId]
      );
      await save(p.previewId);
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
  }
);
