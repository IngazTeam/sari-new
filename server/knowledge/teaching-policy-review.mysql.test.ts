import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const mocks = vi.hoisted(() => ({ understand: vi.fn() }));
vi.mock("../ai/teaching-policy-understanding", async original => ({
  ...(await original<typeof import("../ai/teaching-policy-understanding")>()),
  understandTeachingPolicy: mocks.understand,
}));
import { closeDb, getDb, getPool } from "../db/connection";
import { sariActivityLog, knowledgeSections } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { ensureTeachingDialogueSchema } from "../tests/helpers/teaching-dialogue-schema";
import {
  createTeachingFixture,
  dialogueQuery as q,
} from "../tests/helpers/teaching-dialogue-fixture";
import { cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import {
  analyzeTeachingPolicy,
  teachingPolicyContext,
} from "./teaching-policy-review";
import {
  readSectionWorkspace,
  changeWorkspaceSection,
} from "./section-workspace";
import {
  readConflictReview,
  decideKnowledgeConflict,
} from "./conflict-workspace";
import { getBotSections } from "../db/knowledge";
import type { TeachingPolicyInput } from "../ai/teaching-policy-understanding";
describe.skipIf(!process.env.DATABASE_URL)(
  "semantic teaching policy review on real MySQL",
  () => {
    let f: Awaited<ReturnType<typeof createTeachingFixture>>, sectionId: number;
    const users: number[] = [];
    beforeAll(ensureTeachingDialogueSchema);
    beforeEach(async () => {
      f = await createTeachingFixture();
      users.push(f.userId);
      await (await f.event("اعتمد سياسة الضمان سنتين ولا يشمل الكسر")).commit();
      sectionId = (await f.sections())[0].id;
      mocks.understand.mockReset();
      mocks.understand.mockImplementation(
        async (_m: number, i: TeachingPolicyInput) => ({
          version: 1,
          basisHash: i.basisHash,
          coherent: true,
          businessKnowledge: true,
          confidence: 0.99,
          reason: "راجع المقارنة",
          comparisons: i.candidates.map(c => ({
            key: c.key,
            relation: "compatible",
            reason: "لا تعارض",
            currentEvidence: "",
            proposedEvidence: "",
          })),
        })
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    const current = async (content = "الضمان سنة") =>
      Number(
        (
          await q(
            "INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source,status,use_in_bot,inject_as) VALUES (?,'policies','سياسة حالية',?,'manual','approved',1,'fact')",
            [f.merchantId, content]
          )
        ).insertId
      );
    const compare = async () => {
      const view = await readConflictReview(f.merchantId, sectionId);
      return analyzeTeachingPolicy(
        f.merchantId,
        sectionId,
        view.teaching!.basisHash!
      );
    };
    const approve = async () => {
      const view = await readConflictReview(f.merchantId, sectionId);
      return decideKnowledgeConflict(f.merchantId, {
        sectionId,
        action: "approve",
        acknowledged: true,
        expectedRevision: view.revision,
      });
    };
    const approvedTeaching = async () => {
      const pending = sectionId,
        event = await f.event("توصيل الطلبات خلال يومين ولا يشمل الجمعة");
      const saved = await event.commit();
      sectionId = saved.sectionId!;
      await compare();
      await approve();
      const id = sectionId;
      sectionId = pending;
      mocks.understand.mockClear();
      return { event, id };
    };
    it.each(["deleted", "text", "turn"])(
      "excludes current teaching with %s evidence from AI comparison and bot retrieval",
      async mode => {
        const old = await approvedTeaching();
        expect(
          (
            await readConflictReview(f.merchantId, sectionId)
          ).teaching?.candidates.map(c => c.key)
        ).toContain(`section:${old.id}`);
        if (mode === "deleted")
          await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
            old.event.execution.id,
          ]);
        if (mode === "text")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','changed fixture') WHERE id=?",
            [old.event.execution.id]
          );
        if (mode === "turn")
          await q(
            "DELETE FROM merchant_teaching_turns WHERE merchant_id=? AND event_key=?",
            [f.merchantId, old.event.execution.eventKey]
          );
        await compare();
        const context = mocks.understand.mock.calls.at(
          -1
        )![1] as TeachingPolicyInput;
        expect(context.candidates.map(c => c.key)).not.toContain(
          `section:${old.id}`
        );
        expect(
          (await getBotSections(f.merchantId)).map(r => r.id)
        ).not.toContain(old.id);
        expect(
          (await f.sections()).find((s: any) => s.id === old.id)
        ).toMatchObject({ status: "approved", use_in_bot: 1 });
      }
    );
    it("invalidates an existing comparison when a candidate source is withdrawn before approval", async () => {
      const old = await approvedTeaching();
      await compare();
      const before = await readConflictReview(f.merchantId, sectionId);
      expect(before.canApprove).toBe(true);
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
        old.event.execution.id,
      ]);
      const after = await readConflictReview(f.merchantId, sectionId);
      expect(after.canApprove).toBe(false);
      expect(after.teaching?.basisHash).not.toBe(before.teaching?.basisHash);
      await expect(
        decideKnowledgeConflict(f.merchantId, {
          sectionId,
          action: "approve",
          acknowledged: true,
          expectedRevision: before.revision,
        })
      ).rejects.toThrow();
      expect(
        (await f.sections()).find((s: any) => s.id === sectionId).use_in_bot
      ).toBe(0);
    });
    it("rejects AI results if candidate evidence disappears while comparison is running", async () => {
      const old = await approvedTeaching(),
        original = mocks.understand.getMockImplementation()!;
      mocks.understand.mockImplementationOnce(async (m, i) => {
        const decision = await original(m, i);
        await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
          old.event.execution.id,
        ]);
        return decision;
      });
      await expect(compare()).rejects.toThrow("Policy changed during analysis");
      const review = await readConflictReview(f.merchantId, sectionId);
      expect(review.teaching?.analyzed).toBe(false);
      expect(review.canApprove).toBe(false);
    });
    it("compares independently reviewed manual teaching after the old WhatsApp original is gone", async () => {
      const old = await approvedTeaching();
      const r = await readSectionWorkspace(f.merchantId, old.id);
      await changeWorkspaceSection(f.merchantId, {
        id: old.id,
        title: r.section.title,
        content: "التوصيل خلال ثلاثة أيام عدا الجمعة",
        useInBot: true,
        expectedRevision: r.revision,
        acknowledged: true,
      });
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
        old.event.execution.id,
      ]);
      await compare();
      expect(
        (mocks.understand.mock.calls.at(-1)![1] as TeachingPolicyInput)
          .candidates
      ).toContainEqual(
        expect.objectContaining({
          key: `section:${old.id}`,
          content: "التوصيل خلال ثلاثة أيام عدا الجمعة",
        })
      );
      await q(
        "DELETE FROM knowledge_changelog WHERE merchant_id=? AND section_id=? AND action='manual_edit'",
        [f.merchantId, old.id]
      );
      expect(
        (await readConflictReview(f.merchantId, sectionId)).canApprove
      ).toBe(false);
    });
    it("does not bypass the complete-context limit by filtering a capped set of invalid sources", async () => {
      const placeholders = Array.from(
        { length: 201 },
        () =>
          "(?,'policies','fixture','fixture','manual','approved',1,'fact','whatsapp-dialogue://missing')"
      ).join(",");
      await q(
        "INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source,status,use_in_bot,inject_as,source_url) VALUES " +
          placeholders,
        Array(201).fill(f.merchantId)
      );
      expect(
        (await readConflictReview(f.merchantId, sectionId)).teaching?.available
      ).toBe(false);
      await expect(compare()).rejects.toThrow(
        "Complete policy context exceeds bounds"
      );
      expect(mocks.understand).not.toHaveBeenCalled();
    });
    it("keeps parent replacement blocked while a stored active child has temporarily invalid evidence", async () => {
      const parent = await current(),
        old = await approvedTeaching();
      await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
        parent,
        old.id,
      ]);
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
        old.event.execution.id,
      ]);
      const review = await readConflictReview(f.merchantId, sectionId);
      expect(
        review.teaching?.candidates.find(c => c.key === `section:${parent}`)
          ?.replaceable
      ).toBe(false);
      expect(review.teaching?.candidates.map(c => c.key)).not.toContain(
        `section:${old.id}`
      );
    });
    it("holds current candidate evidence until the final comparison transaction completes", async () => {
      const old = await approvedTeaching(),
        db = (await getDb())!;
      const [proposal] = await db
        .select()
        .from(knowledgeSections)
        .where(eq(knowledgeSections.id, sectionId));
      const other = await (await getPool())!.getConnection();
      const [settings] = await other.query<any[]>(
        "SELECT @@innodb_lock_wait_timeout AS timeout"
      );
      try {
        await other.query("SET SESSION innodb_lock_wait_timeout=1");
        await db.transaction(async tx => {
          const context = await teachingPolicyContext(
            tx,
            f.merchantId,
            proposal,
            true
          );
          expect(context.input.candidates.map(c => c.key)).toContain(
            `section:${old.id}`
          );
          await expect(
            other.execute("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
              old.event.execution.id,
            ])
          ).rejects.toMatchObject({ code: "ER_LOCK_WAIT_TIMEOUT" });
        });
        const [result] = await other.execute<any>(
          "DELETE FROM whatsapp_inbound_jobs WHERE id=?",
          [old.event.execution.id]
        );
        expect(result.affectedRows).toBe(1);
      } finally {
        await other.query("SET SESSION innodb_lock_wait_timeout=?", [
          settings[0].timeout,
        ]);
        other.release();
      }
    });
    it("keeps comparison separate from approval and enables only a source-verified proposal after consent", async () => {
      expect(
        (await readConflictReview(f.merchantId, sectionId)).canApprove
      ).toBe(false);
      await compare();
      expect(await getBotSections(f.merchantId)).toHaveLength(0);
      expect(
        (await readConflictReview(f.merchantId, sectionId)).canApprove
      ).toBe(true);
      await approve();
      expect((await getBotSections(f.merchantId)).map(s => s.id)).toEqual([
        sectionId,
      ]);
    });
    it("reviews an ordered multi-message teaching while preserving the last exception", async () => {
      await (await f.event("سأشرح الضمان: سنتان.")).commit("start");
      await (await f.event("ويستثنى الكسر وسوء الاستخدام.")).commit("append");
      const saved = await (
        await f.event("اكتملت، أرسلها للمراجعة.")
      ).commit("submit", false);
      sectionId = saved.sectionId!;
      await compare();
      await approve();
      const enabled = (await getBotSections(f.merchantId)).find(
        s => s.id === sectionId
      )!;
      expect(enabled.content).toContain("سنتان.");
      expect(enabled.content).toContain("ويستثنى الكسر وسوء الاستخدام.");
      expect(enabled.content).not.toContain("اكتملت");
    });
    it("replaces multiple fully reviewed policies atomically and retains compatible knowledge", async () => {
      const a = await current(),
        b = await current("الضمان سنة واحدة"),
        keep = await current("التوصيل خلال يومين");
      mocks.understand.mockImplementation(
        async (_m: number, i: TeachingPolicyInput) => ({
          version: 1,
          basisHash: i.basisHash,
          coherent: true,
          businessKnowledge: true,
          confidence: 0.99,
          reason: "تحديث الضمان",
          comparisons: i.candidates.map(c => ({
            key: c.key,
            relation: c.key === `section:${keep}` ? "compatible" : "replace",
            reason: "مقارنة",
            currentEvidence: c.content,
            proposedEvidence: "الضمان سنتين",
          })),
        })
      );
      await compare();
      const r = await readConflictReview(f.merchantId, sectionId);
      expect(r.teaching?.replaceIds).toEqual([a, b]);
      expect((await approve()).replacedSectionIds).toEqual([a, b]);
      expect(
        (await getBotSections(f.merchantId)).map(s => s.id).sort()
      ).toEqual([sectionId, keep].sort());
      expect(await f.sections()).toHaveLength(4);
    });
    it.each(["added", "edited", "disabled", "deleted"] as const)(
      "invalidates comparison when existing knowledge is %s",
      async mode => {
        const id = await current();
        await compare();
        const view = await readConflictReview(f.merchantId, sectionId);
        if (mode === "added") await current("سياسة جديدة");
        if (mode === "edited")
          await q(
            "UPDATE knowledge_sections SET content='تغير النص' WHERE id=?",
            [id]
          );
        if (mode === "disabled")
          await q("UPDATE knowledge_sections SET use_in_bot=0 WHERE id=?", [
            id,
          ]);
        if (mode === "deleted")
          await q("DELETE FROM knowledge_sections WHERE id=?", [id]);
        expect(
          (await readConflictReview(f.merchantId, sectionId)).canApprove
        ).toBe(false);
        await expect(
          decideKnowledgeConflict(f.merchantId, {
            sectionId,
            action: "approve",
            acknowledged: true,
            expectedRevision: view.revision,
          })
        ).rejects.toThrow();
        expect(
          (await f.sections()).find((s: any) => s.id === sectionId).use_in_bot
        ).toBe(0);
      }
    );
    it.each(["text", "source", "title"] as const)(
      "blocks a changed %s proof without reinterpreting it",
      async mode => {
        await compare();
        if (mode === "text")
          await q(
            "UPDATE knowledge_sections SET content='modified' WHERE id=?",
            [sectionId]
          );
        if (mode === "title")
          await q("UPDATE knowledge_sections SET title='modified' WHERE id=?", [
            sectionId,
          ]);
        if (mode === "source")
          await q("DELETE FROM whatsapp_inbound_jobs WHERE merchant_id=?", [
            f.merchantId,
          ]);
        const r = await readConflictReview(f.merchantId, sectionId);
        expect(r.teaching?.available).toBe(false);
        await expect(approve()).rejects.toThrow();
      }
    );
    it("rejects a changed snapshot after AI and persists no analysis or activation", async () => {
      const original = mocks.understand.getMockImplementation()!;
      mocks.understand.mockImplementationOnce(async (m, i) => {
        const d = await original(m, i);
        await current("ظهر مصدر جديد أثناء التحليل");
        return d;
      });
      await expect(compare()).rejects.toThrow("changed during");
      const r = await readConflictReview(f.merchantId, sectionId);
      expect(r.teaching?.analyzed).toBe(false);
      expect(r.canApprove).toBe(false);
    });
    it.each(["uncertain", "incoherent", "unsafe", "needs_review"] as const)(
      "does not activate %s model conclusions",
      async mode => {
        await current();
        const original = mocks.understand.getMockImplementation()!;
        mocks.understand.mockImplementationOnce(async (m, i) => {
          const d = await original(m, i);
          if (mode === "uncertain") d.confidence = 0.6;
          if (mode === "incoherent") d.coherent = false;
          if (mode === "unsafe") d.businessKnowledge = false;
          if (mode === "needs_review") d.comparisons[0].relation = "review";
          return d;
        });
        await compare();
        expect(
          (await readConflictReview(f.merchantId, sectionId)).canApprove
        ).toBe(false);
        await expect(approve()).rejects.toThrow();
      }
    );
    it("includes FAQ and page policies without permitting their silent replacement", async () => {
      await q(
        "INSERT INTO extracted_faqs(merchant_id,question,answer) VALUES (?,'الضمان','الضمان سنة')",
        [f.merchantId]
      );
      await q(
        "INSERT INTO discovered_pages(merchant_id,page_type,title,url,content) VALUES (?,'returns','الإرجاع','https://example.invalid/policy','لا يوجد ضمان')",
        [f.merchantId]
      );
      const original = mocks.understand.getMockImplementation()!;
      mocks.understand.mockImplementationOnce(async (m, i) => {
        const d = await original(m, i);
        d.comparisons = d.comparisons.map((c: any) => ({
          ...c,
          relation: "review",
        }));
        return d;
      });
      await compare();
      const view = await readConflictReview(f.merchantId, sectionId);
      expect(view.teaching?.candidates.map(c => c.replaceable)).toEqual([
        false,
        false,
      ]);
      expect(view.canApprove).toBe(false);
      await expect(approve()).rejects.toThrow();
    });
    it("does not call AI for an out-of-scope proposal or a stale reviewed basis", async () => {
      const other = await createTeachingFixture();
      users.push(other.userId);
      await expect(
        analyzeTeachingPolicy(other.merchantId, sectionId, "a".repeat(64))
      ).rejects.toThrow();
      await expect(
        analyzeTeachingPolicy(f.merchantId, sectionId, "a".repeat(64))
      ).rejects.toThrow();
      expect(mocks.understand).not.toHaveBeenCalled();
    });
    it("rejects incomplete candidate coverage from the provider before saving a review", async () => {
      await current();
      const original = mocks.understand.getMockImplementation()!;
      mocks.understand.mockImplementationOnce(async (m, i) => ({
        ...(await original(m, i)),
        comparisons: [],
      }));
      await expect(compare()).rejects.toThrow("coverage");
      expect(
        (await readConflictReview(f.merchantId, sectionId)).canApprove
      ).toBe(false);
    });
    it("rejects an overlarge knowledge set without truncating or calling AI", async () => {
      for (let i = 0; i < 3; i++) await current("a".repeat(31000));
      const r = await readConflictReview(f.merchantId, sectionId);
      expect(r.teaching?.available).toBe(false);
      expect(mocks.understand).not.toHaveBeenCalled();
    });
    it("will not replace the proposal's own parent or a source with active children", async () => {
      const parent = await current();
      await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
        parent,
        sectionId,
      ]);
      const view = await readConflictReview(f.merchantId, sectionId);
      expect(
        view.teaching?.candidates.find(c => c.key === `section:${parent}`)
          ?.replaceable
      ).toBe(false);
      await q("UPDATE knowledge_sections SET parent_id=NULL WHERE id=?", [
        sectionId,
      ]);
      const child = await current("تفاصيل مستقلة");
      await q("UPDATE knowledge_sections SET parent_id=? WHERE id=?", [
        parent,
        child,
      ]);
      expect(
        (
          await readConflictReview(f.merchantId, sectionId)
        ).teaching?.candidates.find(c => c.key === `section:${parent}`)
          ?.replaceable
      ).toBe(false);
    });
    it("rolls back replacement and activation if the final audit cannot be saved", async () => {
      const old = await current();
      mocks.understand.mockImplementationOnce(
        async (_m: number, i: TeachingPolicyInput) => ({
          version: 1,
          basisHash: i.basisHash,
          coherent: true,
          businessKnowledge: true,
          confidence: 0.99,
          reason: "استبدال",
          comparisons: i.candidates.map(c => ({
            key: c.key,
            relation: "replace",
            reason: "استبدال كامل",
            currentEvidence: c.content,
            proposedEvidence: "الضمان سنتين",
          })),
        })
      );
      await compare();
      const db = (await getDb())!,
        original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async (tx: any) => {
          const insert = tx.insert.bind(tx);
          tx.insert = (table: any) => {
            if (table === sariActivityLog)
              throw Error("fixture review audit failed");
            return insert(table);
          };
          return run(tx);
        }, config)) as any);
      await expect(approve()).rejects.toThrow("fixture review audit failed");
      vi.restoreAllMocks();
      const saved = await f.sections();
      expect(saved.find((s: any) => s.id === old).use_in_bot).toBe(1);
      expect(saved.find((s: any) => s.id === sectionId)).toMatchObject({
        status: "pending_review",
        use_in_bot: 0,
      });
    });
    it("allows closing a source-invalid proposal without enabling it", async () => {
      await q("DELETE FROM whatsapp_inbound_jobs WHERE merchant_id=?", [
        f.merchantId,
      ]);
      const r = await readConflictReview(f.merchantId, sectionId);
      await decideKnowledgeConflict(f.merchantId, {
        sectionId,
        action: "reject",
        acknowledged: true,
        expectedRevision: r.revision,
      });
      expect(await getBotSections(f.merchantId)).toHaveLength(0);
    });
  }
);
