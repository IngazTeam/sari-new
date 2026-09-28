import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash } from "node:crypto";
const model = vi.hoisted(() => ({ call: vi.fn(), settings: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: model.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: model.settings,
}));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { learningUnderstandingFixture } from "../tests/helpers/learning-understanding-fixture";
import {
  understandConversation,
  readStoredUnderstanding,
} from "./conversation-understanding";
import {
  withConversationUnderstanding,
  conversationUnderstandingSchema,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import {
  captureContextualLearningSignals,
  type ContextualLearningInput,
} from "./contextual-learning";
import { captureConversationSignals } from "./learning-engine";
import { persistLearningAnalysis } from "./learning-analysis";
import { snapshotLearningSignals } from "./learning-analysis-contract";
import { getLearningEvidence } from "../db/learning";
import { buildReplyPlan } from "../messaging/reply-plan";
import {
  stageInteraction,
  finishInteractionDelivery,
  runInteractionJob,
} from "./interaction-jobs";
import type { ContextualLearningSignal } from "./contextual-learning-contract";

describe.skipIf(!process.env.DATABASE_URL)(
  "sealed contextual learning lifecycle and local penetration checks",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      users: number[],
      input: ContextualLearningInput & {
        customerPhone: string;
        message: string;
      };
    let previousId: number,
      changes: Partial<ConversationUnderstanding>,
      types: ContextualLearningSignal["type"][];
    const q = async (sql: string, args: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const rows = () =>
      q("SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id", [
        owner.merchantId,
      ]);
    const job = async () =>
      (
        await q("SELECT * FROM ai_interaction_jobs WHERE id=?", [input.jobId])
      )[0];
    const interpret = () => understandConversation(input);
    const capture = () => captureContextualLearningSignals(input);
    const pending = () =>
      q(
        "UPDATE ai_interaction_jobs SET state='pending',lease_token=NULL,lease_until=NULL,available_at=UTC_TIMESTAMP(3) WHERE id=?",
        [input.jobId]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("contextual-learning");
      users = [owner.userId];
      changes = {};
      types = ["positive_feedback", "price_objection"];
      const conv = await q(
        "INSERT INTO conversations(merchantId,customerPhone,deal_stage) VALUES (?,'966500000088','qualified')",
        [owner.merchantId]
      );
      const text = "هذه الفروق بين الباقات وكيف تناسب احتياجك.";
      previousId = (
        await q(
          "INSERT INTO messages(conversationId,direction,messageType,content,aiResponse,isProcessed,sender_type) VALUES (?,'outgoing','text',?,?,1,'assistant')",
          [conv.insertId, text, text]
        )
      ).insertId;
      const message = "توضيحك أفادني لكن ميزانيتي أقل من تكلفة هذه الباقة";
      const incoming = (
        await q(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
          [conv.insertId, message]
        )
      ).insertId;
      const plan = buildReplyPlan({
        merchantId: owner.merchantId,
        conversationId: conv.insertId,
        incomingMessageId: incoming,
        instanceId: 1,
        providerAccount: "synthetic",
        eventId: `learning:${incoming}`,
        to: "966500000088",
        text: "هذا الرد الجديد لم يكن مكتوبًا حين علّق العميل على الرد السابق.",
      });
      await stageInteraction(plan);
      await finishInteractionDelivery(plan, true);
      const [saved] = await q(
        "SELECT id FROM ai_interaction_jobs WHERE merchant_id=?",
        [owner.merchantId]
      );
      input = {
        merchantId: owner.merchantId,
        conversationId: conv.insertId,
        incomingMessageId: incoming,
        customerPhone: "966500000088",
        message,
        jobId: saved.id,
        leaseToken: "synthetic-learning-claim",
      };
      await q(
        "UPDATE ai_interaction_jobs SET state='processing',lease_token=?,lease_until=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?",
        [input.leaseToken, input.jobId]
      );
      model.settings.mockReset().mockResolvedValue({
        model: "superadmin-learning-model",
        textGenerationProvider: "openai",
        isActive: true,
      });
      model.call
        .mockReset()
        .mockImplementation(async messages =>
          JSON.stringify(
            learningUnderstandingFixture(
              JSON.parse(messages[1].content),
              types,
              changes
            )
          )
        );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
    });
    afterAll(closeDb);
    it.each(["openai", "zahypi"])(
      "uses the shared %s interpretation once and deduplicates concurrent learning",
      async provider => {
        model.settings.mockResolvedValue({
          model: "superadmin-learning-model",
          textGenerationProvider: provider,
          isActive: true,
        });
        const context = await interpret();
        expect(context).not.toBeNull();
        expect(model.call).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            model: "superadmin-learning-model",
            taskType: "sari.customer.intent",
            noRetry: true,
          })
        );
        const result = await withConversationUnderstanding(context!, () =>
          Promise.all(Array.from({ length: 6 }, capture))
        );
        expect(result.reduce((n, v) => n + v, 0)).toBe(2);
        const saved = await rows();
        expect(saved.map((s: any) => s.signal_type).sort()).toEqual([
          "positive_feedback",
          "price_objection",
        ]);
        for (const row of saved) {
          expect(row.customer_message).toBe(input.message);
          expect(row.bot_message).toBe(
            "هذه الفروق بين الباقات وكيف تناسب احتياجك."
          );
          expect(JSON.parse(row.context_summary)).toMatchObject({
            basis: "interpreted_conversation",
            sourceMessageId: input.incomingMessageId,
            aboutAssistantMessageId: previousId,
            interpretationDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
            financialOutcome: "unmeasured",
            causality: "unmeasured",
          });
        }
        expect(
          await q("SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
        expect(
          await q("SELECT id FROM ai_learning_proposals WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
        expect(model.call).toHaveBeenCalledOnce();
      }
    );
    it.each([
      "positive_feedback",
      "question_repeated",
      "price_objection",
      "sales_objection",
      "escalation_requested",
      "knowledge_gap",
    ] as ContextualLearningSignal["type"][])(
      "stores centrally interpreted %s with the correct source and fixed server weight",
      async type => {
        types = [type];
        expect(await interpret()).not.toBeNull();
        expect(await capture()).toBe(1);
        expect((await rows())[0].signal_type).toBe(type);
        if (type === "sales_objection")
          expect(JSON.parse((await rows())[0].context_summary).objection).toBe(
            "trust"
          );
      }
    );
    it("keeps contextual objection evidence descriptive through proposal review and retry", async () => {
      types = ["sales_objection"];
      await interpret();
      await capture();
      const sources = await rows();
      expect(
        await persistLearningAnalysis(
          snapshotLearningSignals(owner.merchantId, sources),
          {
            updates: [
              {
                dimension: "objection_handling",
                insight:
                  "راجع إثباتات الاعتماد المتاحة مع العميل قبل طلب القرار.",
                confidence: 0.7,
                supporting_signal_ids: [sources[0].id],
                contrary_signal_ids: [],
              },
            ],
            knowledge_gaps: [],
          }
        )
      ).toMatchObject({ status: "applied", proposalCount: 1 });
      const evidence = await getLearningEvidence(owner.merchantId);
      expect(evidence).toMatchObject({
        verifiedPurchases: 0,
        verifiedRefunds: 0,
        proposalCount: 1,
      });
      expect(evidence.proposals[0]).toMatchObject({
        status: "proposed",
        evidenceCount: 1,
        evidence: [
          expect.objectContaining({
            signalId: sources[0].id,
            type: "sales_objection",
            excerpt: input.message,
          }),
        ],
      });
      const saved = await rows();
      expect(saved[0].analyzed).toBe(1);
      expect(saved[0].bot_message).toBe(
        "هذه الفروق بين الباقات وكيف تناسب احتياجك."
      );
      expect(JSON.parse(saved[0].context_summary)).toMatchObject({
        basis: "interpreted_conversation",
        financialOutcome: "unmeasured",
        causality: "unmeasured",
      });
      expect(await capture()).toBe(0);
      expect(await rows()).toEqual(saved);
      expect(
        await q("SELECT id FROM sari_behavioral_dna WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(model.call).toHaveBeenCalledOnce();
    });
    it("rejects a prior reply whose authorship changes while the model is running", async () => {
      const original = model.call.getMockImplementation()!;
      model.call.mockImplementation(async messages => {
        const response = await original(messages);
        await q("UPDATE messages SET sender_type='merchant' WHERE id=?", [
          previousId,
        ]);
        return response;
      });
      expect(await interpret()).toBeNull();
      expect(await capture()).toBe(0);
      expect(await rows()).toHaveLength(0);
    });
    it.each(["missing", "historic", "empty", "uncertain"])(
      "does not learn from %s analysis or the wording of a new reply",
      async kind => {
        if (kind !== "missing") {
          if (kind === "historic")
            model.call.mockImplementation(async messages => {
              const value = learningUnderstandingFixture(
                JSON.parse(messages[1].content)
              );
              delete value.learningSignals;
              return JSON.stringify(value);
            });
          if (kind === "empty") types = [];
          if (kind === "uncertain") {
            types = [];
            changes.confidence = 0.4;
          }
          expect(await interpret()).not.toBeNull();
        }
        expect(await capture()).toBe(0);
        expect(await rows()).toHaveLength(0);
      }
    );
    it("retains old seals without the optional authorship or learning fields", async () => {
      types = [];
      await interpret();
      const [r] = await q(
        "SELECT * FROM ai_conversation_understanding WHERE merchant_id=?",
        [owner.merchantId]
      );
      const read = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
      const evidence = read(r.message_evidence).map((e: any) => ({
        id: e.id,
        role: e.role,
        digest: e.digest,
        createdAt: e.createdAt,
      }));
      const raw = read(r.result_json);
      delete raw.learningSignals;
      const analysis = conversationUnderstandingSchema.parse(raw);
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            source: r.source_digest,
            context: r.context_digest,
            evidence,
            analysis,
          })
        )
        .digest("hex");
      await q(
        "UPDATE ai_conversation_understanding SET result_json=?,message_evidence=?,result_digest=? WHERE id=?",
        [JSON.stringify(analysis), JSON.stringify(evidence), digest, r.id]
      );
      expect(
        (await readStoredUnderstanding((await getPool())!, input, true))
          ?.analysis
      ).not.toHaveProperty("learningSignals");
      expect(await capture()).toBe(0);
    });
    it("ignores caller-provided text, response attribution and source keys", async () => {
      await interpret();
      await captureConversationSignals({
        ...input,
        customerMessage: "untrusted override",
        botResponse: "wrong new reply",
        previousBotResponse: "wrong prior reply",
        sourceKey: "caller-key",
        strict: true,
      });
      for (const s of await rows()) {
        expect(s.source_key).toBe(
          `contextual_learning:${input.conversationId}:${input.incomingMessageId}`
        );
        expect(s.customer_message).toBe(input.message);
        expect(s.bot_message).not.toContain("wrong");
      }
    });
    it("does not attribute objections to an assistant when the model leaves the reference unbound", async () => {
      types = ["price_objection"];
      model.call.mockImplementation(async messages => {
        const value = learningUnderstandingFixture(
          JSON.parse(messages[1].content),
          types
        );
        value.learningSignals![0].aboutAssistantMessageId = null;
        value.learningSignals![0].evidence =
          value.learningSignals![0].evidence.filter(
            e => e.messageId === input.incomingMessageId
          );
        return JSON.stringify(value);
      });
      await interpret();
      expect(await capture()).toBe(1);
      expect((await rows())[0].bot_message).toBeNull();
    });
    it.each([
      "human reply",
      "missing AI marker",
      "future reference",
      "foreign evidence",
      "mismatched objection",
      "low confidence",
      "outage",
      "malformed",
    ])("fails closed on %s during interpretation", async attack => {
      if (attack === "human reply")
        await q("UPDATE messages SET sender_type='merchant' WHERE id=?", [
          previousId,
        ]);
      if (attack === "missing AI marker")
        await q("UPDATE messages SET aiResponse=NULL WHERE id=?", [previousId]);
      const original = model.call.getMockImplementation()!;
      model.call.mockImplementation(async messages => {
        if (attack === "outage") throw Error("Synthetic provider failure");
        if (attack === "malformed") return "شكرا";
        const value = JSON.parse(await original(messages));
        if (attack === "future reference")
          value.learningSignals[0].aboutAssistantMessageId =
            input.incomingMessageId + 1;
        if (attack === "foreign evidence")
          value.learningSignals[0].evidence.push({
            messageId: 900000000,
            excerpt: "شكر",
          });
        if (attack === "mismatched objection") value.objection = "none";
        if (attack === "low confidence") value.confidence = 0.4;
        return JSON.stringify(value);
      });
      expect(await interpret()).toBeNull();
      expect(await capture()).toBe(0);
      expect(await rows()).toHaveLength(0);
    });
    const mutate = async (kind: string) => {
      if (kind === "source")
        await q("UPDATE messages SET content='تغير المصدر' WHERE id=?", [
          input.incomingMessageId,
        ]);
      if (kind === "history")
        await q("UPDATE messages SET content='تغير الرد' WHERE id=?", [
          previousId,
        ]);
      if (kind === "timestamp")
        await q(
          "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
          [previousId]
        );
      if (kind === "authorship")
        await q("UPDATE messages SET sender_type='merchant' WHERE id=?", [
          previousId,
        ]);
      if (kind === "AI marker")
        await q("UPDATE messages SET aiResponse=NULL WHERE id=?", [previousId]);
      if (kind === "processed marker")
        await q("UPDATE messages SET isProcessed=0 WHERE id=?", [previousId]);
      if (kind === "handoff")
        await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
          input.conversationId,
        ]);
      if (kind === "ownership version")
        await q(
          "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
          [input.conversationId]
        );
      if (kind === "automation cutoff")
        await q(
          "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
          [input.incomingMessageId, input.conversationId]
        );
      if (kind === "memory cutoff")
        await q(
          "INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)",
          [owner.merchantId, input.customerPhone, input.incomingMessageId]
        );
      if (kind === "seal")
        await q(
          "UPDATE ai_conversation_understanding SET result_json=JSON_SET(result_json,'$.objection','trust') WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (kind === "analysis deleted")
        await q(
          "DELETE FROM ai_conversation_understanding WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (kind === "reply text")
        await q(
          "UPDATE ai_interaction_jobs SET reply_text='replaced' WHERE id=?",
          [input.jobId]
        );
      if (kind === "reply digest")
        await q(
          "UPDATE ai_interaction_jobs SET reply_digest=REPEAT('0',64) WHERE id=?",
          [input.jobId]
        );
      if (kind === "phone reassigned")
        await q(
          "UPDATE conversations SET customerPhone='966500000077' WHERE id=?",
          [input.conversationId]
        );
    };
    it.each([
      "source",
      "history",
      "timestamp",
      "authorship",
      "AI marker",
      "processed marker",
      "handoff",
      "ownership version",
      "automation cutoff",
      "memory cutoff",
      "seal",
      "analysis deleted",
      "reply text",
      "reply digest",
      "phone reassigned",
    ])("rechecks stored source authority after %s", async kind => {
      await interpret();
      await mutate(kind);
      await capture().catch(() => null);
      expect(await rows()).toHaveLength(0);
    });
    it("can learn a historical accepted turn after a later customer message without reading its contents", async () => {
      await interpret();
      await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','future secret changed my mind')",
        [input.conversationId]
      );
      expect(await capture()).toBe(2);
      expect(JSON.stringify(await rows())).not.toContain("future secret");
    });
    it.each([
      "pending",
      "waiting_delivery",
      "suppressed",
      "completed",
      "expired",
      "replaced",
    ])("rejects a worker whose claim is %s", async state => {
      await interpret();
      if (state === "expired")
        await q(
          "UPDATE ai_interaction_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?",
          [input.jobId]
        );
      else if (state === "replaced")
        await q(
          "UPDATE ai_interaction_jobs SET lease_token='other' WHERE id=?",
          [input.jobId]
        );
      else
        await q("UPDATE ai_interaction_jobs SET state=? WHERE id=?", [
          state,
          input.jobId,
        ]);
      await expect(capture()).rejects.toMatchObject({ code: "ownership" });
      expect(await rows()).toHaveLength(0);
    });
    it("rejects preview and mismatched scoped identities without accepting a forged in-memory signal", async () => {
      const context = await interpret();
      expect(context).not.toBeNull();
      for (const value of [
        { ...context!, mode: "preview" as const },
        { ...context!, merchantId: input.merchantId + 1 },
      ])
        await withConversationUnderstanding(value, async () => {
          await expect(capture()).rejects.toMatchObject({ code: "ownership" });
        });
      await withConversationUnderstanding(
        {
          ...context!,
          analysis: { ...context!.analysis, learningSignals: [] },
        },
        async () => expect(await capture()).toBe(2)
      );
    });
    it("rejects cross-tenant and cross-conversation claims without writing either tenant", async () => {
      await interpret();
      const other = await createDisposableMerchant("learning-other");
      users.push(other.userId);
      const conv = (
        await q(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000077')",
          [other.merchantId]
        )
      ).insertId;
      for (const changed of [
        { merchantId: other.merchantId },
        { conversationId: conv },
        { jobId: input.jobId + 9000000 },
        { incomingMessageId: previousId },
      ])
        await expect(
          captureContextualLearningSignals({ ...input, ...changed })
        ).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect(
        await q("SELECT id FROM sari_learning_signals WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toHaveLength(0);
    });
    const fill = async (count: number) =>
      q(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,analyzed,source_key) VALUES ${Array.from({ length: count }, () => "(?,?,'price_objection',1,?)").join(",")}`,
        Array.from({ length: count }, (_, i) => [
          input.merchantId,
          input.conversationId,
          `seed:${i}`,
        ]).flat()
      );
    it("rolls the entire message back if only one daily slot remains and retries later", async () => {
      await interpret();
      await fill(499);
      await expect(capture()).rejects.toMatchObject({ code: "daily_limit" });
      expect(await rows()).toHaveLength(499);
      await q(
        "UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,-1,UTC_DATE()) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await capture()).toBe(2);
      expect(await rows()).toHaveLength(501);
    });
    it("replays a committed batch at the quota without changing analyzed evidence", async () => {
      await interpret();
      await capture();
      await fill(498);
      await q(
        "UPDATE sari_learning_signals SET analyzed=1 WHERE merchant_id=?",
        [owner.merchantId]
      );
      const before = await rows();
      expect(await capture()).toBe(0);
      expect(await rows()).toEqual(before);
    });
    it("does not count the same message again during a rolling upgrade from keyword learning", async () => {
      await interpret();
      await q(
        "INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,source_key) VALUES (?,?,'price_objection',?)",
        [
          owner.merchantId,
          input.conversationId,
          `message:${input.incomingMessageId}`,
        ]
      );
      const before = await rows();
      expect(await capture()).toBe(0);
      expect(await rows()).toEqual(before);
    });
    const fault = async (kind: string) => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let inserts = 0;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get();
        return new Proxy(c, {
          get(t, key) {
            if (key === "execute")
              return async (...args: any[]) => {
                const sql = String(args[0]);
                if (
                  sql.includes("INSERT INTO sari_learning_signals") &&
                  ++inserts === 2 &&
                  kind === "second insert"
                )
                  throw Error("private synthetic source");
                const result = await (t.execute as any)(...args);
                if (
                  sql.includes("INSERT INTO sari_learning_signals") &&
                  inserts === 1
                ) {
                  if (kind === "source changed")
                    await t.execute(
                      "UPDATE messages SET content='mutated' WHERE id=?",
                      [input.incomingMessageId]
                    );
                  if (kind === "lease expired")
                    await t.execute(
                      "UPDATE ai_interaction_jobs SET lease_until=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP(3)) WHERE id=?",
                      [input.jobId]
                    );
                }
                return result;
              };
            if (key === "commit" && kind === "lost acknowledgement")
              return async () => {
                await t.commit();
                throw Error("private lost acknowledgement");
              };
            const value = (t as any)[key];
            return typeof value === "function" ? value.bind(t) : value;
          },
        }) as any;
      });
    };
    it.each(["second insert", "source changed", "lease expired"])(
      "rolls all signals back after %s and redacts the failure",
      async kind => {
        await interpret();
        await fault(kind);
        const log = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(
          captureConversationSignals({ ...input, strict: true })
        ).rejects.toThrow();
        expect(await rows()).toHaveLength(0);
        expect(JSON.stringify(log.mock.calls)).not.toContain("private");
        vi.restoreAllMocks();
        expect(await capture()).toBe(2);
      }
    );
    it("recovers a lost commit acknowledgement without another AI call or duplicate evidence", async () => {
      await interpret();
      await fault("lost acknowledgement");
      await expect(capture()).rejects.toThrow();
      vi.restoreAllMocks();
      expect(await capture()).toBe(0);
      expect(await rows()).toHaveLength(2);
      expect(model.call).toHaveBeenCalledOnce();
    });
    it("rejects a changed payload behind the same source identity", async () => {
      await interpret();
      await capture();
      await q(
        "UPDATE sari_learning_signals SET customer_message='tampered' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(capture()).rejects.toMatchObject({
        code: "source_conflict",
      });
      expect(await rows()).toHaveLength(2);
    });
    it("runs the real worker, its retry and concurrent claimant without duplicate learning", async () => {
      await interpret();
      await pending();
      const outcomes = await Promise.all([
        runInteractionJob(),
        runInteractionJob(),
      ]);
      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect((await job()).state).toBe("completed");
      expect(await rows()).toHaveLength(2);
      await pending();
      expect(await runInteractionJob()).toBe(true);
      expect(await rows()).toHaveLength(2);
      expect(model.call).toHaveBeenCalledOnce();
    });
    it("defers quota-full contextual jobs to the next UTC day without burning an attempt", async () => {
      await interpret();
      await fill(499);
      await pending();
      expect(await runInteractionJob()).toBe(true);
      expect(await job()).toMatchObject({
        state: "pending",
        attempts: 0,
        last_error: "learning_daily_limit",
        lease_token: null,
      });
      expect(await rows()).toHaveLength(499);
      await q(
        "UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,-1,UTC_DATE()) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await pending();
      expect(await runInteractionJob()).toBe(true);
      expect((await job()).state).toBe("completed");
      expect(await rows()).toHaveLength(501);
    });
  }
);
