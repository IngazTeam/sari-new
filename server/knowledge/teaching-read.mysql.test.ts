import { ensureGroupTestSchema } from "../tests/helpers/group-schema";
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
const mock = vi.hoisted(() => ({ understand: vi.fn() }));
vi.mock("../ai/teaching-policy-understanding", async original => ({
  ...(await original<typeof import("../ai/teaching-policy-understanding")>()),
  understandTeachingPolicy: mock.understand,
}));
import { closeDb, getDb } from "../db/connection";
import { sariActivityLog } from "../../drizzle/schema";
import {
  createTeachingFixture,
  dialogueQuery as q,
} from "../tests/helpers/teaching-dialogue-fixture";
import { ensureTeachingDialogueSchema } from "../tests/helpers/teaching-dialogue-schema";
import { ensureOnboardingTestSchema } from "../tests/helpers/onboarding-schema";
import { cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import { getBotSections, getBotSectionsWithEmbedding } from "../db/knowledge";
import {
  readConflictReview,
  decideKnowledgeConflict,
} from "./conflict-workspace";
import { analyzeTeachingPolicy } from "./teaching-policy-review";
import {
  readSectionWorkspace,
  changeWorkspaceSection,
  listSectionWorkspace,
  sectionReadiness,
} from "./section-workspace";
import { saveContextualMerchantTeaching } from "./whatsapp-teaching";
import { teachingTextHash } from "../ai/merchant-teaching-understanding";
import type { TeachingPolicyInput } from "../ai/teaching-policy-understanding";
import { purgeCompletedInboundPayloads } from "../messaging/retention";

describe.skipIf(!process.env.DATABASE_URL)(
  "teaching provenance at bot retrieval on real MySQL",
  () => {
    let f: Awaited<ReturnType<typeof createTeachingFixture>>,
      event: Awaited<
        ReturnType<Awaited<ReturnType<typeof createTeachingFixture>>["event"]>
      >,
      id: number;
    const users: number[] = [];
    beforeAll(async () => {
      await ensureGroupTestSchema();
      await ensureTeachingDialogueSchema();
      await ensureOnboardingTestSchema();
    });
    beforeEach(async () => {
      f = await createTeachingFixture();
      users.push(f.userId);
      mock.understand
        .mockReset()
        .mockImplementation(async (_m: number, i: TeachingPolicyInput) => ({
          version: 1,
          basisHash: i.basisHash,
          coherent: true,
          businessKnowledge: true,
          confidence: 0.99,
          reason: "fixture",
          comparisons: i.candidates.map(c => ({
            key: c.key,
            relation: "compatible",
            reason: "fixture",
            currentEvidence: "",
            proposedEvidence: "",
          })),
        }));
      event = await f.event("الضمان سنتان ولا يشمل الكسر");
      id = (await event.commit()).sectionId!;
      await approve(id);
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    async function approve(sectionId: number) {
      const r = await readConflictReview(f.merchantId, sectionId);
      await analyzeTeachingPolicy(
        f.merchantId,
        sectionId,
        r.teaching!.basisHash!
      );
      const view = await readConflictReview(f.merchantId, sectionId);
      await decideKnowledgeConflict(f.merchantId, {
        sectionId,
        action: "approve",
        expectedRevision: view.revision,
        acknowledged: true,
      });
    }
    async function manual(
      title = "سياسة راجعتها بنفسي",
      content = "الضمان ثلاث سنوات دون الكسر"
    ) {
      const r = await readSectionWorkspace(f.merchantId, id);
      return changeWorkspaceSection(f.merchantId, {
        id,
        title,
        content,
        useInBot: true,
        expectedRevision: r.revision,
        acknowledged: true,
      });
    }
    const visible = async () => ({
      plain: (await getBotSections(f.merchantId)).map(r => r.id),
      rag: (await getBotSectionsWithEmbedding(f.merchantId)).map(r => r.id),
    });
    const list = (state: any = "all", page = 1) =>
      listSectionWorkspace(f.merchantId, {
        search: "",
        type: "all",
        state,
        page,
      });
    async function expectUnverified() {
      expect((await list("eligible")).total).toBe(0);
      expect((await list("unverified")).items.map(r => r.id)).toEqual([id]);
      expect(
        (await readSectionWorkspace(f.merchantId, id)).section
      ).toMatchObject({
        state: "unverified",
        useInBot: true,
        status: "approved",
        replacesTeachingSource: true,
      });
      expect(await sectionReadiness(f.merchantId)).toMatchObject({
        total: 0,
        covered: 0,
        saved: 1,
        counts: { eligible: 0, unverified: 1 },
      });
    }
    it("shows the same valid teaching in coverage, list, review and both bot readers", async () => {
      expect((await list("eligible")).items.map(r => r.id)).toEqual([id]);
      expect((await readSectionWorkspace(f.merchantId, id)).section.state).toBe(
        "eligible"
      );
      expect(await sectionReadiness(f.merchantId)).toMatchObject({
        covered: 1,
        saved: 1,
        counts: { eligible: 1, unverified: 0 },
      });
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
    });
    it("filters unverified sources before pagination and excludes them from coverage", async () => {
      // Nine saved sections share one real turn; changed identities cannot borrow its approval.
      for (let at = 0; at < 8; at++)
        await q(
          `INSERT INTO knowledge_sections
        (merchant_id,section_type,title,content,source,source_url,provenance,status,use_in_bot,inject_as)
        SELECT merchant_id,section_type,title,content,source,source_url,provenance,status,use_in_bot,inject_as
        FROM knowledge_sections WHERE id=?`,
          [id]
        );
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
        event.execution.id,
      ]);
      const first = await list("unverified"),
        second = await list("unverified", 99);
      expect(first).toMatchObject({ total: 9, page: 1, totalPages: 2 });
      expect(first.items).toHaveLength(8);
      expect(second).toMatchObject({ total: 9, page: 2, totalPages: 2 });
      expect(second.items).toHaveLength(1);
      expect((await list("eligible")).total).toBe(0);
      expect(await sectionReadiness(f.merchantId)).toMatchObject({
        saved: 9,
        total: 0,
        counts: { unverified: 9 },
      });
    });
    it.each([
      ["paused", "use_in_bot=0"],
      ["expired", "valid_until='2020-01-01'"],
      ["excluded", "inject_as='none'"],
      ["pending", "status='pending_review'"],
    ])(
      "keeps %s distinct from failed source verification",
      async (state, patch) => {
        await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
          event.execution.id,
        ]);
        await q(`UPDATE knowledge_sections SET ${patch} WHERE id=?`, [id]);
        expect((await list(state)).items.map(r => r.id)).toEqual([id]);
        expect((await list("unverified")).total).toBe(0);
        expect(
          (await readSectionWorkspace(f.merchantId, id)).section.state
        ).toBe(state);
        expect(await sectionReadiness(f.merchantId)).toMatchObject({
          total: 0,
          counts: { [state]: 1, unverified: 0 },
        });
      }
    );
    it("restores eligibility only after an acknowledged independent manual review", async () => {
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
        event.execution.id,
      ]);
      await expectUnverified();
      const r = await readSectionWorkspace(f.merchantId, id);
      const input = {
        id,
        title: r.section.title,
        content: r.section.content,
        useInBot: true,
        expectedRevision: r.revision,
      };
      await expect(
        changeWorkspaceSection(f.merchantId, input)
      ).rejects.toThrow();
      await expectUnverified();
      await changeWorkspaceSection(f.merchantId, {
        ...input,
        acknowledged: true,
      });
      expect((await list("eligible")).total).toBe(1);
      expect((await list("unverified")).total).toBe(0);
      expect((await sectionReadiness(f.merchantId)).covered).toBe(1);
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
      expect((await readSectionWorkspace(f.merchantId, id)).section.state).toBe(
        "eligible"
      );
    });
    it("does not expose teaching bodies, provenance or original payloads through another tenant workspace", async () => {
      const other = await createTeachingFixture();
      users.push(other.userId);
      expect(
        (
          await listSectionWorkspace(other.merchantId, {
            search: "",
            type: "all",
            state: "all",
            page: 1,
          })
        ).total
      ).toBe(0);
      expect((await sectionReadiness(other.merchantId)).saved).toBe(0);
      await expect(
        readSectionWorkspace(other.merchantId, id)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const [entry] = (await list()).items;
      for (const key of [
        "content",
        "provenance",
        "payload_json",
        "merchantId",
        "sourceUrl",
      ])
        expect(entry).not.toHaveProperty(key);
    });
    it("fails workspace reads instead of reporting zero coverage or usable knowledge when proof queries fail", async () => {
      const db = (await getDb())!,
        original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async (tx: any) => {
          const execute = tx.execute.bind(tx);
          tx.execute = (s: any) => {
            if (
              tx.dialect
                .sqlToQuery(s)
                .sql.includes("FROM merchant_teaching_turns")
            )
              throw Error("fixture proof query failed");
            return execute(s);
          };
          return run(tx);
        }, config)) as any);
      await expect(list()).rejects.toThrow("fixture proof query failed");
      await expect(sectionReadiness(f.merchantId)).rejects.toThrow(
        "fixture proof query failed"
      );
      await expect(readSectionWorkspace(f.merchantId, id)).rejects.toThrow(
        "fixture proof query failed"
      );
    });
    it("retains a reviewed policy in both readers before and after legitimate source minimization", async () => {
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='completed',updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 DAY) WHERE id=?",
        [event.execution.id]
      );
      await purgeCompletedInboundPayloads();
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
    });
    it.each([
      "deleted",
      "redacted",
      "text",
      "sender",
      "event",
      "instance",
      "quoted",
    ])(
      "withdraws an already-approved policy when original evidence is %s",
      async mode => {
        expect((await visible()).plain).toEqual([id]);
        if (mode === "deleted")
          await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
            event.execution.id,
          ]);
        else if (mode === "redacted")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_OBJECT('redacted',true) WHERE id=?",
            [event.execution.id]
          );
        else {
          const paths: Record<string, string> = {
            text: "$.messageData.textMessageData.textMessage",
            sender: "$.senderData.sender",
            event: "$.idMessage",
            instance: "$.instanceData.idInstance",
            quoted: "$.messageData.quotedMessage.stanzaId",
          };
          if (mode === "quoted")
            await q(
              "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.quotedMessage',JSON_OBJECT('stanzaId','changed-fixture')) WHERE id=?",
              [event.execution.id]
            );
          else
            await q(
              "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,?,?) WHERE id=?",
              [paths[mode], "changed-fixture", event.execution.id]
            );
        }
        expect(await visible()).toEqual({ plain: [], rag: [] });
        await expectUnverified();
        expect((await f.sections())[0].status).toBe("approved"); // Read does not silently rewrite the review history.
      }
    );
    it.each([
      "title",
      "content",
      "summary",
      "digest",
      "approval",
      "turn",
      "origin",
    ])(
      "rejects unreviewed changes to %s rather than trusting approved status",
      async mode => {
        if (["title", "content", "summary"].includes(mode))
          await q(
            `UPDATE knowledge_sections SET ${mode}='tampered fixture' WHERE id=?`,
            [id]
          );
        else if (mode === "turn")
          await q("DELETE FROM merchant_teaching_turns WHERE merchant_id=?", [
            f.merchantId,
          ]);
        else
          await q(
            "UPDATE knowledge_sections SET provenance=JSON_REMOVE(provenance,?) WHERE id=?",
            [
              mode === "digest"
                ? "$.sourceDigest"
                : mode === "approval"
                  ? "$.reviewDecision"
                  : "$.origin",
              id,
            ]
          );
        expect(await visible()).toEqual({ plain: [], rag: [] });
        await expectUnverified();
      }
    );
    it("rejects conflicting quote identifiers even when the quote parser cannot resolve one", async () => {
      await q(
        "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.quotedMessage',JSON_OBJECT('stanzaId','quote-a'),'$.messageData.extendedTextMessageData',JSON_OBJECT('stanzaId','quote-b','text',?)) WHERE id=?",
        [event.text, event.execution.id]
      );
      expect(await visible()).toEqual({ plain: [], rag: [] });
    });
    it("withdraws a multi-part policy when a nonfinal exclusion fragment disappears", async () => {
      const a = await f.event("الصيانة مجانية سنتين");
      await a.commit("start");
      const b = await f.event("باستثناء الكسر وسوء الاستخدام");
      await b.commit("append");
      const c = await f.event("احفظ المكتمل للمراجعة");
      const next = (await c.commit("submit", false)).sectionId!;
      await approve(next);
      expect((await visible()).rag).toContain(next);
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [b.execution.id]);
      expect((await visible()).rag).toEqual([id]);
    });
    it("keeps a separately reviewed manual correction after withdrawal of the old WhatsApp source", async () => {
      await manual();
      await q("DELETE FROM whatsapp_inbound_jobs WHERE merchant_id=?", [
        f.merchantId,
      ]);
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
      expect((await getBotSections(f.merchantId))[0].content).toBe(
        "الضمان ثلاث سنوات دون الكسر"
      );
    });
    it("releases the old inbound retention reference once an independent manual review is recorded", async () => {
      await manual();
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='completed',updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 DAY) WHERE merchant_id=?",
        [f.merchantId]
      );
      await purgeCompletedInboundPayloads();
      const [r] = await q(
        "SELECT payload_json FROM whatsapp_inbound_jobs WHERE id=?",
        [event.execution.id]
      );
      expect(r.payload_json).toEqual({ redacted: true });
      expect((await visible()).plain).toEqual([id]);
    });
    it.each(["content", "title", "receipt", "hash"])(
      "rejects a changed manual %s even when its original teaching source still exists",
      async mode => {
        await manual();
        expect((await visible()).plain).toEqual([id]);
        if (mode === "receipt")
          await q(
            "DELETE FROM knowledge_changelog WHERE merchant_id=? AND action='manual_edit'",
            [f.merchantId]
          );
        else if (mode === "hash")
          await q(
            "UPDATE knowledge_sections SET provenance=JSON_SET(provenance,'$.manualReview.contentHash',REPEAT('a',64)) WHERE id=?",
            [id]
          );
        else
          await q(
            `UPDATE knowledge_sections SET ${mode}='changed after review' WHERE id=?`,
            [id]
          );
        expect(await visible()).toEqual({ plain: [], rag: [] });
      }
    );
    it("does not depend on the temporary activity feed after a manual review", async () => {
      await manual();
      await q("DELETE FROM sari_activity_log WHERE merchant_id=?", [
        f.merchantId,
      ]);
      await q("DELETE FROM whatsapp_inbound_jobs WHERE merchant_id=?", [
        f.merchantId,
      ]);
      expect(await visible()).toEqual({ plain: [id], rag: [id] });
    });
    it("cannot borrow another tenant manual review receipt", async () => {
      await manual();
      const other = await createTeachingFixture();
      users.push(other.userId);
      await q(
        "UPDATE knowledge_changelog SET merchant_id=? WHERE merchant_id=? AND action='manual_edit'",
        [other.merchantId, f.merchantId]
      );
      expect(await visible()).toEqual({ plain: [], rag: [] });
    });
    it("rolls back manual text and provenance together if the audit fails", async () => {
      const before = (await f.sections())[0],
        db = (await getDb())!,
        original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async (tx: any) => {
          const insert = tx.insert.bind(tx);
          tx.insert = (table: any) => {
            if (table === sariActivityLog) throw Error("fixture audit failed");
            return insert(table);
          };
          return run(tx);
        }, config)) as any);
      await expect(manual()).rejects.toThrow("fixture audit failed");
      vi.restoreAllMocks();
      const after = (await f.sections())[0];
      expect(after.content).toBe(before.content);
      expect(after.provenance).toEqual(before.provenance);
      expect((await visible()).plain).toEqual([id]);
    });
    it("preserves legacy teaching only while its original source and creation audit agree", async () => {
      const e = await f.event("اعتمد مدة الصيانة ثلاثة أشهر"),
        c = await e.read();
      const saved = await e.within(() =>
        saveContextualMerchantTeaching(c.source, {
          version: 1,
          sourceHash: teachingTextHash(e.text),
          intent: "teach",
          scope: "general",
          confidence: 0.99,
          ambiguous: false,
          businessKnowledge: true,
          title: "الصيانة",
        })
      );
      expect((await visible()).plain).toContain(saved.sectionId);
      await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [e.execution.id]);
      expect((await visible()).plain).not.toContain(saved.sectionId);
    });
    it("fetches multiple policies and source bodies in batches rather than a query per fragment", async () => {
      for (const text of ["العمل يوم الثلاثاء", "الصيانة في المكتب"]) {
        const e = await f.event(text);
        await approve((await e.commit()).sectionId!);
      }
      const db = (await getDb())!,
        original = db.transaction.bind(db),
        queries: string[] = [];
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async (tx: any) => {
          const execute = tx.execute.bind(tx);
          tx.execute = (s: any) => {
            queries.push(tx.dialect.sqlToQuery(s).sql);
            return execute(s);
          };
          return run(tx);
        }, config)) as any);
      expect(await getBotSections(f.merchantId)).toHaveLength(3);
      expect(queries.filter(s => /^SELECT /i.test(s))).toHaveLength(3);
    });
  }
);
