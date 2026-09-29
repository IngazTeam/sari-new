import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  assertDisposableDatabase,
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  storeImportReview,
  readImportReview,
  refreshImportReview,
  applyReviewedImport,
} from "./website-import";
import { resetKnowledgeSources } from "./source-lifecycle";
import type { ImportReview, ImportChoices } from "../../shared/website-import";
describe.skipIf(!process.env.DATABASE_URL)(
  "saved website import (MySQL)",
  () => {
    const users: number[] = [];
    let merchantId: number;
    const q = async (s: string, v: unknown[] = []) =>
      (await (await getPool())!.execute<any>(s, v))[0];
    const proposal = () => ({
      websiteUrl: "https://import.example.test",
      platform: "custom",
      productsAction: "skip",
      products: [{ name: "Imported", price: 0, productUrl: "/item" }],
      faqsAction: "skip",
      faqs: [
        { question: "Returns?", answer: "Thirty days <script>inert</script>" },
      ],
      pagesAction: "skip",
      pages: [
        {
          pageType: "about",
          title: "About",
          url: "https://import.example.test/about",
          content:
            "Full website text that remains unchanged during the review and save.",
        },
      ],
      applyContactInfo: false,
      contactInfo: { phones: ["5550001"], address: "Reviewed address" },
    });
    const choices: ImportChoices = {
      productsAction: "merge",
      pagesAction: "merge",
      faqsAction: "merge",
      applyContactInfo: true,
    };
    const make = async () => {
      const r = await storeImportReview(merchantId, proposal());
      if (r.state !== "review") throw Error("Expected review");
      return r.review;
    };
    const input = (r: ImportReview, c = choices) => ({
      previewId: r.previewId,
      expectedRevision: r.revision,
      choices: c,
      acknowledged: true,
    });
    beforeAll(async () => {
      assertDisposableDatabase();
      await (await getPool())!.query(
        await readFile("drizzle/0164_website_import_reviews.sql", "utf8")
      );
    });
    beforeEach(async () => {
      const m = await createDisposableMerchant("web-import");
      users.push(m.userId);
      merchantId = m.merchantId;
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users.splice(0));
    });
    afterAll(closeDb);
    it("stores a full review without changing active data or contacts", async () => {
      const r = await make();
      expect(r.proposal.pages[0].content).toContain("remains unchanged");
      expect(r.proposal.products[0].price).toBe(0);
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [merchantId])
      ).toEqual([]);
      expect(
        (await q("SELECT phone FROM merchants WHERE id=?", [merchantId]))[0]
          .phone
      ).not.toBe("5550001");
      expect(await readImportReview(merchantId, r.previewId)).toEqual({
        state: "review",
        review: r,
      });
    });
    it("applies the exact saved source and records one receipt and audit for simultaneous retries", async () => {
      const r = await make();
      const results = await Promise.all([
        applyReviewedImport(merchantId, input(r)),
        applyReviewedImport(merchantId, input(r)),
      ]);
      expect(results.map(v => v.state)).toEqual(["applied", "applied"]);
      expect(
        await q(
          "SELECT name,price,price_unit FROM products WHERE merchantId=?",
          [merchantId]
        )
      ).toEqual([{ name: "Imported", price: 0, price_unit: "minor" }]);
      expect(
        (
          await q("SELECT content FROM discovered_pages WHERE merchant_id=?", [
            merchantId,
          ])
        )[0].content
      ).toBe(r.proposal.pages[0].content);
      expect(
        await q(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='website_import_apply'",
          [merchantId]
        )
      ).toHaveLength(1);
    });
    it("rejects client-supplied replacement content and absent acknowledgement", async () => {
      const r = await make();
      await expect(
        applyReviewedImport(merchantId, {
          ...input(r),
          products: [{ name: "Injected", price: 1 }],
        })
      ).rejects.toThrow();
      await expect(
        applyReviewedImport(merchantId, { ...input(r), acknowledged: false })
      ).rejects.toThrow();
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [merchantId])
      ).toHaveLength(0);
    });
    it("isolates another tenant during reads, refresh and writes", async () => {
      const r = await make(),
        other = await createDisposableMerchant("web-import-other");
      users.push(other.userId);
      expect(await readImportReview(other.merchantId, r.previewId)).toEqual({
        state: "not_found",
      });
      expect(await refreshImportReview(other.merchantId, r.previewId)).toEqual({
        state: "not_found",
      });
      await expect(
        applyReviewedImport(other.merchantId, input(r))
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it.each(["phone", "address"])(
      "rejects stale %s and allows only a refreshed version",
      async field => {
        const r = await make();
        await q(`UPDATE merchants SET ${field}='Changed' WHERE id=?`, [
          merchantId,
        ]);
        await expect(
          applyReviewedImport(merchantId, input(r))
        ).rejects.toMatchObject({ code: "CONFLICT" });
        const next = await refreshImportReview(merchantId, r.previewId);
        expect(next.state).toBe("review");
        if (next.state !== "review") return;
        expect(next.review.revision).not.toBe(r.revision);
        await expect(
          applyReviewedImport(merchantId, input(r))
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect(
          (await applyReviewedImport(merchantId, input(next.review))).state
        ).toBe("applied");
      }
    );
    it("detects a new current product before any import writes", async () => {
      const r = await make();
      await q(
        "INSERT INTO products(merchantId,name,price) VALUES(?,'New product',100)",
        [merchantId]
      );
      await expect(
        applyReviewedImport(merchantId, input(r))
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(
        await q("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          merchantId,
        ])
      ).toHaveLength(0);
    });
    it("does not replay an applied import after deletion/reset", async () => {
      const r = await make();
      await applyReviewedImport(merchantId, input(r));
      await resetKnowledgeSources(merchantId);
      expect((await readImportReview(merchantId, r.previewId)).state).toBe(
        "changed"
      );
      expect((await applyReviewedImport(merchantId, input(r))).state).toBe(
        "changed"
      );
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [merchantId])
      ).toHaveLength(0);
    });
    it("cancels unconsumed previews during reset", async () => {
      const r = await make();
      await resetKnowledgeSources(merchantId);
      expect(await readImportReview(merchantId, r.previewId)).toEqual({
        state: "not_found",
      });
    });
    it("requires the original choices when recovering an applied import", async () => {
      const r = await make();
      await applyReviewedImport(merchantId, input(r));
      await expect(
        applyReviewedImport(
          merchantId,
          input(r, { ...choices, productsAction: "replace" })
        )
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
    it("expires unconsumed previews without losing already committed receipts", async () => {
      const r = await make();
      await q(
        "UPDATE website_import_reviews SET expires_at='2020-01-01' WHERE preview_id=?",
        [r.previewId]
      );
      expect(await readImportReview(merchantId, r.previewId)).toEqual({
        state: "expired",
      });
      await expect(
        applyReviewedImport(merchantId, input(r))
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      const next = await make();
      await applyReviewedImport(merchantId, input(next));
      await q(
        "UPDATE website_import_reviews SET expires_at='2020-01-01' WHERE preview_id=?",
        [next.previewId]
      );
      expect((await readImportReview(merchantId, next.previewId)).state).toBe(
        "applied"
      );
    });
    it("limits pending previews and rejects unsafe links before storing", async () => {
      for (let i = 0; i < 5; i++) await make();
      await expect(make()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      await expect(
        storeImportReview(merchantId, {
          ...proposal(),
          products: [
            { name: "Unsafe", price: 1, productUrl: "javascript:alert(1)" },
          ],
        })
      ).rejects.toThrow();
    });
    it("rolls back all changes if the audit write fails", async () => {
      const r = await make(),
        trigger = "import_fail_" + randomUUID().replaceAll("-", "");
      await (await getPool())!.query(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON sari_activity_log FOR EACH ROW BEGIN IF NEW.merchant_id=${merchantId} AND NEW.action_type='website_import_apply' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test audit failure'; END IF; END`
      );
      try {
        await expect(
          applyReviewedImport(merchantId, input(r))
        ).rejects.toThrow();
        expect(
          await q("SELECT id FROM products WHERE merchantId=?", [merchantId])
        ).toHaveLength(0);
        expect((await readImportReview(merchantId, r.previewId)).state).toBe(
          "review"
        );
      } finally {
        await (await getPool())!.query(`DROP TRIGGER ${trigger}`);
      }
    });
    it.each([
      "https://import.example.test/about",
      "https://import.example.test",
    ])(
      "pauses page and aggregate roots at %s on replacement, keeping full text",
      async sourceUrl => {
        await q(
          "INSERT INTO discovered_pages(merchant_id,page_type,url,title,content) VALUES(?,'about','https://import.example.test/about','Old','Old source')",
          [merchantId]
        );
        await q(
          "INSERT INTO knowledge_sections(merchant_id,title,content,source,source_url,section_type,status,use_in_bot) VALUES(?,'Old section','Previous full source','website',?,'custom','approved',1)",
          [merchantId, sourceUrl]
        );
        const r = await make();
        const saved = await applyReviewedImport(
          merchantId,
          input(r, { ...choices, pagesAction: "replace" })
        );
        expect(saved).toMatchObject({
          state: "applied",
          receipt: { pausedSections: 1 },
        });
        expect(
          await q(
            "SELECT content,use_in_bot FROM knowledge_sections WHERE merchant_id=?",
            [merchantId]
          )
        ).toEqual([{ content: "Previous full source", use_in_bot: 0 }]);
      }
    );
    it("enforces page capacity atomically", async () => {
      for (let i = 0; i < 50; i++)
        await q(
          "INSERT INTO discovered_pages(merchant_id,page_type,url) VALUES(?,'other',?)",
          [merchantId, `https://old.example.test/${i}`]
        );
      const r = await make();
      await expect(
        applyReviewedImport(merchantId, input(r))
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(
        await q("SELECT id FROM products WHERE merchantId=?", [merchantId])
      ).toHaveLength(0);
    });
  }
);
