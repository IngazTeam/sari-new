import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "../tests/helpers/disposable-merchant";
import {
  readConflictReview,
  listConflictWorkspace,
  decideKnowledgeConflict,
} from "./conflict-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed knowledge decisions",
  () => {
    const users: number[] = [];
    let merchantId: number;
    const q = async (sql: string, args: unknown[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    beforeEach(async () => {
      const m = await createDisposableMerchant("conflict-review");
      users.push(m.userId);
      merchantId = m.merchantId;
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    async function section(pending = false, m = merchantId) {
      return (
        await q(
          "INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source,status,use_in_bot,inject_as) VALUES (?,'policies',?,?,'manual',?,?,'fact')",
          [
            m,
            pending ? "Proposed policy" : "Current policy",
            pending ? "Return within ten days" : "Return within seven days",
            pending ? "pending_review" : "approved",
            pending ? 0 : 1,
          ]
        )
      ).insertId as number;
    }
    async function fixture(linked = true) {
      const target = await section(),
        proposal = await section(true),
        requestId = randomUUID(),
        reviewId = randomUUID();
      if (linked) {
        const doc = await q(
          "INSERT INTO merchant_knowledge_docs (merchant_id,file_name,file_type,file_size,extraction_status) VALUES (?,'Synthetic.txt','text',20,'completed')",
          [merchantId]
        );
        const plan = {
          version: 1,
          items: [
            {
              action: "conflict",
              targetId: target,
              parentIndex: null,
              sectionType: "policies",
              title: "Proposed policy",
              content: "Return within ten days",
              summary: "",
              reason: "Changed return policy",
              before: {
                title: "Current policy",
                content: "Return within seven days",
                summary: null,
              },
              status: "pending_review",
              useInBot: false,
              injectAs: "fact",
            },
          ],
        };
        await q(
          "INSERT INTO knowledge_intake_receipts (merchant_id,request_id,input_hash,review_id,review_snapshot,section_links,document_id,content_type,state) VALUES (?,?,?,?,?,?,?,'custom','completed')",
          [
            merchantId,
            requestId,
            "a".repeat(64),
            reviewId,
            JSON.stringify({ id: reviewId, plan }),
            JSON.stringify({
              version: 1,
              items: [
                {
                  planIndex: 0,
                  sectionId: proposal,
                  contentHash: "a".repeat(64),
                  settingsHash: "b".repeat(64),
                },
              ],
            }),
            doc.insertId,
          ]
        );
        await q("UPDATE knowledge_sections SET provenance=? WHERE id=?", [
          JSON.stringify({ requestId, reviewId, documentId: doc.insertId }),
          proposal,
        ]);
      }
      await q(
        "INSERT INTO knowledge_changelog (merchant_id,section_id,action,old_content,new_content,reason) VALUES (?,?,'conflict','Return within seven days','Return within ten days','Changed return policy')",
        [merchantId, proposal]
      );
      return { target, proposal, requestId };
    }
    const decide = async (
      proposal: number,
      action: "approve" | "reject" = "approve"
    ) => {
      const review = await readConflictReview(merchantId, proposal);
      return decideKnowledgeConflict(merchantId, {
        sectionId: proposal,
        action,
        expectedRevision: review.revision,
        acknowledged: true,
      });
    };
    it("replaces only the proven linked current record and retains both texts", async () => {
      const f = await fixture();
      const other = await section();
      const review = await readConflictReview(merchantId, f.proposal);
      expect(review).toMatchObject({
        link: "verified",
        canApprove: true,
        current: { id: f.target },
      });
      await decide(f.proposal);
      expect(
        await q(
          "SELECT id,use_in_bot,status FROM knowledge_sections WHERE merchant_id=? ORDER BY id",
          [merchantId]
        )
      ).toEqual([
        { id: f.target, use_in_bot: 0, status: "approved" },
        { id: f.proposal, use_in_bot: 1, status: "approved" },
        { id: other, use_in_bot: 1, status: "approved" },
      ]);
      expect(
        await q("SELECT resolved FROM knowledge_changelog WHERE section_id=?", [
          f.proposal,
        ])
      ).toEqual([{ resolved: 1 }]);
      expect((await listConflictWorkspace(merchantId, 1)).total).toBe(0);
    });
    it("closes a rejected proposal without deleting it or disabling the current record", async () => {
      const f = await fixture();
      await decide(f.proposal, "reject");
      expect(
        await q(
          "SELECT id,use_in_bot FROM knowledge_sections WHERE merchant_id=? ORDER BY id",
          [merchantId]
        )
      ).toEqual([
        { id: f.target, use_in_bot: 1 },
        { id: f.proposal, use_in_bot: 0 },
      ]);
      expect(
        await q(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='conflict_reviewed'",
          [merchantId]
        )
      ).toHaveLength(1);
    });
    it.each(["proposed", "current", "evidence", "source"])(
      "rejects a decision after %s changes",
      async kind => {
        const f = await fixture();
        const review = await readConflictReview(merchantId, f.proposal);
        if (kind === "proposed" || kind === "current")
          await q("UPDATE knowledge_sections SET content=? WHERE id=?", [
            "New text",
            kind === "proposed" ? f.proposal : f.target,
          ]);
        else if (kind === "evidence")
          await q(
            "UPDATE knowledge_changelog SET reason=? WHERE section_id=?",
            ["New reason", f.proposal]
          );
        else
          await q(
            "UPDATE knowledge_intake_receipts SET section_links=NULL WHERE request_id=?",
            [f.requestId]
          );
        await expect(
          decideKnowledgeConflict(merchantId, {
            sectionId: f.proposal,
            action: "approve",
            expectedRevision: review.revision,
            acknowledged: true,
          })
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect(
          await q("SELECT use_in_bot FROM knowledge_sections WHERE id=?", [
            f.target,
          ])
        ).toEqual([{ use_in_bot: 1 }]);
      }
    );
    it("accepts only one of two simultaneous decisions and records one event", async () => {
      const f = await fixture(),
        r = await readConflictReview(merchantId, f.proposal);
      const result = await Promise.allSettled(
        ["approve", "reject"].map(action =>
          decideKnowledgeConflict(merchantId, {
            sectionId: f.proposal,
            action,
            expectedRevision: r.revision,
            acknowledged: true,
          })
        )
      );
      expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(
        await q(
          "SELECT id FROM sari_activity_log WHERE merchant_id=? AND action_type='conflict_reviewed'",
          [merchantId]
        )
      ).toHaveLength(1);
    });
    it("does not infer an old record from matching text on an unlinked proposal", async () => {
      const f = await fixture(false);
      expect((await readConflictReview(merchantId, f.proposal)).link).toBe(
        "unlinked"
      );
      expect((await decide(f.proposal)).replacedSectionId).toBeNull();
      expect(
        await q("SELECT use_in_bot FROM knowledge_sections WHERE id=?", [
          f.target,
        ])
      ).toEqual([{ use_in_bot: 1 }]);
    });
    it("blocks incomplete source linkage but still allows closing without activation", async () => {
      const f = await fixture();
      await q(
        "UPDATE knowledge_intake_receipts SET section_links=NULL WHERE request_id=?",
        [f.requestId]
      );
      expect(await readConflictReview(merchantId, f.proposal)).toMatchObject({
        link: "unavailable",
        canApprove: false,
      });
      await expect(decide(f.proposal)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
      await decide(f.proposal, "reject");
    });
    it("scopes reads and decisions to the authenticated merchant even with another revision", async () => {
      const f = await fixture(),
        r = await readConflictReview(merchantId, f.proposal),
        other = await createDisposableMerchant("foreign-review");
      users.push(other.userId);
      expect((await listConflictWorkspace(other.merchantId, 1)).total).toBe(0);
      await expect(
        readConflictReview(other.merchantId, f.proposal)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        decideKnowledgeConflict(other.merchantId, {
          sectionId: f.proposal,
          action: "approve",
          expectedRevision: r.revision,
          acknowledged: true,
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
    it("never exposes or disables a foreign target referenced by corrupted source metadata", async () => {
      const f = await fixture(),
        other = await createDisposableMerchant("foreign-target");
      users.push(other.userId);
      const foreign = await section(false, other.merchantId);
      await q(
        "UPDATE knowledge_intake_receipts SET review_snapshot=JSON_SET(review_snapshot,'$.plan.items[0].targetId',?) WHERE request_id=?",
        [foreign, f.requestId]
      );
      expect(await readConflictReview(merchantId, f.proposal)).toMatchObject({
        link: "unavailable",
        current: null,
        canApprove: false,
      });
      await expect(decide(f.proposal)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });
    it.each([
      "expired",
      "none",
      "parent",
      "null-injection",
      "unapproved-parent",
      "replacement-parent",
    ])("does not activate a proposal with %s eligibility", async kind => {
      const f = await fixture();
      if (kind === "expired")
        await q(
          "UPDATE knowledge_sections SET valid_until='2020-01-01' WHERE id=?",
          [f.proposal]
        );
      if (kind === "none")
        await q("UPDATE knowledge_sections SET inject_as='none' WHERE id=?", [
          f.proposal,
        ]);
      if (kind === "null-injection")
        await q("UPDATE knowledge_sections SET inject_as=NULL WHERE id=?", [
          f.proposal,
        ]);
      if (kind === "unapproved-parent") {
        const parent = await section();
        await q("UPDATE knowledge_sections SET status=NULL WHERE id=?", [
          parent,
        ]);
        await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
          parent,
          f.proposal,
        ]);
      }
      if (kind === "parent") {
        const parent = await section(true);
        await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
          parent,
          f.proposal,
        ]);
      }
      if (kind === "replacement-parent")
        await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
          f.target,
          f.proposal,
        ]);
      expect(
        (await readConflictReview(merchantId, f.proposal)).canApprove
      ).toBe(false);
      await expect(decide(f.proposal)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });
    it("keeps indexing-only changes out of the decision version", async () => {
      const f = await fixture(),
        r = await readConflictReview(merchantId, f.proposal);
      await q(
        "UPDATE knowledge_sections SET embedding_content_hash=? WHERE id=?",
        ["c".repeat(64), f.proposal]
      );
      expect((await readConflictReview(merchantId, f.proposal)).revision).toBe(
        r.revision
      );
    });
    it.each(["approve", "reject"])(
      "invalidates cached responses and durable sessions atomically on %s",
      async action => {
        const f = await fixture();
        const conv = await q(
          "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000018')",
          [merchantId]
        );
        await q(
          "INSERT INTO session_contexts (merchant_id,conversation_id,session_key,context_json,expires_at,version) VALUES (?,?,?,'{}',TIMESTAMPADD(HOUR,1,UTC_TIMESTAMP()),1)",
          [merchantId, conv.insertId, `${merchantId}:${conv.insertId}`]
        );
        await q(
          "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Question','Old response')",
          [merchantId]
        );
        await decide(f.proposal, action as "approve" | "reject");
        expect(
          await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
            merchantId,
          ])
        ).toEqual([]);
        expect(
          await q(
            "SELECT context_json,version FROM session_contexts WHERE merchant_id=?",
            [merchantId]
          )
        ).toEqual([{ context_json: "null", version: 2 }]);
      }
    );
    it("lists proposals after the fifth and clamps pagination", async () => {
      for (let i = 0; i < 10; i++) await section(true);
      expect(await listConflictWorkspace(merchantId, 999)).toMatchObject({
        total: 10,
        page: 2,
        totalPages: 2,
      });
      expect((await listConflictWorkspace(merchantId, 2)).items).toHaveLength(
        2
      );
    });
    it("can approve a source-linked addition after its parent is enabled without retiring the parent", async () => {
      const f = await fixture();
      await q(
        "UPDATE knowledge_intake_receipts SET review_snapshot=JSON_SET(review_snapshot,'$.plan.items[0].action','add','$.plan.items[0].targetId',NULL) WHERE request_id=?",
        [f.requestId]
      );
      await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
        f.target,
        f.proposal,
      ]);
      expect(await readConflictReview(merchantId, f.proposal)).toMatchObject({
        link: "unlinked",
        canApprove: true,
        current: null,
      });
      await decide(f.proposal);
      expect(
        await q("SELECT use_in_bot FROM knowledge_sections WHERE id=?", [
          f.target,
        ])
      ).toEqual([{ use_in_bot: 1 }]);
    });
    it("fails closed on an incomplete or duplicated source mapping", async () => {
      const f = await fixture();
      await q(
        "UPDATE knowledge_intake_receipts SET section_links=JSON_SET(section_links,'$.items[0].planIndex',1) WHERE request_id=?",
        [f.requestId]
      );
      expect(await readConflictReview(merchantId, f.proposal)).toMatchObject({
        link: "unavailable",
        canApprove: false,
        current: null,
      });
      await expect(decide(f.proposal)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    });
    it("requires explicit acknowledgement and a reviewed version before a mutation", async () => {
      const f = await fixture();
      await expect(
        decideKnowledgeConflict(merchantId, {
          sectionId: f.proposal,
          action: "approve",
        })
      ).rejects.toThrow();
      expect((await listConflictWorkspace(merchantId, 1)).total).toBe(1);
    });
  }
);
