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
vi.mock("../ai/teaching-dialogue-understanding", async original => ({
  ...(await original<typeof import("../ai/teaching-dialogue-understanding")>()),
  understandTeachingDialogue: mocks.understand,
}));
import { closeDb, getDb } from "../db/connection";
import { cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import { ensureTeachingDialogueSchema } from "../tests/helpers/teaching-dialogue-schema";
import {
  createTeachingFixture,
  dialogueQuery as q,
  dialogueDecision as decision,
} from "../tests/helpers/teaching-dialogue-fixture";
import { commitTeachingDialogue, findTeachingTurn } from "./teaching-dialogue";
import { handleTeachingDialogue } from "../ai/teaching-dialogue-handler";
import {
  readConflictReview,
  decideKnowledgeConflict,
} from "./conflict-workspace";
import { getBotSections, deleteSection, updateSection } from "../db/knowledge";

describe.skipIf(!process.env.DATABASE_URL)(
  "sourced multi-message teaching on real MySQL",
  () => {
    let f: Awaited<ReturnType<typeof createTeachingFixture>>;
    const users: number[] = [];
    beforeAll(ensureTeachingDialogueSchema);
    beforeEach(async () => {
      f = await createTeachingFixture();
      users.push(f.userId);
      mocks.understand.mockReset();
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    it("retains ordered original fragments and their exclusions in an inactive proposal", async () => {
      const a = await f.event("سأشرح سياسة الضمان. الضمان سنتان."),
        b = await f.event("ويستثنى الكسر وسوء الاستخدام.");
      await a.commit("start");
      await b.commit("append");
      const c = await f.event(
          "اكتملت السياسة، احفظها للاستخدام العام بعد المراجعة"
        ),
        ctx = await c.read();
      expect(ctx.input.draft?.fragments.map(x => x.text)).toEqual([
        a.text,
        b.text,
      ]);
      await c.commit("submit", false);
      const [s] = await f.sections();
      expect(s.content).toContain(a.text);
      expect(s.content).toContain(b.text);
      expect(s.content).not.toContain(c.text);
      expect(s).toMatchObject({ status: "pending_review", use_in_bot: 0 });
      expect(await getBotSections(f.merchantId)).toHaveLength(0);
      expect((await f.drafts())[0]).toMatchObject({
        version: 3,
        status: "submitted",
      });
      expect(await f.turns()).toHaveLength(3);
    });
    it("preserves a complete one-message policy but does not activate it", async () => {
      const e = await f.event(
        "اعتمد الضمان سنتين ما عدا الكسر\nولا يشمل البطارية"
      );
      await e.commit();
      expect((await f.sections())[0]).toMatchObject({
        content: "المعلومة: " + e.text,
        status: "pending_review",
        use_in_bot: 0,
      });
    });
    it("prevents the generic conflict approval from bypassing semantic conflict review", async () => {
      await (await f.event("اعتمد الضمان سنتين")).commit();
      const [s] = await f.sections();
      const r = await readConflictReview(f.merchantId, s.id);
      expect(r.canApprove).toBe(false);
      await expect(
        decideKnowledgeConflict(f.merchantId, {
          sectionId: s.id,
          action: "approve",
          expectedRevision: r.revision,
          acknowledged: true,
        })
      ).rejects.toThrow();
      expect(await getBotSections(f.merchantId)).toHaveLength(0);
    });
    it("cancels only the current scoped draft without deleting established policies", async () => {
      await (await f.event("سأشرح سياستنا")).commit("start");
      await (await f.event("ألغ مسودة الشرح")).commit("cancel", false);
      expect((await f.drafts())[0]).toMatchObject({
        status: "cancelled",
        version: 2,
      });
      expect(await f.sections()).toHaveLength(0);
    });
    it("replaces a draft with a complete explicit correction and keeps the audit", async () => {
      await (await f.event("سأشرح الضمان سنة")).commit("start");
      await (
        await f.event("استبدل المسودة كاملة: الضمان سنتان باستثناء الكسر")
      ).commit("replace");
      const e = await f.event("احفظها للمراجعة");
      await e.commit("submit", false);
      const [s] = await f.sections();
      expect(s.content).toContain("الضمان سنتان");
      expect(s.content).not.toContain("الضمان سنة");
      expect(await f.turns()).toHaveLength(3);
    });
    it("does not append reports or questions to the draft", async () => {
      await (await f.event("سأشرح الضمان سنة")).commit("start");
      await (await f.event("أرسل تقرير اليوم")).commit("not_teaching", false);
      expect((await f.drafts())[0].version).toBe(1);
      const c = await (await f.event("احفظها")).read();
      expect(c.input.draft?.fragments).toHaveLength(1);
    });
    it("does not repeat a submitted policy under concurrent delivery of one event", async () => {
      const e = await f.event("احفظ الضمان سنتين"),
        c = await e.read();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          e.within(() => commitTeachingDialogue(c, decision(c)))
        )
      );
      expect(results.filter(r => !r.replayed)).toHaveLength(1);
      expect(await f.sections()).toHaveLength(1);
      expect(await f.turns()).toHaveLength(1);
    });
    it.each(["deleted", "edited", "disabled"])(
      "does not recreate or overwrite a %s proposal on replay",
      async mode => {
        const e = await f.event("احفظ الضمان سنتين");
        await e.commit();
        const [s] = await f.sections();
        if (mode === "deleted") await deleteSection(s.id, f.merchantId);
        if (mode === "edited")
          await updateSection(s.id, f.merchantId, { content: "مراجعة بشرية" });
        if (mode === "disabled")
          await updateSection(s.id, f.merchantId, {
            status: "approved",
            useInBot: false,
          });
        const replay = await e.within(() =>
          handleTeachingDialogue(f.merchantId, e.text)
        );
        expect(replay.handled).toBe(true);
        expect(mocks.understand).not.toHaveBeenCalled();
        expect(await f.sections()).toHaveLength(mode === "deleted" ? 0 : 1);
        if (mode === "edited")
          expect((await f.sections())[0].content).toBe("مراجعة بشرية");
        expect(await getBotSections(f.merchantId)).toHaveLength(0);
      }
    );
    it("rejects a stale concurrent append after another append commits", async () => {
      await (await f.event("سأشرح الضمان سنتين")).commit("start");
      const a = await f.event("لا يشمل الكسر"),
        b = await f.event("يشمل الصيانة");
      const ca = await a.read(),
        cb = await b.read();
      await a.within(() => commitTeachingDialogue(ca, decision(ca, "append")));
      await expect(
        b.within(() => commitTeachingDialogue(cb, decision(cb, "append")))
      ).rejects.toThrow("draft changed");
      expect((await f.drafts())[0].version).toBe(2);
    });
    it("prevents an older queued message from rewriting a newer draft", async () => {
      const old = await f.event("ابدأ مسودة قديمة");
      await (await f.event("ابدأ مسودة حديثة")).commit("start");
      await expect(old.commit("replace")).rejects.toThrow("Older teaching");
      expect((await f.drafts())[0].version).toBe(1);
    });
    it.each(["text", "deleted", "sender"])(
      "withdraws a %s source from draft context and permits explicit recovery",
      async mode => {
        const a = await f.event("سأشرح الضمان سنتين");
        await a.commit("start");
        if (mode === "deleted")
          await q("DELETE FROM whatsapp_inbound_jobs WHERE id=?", [
            a.execution.id,
          ]);
        if (mode === "text")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','changed') WHERE id=?",
            [a.execution.id]
          );
        if (mode === "sender")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.senderData.sender','966500000099@c.us') WHERE id=?",
            [a.execution.id]
          );
        const b = await f.event("ألغ المسودة التي فقدت مصدرها"),
          c = await b.read();
        expect(c.input).toMatchObject({ draft: null, draftUnavailable: true });
        await b.commit("cancel", false);
        expect((await f.drafts())[0].status).toBe("cancelled");
        expect(await f.sections()).toHaveLength(0);
      }
    );
    it("does not revive an expired draft from an ambiguous acceptance", async () => {
      await (await f.event("سأشرح الضمان سنتين")).commit("start");
      await q(
        "UPDATE merchant_teaching_drafts SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 25 HOUR) WHERE merchant_id=?",
        [f.merchantId]
      );
      const e = await f.event("احفظها");
      expect((await e.read()).input.draftUnavailable).toBe(true);
      await expect(e.commit("submit", false)).rejects.toThrow();
    });
    it.each(["author", "lease", "source", "account"])(
      "revalidates %s before a draft mutation",
      async mode => {
        const e = await f.event("ابدأ شرح الضمان"),
          c = await e.read();
        if (mode === "author")
          await q("UPDATE merchants SET phone=NULL WHERE id=?", [f.merchantId]);
        if (mode === "lease")
          await q(
            "UPDATE whatsapp_inbound_jobs SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?",
            [e.execution.id]
          );
        if (mode === "source")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','changed') WHERE id=?",
            [e.execution.id]
          );
        if (mode === "account")
          await q(
            "UPDATE users SET account_status='deletion_pending' WHERE id=?",
            [f.userId]
          );
        await expect(
          e.within(() => commitTeachingDialogue(c, decision(c, "start")))
        ).rejects.toThrow();
        expect(await f.drafts()).toHaveLength(0);
        expect(await f.turns()).toHaveLength(0);
      }
    );
    it("isolates another authorized sender and another merchant from the draft", async () => {
      await (await f.event("سأشرح الضمان سنتين")).commit("start");
      const phone = "966500000099";
      await q("UPDATE merchants SET emergency_phone=? WHERE id=?", [
        phone,
        f.merchantId,
      ]);
      expect(
        (await (await f.event("احفظها", phone)).read()).input.draft
      ).toBeNull();
      const other = await createTeachingFixture();
      users.push(other.userId);
      expect(
        (await (await other.event("احفظها")).read()).input.draft
      ).toBeNull();
    });
    it("rolls back the proposal and draft when the turn audit cannot be written", async () => {
      const e = await f.event("احفظ الضمان سنتين"),
        c = await e.read(),
        db = (await getDb())!,
        original = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementation(((run: any, config: any) =>
        original(async (tx: any) => {
          const execute = tx.execute.bind(tx);
          tx.execute = (statement: any) => {
            const chunks = JSON.stringify(statement, (_k, v) =>
              typeof v === "bigint" ? String(v) : v
            );
            if (chunks.includes("INSERT INTO merchant_teaching_turns"))
              throw Error("fixture audit failure");
            return execute(statement);
          };
          return run(tx);
        }, config)) as any);
      await expect(
        e.within(() => commitTeachingDialogue(c, decision(c)))
      ).rejects.toThrow("fixture audit failure");
      vi.restoreAllMocks();
      expect(await f.sections()).toHaveLength(0);
      expect(await f.drafts()).toHaveLength(0);
      expect(await f.turns()).toHaveLength(0);
    });
    it("keeps the daily proposal quota after proposal deletion", async () => {
      for (let i = 0; i < 10; i++)
        await (await f.event("احفظ هذه السياسة " + i)).commit();
      for (const s of await f.sections())
        await deleteSection(s.id, f.merchantId);
      await expect(
        (await f.event("احفظ السياسة التالية")).commit()
      ).rejects.toThrow("quota");
      expect(await f.sections()).toHaveLength(0);
    });
    it("sends an active draft and the complete correction to semantic understanding before committing", async () => {
      await (await f.event("سأشرح الضمان سنتين")).commit("start");
      const e = await f.event("أضف استثناء الكسر"),
        c = await e.read();
      mocks.understand.mockResolvedValueOnce(decision(c, "append"));
      expect(
        await e.within(() => handleTeachingDialogue(f.merchantId, e.text, true))
      ).toMatchObject({ handled: true });
      expect(mocks.understand).toHaveBeenCalledWith(
        f.merchantId,
        expect.objectContaining({
          message: e.text,
          draft: expect.objectContaining({ version: 1 }),
        })
      );
      expect((await f.drafts())[0].version).toBe(2);
    });
    it("acknowledges an unconfirmed save safely when the lease is lost during AI", async () => {
      const e = await f.event("احفظ الضمان سنتين"),
        c = await e.read();
      mocks.understand.mockImplementationOnce(async () => {
        await q(
          "UPDATE whatsapp_inbound_jobs SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?",
          [e.execution.id]
        );
        return decision(c);
      });
      const result = await e.within(() =>
        handleTeachingDialogue(f.merchantId, e.text)
      );
      expect(result).toMatchObject({ handled: true });
      expect(result.response).toContain("لم يتم تأكيد");
      expect(await f.sections()).toHaveLength(0);
      expect(await f.turns()).toHaveLength(0);
    });
    it("does not start another AI classification from the active-draft hook when there is no draft", async () => {
      const e = await f.event("أرسل تقرير اليوم");
      expect(
        await e.within(() => handleTeachingDialogue(f.merchantId, e.text, true))
      ).toEqual({ handled: false });
      expect(mocks.understand).not.toHaveBeenCalled();
    });
  }
);
