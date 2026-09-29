import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  call: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: mocks.send }),
}));
vi.mock("./openai", () => ({ callGPT4: mocks.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("./zahypi-client", () => ({
  runWithZahyPiContext: (_: unknown, run: () => unknown) => run(),
  resolveZahyPiRuntimeConfig: async () => ({ enabled: false }),
  getOptionalZahyPiRequestContext: () => undefined,
}));
import { getPool, getDb, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { ensureCoachingTestSchema } from "../tests/helpers/coaching-schema";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
import { enqueueInbound, assertInboundOwned } from "../messaging/inbound-jobs";
import {
  createContextualCoachingSession,
  findCoachingReview,
  commitCoachingReview,
  coachingDeliveryKey,
  type CoachingCandidate,
  type CoachingReview,
} from "./coaching-store";
import {
  sendCurrentCoachingQuestion,
  canDispatchCoachingQuestion,
} from "./coaching-delivery";
import { handleContextualCoachingReply } from "./coaching-handler";
import {
  getReviewCandidates,
  getActiveSession,
  getCoachingStats,
  expireStaleSessions,
} from "../db/coaching";
import { sendMerchantWhatsApp } from "../channels/whatsapp/service";
import { knowledgeChangelog } from "../../drizzle/schema";
import { deleteSection, getBotSections } from "../db/knowledge";
import { coachingHash, type CoachingDecision } from "./coaching-understanding";

describe.skipIf(!process.env.DATABASE_URL)(
  "sourced coaching transactions and transport on MySQL",
  () => {
    const users: number[] = [],
      author = "966500000032",
      customer = "966500000072";
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      instanceId: number,
      account: string;
    const query = async (
      statement: string,
      args: unknown[] = []
    ): Promise<any> => (await (await getPool())!.execute(statement, args))[0];
    beforeAll(ensureCoachingTestSchema);
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("coaching");
      users.push(owner.userId);
      account = randomUUID();
      await query("UPDATE merchants SET phone=? WHERE id=?", [
        author,
        owner.merchantId,
      ]);
      const instance = await query(
        "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,provider,is_primary) VALUES (?,?,'fixture','active','green_api',1)",
        [owner.merchantId, account]
      );
      instanceId = instance.insertId;
      mocks.send.mockImplementation(async () => ({
        accepted: true,
        outcome: "accepted",
        status: "sent",
        providerMessageId: randomUUID(),
      }));
      mocks.settings.mockResolvedValue({
        isActive: true,
        model: "central-fixture-model",
      });
      mocks.call.mockImplementation(async (messages: any[]) => {
        const data = JSON.parse(messages[1].content);
        return JSON.stringify({
          version: 1,
          basisHash: data.basisHash,
          verdict: "correct",
          confidence: 0.99,
          ambiguous: false,
          conditional: false,
          rationale: "تصحيح صريح مرتبط بالسؤال",
          evidence: data.merchantReply,
        });
      });
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    async function candidate(index = 0): Promise<CoachingCandidate> {
      const conversation = await query(
        "INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",
        [owner.merchantId, customer]
      );
      const question = `هل الدورة ${index} مسائية؟`,
        answer = `الدورة ${index} مسائية حضورية، وتبدأ في الثامنة مساءً.`;
      const incoming = await query(
        "INSERT INTO messages (conversationId,direction,messageType,content,sender_type,isProcessed) VALUES (?,'incoming','text',?,'customer',1)",
        [conversation.insertId, question]
      );
      const outgoing = await query(
        "INSERT INTO messages (conversationId,direction,messageType,content,sender_type,isProcessed,aiResponse) VALUES (?,'outgoing','text',?,'assistant',1,?)",
        [conversation.insertId, answer, answer]
      );
      return {
        conversationId: conversation.insertId,
        incomingId: incoming.insertId,
        outgoingId: outgoing.insertId,
        customerQuestion: question,
        botResponse: answer,
      };
    }
    async function session(count = 1) {
      const candidates = await Promise.all(
        Array.from({ length: count }, (_, i) => candidate(i))
      );
      const id = (await createContextualCoachingSession(
        owner.merchantId,
        candidates
      ))!;
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        true
      );
      const questions = await query(
        "SELECT * FROM sari_coaching_questions WHERE session_id=? ORDER BY question_order",
        [id]
      );
      const [delivery] = await query(
        "SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?",
        [owner.merchantId, questions[0].delivery_key]
      );
      return { id, questions, delivery, candidates };
    }
    async function inbound(
      quote: string,
      text = "التصحيح: الدورة عن بعد وتبدأ التاسعة مساءً.",
      sender = author
    ) {
      const payload = {
        typeWebhook: "incomingMessageReceived",
        instanceData: { idInstance: account },
        idMessage: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        senderData: { sender: `${sender}@c.us`, chatId: `${sender}@c.us` },
        messageData: {
          typeMessage: "quotedMessage",
          extendedTextMessageData: { text, stanzaId: quote },
          quotedMessage: {
            stanzaId: quote,
            textMessage: "سياق مقتبس لا نعتمد عليه",
          },
        },
      };
      const queued = await enqueueInbound({
          payload,
          source: "webhook",
          expectedMerchantId: owner.merchantId,
        }),
        token = randomUUID();
      await query(
        "UPDATE whatsapp_inbound_jobs SET status='running',lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=?",
        [token, queued.id]
      );
      const [row] = await query(
        "SELECT * FROM whatsapp_inbound_jobs WHERE id=?",
        [queued.id]
      );
      const execution: InboundExecution = {
        id: row.id,
        merchantId: owner.merchantId,
        instanceId,
        token,
        eventKey: row.event_key,
        partitionKey: row.partition_key,
        sendOrdinal: 0,
        assertOwned: () =>
          assertInboundOwned({ id: row.id, lease_token: token }),
      };
      const within = <T>(run: () => Promise<T>) =>
        withInboundExecution({ ...execution }, run);
      return {
        execution,
        text,
        within,
        run: () =>
          within(() =>
            handleContextualCoachingReply(owner.merchantId, text, quote)
          ),
        read: () =>
          within(() => findCoachingReview(owner.merchantId, text, quote)),
      };
    }
    const decision = (
      review: CoachingReview,
      verdict: CoachingDecision["verdict"] = "correct"
    ): CoachingDecision => ({
      version: 1,
      basisHash: review.basisHash,
      verdict,
      confidence: 0.99,
      ambiguous: false,
      conditional: false,
      rationale: "مراجعة موثقة",
      evidence: review.source.text,
    });
    const sections = () =>
      query("SELECT * FROM knowledge_sections WHERE merchant_id=?", [
        owner.merchantId,
      ]);
    it("creates one complete session under concurrent triggers and verifies actual question delivery", async () => {
      const candidates = [await candidate()];
      const ids = await Promise.all([
        createContextualCoachingSession(owner.merchantId, candidates),
        createContextualCoachingSession(owner.merchantId, candidates),
      ]);
      expect(ids[0]).toBe(ids[1]);
      expect(
        await query(
          "SELECT * FROM sari_coaching_sessions WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
      await Promise.all([
        sendCurrentCoachingQuestion(owner.merchantId, ids[0]!),
        sendCurrentCoachingQuestion(owner.merchantId, ids[0]!),
      ]);
      expect(mocks.send).toHaveBeenCalledOnce();
      const request = mocks.send.mock.calls[0][1];
      expect(request.text).toContain(candidates[0].customerQuestion);
      expect(request.text).toContain(candidates[0].botResponse);
      expect(request.text).toContain("Reply");
      expect(await getActiveSession(owner.merchantId)).toMatchObject({
        id: ids[0],
        currentQuestionIndex: 0,
        totalQuestions: 1,
      });
    });
    it("stores correction, provenance, audit, verdict and session counters together without publishing it", async () => {
      const s = await session(),
        reply = await inbound(s.delivery.provider_message_id);
      expect((await reply.run()).response).toContain("قبل اعتماده");
      const [q] = await query(
        "SELECT * FROM sari_coaching_questions WHERE session_id=?",
        [s.id]
      );
      expect(q.merchant_verdict).toBe("corrected");
      expect(q.merchant_correction).toBe(reply.text);
      const [state] = await query(
        "SELECT * FROM sari_coaching_sessions WHERE id=?",
        [s.id]
      );
      expect(state).toMatchObject({
        status: "completed",
        current_question_index: 1,
        corrected_count: 1,
        correct_count: 0,
      });
      const [section] = await sections();
      expect(section.content).toContain(reply.text);
      expect(section.content).toContain(s.candidates[0].botResponse);
      expect(section).toMatchObject({
        status: "pending_review",
        use_in_bot: 0,
      });
      expect(await getBotSections(owner.merchantId)).toHaveLength(0);
      expect(
        await query("SELECT * FROM sari_learning_signals WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("does not consume a second question on replay or publish deleted knowledge again", async () => {
      const s = await session(2),
        reply = await inbound(s.delivery.provider_message_id);
      const result = await reply.run();
      expect(result.nextSessionId).toBe(s.id);
      const [section] = await sections();
      await deleteSection(section.id, owner.merchantId);
      expect((await reply.run()).response).toContain("سبق تسجيل");
      const [state] = await query(
        "SELECT * FROM sari_coaching_sessions WHERE id=?",
        [s.id]
      );
      expect(state.current_question_index).toBe(1);
      expect(state.corrected_count).toBe(1);
      expect(await sections()).toHaveLength(0);
      expect(mocks.call).toHaveBeenCalledOnce();
    });
    it("admits the same review once under six concurrent writes", async () => {
      const s = await session(2),
        reply = await inbound(s.delivery.provider_message_id),
        review = (await reply.read())!;
      const outcomes = await Promise.all(
        Array.from({ length: 6 }, () =>
          reply.within(() => commitCoachingReview(review, decision(review)))
        )
      );
      expect(outcomes.filter(result => !result.replayed)).toHaveLength(1);
      expect(await sections()).toHaveLength(1);
      const [state] = await query(
        "SELECT * FROM sari_coaching_sessions WHERE id=?",
        [s.id]
      );
      expect(state.current_question_index).toBe(1);
      expect(state.corrected_count).toBe(1);
    });
    it("rejects competing events for an already decided question", async () => {
      const s = await session(),
        a = await inbound(s.delivery.provider_message_id),
        b = await inbound(s.delivery.provider_message_id, "الرد صحيح بالكامل");
      const ra = (await a.read())!,
        rb = (await b.read())!;
      await a.within(() => commitCoachingReview(ra, decision(ra)));
      await expect(
        b.within(() => commitCoachingReview(rb, decision(rb, "confirm")))
      ).rejects.toThrow("already reviewed");
      expect(await sections()).toHaveLength(1);
    });
    it.each([
      "lease",
      "phone",
      "instance",
      "provider",
      "account",
      "question",
      "answer",
      "history",
      "cutoff",
      "session",
      "index",
      "receipt",
      "recipient",
      "prompt",
      "owner",
    ] as const)("rechecks %s drift after AI before writing", async change => {
      const s = await session(),
        reply = await inbound(s.delivery.provider_message_id);
      mocks.call.mockImplementationOnce(async (messages: any[]) => {
        const data = JSON.parse(messages[1].content);
        if (change === "lease")
          await query(
            "UPDATE whatsapp_inbound_jobs SET lease_token=? WHERE id=?",
            [randomUUID(), reply.execution.id]
          );
        if (change === "phone")
          await query("UPDATE merchants SET phone=NULL WHERE id=?", [
            owner.merchantId,
          ]);
        if (change === "instance")
          await query(
            "UPDATE whatsapp_instances SET status='inactive' WHERE id=?",
            [instanceId]
          );
        if (change === "provider")
          await query(
            "UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",
            [instanceId]
          );
        if (change === "account")
          await query(
            "UPDATE whatsapp_instances SET instance_id=? WHERE id=?",
            [randomUUID(), instanceId]
          );
        if (change === "owner")
          await query(
            "UPDATE users SET account_status='deletion_pending' WHERE id=?",
            [owner.userId]
          );
        if (change === "question")
          await query(
            "UPDATE sari_coaching_questions SET customer_question='tampered' WHERE id=?",
            [s.questions[0].id]
          );
        if (change === "answer")
          await query(
            "UPDATE messages SET content='changed',aiResponse='changed' WHERE id=?",
            [s.candidates[0].outgoingId]
          );
        if (change === "history")
          await query("UPDATE messages SET content='changed' WHERE id=?", [
            s.candidates[0].incomingId,
          ]);
        if (change === "cutoff")
          await query(
            "INSERT INTO customer_profiles (merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)",
            [owner.merchantId, customer, s.candidates[0].incomingId]
          );
        if (change === "session")
          await query(
            "UPDATE sari_coaching_sessions SET status='completed' WHERE id=?",
            [s.id]
          );
        if (change === "index")
          await query(
            "UPDATE sari_coaching_sessions SET current_question_index=1 WHERE id=?",
            [s.id]
          );
        if (change === "receipt")
          await query(
            "UPDATE whatsapp_message_deliveries SET status='failed' WHERE id=?",
            [s.delivery.id]
          );
        if (change === "recipient")
          await query(
            "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966500000099') WHERE id=?",
            [s.delivery.id]
          );
        if (change === "prompt")
          await query(
            "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','tampered') WHERE id=?",
            [s.delivery.id]
          );
        return JSON.stringify({
          version: 1,
          basisHash: data.basisHash,
          verdict: "correct",
          confidence: 0.99,
          ambiguous: false,
          conditional: false,
          rationale: "fixture",
          evidence: reply.text,
        });
      });
      expect((await reply.run()).response).toContain("لم أؤكد");
      expect(await sections()).toHaveLength(0);
      expect(
        (
          await query(
            "SELECT merchant_verdict FROM sari_coaching_questions WHERE id=?",
            [s.questions[0].id]
          )
        )[0].merchant_verdict
      ).toBeNull();
    });
    it("rolls back correction and counters if the audit insert fails", async () => {
      const s = await session(),
        reply = await inbound(s.delivery.provider_message_id),
        review = (await reply.read())!,
        db = (await getDb())!,
        transaction = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementationOnce((async (run: any) =>
        transaction(async tx => {
          const insert = tx.insert.bind(tx);
          vi.spyOn(tx, "insert").mockImplementation(((table: any) => {
            if (table === knowledgeChangelog)
              throw Error("fixture audit failure");
            return insert(table);
          }) as any);
          return run(tx);
        })) as any);
      await expect(
        reply.within(() => commitCoachingReview(review, decision(review)))
      ).rejects.toThrow("fixture audit failure");
      expect(await sections()).toHaveLength(0);
      expect(
        (
          await query(
            "SELECT current_question_index FROM sari_coaching_sessions WHERE id=?",
            [s.id]
          )
        )[0].current_question_index
      ).toBe(0);
    });
    it.each([
      "foreign_sender",
      "unknown_quote",
      "forged_source",
      "old_without_context",
    ] as const)("rejects invalid review source %s", async mode => {
      const s = await session();
      if (mode === "old_without_context")
        await query(
          "UPDATE sari_coaching_questions SET context_json=NULL WHERE id=?",
          [s.questions[0].id]
        );
      const reply = await inbound(
        mode === "unknown_quote"
          ? randomUUID()
          : s.delivery.provider_message_id,
        undefined,
        mode === "foreign_sender" ? "966500000099" : author
      );
      if (mode === "forged_source") reply.execution.eventKey = "a".repeat(64);
      const result = await reply.run();
      expect(result.handled).toBe(mode !== "unknown_quote");
      expect(mocks.call).not.toHaveBeenCalled();
      expect(await sections()).toHaveLength(0);
    });
    it("cannot review another tenant question or steal a source into another transaction", async () => {
      const s = await session(),
        reply = await inbound(s.delivery.provider_message_id),
        review = (await reply.read())!,
        other = await createDisposableMerchant("coach-other");
      users.push(other.userId);
      await expect(
        reply.within(() =>
          findCoachingReview(
            other.merchantId,
            reply.text,
            s.delivery.provider_message_id
          )
        )
      ).rejects.toThrow();
      await expect(
        reply.within(() =>
          commitCoachingReview(
            {
              ...review,
              source: { ...review.source, merchantId: other.merchantId },
            },
            decision(review)
          )
        )
      ).rejects.toThrow();
      expect(await sections()).toHaveLength(0);
    });
    it("allows a sourced late review within 24 hours but not an old session", async () => {
      const s = await session();
      await query(
        "UPDATE sari_coaching_sessions SET started_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 HOUR) WHERE id=?",
        [s.id]
      );
      await expireStaleSessions();
      const reply = await inbound(s.delivery.provider_message_id);
      expect((await reply.run()).response).toContain("حفظت تصحيحك");
    });
    it("does not reactivate an expired session older than 24 hours", async () => {
      const s = await session();
      await query(
        "UPDATE sari_coaching_sessions SET status='expired',created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 25 HOUR) WHERE id=?",
        [s.id]
      );
      const reply = await inbound(s.delivery.provider_message_id);
      expect((await reply.run()).response).toContain("لم يعد");
      expect(mocks.call).not.toHaveBeenCalled();
    });
    it("stores a skip without knowledge or a positive learning signal and excludes it from the confirmation rate", async () => {
      const s = await session(2),
        reply = await inbound(
          s.delivery.provider_message_id,
          "تجاوز هذا السؤال"
        ),
        review = (await reply.read())!;
      await reply.within(() =>
        commitCoachingReview(review, decision(review, "skip"))
      );
      expect(await sendCurrentCoachingQuestion(owner.merchantId, s.id)).toBe(
        true
      );
      const [d] = await query(
        "SELECT * FROM whatsapp_message_deliveries WHERE idempotency_key=?",
        [s.questions[1].delivery_key]
      );
      const next = await inbound(
          d.provider_message_id,
          "هذا الرد صحيح بالكامل"
        ),
        r = (await next.read())!;
      await next.within(() => commitCoachingReview(r, decision(r, "confirm")));
      expect(await getCoachingStats(owner.merchantId)).toMatchObject({
        totalReviewed: 1,
        correctRate: 1,
        totalSessions: 1,
      });
      expect(await sections()).toHaveLength(0);
    });
    it("does not send a question with altered context or a missing guard through transport", async () => {
      const c = await candidate(),
        id = (await createContextualCoachingSession(owner.merchantId, [c]))!;
      const [q] = await query(
        "SELECT * FROM sari_coaching_questions WHERE session_id=?",
        [id]
      );
      const ctx =
        typeof q.context_json === "string"
          ? JSON.parse(q.context_json)
          : q.context_json;
      expect(
        (
          await sendMerchantWhatsApp({
            merchantId: owner.merchantId,
            instanceRecordId: instanceId,
            idempotencyKey: q.delivery_key,
            to: author,
            kind: "text",
            text: ctx.prompt,
          })
        ).accepted
      ).toBe(false);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(
        await canDispatchCoachingQuestion(
          {
            merchantId: owner.merchantId,
            instanceRecordId: instanceId,
            idempotencyKey: q.delivery_key,
            to: author,
            kind: "text",
            text: "tampered",
            coachingGuard: { questionId: q.id },
          },
          { provider: "green_api", instanceId: account, token: "fixture" }
        )
      ).toBe(false);
    });
    it("never retries a question whose provider result is unknown", async () => {
      const id = (await createContextualCoachingSession(owner.merchantId, [
        await candidate(),
      ]))!;
      mocks.send.mockResolvedValue({
        accepted: false,
        outcome: "unknown",
        status: "failed",
        errorCode: "provider_unreachable",
      });
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        false
      );
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        false
      );
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it.each(["source", "recipient", "position", "account"] as const)(
      "checks %s again at the provider boundary before sending a question",
      async change => {
        const c = await candidate();
        const id = (await createContextualCoachingSession(owner.merchantId, [
          c,
        ]))!;
        const [q] = await query(
          "SELECT * FROM sari_coaching_questions WHERE session_id=?",
          [id]
        );
        const ctx =
          typeof q.context_json === "string"
            ? JSON.parse(q.context_json)
            : q.context_json;
        if (change === "source")
          await query("UPDATE messages SET content='changed' WHERE id=?", [
            c.incomingId,
          ]);
        if (change === "recipient")
          await query("UPDATE merchants SET phone='966500000099' WHERE id=?", [
            owner.merchantId,
          ]);
        if (change === "position")
          await query(
            "UPDATE sari_coaching_sessions SET current_question_index=1 WHERE id=?",
            [id]
          );
        if (change === "account")
          await query(
            "UPDATE whatsapp_instances SET instance_id=? WHERE id=?",
            [randomUUID(), instanceId]
          );
        const result = await sendMerchantWhatsApp({
          merchantId: owner.merchantId,
          instanceRecordId: instanceId,
          idempotencyKey: q.delivery_key,
          to: author,
          kind: "text",
          text: ctx.prompt,
          coachingGuard: { questionId: q.id },
        });
        expect(result.accepted).toBe(false);
        expect(mocks.send).not.toHaveBeenCalled();
      }
    );
    it("cannot retry a failed coaching delivery by stripping its guard", async () => {
      const c = await candidate();
      const id = (await createContextualCoachingSession(owner.merchantId, [
        c,
      ]))!;
      mocks.send.mockResolvedValue({
        accepted: false,
        outcome: "rejected",
        status: "failed",
        errorCode: "fixture",
      });
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        false
      );
      const [q] = await query(
        "SELECT * FROM sari_coaching_questions WHERE session_id=?",
        [id]
      );
      const result = await sendMerchantWhatsApp({
        merchantId: owner.merchantId,
        instanceRecordId: instanceId,
        idempotencyKey: q.delivery_key,
        to: author,
        kind: "text",
        text: "replayed without guard",
        retryFailed: true,
      });
      expect(result.accepted).toBe(false);
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("rejects an altered inference context even when the original basis hash is copied", async () => {
      const s = await session(),
        reply = await inbound(s.delivery.provider_message_id),
        review = (await reply.read())!;
      const changed = {
        ...review,
        context: { ...review.context, prompt: "different question" },
      };
      await expect(
        reply.within(() => commitCoachingReview(changed, decision(review)))
      ).rejects.toThrow("basis changed");
      expect(await sections()).toHaveLength(0);
    });
    it("masks sensitive fields in both displayed texts without rewriting the stored conversation", async () => {
      const c = await candidate();
      const sensitive =
        "client@example.test SA0380000000608010167519 4111-1111-1111-1111";
      c.customerQuestion += " " + sensitive;
      c.botResponse += " " + sensitive;
      await query("UPDATE messages SET content=? WHERE id=?", [
        c.customerQuestion,
        c.incomingId,
      ]);
      await query("UPDATE messages SET content=?,aiResponse=? WHERE id=?", [
        c.botResponse,
        c.botResponse,
        c.outgoingId,
      ]);
      const id = (await createContextualCoachingSession(owner.merchantId, [
        c,
      ]))!;
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        true
      );
      const text = mocks.send.mock.calls[0][1].text as string;
      for (const value of sensitive.split(" "))
        expect(text).not.toContain(value);
      expect(text.match(/\[بريد محذوف\]/g)).toHaveLength(2);
      expect(text.match(/\[حساب محذوف\]/g)).toHaveLength(2);
      expect(text.match(/\[رقم محذوف\]/g)).toHaveLength(2);
      const [q] = await query(
        "SELECT * FROM sari_coaching_questions WHERE session_id=?",
        [id]
      );
      expect(q.customer_question).toBe(c.customerQuestion);
      expect(q.bot_response).toBe(c.botResponse);
      const reply = await inbound(
        (
          await query(
            "SELECT provider_message_id FROM whatsapp_message_deliveries WHERE idempotency_key=?",
            [q.delivery_key]
          )
        )[0].provider_message_id
      );
      expect((await reply.read())!.context.messages[0].content).toBe(
        c.customerQuestion
      );
    });
    it.each([NaN, Infinity, -5, "1; DROP TABLE messages" as unknown as number])(
      "bounds the database candidate limit for %s",
      async limit => {
        await candidate();
        await candidate(1);
        expect(await getReviewCandidates(owner.merchantId, limit)).toHaveLength(
          1
        );
      }
    );
    it.each([
      "merchant",
      "unknown",
      "not_processed",
      "changed_ai_response",
    ] as const)(
      "does not sample a response with unverified AI authorship (%s)",
      async kind => {
        const c = await candidate();
        if (kind === "not_processed")
          await query("UPDATE messages SET isProcessed=0 WHERE id=?", [
            c.outgoingId,
          ]);
        else if (kind === "changed_ai_response")
          await query("UPDATE messages SET aiResponse='different' WHERE id=?", [
            c.outgoingId,
          ]);
        else
          await query("UPDATE messages SET sender_type=? WHERE id=?", [
            kind,
            c.outgoingId,
          ]);
        expect(await getReviewCandidates(owner.merchantId)).toHaveLength(0);
        await expect(
          createContextualCoachingSession(owner.merchantId, [c])
        ).rejects.toThrow();
        expect(
          await query(
            "SELECT * FROM sari_coaching_sessions WHERE merchant_id=?",
            [owner.merchantId]
          )
        ).toHaveLength(0);
      }
    );
    it("preserves leading/trailing text and never truncates the training question", async () => {
      const c = await candidate();
      c.customerQuestion = "  " + c.customerQuestion + "  ";
      await query("UPDATE messages SET content=? WHERE id=?", [
        c.customerQuestion,
        c.incomingId,
      ]);
      expect(
        (await getReviewCandidates(owner.merchantId))[0].customerQuestion
      ).toBe(c.customerQuestion);
      const id = (await createContextualCoachingSession(owner.merchantId, [
        c,
      ]))!;
      expect(await sendCurrentCoachingQuestion(owner.merchantId, id)).toBe(
        true
      );
      expect(mocks.send.mock.calls[0][1].text).toContain(c.customerQuestion);
    });
    it("cannot create partial sessions from a foreign or oversized second candidate", async () => {
      const first = await candidate(),
        second = await candidate(1);
      second.botResponse = "ن".repeat(3001);
      await query("UPDATE messages SET content=?,aiResponse=? WHERE id=?", [
        second.botResponse,
        second.botResponse,
        second.outgoingId,
      ]);
      await expect(
        createContextualCoachingSession(owner.merchantId, [first, second])
      ).rejects.toThrow();
      expect(
        await query(
          "SELECT * FROM sari_coaching_sessions WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
    });
  }
);
