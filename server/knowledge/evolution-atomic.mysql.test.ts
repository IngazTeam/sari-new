import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const model = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../ai/openai", () => ({ callGPT4: model.call }));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { createSection } from "../db/knowledge";
import {
  evolveKnowledge,
  ingestContent,
  type ClassifiedSection,
} from "../ai/knowledge-engine";
import * as acknowledgements from "./storage-acknowledgement";
import {
  commitEvolution,
  readEvolutionSnapshot,
  type EvolutionOperation,
} from "./evolution-storage";
import { randomUUID } from "node:crypto";
import { reserveIntake } from "./intake-receipt-store";
import { runIntakeExecution } from "./intake-execution";
import { reviewedKnowledgeInput } from "../tests/helpers/knowledge-reviewed-input";
import { beginWebsiteAnalysisJob } from "./website-analysis-jobs";
import { runWebsiteAnalysisExecution } from "./website-analysis-execution";

const parent: ClassifiedSection = {
  sectionType: "services",
  title: "Services",
  content: "Local business offers standard services",
  summary: "Services",
  confidence: 0.9,
};
const child: ClassifiedSection = {
  sectionType: "policies",
  title: "Delivery",
  content: "Delivery requires an appointment",
  summary: "Delivery",
  confidence: 0.9,
};
const changed = {
  ...parent,
  content: parent.content + " with written confirmation",
};
const sales = {
  usps: ["Local service"],
  sellingTips: ["Ask about the need"],
  opportunities: ["Check delivery details"],
};

