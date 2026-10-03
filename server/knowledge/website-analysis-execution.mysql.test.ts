import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  beginWebsiteAnalysisJob,
  finishWebsiteAnalysisJob,
} from "./website-analysis-jobs";
import { runWebsiteAnalysisExecution } from "./website-analysis-execution";
import { assertIntakeCheckpoint } from "./intake-execution";
import { withKnowledgeTransaction } from "./transaction";
import {
  createSection,
  getSectionById,
  updateSection,
  storeSectionEmbedding,
  logChange,
} from "../db/knowledge";
import { persistCrawledKnowledge } from "./crawled-snapshot";
import type { WebsiteJobExecution } from "../../shared/website-analysis-job";

describe.skipIf(!process.env.DATABASE_URL)(
  "website execution fences real knowledge writes",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      scope: WebsiteJobExecution;
    const query = async (text: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(text, args))[0];
    const create = () =>
      createSection({
        merchantId: owner.merchantId,
        sectionType: "policies",
        title: "Local",
        content: "Local source",
        source: "website",
        status: "approved",
      });
    const expire = () =>
      query(
        "UPDATE website_analysis_jobs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
        [owner.merchantId]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("website-fence423");
      other = await createDisposableMerchant("website-fence423-other");
      await query("UPDATE merchants SET website_url=? WHERE id=?", [
        "https://example.test",
        owner.merchantId,
      ]);
      scope = (
        await beginWebsiteAnalysisJob(
          owner.userId,
          owner.merchantId,
          randomUUID()
        )
      ).execution!;
    });
    afterEach(() =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("allows current website execution to persist raw knowledge, changelog and embedding writes", async () => {
      await runWebsiteAnalysisExecution(scope, async () => {
        await assertIntakeCheckpoint(owner.merchantId);
        const id = await create();
        await updateSection(id, owner.merchantId, { content: "Current text" });
        const section = (await getSectionById(id, owner.merchantId))!;
        expect(
          await storeSectionEmbedding(
            section,
            owner.merchantId,
            Buffer.alloc(1536 * 4)
          )
        ).toBe(true);
        await logChange({
          merchantId: owner.merchantId,
          sectionId: id,
          action: "add",
          reason: "local",
          newContent: "Current text",
          source: "website",
        });
      });
      expect(
        (
          await query(
            "SELECT content FROM knowledge_sections WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0].content
      ).toBe("Current text");
      expect(
        await query("SELECT id FROM knowledge_changelog WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("rejects a provider checkpoint and every raw write after lease expiry", async () => {
      const id = await create(),
        section = (await getSectionById(id, owner.merchantId))!;
      await expire();
      await runWebsiteAnalysisExecution(scope, async () => {
        await expect(assertIntakeCheckpoint(owner.merchantId)).rejects.toThrow(
          "website_job:expired"
        );
        await expect(create()).rejects.toThrow("website_job:expired");
        await expect(
          updateSection(id, owner.merchantId, { content: "Late" })
        ).rejects.toThrow("website_job:expired");
        await expect(
          storeSectionEmbedding(
            section,
            owner.merchantId,
            Buffer.alloc(1536 * 4)
          )
        ).rejects.toThrow("website_job:expired");
        await expect(
          logChange({
            merchantId: owner.merchantId,
            sectionId: id,
            action: "add",
            reason: "late",
            source: "website",
          })
        ).rejects.toThrow("website_job:expired");
      });
      expect((await getSectionById(id, owner.merchantId))!.content).toBe(
        "Local source"
      );
      expect(
        (
          await query("SELECT embedding FROM knowledge_sections WHERE id=?", [
            id,
          ])
        )[0].embedding
      ).toBeNull();
      expect(
        await query("SELECT id FROM knowledge_changelog WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("applies the same fence to Drizzle transactions used by crawled pages and FAQs", async () => {
      await expire();
      await expect(
        runWebsiteAnalysisExecution(scope, () =>
          persistCrawledKnowledge(owner.merchantId, "https://example.test", {
            faqs: [{ question: "Late?", answer: "Late answer" }],
            _crawledPages: [
              {
                success: true,
                url: "https://example.test/about",
                title: "Late",
                content: "Late facts",
              },
            ],
          })
        )
      ).rejects.toThrow("website_job:expired");
      expect(
        await query("SELECT id FROM extracted_faqs WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(
        await query("SELECT id FROM discovered_pages WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("can persist a current crawl transaction without leaking the job scope afterward", async () => {
      await runWebsiteAnalysisExecution(scope, () =>
        persistCrawledKnowledge(owner.merchantId, "https://example.test", {
          faqs: [{ question: "Current?", answer: "Current answer" }],
          _crawledPages: [],
        })
      );
      expect(
        await query("SELECT id FROM extracted_faqs WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
      await expire();
      await expect(create()).resolves.toBeTypeOf("number");
    });
    it.each(["website", "member", "owner_account"])(
      "rejects Drizzle writes after %s authority changes",
      async change => {
        if (change === "website")
          await query("UPDATE merchants SET website_url=? WHERE id=?", [
            "https://changed.test",
            owner.merchantId,
          ]);
        if (change === "member")
          await query(
            "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
            [owner.merchantId, owner.userId]
          );
        if (change === "owner_account")
          await query(
            "UPDATE users SET account_status='deletion_pending' WHERE id=?",
            [owner.userId]
          );
        await expect(
          runWebsiteAnalysisExecution(scope, () =>
            withKnowledgeTransaction(owner.merchantId, tx =>
              tx.execute(
                sql`UPDATE merchants SET businessName='LATE' WHERE id=${owner.merchantId}`
              )
            )
          )
        ).rejects.toThrow("website_job:");
        expect(
          (
            await query("SELECT businessName FROM merchants WHERE id=?", [
              owner.merchantId,
            ])
          )[0].businessName
        ).not.toBe("LATE");
      }
    );
    it("cannot use a valid website job to write knowledge for a different tenant", async () => {
      await runWebsiteAnalysisExecution(scope, async () => {
        await expect(assertIntakeCheckpoint(other.merchantId)).rejects.toThrow(
          "website_job:forbidden"
        );
        await expect(
          createSection({
            merchantId: other.merchantId,
            sectionType: "policies",
            title: "Foreign",
            content: "Forbidden",
            source: "website",
          })
        ).rejects.toThrow("website_job:forbidden");
        await expect(
          withKnowledgeTransaction(other.merchantId, async () => undefined)
        ).rejects.toThrow("website_job:forbidden");
      });
    });
  }
);
