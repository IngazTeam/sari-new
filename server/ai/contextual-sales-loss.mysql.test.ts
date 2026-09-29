import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
import { salesLossUnderstandingFixture } from "../tests/helpers/sales-loss-understanding-fixture";
import { understandConversation } from "./conversation-understanding";
import {
  withConversationUnderstanding,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import { recordContextualSalesLoss } from "./contextual-sales-loss";
import { detectLostDeals } from "./loss-detector";
import { applyTapOrderPaymentState } from "../payment/order-payment-state";
import type { CheckoutIdentity } from "./checkout-agreements";
import { snapshotLearningSignals } from "./learning-analysis-contract";
import { persistLearningAnalysis } from "./learning-analysis";
import { buildDNAPrompt } from "./learning-engine";
import { getUnanalyzedSignals, getLearningEvidence } from "../db/learning";
import {
  getLearningPolicyReview,
  recordLearningPolicyReview,
} from "./learning-policy-review";
import {
  learningPolicyReviewSuite,
  learningPolicyReviewSuiteDigest,
} from "./learning-policy-review-contract";
import { randomUUID } from "node:crypto";
import {
  claimLearningAnalysis,
  dispatchLearningAnalysis,
  storeLearningResponse,
  resumeLearningAnalysis,
} from "./learning-analysis-jobs";

describe.skipIf(!process.env.DATABASE_URL)(
  "contextual sales loss atomicity and local penetration checks",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      input: CheckoutIdentity & { message: string },
      users: number[];
    let changes: Partial<ConversationUnderstanding>;
    const q = async (sql: string, params: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, params))[0];
    const signals = () =>
      q(
        "SELECT * FROM sari_learning_signals WHERE merchant_id=? AND signal_type='sales_declined'",
        [owner.merchantId]
      );
    const state = async () =>
      (
        await q(
          "SELECT deal_stage,loss_reason,stalled_since FROM conversations WHERE id=?",
          [input.conversationId]
        )
      )[0];
    const interpret = () => understandConversation(input);
    const project = () => recordContextualSalesLoss(input);
    const blocked = async () => {
      await project().catch(() => null);
      expect(await signals()).toHaveLength(0);
      expect(await state()).toMatchObject({
        deal_stage: "qualified",
        loss_reason: null,
      });
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("contextual-loss");
      users = [owner.userId];
      changes = {};
      const conversation = await q(
        "INSERT INTO conversations(merchantId,customerPhone,status,deal_stage) VALUES (?,'966500000087','active','qualified')",
        [owner.merchantId]
      );
      await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'outgoing','text','هل تناسبك المواعيد المتاحة؟')",
        [conversation.insertId]
      );
      const message = "تغير جدول عملي، لن أستطيع الالتحاق بهذه الدورة";
      const incoming = await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
        [conversation.insertId, message]
      );
      input = {
        merchantId: owner.merchantId,
        conversationId: conversation.insertId,
        incomingMessageId: incoming.insertId,
        customerPhone: "966500000087",
        message,
      };
      model.settings.mockReset().mockResolvedValue({
        model: "central-loss-model",
        textGenerationProvider: "openai",
        isActive: true,
      });
      model.call
        .mockReset()
        .mockImplementation(async messages =>
          JSON.stringify(
            salesLossUnderstandingFixture(
              JSON.parse(messages[1].content),
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

    const historicalLoss = async () => {
      await interpret();
      expect(await project()).not.toBeNull();
      return signals();
    };
    const proposalAnalysis = (sources: any[]) => ({
      updates: [
        {
          dimension: "objection_handling" as const,
          insight: "ناقش المواعيد المتاحة حين يوضح العميل تعارضها مع عمله.",
          confidence: 0.7,
          supporting_signal_ids: sources.map(s => s.id),
          contrary_signal_ids: [],
        },
      ],
      knowledge_gaps: [],
    });
    const withdraw = () =>
      q("DELETE FROM messages WHERE id=?", [input.incomingMessageId]);
    it("keeps an intact historical decline after the customer returns without rewriting the current deal", async () => {
      const sources = await historicalLoss();
      await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','أصبح الموعد مناسبًا')",
        [input.conversationId]
      );
      await q(
        "UPDATE conversations SET deal_stage='paid',loss_reason=NULL WHERE id=?",
        [input.conversationId]
      );
      expect(await getUnanalyzedSignals(owner.merchantId)).toEqual(sources);
      expect(await state()).toMatchObject({
        deal_stage: "paid",
        loss_reason: null,
      });
      expect(model.call).toHaveBeenCalledOnce();
    });
    it.each([
      "source_deleted",
      "source_text",
      "source_time",
      "context_deleted",
      "context_text",
      "interpretation_deleted",
      "interpretation_seal",
      "reason",
      "financial_claim",
      "weight",
      "copied_text",
      "copied_bot",
      "correction",
      "source_key",
      "metadata",
      "unmarked",
      "foreign_conversation",
    ])(
      "excludes historical decline with %s drift without changing the stored deal",
      async change => {
        await historicalLoss();
        const before = await state();
        if (change === "source_deleted") await withdraw();
        if (change === "source_text")
          await q(
            "UPDATE messages SET content='استفسار عن الموعد' WHERE id=?",
            [input.incomingMessageId]
          );
        if (change === "source_time")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
            [input.incomingMessageId]
          );
        if (change === "context_deleted")
          await q(
            "DELETE FROM messages WHERE conversationId=? AND direction='outgoing'",
            [input.conversationId]
          );
        if (change === "context_text")
          await q(
            "UPDATE messages SET content='سؤال مختلف' WHERE conversationId=? AND direction='outgoing'",
            [input.conversationId]
          );
        if (change === "interpretation_deleted")
          await q(
            "DELETE FROM ai_conversation_understanding WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "interpretation_seal")
          await q(
            "UPDATE ai_conversation_understanding SET result_digest=REPEAT('a',64) WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "reason")
          await q(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.reason','price') WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "financial_claim")
          await q(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.financialOutcome','lost') WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "weight")
          await q(
            "UPDATE sari_learning_signals SET signal_weight=9 WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "copied_text")
          await q(
            "UPDATE sari_learning_signals SET customer_message='كلام منسوخ آخر' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "copied_bot")
          await q(
            "UPDATE sari_learning_signals SET bot_message='رد مخترع' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "correction")
          await q(
            "UPDATE sari_learning_signals SET merchant_correction='تصحيح غير مثبت' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "source_key")
          await q(
            "UPDATE sari_learning_signals SET source_key=NULL WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "metadata")
          await q(
            "UPDATE sari_learning_signals SET context_summary='broken' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "unmarked")
          await q(
            "UPDATE sari_learning_signals SET source_key=NULL,context_summary=NULL WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "foreign_conversation") {
          const other = await createDisposableMerchant("loss-source-other");
          users.push(other.userId);
          const conv = await q(
            "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000018')",
            [other.merchantId]
          );
          await q("UPDATE messages SET conversationId=? WHERE id=?", [
            conv.insertId,
            input.incomingMessageId,
          ]);
        }
        expect(await getUnanalyzedSignals(owner.merchantId)).toEqual([]);
        expect(await state()).toEqual(before);
        expect(await signals()).toHaveLength(1);
        expect(model.call).toHaveBeenCalledOnce();
      }
    );
    it.each(["claim", "dispatch", "response", "recovery", "projection"])(
      "rechecks decline evidence at %s",
      async checkpoint => {
        const sources = await historicalLoss(),
          snapshot = snapshotLearningSignals(owner.merchantId, sources),
          analysis = proposalAnalysis(sources);
        if (checkpoint === "claim") {
          await withdraw();
          expect(await claimLearningAnalysis(snapshot)).toMatchObject({
            status: "stale",
          });
        } else if (checkpoint === "projection") {
          await withdraw();
          await expect(
            persistLearningAnalysis(snapshot, analysis)
          ).rejects.toThrow("source changed");
        } else {
          const acquired = await claimLearningAnalysis(snapshot);
          if (acquired.status !== "claimed")
            throw Error("Expected isolated claim");
          if (checkpoint === "dispatch") {
            await withdraw();
            expect(await dispatchLearningAnalysis(acquired.claim)).toBe(false);
          } else {
            expect(await dispatchLearningAnalysis(acquired.claim)).toBe(true);
            if (checkpoint === "recovery") {
              expect(
                await storeLearningResponse(
                  acquired.claim,
                  JSON.stringify(analysis)
                )
              ).not.toBeNull();
              await withdraw();
              expect(
                await resumeLearningAnalysis(owner.merchantId)
              ).toMatchObject({ status: "stale" });
            } else {
              await withdraw();
              expect(
                await storeLearningResponse(
                  acquired.claim,
                  JSON.stringify(analysis)
                )
              ).toBeNull();
            }
          }
        }
        expect(
          await q("SELECT id FROM ai_learning_proposals WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toEqual([]);
        expect(await signals()).toEqual(sources);
      }
    );
    it("invalidates a reviewed decline proposal and its evidence count after the source is withdrawn", async () => {
      const sources = await historicalLoss();
      await persistLearningAnalysis(
        snapshotLearningSignals(owner.merchantId, sources),
        proposalAnalysis(sources)
      );
      const proposalId = (
        await q("SELECT id FROM ai_learning_proposals WHERE merchant_id=?", [
          owner.merchantId,
        ])
      )[0].id;
      const before = await getLearningPolicyReview(owner.merchantId, {
        proposalId,
      });
      await recordLearningPolicyReview(owner.merchantId, owner.userId, {
        proposalId,
        requestId: randomUUID(),
        sourceDigest: before.sourceDigest,
        suiteDigest: learningPolicyReviewSuiteDigest,
        expectedRevision: 0,
        styleOnly: true,
        cases: learningPolicyReviewSuite.cases.map(c => ({
          caseId: c.id as any,
          baselineResponse: "Synthetic baseline",
          candidateResponse: "Synthetic candidate",
          baselineVerdict: "pass",
          candidateVerdict: "pass",
          reason: "Synthetic human review for this stored case.",
        })),
      });
      await withdraw();
      expect(
        await getLearningPolicyReview(owner.merchantId, { proposalId })
      ).toMatchObject({
        stage: "stale",
        eligible: false,
        independentConversations: 0,
        evidencePreview: [],
      });
      expect(
        (await getLearningEvidence(owner.merchantId)).proposals[0]
      ).toMatchObject({ evidenceCount: 0, evidence: [] });
    });

    it.each(["openai", "zahypi"])(
      "projects a sealed %s interpretation once under parallel replay with no extra AI call",
      async provider => {
        model.settings.mockResolvedValue({
          model: "central-loss-model",
          textGenerationProvider: provider,
          isActive: true,
        });
        const understanding = await interpret();
        expect(understanding).not.toBeNull();
        expect(model.call).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            model: "central-loss-model",
            taskType: "sari.customer.intent",
            noRetry: true,
          })
        );
        const results = await withConversationUnderstanding(
          understanding!,
          () => Promise.all(Array.from({ length: 6 }, project))
        );
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await state()).toMatchObject({
          deal_stage: "lost",
          loss_reason: "timing",
        });
        const [signal] = await signals();
        expect(signal.source_key).toBe(
          `contextual_loss:${input.conversationId}:${input.incomingMessageId}`
        );
        expect(signal.customer_message).toBe(input.message);
        expect(JSON.parse(signal.context_summary)).toMatchObject({
          basis: "interpreted_customer_decline",
          sourceMessageId: input.incomingMessageId,
          reason: "timing",
          causality: "unmeasured",
          financialOutcome: "unmeasured",
          interpretationDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(
          await q("SELECT * FROM ai_purchase_outcomes WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
        expect(
          await q("SELECT * FROM sales_followups WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
        const before = await signals();
        expect(await project()).toBeNull();
        expect(await signals()).toEqual(before);
        expect(model.call).toHaveBeenCalledOnce();
      }
    );
    it.each(["none", "unclear", "historic", "missing"])(
      "does not derive a loss from %s interpretation or keyword text",
      async kind => {
        if (kind !== "missing") {
          if (kind === "historic")
            model.call.mockImplementation(async messages => {
              const result = salesLossUnderstandingFixture(
                JSON.parse(messages[1].content)
              );
              delete result.salesLoss;
              return JSON.stringify(result);
            });
          else
            changes.salesLoss = {
              status: kind as "none" | "unclear",
              reason: null,
              evidence: [],
            };
          expect(await interpret()).not.toBeNull();
        }
        await blocked();
      }
    );
    it("preserves interpreted reasons in review evidence without activating a policy or inventing revenue", async () => {
      await interpret();
      await project();
      for (let index = 0; index < 2; index++) {
        const phone = `96650000008${index}`;
        const conversation = await q(
          "INSERT INTO conversations(merchantId,customerPhone,deal_stage) VALUES (?,?,'qualified')",
          [owner.merchantId, phone]
        );
        const message = await q(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
          [conversation.insertId, input.message]
        );
        const other = {
          ...input,
          conversationId: conversation.insertId,
          incomingMessageId: message.insertId,
          customerPhone: phone,
        };
        expect(await understandConversation(other)).not.toBeNull();
        expect(await recordContextualSalesLoss(other)).not.toBeNull();
      }
      const sources = await signals();
      expect(sources).toHaveLength(3);
      const snapshot = snapshotLearningSignals(owner.merchantId, sources);
      const persisted = await persistLearningAnalysis(snapshot, {
        updates: [
          {
            dimension: "losing_patterns",
            insight: "راجع ملاءمة مواعيد الدورة للاحتياج المعلن.",
            confidence: 0.7,
            supporting_signal_ids: sources.map((s: any) => s.id),
            contrary_signal_ids: [],
          },
        ],
        knowledge_gaps: [],
      });
      expect(persisted.status).toBe("applied");
      expect(
        await q(
          "SELECT status FROM ai_learning_proposals WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toEqual([{ status: "proposed" }]);
      expect(
        await q(
          "SELECT signal_id FROM ai_learning_evidence_links WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(3);
      expect(
        (await signals()).every(
          (s: any) =>
            s.analyzed === 1 &&
            JSON.parse(s.context_summary).financialOutcome === "unmeasured"
        )
      ).toBe(true);
      expect(await buildDNAPrompt(owner.merchantId)).toBe("");
      expect(
        await q("SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
      expect(model.call).toHaveBeenCalledTimes(3);
    });
    it.each([
      "outage",
      "malformed",
      "conditional",
      "ambiguous",
      "low confidence",
      "foreign evidence",
      "assistant only",
      "invented reason",
    ])("rejects %s without inventing a fallback loss", async kind => {
      const original = model.call.getMockImplementation()!;
      model.call.mockImplementation(async messages => {
        if (kind === "outage") throw Error("Synthetic model unavailable");
        if (kind === "malformed") return "رفض";
        const result = JSON.parse(await original(messages));
        if (kind === "conditional") result.conditional = true;
        if (kind === "ambiguous") result.ambiguous = true;
        if (kind === "low confidence") result.confidence = 0.5;
        if (kind === "foreign evidence")
          result.salesLoss.evidence = [
            { messageId: 900000000, excerpt: input.message },
          ];
        if (kind === "assistant only")
          result.salesLoss.evidence = [
            JSON.parse(messages[1].content)
              .messages.filter((v: any) => v.role === "assistant")
              .map((v: any) => ({ messageId: v.id, excerpt: v.content }))[0],
          ];
        if (kind === "invented reason")
          result.salesLoss.reason = "abandoned_payment";
        return JSON.stringify(result);
      });
      expect(await interpret()).toBeNull();
      await blocked();
    });
    const mutate = async (kind: string) => {
      if (kind === "source")
        await q(
          "UPDATE messages SET content='أريد مقارنة البدائل' WHERE id=?",
          [input.incomingMessageId]
        );
      if (kind === "history")
        await q(
          "UPDATE messages SET content='سياق مختلف' WHERE conversationId=? AND direction='outgoing'",
          [input.conversationId]
        );
      if (kind === "timestamp")
        await q(
          "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
          [input.incomingMessageId]
        );
      if (kind === "new message")
        await q(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','وجدت وقتًا مناسبًا، نكمل')",
          [input.conversationId]
        );
      if (kind === "human takeover")
        await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
          input.conversationId,
        ]);
      if (kind === "handoff version")
        await q(
          "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
          [input.conversationId]
        );
      if (kind === "automation cutoff")
        await q(
          "UPDATE conversations SET automation_after_message_id=? WHERE id=?",
          [input.incomingMessageId, input.conversationId]
        );
      if (kind === "memory forgotten")
        await q(
          "INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)",
          [owner.merchantId, input.customerPhone, input.incomingMessageId - 1]
        );
      if (kind === "seal")
        await q(
          "UPDATE ai_conversation_understanding SET result_json=JSON_SET(result_json,'$.salesLoss.reason','price') WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (kind === "analysis deleted")
        await q(
          "DELETE FROM ai_conversation_understanding WHERE merchant_id=?",
          [owner.merchantId]
        );
    };
    it.each([
      "source",
      "history",
      "timestamp",
      "new message",
      "human takeover",
      "handoff version",
      "automation cutoff",
      "memory forgotten",
      "seal",
      "analysis deleted",
    ])("rechecks authoritative storage after %s", async kind => {
      expect(await interpret()).not.toBeNull();
      await mutate(kind);
      await blocked();
    });
    it("rejects preview and foreign contextual identity; a forged in-memory reason cannot override the sealed result", async () => {
      const saved = await interpret();
      expect(saved).not.toBeNull();
      for (const identity of [
        { ...saved!, mode: "preview" as const },
        { ...saved!, conversationId: input.conversationId + 1 },
      ])
        await withConversationUnderstanding(identity, blocked);
      await withConversationUnderstanding(
        {
          ...saved!,
          analysis: {
            ...saved!.analysis,
            salesLoss: { ...saved!.analysis.salesLoss!, reason: "price" },
          },
        },
        async () => {
          expect(await project()).toMatchObject({ reason: "timing" });
        }
      );
    });
    it("rejects a foreign merchant, another conversation, and a wrong phone without cross-tenant signals", async () => {
      await interpret();
      const other = await createDisposableMerchant("contextual-loss-other");
      users.push(other.userId);
      const c = await q(
        "INSERT INTO conversations(merchantId,customerPhone,deal_stage) VALUES (?,'966500000086','qualified')",
        [other.merchantId]
      );
      for (const identity of [
        { ...input, merchantId: other.merchantId },
        { ...input, conversationId: c.insertId },
        { ...input, customerPhone: "966500000086" },
      ])
        await expect(recordContextualSalesLoss(identity)).rejects.toThrow();
      expect(await signals()).toHaveLength(0);
      expect(await state()).toMatchObject({ deal_stage: "qualified" });
      expect(
        await q("SELECT id FROM sari_learning_signals WHERE merchant_id=?", [
          other.merchantId,
        ])
      ).toHaveLength(0);
    });
    it.each(["paid", "purchased"])(
      "does not overwrite a %s stage",
      async stage => {
        await interpret();
        await q("UPDATE conversations SET deal_stage=? WHERE id=?", [
          stage,
          input.conversationId,
        ]);
        expect(await project()).toBeNull();
        expect(await state()).toMatchObject({
          deal_stage: stage,
          loss_reason: null,
        });
        expect(await signals()).toHaveLength(0);
      }
    );
    it.each(["CAPTURED", "REFUNDED"])(
      "verified %s payment evidence prevents inferred loss even if stage is stale",
      async status => {
        const order = await q(
          "INSERT INTO orders(merchantId,customerPhone,customerName,items,totalAmount,currency) VALUES (?,?,'Synthetic',?,23000,'SAR')",
          [
            owner.merchantId,
            input.customerPhone,
            JSON.stringify([
              { productId: 1, name: "اختبار", quantity: 1, price: 23000 },
            ]),
          ]
        );
        const charge = `chg_loss_test_${order.insertId}`;
        const payment = await q(
          "INSERT INTO order_payments(merchant_id,order_id,customer_phone,amount,currency,status,tap_charge_id,metadata) VALUES (?,?,?,23000,'SAR','pending',?,?)",
          [
            owner.merchantId,
            order.insertId,
            input.customerPhone,
            charge,
            JSON.stringify({ conversationId: input.conversationId }),
          ]
        );
        const event = {
          paymentId: payment.insertId,
          tapChargeId: charge,
          expectedMerchantId: owner.merchantId,
          expectedAmount: 23000,
          expectedCurrency: "SAR",
          providerStatus: "CAPTURED",
        };
        await applyTapOrderPaymentState(event);
        if (status === "REFUNDED")
          await applyTapOrderPaymentState({ ...event, providerStatus: status });
        await q("UPDATE conversations SET deal_stage='qualified' WHERE id=?", [
          input.conversationId,
        ]);
        await interpret();
        await blocked();
        expect(
          await q("SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(status === "REFUNDED" ? 2 : 1);
      }
    );
    const fill = async (count: number) =>
      q(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,analyzed,source_key) VALUES ${Array.from({ length: count }, () => "(?,?,'price_objection',1,?)").join(",")}`,
        Array.from({ length: count }, (_, i) => [
          owner.merchantId,
          input.conversationId,
          `synthetic:${i}`,
        ]).flat()
      );
    it("keeps stage and learning atomic at the daily cap, and recovers later", async () => {
      await interpret();
      await fill(500);
      await expect(project()).rejects.toMatchObject({ code: "daily_limit" });
      await blocked();
      await q(
        "UPDATE sari_learning_signals SET created_at=TIMESTAMPADD(DAY,-1,UTC_DATE()) WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await detectLostDeals()).toContainEqual(
        expect.objectContaining({ conversationId: input.conversationId })
      );
      expect(await state()).toMatchObject({
        deal_stage: "lost",
        loss_reason: "timing",
      });
      expect(await signals()).toHaveLength(1);
    });
    it("permits an exact replay before quota admission without altering learned evidence", async () => {
      await interpret();
      await project();
      await fill(499);
      await q(
        "UPDATE sari_learning_signals SET analyzed=1 WHERE merchant_id=? AND signal_type='sales_declined'",
        [owner.merchantId]
      );
      const before = await signals();
      expect(await project()).toBeNull();
      expect(await signals()).toEqual(before);
    });
    it("a committed-source replay preserves a subsequent manual stage correction", async () => {
      await interpret();
      await project();
      await q(
        "UPDATE conversations SET deal_stage='qualified',loss_reason=NULL,stalled_since=NULL WHERE id=?",
        [input.conversationId]
      );
      expect(await project()).toBeNull();
      expect(await state()).toMatchObject({
        deal_stage: "qualified",
        loss_reason: null,
        stalled_since: null,
      });
      expect(await signals()).toHaveLength(1);
    });
    const fault = async (kind: string) => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get();
        return new Proxy(c, {
          get(t, key) {
            if (key === "execute")
              return async (...args: any[]) => {
                const sql = String(args[0]);
                if (
                  (kind === "signal insert" &&
                    sql.includes("INSERT INTO sari_learning_signals")) ||
                  (kind === "projection" &&
                    sql.includes("SET deal_stage='lost'"))
                )
                  throw Error("Synthetic private storage failure");
                const result = await (t.execute as any)(...args);
                if (
                  kind === "source changed during admission" &&
                  sql.includes("INSERT INTO sari_learning_signals")
                )
                  await t.execute(
                    "UPDATE messages SET content='changed inside transaction' WHERE id=?",
                    [input.incomingMessageId]
                  );
                return result;
              };
            if (key === "commit" && kind === "lost acknowledgement")
              return async () => {
                await t.commit();
                throw Error("Synthetic lost acknowledgement");
              };
            const value = (t as any)[key];
            return typeof value === "function" ? value.bind(t) : value;
          },
        }) as any;
      });
    };
    it.each(["signal insert", "projection", "source changed during admission"])(
      "rolls back both projections after %s",
      async kind => {
        await interpret();
        await fault(kind);
        await expect(project()).rejects.toThrow();
        vi.restoreAllMocks();
        expect(await signals()).toHaveLength(0);
        expect(await state()).toMatchObject({
          deal_stage: "qualified",
          loss_reason: null,
        });
        expect(
          (
            await q("SELECT content FROM messages WHERE id=?", [
              input.incomingMessageId,
            ])
          )[0].content
        ).toBe(input.message);
        expect(await project()).toMatchObject({ reason: "timing" });
      }
    );
    it("recovers a lost commit acknowledgement without duplicated signals", async () => {
      await interpret();
      await fault("lost acknowledgement");
      await expect(project()).rejects.toThrow();
      vi.restoreAllMocks();
      expect(await project()).toBeNull();
      expect(await signals()).toHaveLength(1);
      expect(await state()).toMatchObject({ deal_stage: "lost" });
    });
    it("refuses conflicting data behind an existing source identity", async () => {
      await interpret();
      await project();
      await q(
        "UPDATE sari_learning_signals SET customer_message='altered' WHERE merchant_id=? AND signal_type='sales_declined'",
        [owner.merchantId]
      );
      await expect(project()).rejects.toMatchObject({
        code: "source_conflict",
      });
      expect(await signals()).toHaveLength(1);
    });
    it("recovers the live projection in the worker without model I/O or a duplicate on replay", async () => {
      await interpret();
      const results = await Promise.all([detectLostDeals(), project()]);
      expect(results.flat().filter(Boolean)).toHaveLength(1);
      expect(await detectLostDeals()).toEqual([]);
      expect(await signals()).toHaveLength(1);
      expect(model.call).toHaveBeenCalledOnce();
    });
    it("the worker skips a superseded interpretation and redacts a projection failure", async () => {
      await interpret();
      await mutate("new message");
      expect(await detectLostDeals()).toEqual([]);
      expect(await signals()).toHaveLength(0);
      await q("DELETE FROM messages WHERE conversationId=? AND id>?", [
        input.conversationId,
        input.incomingMessageId,
      ]);
      await fault("signal insert");
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await detectLostDeals()).toEqual([]);
      expect(await signals()).toHaveLength(0);
      expect(JSON.stringify(log.mock.calls)).not.toContain("private");
      expect(log).toHaveBeenCalled();
    });
    it.each(["qualified", "payment_link_sent", "payment_failed"])(
      "silence/delayed processing keeps %s open with an inactivity marker only",
      async stage => {
        await q(
          "UPDATE conversations SET deal_stage=?,payment_link_sent_at=TIMESTAMPADD(DAY,-5,UTC_TIMESTAMP()) WHERE id=?",
          [stage, input.conversationId]
        );
        await q(
          "UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-4,UTC_TIMESTAMP()) WHERE conversationId=?",
          [input.conversationId]
        );
        expect(await detectLostDeals()).toEqual([]);
        expect(await state()).toMatchObject({
          deal_stage: stage,
          loss_reason: null,
          stalled_since: expect.any(Date),
        });
        expect(
          await q("SELECT * FROM sari_learning_signals WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
        expect(model.call).not.toHaveBeenCalled();
        await q(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','نكمل الحوار')",
          [input.conversationId]
        );
        await detectLostDeals();
        expect(await state()).toMatchObject({
          deal_stage: stage,
          loss_reason: null,
          stalled_since: null,
        });
      }
    );
  }
);
