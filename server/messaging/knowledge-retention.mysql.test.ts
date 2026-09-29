import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
} from "vitest";
import { closeDb } from "../db/connection";
import {
  createTeachingFixture,
  dialogueQuery as q,
} from "../tests/helpers/teaching-dialogue-fixture";
import { cleanupDisposableMerchants } from "../tests/helpers/disposable-merchant";
import { ensureTeachingDialogueSchema } from "../tests/helpers/teaching-dialogue-schema";
import { ensureOnboardingTestSchema } from "../tests/helpers/onboarding-schema";
import { verifyTeachingHistory } from "../knowledge/teaching-source-history";
import {
  readConflictReview,
  decideKnowledgeConflict,
} from "../knowledge/conflict-workspace";
import {
  readOnboardingContext,
  commitOnboarding,
  readVerifiedOnboardingAnswers,
} from "../automation/onboarding-store";
import { saveContextualMerchantTeaching } from "../knowledge/whatsapp-teaching";
import { teachingTextHash } from "../ai/merchant-teaching-understanding";
import { purgeCompletedInboundPayloads } from "./retention";

describe.skipIf(!process.env.DATABASE_URL)(
  "knowledge source retention on real MySQL",
  () => {
    let f: Awaited<ReturnType<typeof createTeachingFixture>>;
    const users: number[] = [];
    beforeAll(async () => {
      await ensureTeachingDialogueSchema();
      await ensureOnboardingTestSchema();
    });
    beforeEach(async () => {
      f = await createTeachingFixture();
      users.push(f.userId);
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    const row = async (id: number) =>
      (await q("SELECT * FROM whatsapp_inbound_jobs WHERE id=?", [id]))[0];
    async function age(id: number, status = "completed") {
      await q(
        `UPDATE whatsapp_inbound_jobs SET status=?,updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP(3)),
      reply_plan_json=JSON_OBJECT('text','old reply'),payload_json=JSON_SET(payload_json,
      '$.unusedSecret','fixture-only-extra','$.senderData.senderName','private profile',
      '$.messageData.quotedMessage.textMessage','private quoted body') WHERE id=?`,
        [status, id]
      );
    }
    async function proposal() {
      const a = await f.event("الضمان سنتان دون الكسر"),
        c = await a.read();
      await a.commit();
      return { a, source: c.source, id: (await f.sections())[0].id };
    }
    async function onboarding(text: string) {
      const e = await f.event(text);
      const c = await e.within(() => readOnboardingContext(f.merchantId, text));
      await e.within(() =>
        commitOnboarding(c, {
          version: 1,
          basisHash: c.input.basisHash,
          intent: "update",
          fieldKey: "businessDescription",
          businessType: null,
          confidence: 0.99,
          explicit: true,
          ambiguous: false,
          conditional: false,
          evidence: text,
          rationale: "fixture",
        })
      );
      return e;
    }
    it("keeps a current onboarding answer verifiable while removing excess payload and the old reply plan", async () => {
      const e = await onboarding("نقدم تدريبًا للمبتدئين ولا نضمن التوظيف");
      await age(e.execution.id);
      const before = await row(e.execution.id);
      await purgeCompletedInboundPayloads();
      const after = await row(e.execution.id);
      expect(after.payload_json.knowledgeEvidenceVersion).toBe(1);
      expect(after.payload_json.unusedSecret).toBeUndefined();
      expect(after.payload_json.senderData.senderName).toBeUndefined();
      expect(
        after.payload_json.messageData.quotedMessage.textMessage
      ).toBeUndefined();
      expect(after.reply_plan_json).toBeNull();
      expect(after.updated_at).toEqual(before.updated_at);
      expect(await readVerifiedOnboardingAnswers(f.merchantId)).toEqual({
        businessDescription: e.text,
      });
      expect(await purgeCompletedInboundPayloads()).toBe(0);
    });
    it("releases an old onboarding source after the field has been replaced", async () => {
      const old = await onboarding("نبيع كتبًا"),
        current = await onboarding("نقدم تدريبًا");
      await age(old.execution.id);
      await age(current.execution.id);
      await purgeCompletedInboundPayloads();
      expect((await row(old.execution.id)).payload_json).toEqual({
        redacted: true,
      });
      expect(await readVerifiedOnboardingAnswers(f.merchantId)).toEqual({
        businessDescription: current.text,
      });
    });
    it("preserves every dialogue fragment and the separate submission receipt without activating the proposal", async () => {
      const a = await f.event("الضمان سنتان"),
        b = await f.event("ولا يشمل الكسر");
      await a.commit("start");
      await b.commit("append");
      const submit = await f.event("اكتملت الشروط أرسلها للمراجعة");
      await submit.commit("submit", false);
      for (const e of [a, b, submit]) await age(e.execution.id);
      await purgeCompletedInboundPayloads();
      for (const e of [a, b, submit])
        expect(
          (await row(e.execution.id)).payload_json.knowledgeEvidenceVersion
        ).toBe(1);
      const s = (await f.sections())[0];
      expect(s).toMatchObject({ status: "pending_review", use_in_bot: 0 });
      expect(
        (await readConflictReview(f.merchantId, s.id)).teaching?.available
      ).toBe(true);
    });
    it("retains approved dialogue evidence even after its draft has been overwritten", async () => {
      const { a, source, id } = await proposal();
      await q(
        "UPDATE knowledge_sections SET status='approved',use_in_bot=1 WHERE id=?",
        [id]
      );
      await (await f.event("مسودة أخرى")).commit("start");
      await age(a.execution.id);
      await purgeCompletedInboundPayloads();
      await expect(verifyTeachingHistory(source)).resolves.toBeUndefined();
    });
    it("preserves legacy single-message teaching evidence without recreating it", async () => {
      const e = await f.event("الضمان سنتان"),
        c = await e.read();
      await e.within(() =>
        saveContextualMerchantTeaching(c.source, {
          version: 1,
          sourceHash: teachingTextHash(e.text),
          intent: "teach",
          scope: "general",
          confidence: 0.99,
          ambiguous: false,
          businessKnowledge: true,
          title: "الضمان",
        })
      );
      await age(e.execution.id);
      await purgeCompletedInboundPayloads();
      await expect(verifyTeachingHistory(c.source)).resolves.toBeUndefined();
      expect(await f.sections()).toHaveLength(1);
    });
    it.each(["disabled", "expired", "rejected", "deleted", "not_injected"])(
      "redacts minimized dialogue evidence after its last reference becomes %s without another 30-day delay",
      async mode => {
        const { a, id } = await proposal();
        await age(a.execution.id);
        await purgeCompletedInboundPayloads();
        expect(
          (await row(a.execution.id)).payload_json.knowledgeEvidenceVersion
        ).toBe(1);
        if (mode === "deleted")
          await q("DELETE FROM knowledge_sections WHERE id=?", [id]);
        else if (mode === "expired")
          await q(
            "UPDATE knowledge_sections SET valid_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?",
            [id]
          );
        else if (mode === "rejected") {
          const view = await readConflictReview(f.merchantId, id);
          await decideKnowledgeConflict(f.merchantId, {
            sectionId: id,
            action: "reject",
            acknowledged: true,
            expectedRevision: view.revision,
          });
        } else
          await q(
            `UPDATE knowledge_sections SET status='approved',use_in_bot=?,inject_as=? WHERE id=?`,
            [
              mode === "disabled" ? 0 : 1,
              mode === "not_injected" ? "none" : "fact",
              id,
            ]
          );
        await purgeCompletedInboundPayloads();
        expect((await row(a.execution.id)).payload_json).toEqual({
          redacted: true,
        });
      }
    );
    it.each(["fresh", "expired", "cancelled"])(
      "retains only a %s scoped draft that still needs the original fragment",
      async mode => {
        const e = await f.event("الضمان سنتان");
        await e.commit("start");
        await age(e.execution.id);
        if (mode === "expired")
          await q(
            "UPDATE merchant_teaching_drafts SET updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 25 HOUR) WHERE merchant_id=?",
            [f.merchantId]
          );
        if (mode === "cancelled")
          await q(
            "UPDATE merchant_teaching_drafts SET status='cancelled' WHERE merchant_id=?",
            [f.merchantId]
          );
        await purgeCompletedInboundPayloads();
        expect((await row(e.execution.id)).payload_json).toMatchObject(
          mode === "fresh"
            ? { knowledgeEvidenceVersion: 1 }
            : { redacted: true }
        );
      }
    );
    it("does not let another tenant retain a source by copying its provenance", async () => {
      const { a, id } = await proposal();
      const other = await createTeachingFixture();
      users.push(other.userId);
      await q("UPDATE knowledge_sections SET merchant_id=? WHERE id=?", [
        other.merchantId,
        id,
      ]);
      await age(a.execution.id);
      await purgeCompletedInboundPayloads();
      expect((await row(a.execution.id)).payload_json).toEqual({
        redacted: true,
      });
    });
    it("does not protect an unrelated event from a matching numeric reference with the wrong event identity", async () => {
      const { a } = await proposal();
      await q(
        "UPDATE merchant_teaching_turns SET source_json=JSON_SET(source_json,'$.eventKey',REPEAT('a',64)) WHERE merchant_id=?",
        [f.merchantId]
      );
      await age(a.execution.id);
      await purgeCompletedInboundPayloads();
      expect((await row(a.execution.id)).payload_json).toEqual({
        redacted: true,
      });
    });
    it("never restores already-redacted evidence from the saved draft or turn", async () => {
      const { a, id } = await proposal();
      await age(a.execution.id);
      await q(
        "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_OBJECT('redacted',true),updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 DAY) WHERE id=?",
        [a.execution.id]
      );
      await purgeCompletedInboundPayloads();
      expect((await row(a.execution.id)).payload_json).toEqual({
        redacted: true,
      });
      expect(
        (await readConflictReview(f.merchantId, id)).teaching?.available
      ).toBe(false);
    });
    it("does not trust a caller-supplied minimization marker to retain excess fields", async () => {
      const { a } = await proposal();
      await age(a.execution.id);
      await q(
        "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.knowledgeEvidenceVersion',1),updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 DAY) WHERE id=?",
        [a.execution.id]
      );
      await purgeCompletedInboundPayloads();
      expect(
        (await row(a.execution.id)).payload_json.unusedSecret
      ).toBeUndefined();
    });
    it("bounds inbound mutations across minimization and redaction and makes progress on later runs", async () => {
      const { a } = await proposal(),
        unused = await f.event("غير مرتبط بمعرفة");
      await age(a.execution.id);
      await age(unused.execution.id);
      expect(await purgeCompletedInboundPayloads(1)).toBe(1);
      expect(
        (await row(a.execution.id)).payload_json.knowledgeEvidenceVersion
      ).toBe(1);
      expect(
        (await row(unused.execution.id)).payload_json.unusedSecret
      ).toBeDefined();
      expect(await purgeCompletedInboundPayloads(1)).toBe(1);
      expect((await row(unused.execution.id)).payload_json).toEqual({
        redacted: true,
      });
      expect(await purgeCompletedInboundPayloads(1)).toBe(0);
    });
  }
);