describe.skipIf(!process.env.DATABASE_URL)(
  "atomic knowledge evolution on local MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const q = async (sql: string, args: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, args))[0];
    const rows = () =>
      q(
        "SELECT id,parent_id,section_type,title,content,merchant_edited,use_in_bot,inject_as FROM knowledge_sections WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const logs = () =>
      q(
        "SELECT section_id,action,old_content,new_content FROM knowledge_changelog WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const seed = (value = parent, extra = {}) =>
      createSection({
        merchantId: owner.merchantId,
        ...value,
        source: "document",
        ...extra,
      });
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("atomic479");
      other = await createDisposableMerchant("atomic479-other");
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);

    it("leaves no earlier section or changelog when a later model decision fails", async () => {
      await seed();
      const before = await rows();
      model.call.mockRejectedValue(new Error("synthetic provider failure"));
      await expect(
        evolveKnowledge(owner.merchantId, [child, changed], "document")
      ).rejects.toMatchObject({ stage: "evolution" });
      expect(await rows()).toEqual(before);
      expect(await logs()).toEqual([]);
    });
    it.each([
      "manual edit",
      "new section",
      "deleted section",
      "disable",
      "provenance",
    ])("rejects a stale plan after %s during analysis", async kind => {
      const id = await seed();
      model.call.mockImplementationOnce(async () => {
        if (kind === "manual edit")
          await q(
            "UPDATE knowledge_sections SET content=?,merchant_edited=1 WHERE id=?",
            ["Merchant correction", id]
          );
        if (kind === "new section") await seed(child);
        if (kind === "deleted section")
          await q("DELETE FROM knowledge_sections WHERE id=?", [id]);
        if (kind === "disable")
          await q("UPDATE knowledge_sections SET use_in_bot=0 WHERE id=?", [
            id,
          ]);
        if (kind === "provenance")
          await q("UPDATE knowledge_sections SET provenance=? WHERE id=?", [
            JSON.stringify({ revised: true }),
            id,
          ]);
        return "evolve";
      });
      await expect(
        evolveKnowledge(owner.merchantId, [changed], "document")
      ).rejects.toMatchObject({
        message: "knowledge_evolution:stale_snapshot",
      });
      const current = await rows();
      expect(current.some((r: any) => r.content === changed.content)).toBe(
        false
      );
      if (kind === "manual edit")
        expect(current[0]).toMatchObject({
          content: "Merchant correction",
          merchant_edited: 1,
        });
      expect(await logs()).toEqual([]);
    });
    it.each([2, 5, 8])(
      "rolls back every section and log after failed write acknowledgement %s",
      async failAt => {
        model.call
          .mockResolvedValueOnce(
            JSON.stringify([{ ...parent, children: [child] }])
          )
          .mockResolvedValueOnce(JSON.stringify(sales));
        const original = acknowledgements.verifiedKnowledgeInsert;
        let writes = 0;
        vi.spyOn(
          acknowledgements,
          "verifiedKnowledgeInsert"
        ).mockImplementation(value => {
          if (++writes === failAt)
            throw new Error("synthetic unconfirmed insert");
          return original(value);
        });
        await expect(
          ingestContent(owner.merchantId, "Source evidence", "document", {})
        ).rejects.toThrow("synthetic unconfirmed insert");
        expect(await rows()).toEqual([]);
        expect(await logs()).toEqual([]);
      }
    );
    it("commits the hierarchy, sales and audit with real parent identities", async () => {
      model.call
        .mockResolvedValueOnce(
          JSON.stringify([{ ...parent, children: [child] }])
        )
        .mockResolvedValueOnce(JSON.stringify(sales));
      expect(
        (
          await ingestContent(
            owner.merchantId,
            "Source evidence",
            "document",
            {}
          )
        ).evolveResult
      ).toMatchObject({ added: 2 });
      const current = await rows(),
        audit = await logs();
      expect(current).toHaveLength(4);
      expect(audit).toHaveLength(4);
      expect(current[1]).toMatchObject({
        parent_id: current[0].id,
        section_type: "policies",
      });
      expect(current[2]).toMatchObject({
        section_type: "sales_intel",
        inject_as: "behavior",
      });
      expect(current[3]).toMatchObject({
        section_type: "opportunities",
        use_in_bot: 0,
        inject_as: "none",
      });
      expect(audit.map((r: any) => r.section_id)).toEqual(
        current.map((r: any) => r.id)
      );
      expect(
        await q("SELECT id FROM knowledge_sections WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toEqual([]);
    });
    it("allows an embedding-only publication during analysis and invalidates that obsolete embedding on evolution", async () => {
      const id = await seed();
      model.call.mockImplementationOnce(async () => {
        await q(
          "UPDATE knowledge_sections SET embedding=?,embedding_content_hash=? WHERE id=?",
          [Buffer.from("old vector"), "a".repeat(64), id]
        );
        return "evolve";
      });
      expect(
        (await evolveKnowledge(owner.merchantId, [changed], "document")).evolved
      ).toBe(1);
      expect(
        (
          await q(
            "SELECT embedding,embedding_content_hash FROM knowledge_sections WHERE id=?",
            [id]
          )
        )[0]
      ).toMatchObject({ embedding: null, embedding_content_hash: null });
    });
    it("rolls back an earlier update and audit when saving later sales intelligence fails", async () => {
      await seed();
      const before = await rows();
      model.call
        .mockResolvedValueOnce(JSON.stringify([changed]))
        .mockResolvedValueOnce(JSON.stringify(sales))
        .mockResolvedValueOnce("evolve");
      const original = acknowledgements.verifiedKnowledgeInsert;
      let inserts = 0;
      vi.spyOn(acknowledgements, "verifiedKnowledgeInsert").mockImplementation(
        value => {
          if (++inserts === 3) throw new Error("synthetic sales audit failure");
          return original(value);
        }
      );
      await expect(
        ingestContent(owner.merchantId, "Source evidence", "document", {})
      ).rejects.toThrow("synthetic sales audit failure");
      expect(await rows()).toEqual(before);
      expect(await logs()).toEqual([]);
    });
    it("updates a generated sibling identity in the same plan without creating a duplicate", async () => {
      model.call.mockResolvedValueOnce("evolve");
      expect(
        await evolveKnowledge(owner.merchantId, [parent, changed], "document")
      ).toMatchObject({ added: 1, evolved: 1 });
      const current = await rows(),
        audit = await logs();
      expect(current).toHaveLength(1);
      expect(current[0].content).toBe(changed.content);
      expect(audit).toHaveLength(2);
      expect(audit.every((r: any) => r.section_id === current[0].id)).toBe(
        true
      );
    });
    it("does not replace merchant-edited sales intelligence or a same-type child", async () => {
      const parentId = await seed();
      const intel = {
        ...child,
        sectionType: "sales_intel" as const,
        content: "Merchant sales guidance",
      };
      const childId = await seed(intel, { parentId });
      const rootId = await seed(intel, { merchantEdited: true });
      const before = await rows();
      model.call
        .mockResolvedValueOnce(JSON.stringify([parent]))
        .mockResolvedValueOnce(JSON.stringify(sales));
      await ingestContent(owner.merchantId, "Source evidence", "document", {});
      const current = await rows();
      for (const id of [childId, rootId])
        expect(current.find((r: any) => r.id === id)).toEqual(
          before.find((r: any) => r.id === id)
        );
      expect(
        current.filter((r: any) => r.section_type === "sales_intel")
      ).toHaveLength(2);
    });
    it.each(["update", "parent"] as const)(
      "rejects a foreign %s reference and rolls back preceding operations",
      async kind => {
        const foreign = await createSection({
          merchantId: other.merchantId,
          ...parent,
          source: "document",
        });
        const snapshot = await readEvolutionSnapshot(owner.merchantId);
        const add: EvolutionOperation = {
          kind: "create",
          temporaryId: -1,
          values: { ...child, source: "document" },
          audit: {
            action: "add",
            reason: "Test",
            newContent: child.content,
            source: "document",
          },
        };
        const invalid: EvolutionOperation =
          kind === "update"
            ? {
                kind: "update",
                id: foreign,
                values: { content: "Foreign write" },
                audit: { ...add.audit, action: "evolve" },
              }
            : {
                ...add,
                temporaryId: -2,
                values: { ...add.values, parentId: foreign },
              };
        await expect(commitEvolution(snapshot, [add, invalid])).rejects.toThrow(
          "knowledge_evolution:invalid_reference"
        );
        expect(await rows()).toEqual([]);
        expect(await logs()).toEqual([]);
        expect(
          (
            await q("SELECT content FROM knowledge_sections WHERE id=?", [
              foreign,
            ])
          )[0].content
        ).toBe(parent.content);
      }
    );
    it("allows exactly one concurrent commit from the same snapshot", async () => {
      const snapshot = await readEvolutionSnapshot(owner.merchantId);
      const operations: EvolutionOperation[] = [
        {
          kind: "create",
          temporaryId: -1,
          values: { ...parent, source: "document" },
          audit: {
            action: "add",
            reason: "Test",
            newContent: parent.content,
            source: "document",
          },
        },
      ];
      const settled = await Promise.allSettled([
        commitEvolution(snapshot, operations),
        commitEvolution(snapshot, operations),
      ]);
      expect(
        settled.filter(result => result.status === "fulfilled")
      ).toHaveLength(1);
      expect(
        settled.filter(result => result.status === "rejected")
      ).toHaveLength(1);
      expect(await rows()).toHaveLength(1);
      expect(await logs()).toHaveLength(1);
    });
    it.each(["intake", "website"] as const)(
      "rejects an expired %s execution at the final commit fence",
      async kind => {
        const snapshot = await readEvolutionSnapshot(owner.merchantId);
        const commit = () =>
          commitEvolution(snapshot, [
            {
              kind: "create",
              temporaryId: -1,
              values: { ...parent, source: "document" },
              audit: {
                action: "add",
                reason: "Test",
                newContent: parent.content,
                source: "document",
              },
            },
          ]);
        if (kind === "intake") {
          const receipt = await reserveIntake(
            owner.merchantId,
            await reviewedKnowledgeInput(owner.merchantId, {
              requestId: randomUUID(),
              content: "Local knowledge input for expiry testing",
              contentType: "document",
            })
          );
          await q(
            "UPDATE knowledge_intake_receipts SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE merchant_id=?",
            [owner.merchantId]
          );
          await expect(
            runIntakeExecution(receipt.execution!, commit)
          ).rejects.toMatchObject({ name: "IntakeExecutionExpired" });
        } else {
          await q("UPDATE merchants SET website_url=? WHERE id=?", [
            "https://example.test",
            owner.merchantId,
          ]);
          const job = await beginWebsiteAnalysisJob(
            owner.userId,
            owner.merchantId,
            randomUUID()
          );
          await q(
            "UPDATE website_analysis_jobs SET lease_expires_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE merchant_id=?",
            [owner.merchantId]
          );
          await expect(
            runWebsiteAnalysisExecution(job.execution!, commit)
          ).rejects.toThrow("website_job:expired");
        }
        expect(await rows()).toEqual([]);
        expect(await logs()).toEqual([]);
      }
    );
    it("invalidates cached answers only when the whole evolution commits", async () => {
      await q(
        "INSERT INTO sari_response_cache (merchant_id,question_text,response_text) VALUES (?,'Q','Old answer')",
        [owner.merchantId]
      );
      const original = acknowledgements.verifiedKnowledgeInsert;
      const fault = vi
        .spyOn(acknowledgements, "verifiedKnowledgeInsert")
        .mockImplementation(() => {
          throw new Error("synthetic insert failure");
        });
      await expect(
        evolveKnowledge(owner.merchantId, [parent], "document")
      ).rejects.toThrow("synthetic insert failure");
      expect(
        await q(
          "SELECT response_text FROM sari_response_cache WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toEqual([{ response_text: "Old answer" }]);
      fault.mockImplementation(original);
      await evolveKnowledge(owner.merchantId, [parent], "document");
      expect(
        await q("SELECT id FROM sari_response_cache WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toEqual([]);
    });
  }
);
