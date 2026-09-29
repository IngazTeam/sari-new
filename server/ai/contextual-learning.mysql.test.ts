import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHash, randomUUID } from "node:crypto";
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
import {
  getLearningEvidence,
  getUnanalyzedSignals,
  countUnanalyzedSignals,
} from "../db/learning";
import { verifiedContextualLearningSources } from "./contextual-learning-source";
import {
  claimLearningAnalysis,
  dispatchLearningAnalysis,
  storeLearningResponse,
  resumeLearningAnalysis,
} from "./learning-analysis-jobs";
import {
  getLearningPolicyReview,
  recordLearningPolicyReview,
} from "./learning-policy-review";
import {
  getLearningPolicyCandidate,
  createLearningPolicyCandidate,
  requireCurrentLearningPolicyCandidate,
} from "./learning-policy-candidates";
import {
  learningPolicyReviewSuite,
  learningPolicyReviewSuiteDigest,
} from "./learning-policy-review-contract";
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
    const historicalSources = async () => {
      await interpret();
      expect(await capture()).toBe(2);
      return rows();
    };
    it("filters newer operational history before the sampling limit without starving grounded sources", async () => {
      await historicalSources();
      const legacyTypes = [
        "merchant_correction",
        "long_conversation",
        "quick_resolution",
        "customer_left",
        "knowledge_gap",
        "escalation_requested",
        "positive_feedback",
        "question_repeated",
        "price_objection",
        "sales_objection",
        "unknown_learning",
        "PRICE_OBJECTION",
        "Positive_Feedback",
      ];
      const values = Array.from({ length: 240 }, (_, i) => [
        owner.merchantId,
        input.conversationId,
        legacyTypes[i % legacyTypes.length],
      ]);
      await q(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type) VALUES ${values.map(() => "(?,?,?)").join(",")}`,
        values.flat()
      );
      expect(await getUnanalyzedSignals(owner.merchantId, 2)).toHaveLength(2);
      expect(await countUnanalyzedSignals(owner.merchantId)).toBe(2);
      expect(await rows()).toHaveLength(242);
      expect(model.call).toHaveBeenCalledOnce();
    });
    const proposedAnalysis = (sources: any[]) => ({
      updates: [
        {
          dimension: "objection_handling" as const,
          insight: "اشرح فرق القيمة المناسب للاحتياج قبل طلب القرار.",
          confidence: 0.7,
          supporting_signal_ids: sources.map(s => s.id),
          contrary_signal_ids: [],
        },
      ],
      knowledge_gaps: [],
    });
    const withdraw = () => q("DELETE FROM messages WHERE id=?", [previousId]);
    const prepareProposal = async () => {
      const sources = await historicalSources();
      await persistLearningAnalysis(
        snapshotLearningSignals(owner.merchantId, sources),
        proposedAnalysis(sources)
      );
      return Number(
        (
          await q("SELECT id FROM ai_learning_proposals WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0].id
      );
    };
    const reviewRequest = async (proposalId: number) => {
      const source = await getLearningPolicyReview(owner.merchantId, {
        proposalId,
      });
      return {
        proposalId,
        requestId: randomUUID(),
        sourceDigest: source.sourceDigest,
        suiteDigest: learningPolicyReviewSuiteDigest,
        expectedRevision: source.revision,
        styleOnly: true as const,
        cases: learningPolicyReviewSuite.cases.map(c => ({
          caseId: c.id as any,
          baselineResponse: "Synthetic baseline response",
          candidateResponse: "Synthetic candidate response",
          baselineVerdict: "pass" as const,
          candidateVerdict: "pass" as const,
          reason: "Synthetic independent review for the stored test case.",
        })),
      };
    };
    it("keeps the evidence workspace count and excerpts consistent with source eligibility", async () => {
      const proposalId = await prepareProposal();
      expect(
        (await getLearningEvidence(owner.merchantId)).proposals[0]
      ).toMatchObject({ id: proposalId, evidenceCount: 1 });
      await withdraw();
      expect(
        (await getLearningEvidence(owner.merchantId)).proposals[0]
      ).toMatchObject({ id: proposalId, evidenceCount: 0, evidence: [] });
      expect(await rows()).toHaveLength(2);
    });
    it("retains surviving excerpts but never cherry-picks around an invalid contrary source", async () => {
      const proposalId = await prepareProposal(),
        sources = await rows();
      await q(
        "UPDATE ai_learning_evidence_links SET relation='contrary' WHERE proposal_id=? AND signal_id=?",
        [proposalId, sources[0].id]
      );
      await q(
        "UPDATE sari_learning_signals SET bot_message='مقتطف مختلف' WHERE id=?",
        [sources[0].id]
      );
      const workspace = (await getLearningEvidence(owner.merchantId))
        .proposals[0];
      expect(workspace.evidenceCount).toBe(1);
      expect(workspace.evidence.map(s => s.signalId)).toEqual([sources[1].id]);
      expect(
        await getLearningPolicyReview(owner.merchantId, { proposalId })
      ).toMatchObject({ eligible: false, independentConversations: 1 });
    });
    it("propagates a source read failure instead of treating it as an empty or valid proof", async () => {
      const sources = await historicalSources(),
        c = await (await getPool())!.getConnection();
      const execute = c.execute.bind(c);
      try {
        vi.spyOn(c, "execute").mockImplementation((async (
          sql: any,
          values: any
        ) => {
          if (String(sql).includes("FROM messages m"))
            throw Error("Synthetic source storage failure");
          return execute(sql, values);
        }) as any);
        await expect(
          verifiedContextualLearningSources(c, owner.merchantId, sources)
        ).rejects.toThrow("Synthetic source storage failure");
      } finally {
        vi.restoreAllMocks();
        c.release();
      }
    });
    it("rejects oversized proof batches before making a database query", async () => {
      const execute = vi.fn();
      await expect(
        verifiedContextualLearningSources(
          { execute } as any,
          owner.merchantId,
          Array(2001).fill({})
        )
      ).rejects.toThrow("too large");
      expect(execute).not.toHaveBeenCalled();
    });
    it("filters invalid excerpts before the display limit while keeping the full proposal ineligible", async () => {
      const proposalId = await prepareProposal(),
        original = await rows();
      for (let n = 0; n < 21; n++) {
        const saved = await q(
          "INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,source_key,context_summary) VALUES (?,?,'price_objection',?,'broken')",
          [
            owner.merchantId,
            input.conversationId,
            `contextual_learning:invalid:${n}`,
          ]
        );
        await q(
          "INSERT INTO ai_learning_evidence_links(proposal_id,signal_id,merchant_id,relation) VALUES (?,?,?,'contrary')",
          [proposalId, saved.insertId, owner.merchantId]
        );
      }
      const result = (await getLearningEvidence(owner.merchantId)).proposals[0];
      expect(result.evidenceCount).toBe(1);
      expect(result.evidence.map(e => e.signalId)).toEqual(
        original.map((s: any) => s.id).reverse()
      );
      expect(
        await getLearningPolicyReview(owner.merchantId, { proposalId })
      ).toMatchObject({ eligible: false, evidenceLinks: 23 });
    });
    it("refuses an oversized proposal rather than publishing a truncated evidence count", async () => {
      const proposalId = await prepareProposal();
      const values = Array.from({ length: 1999 }, (_, n) => [
        owner.merchantId,
        input.conversationId,
        `boundary:${n}`,
      ]).flat();
      await q(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,source_key) VALUES ${Array.from({ length: 1999 }, () => "(?,?,'long_conversation',?)").join(",")}`,
        values
      );
      await q(
        "INSERT INTO ai_learning_evidence_links(proposal_id,signal_id,merchant_id,relation) SELECT ?,id,merchant_id,'observed' FROM sari_learning_signals WHERE merchant_id=? AND source_key LIKE 'boundary:%'",
        [proposalId, owner.merchantId]
      );
      await expect(getLearningEvidence(owner.merchantId)).rejects.toThrow(
        "exceeds review capacity"
      );
      await expect(
        getLearningPolicyReview(owner.merchantId, { proposalId })
      ).rejects.toThrow("changed");
    });
    it("rechecks historical sources without another AI call after a newer turn and handoff", async () => {
      const before = await historicalSources();
      await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','رسالة لاحقة')",
        [input.conversationId]
      );
      await q(
        "UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1 WHERE id=?",
        [input.conversationId]
      );
      expect(await getUnanalyzedSignals(owner.merchantId)).toEqual(
        [...before].reverse()
      );
      expect(model.call).toHaveBeenCalledOnce();
    });
    it.each([
      "deleted_source",
      "deleted_reply",
      "source_text",
      "reply_text",
      "authorship",
      "ai_receipt",
      "message_time",
      "interpretation_deleted",
      "interpretation_state",
      "interpretation_digest",
      "foreign_conversation",
      "source_key",
      "metadata",
      "weight",
      "copied_customer",
      "copied_bot",
      "correction",
      "target",
      "financial_claim",
    ])(
      "withdraws %s evidence before analysis without deleting its audit history",
      async change => {
        const sources = await historicalSources();
        if (change === "deleted_source")
          await q("DELETE FROM messages WHERE id=?", [input.incomingMessageId]);
        if (change === "deleted_reply") await withdraw();
        if (change === "source_text")
          await q("UPDATE messages SET content='الرد لم يفدني' WHERE id=?", [
            input.incomingMessageId,
          ]);
        if (change === "reply_text")
          await q("UPDATE messages SET content='نص مختلف' WHERE id=?", [
            previousId,
          ]);
        if (change === "authorship")
          await q("UPDATE messages SET sender_type='merchant' WHERE id=?", [
            previousId,
          ]);
        if (change === "ai_receipt")
          await q("UPDATE messages SET aiResponse=NULL WHERE id=?", [
            previousId,
          ]);
        if (change === "message_time")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
            [previousId]
          );
        if (change === "interpretation_deleted")
          await q(
            "DELETE FROM ai_conversation_understanding WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "interpretation_state")
          await q(
            "UPDATE ai_conversation_understanding SET state='failed',result_json=NULL,result_digest=NULL WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "interpretation_digest")
          await q(
            "UPDATE ai_conversation_understanding SET result_digest=REPEAT('a',64) WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "foreign_conversation") {
          const other = await createDisposableMerchant("learning-source-other");
          users.push(other.userId);
          const conv = await q(
            "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000089')",
            [other.merchantId]
          );
          await q("UPDATE messages SET conversationId=? WHERE id=?", [
            conv.insertId,
            previousId,
          ]);
        }
        if (change === "source_key")
          await q(
            "UPDATE sari_learning_signals SET source_key=CONCAT('contextual_learning:',conversation_id,':999999999') WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "metadata")
          await q(
            "UPDATE sari_learning_signals SET context_summary='broken' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "weight")
          await q(
            "UPDATE sari_learning_signals SET signal_weight=9 WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "copied_customer")
          await q(
            "UPDATE sari_learning_signals SET customer_message='دليل مزور' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "copied_bot")
          await q(
            "UPDATE sari_learning_signals SET bot_message='رد مزور' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "correction")
          await q(
            "UPDATE sari_learning_signals SET merchant_correction='تعليم مصطنع' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "target")
          await q(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.aboutAssistantMessageId',NULL) WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "financial_claim")
          await q(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.financialOutcome','paid') WHERE merchant_id=?",
            [owner.merchantId]
          );
        expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(0);
        expect(await rows()).toHaveLength(sources.length);
        expect(model.call).toHaveBeenCalledOnce();
      }
    );
    it("rechecks full original content beyond the copied 2000-character preview", async () => {
      input.message += " توضيح".repeat(420);
      await q("UPDATE messages SET content=? WHERE id=?", [
        input.message,
        input.incomingMessageId,
      ]);
      await historicalSources();
      expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(2);
      await q(
        "UPDATE messages SET content=CONCAT(content,' تغيير أخير') WHERE id=?",
        [input.incomingMessageId]
      );
      expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(0);
    });
    it("does not reconstruct a missing interpretation when a copied signal is renamed", async () => {
      await historicalSources();
      await q(
        "UPDATE sari_learning_signals SET source_key=NULL WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(0);
    });
    it.each(["claim", "dispatch", "response", "recovery", "projection"])(
      "rejects revoked evidence at the %s checkpoint",
      async checkpoint => {
        const sources = await historicalSources(),
          snapshot = snapshotLearningSignals(owner.merchantId, sources);
        const analysis = proposedAnalysis(sources);
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
          expect(await rows()).toEqual(sources);
        } else {
          const acquired = await claimLearningAnalysis(snapshot);
          expect(acquired.status).toBe("claimed");
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
        ).toHaveLength(0);
      }
    );
    it("invalidates the reviewed proposal and excludes revoked excerpts without erasing the review", async () => {
      const proposalId = await prepareProposal(),
        request = await reviewRequest(proposalId);
      await recordLearningPolicyReview(owner.merchantId, owner.userId, request);
      const before = await getLearningPolicyReview(owner.merchantId, {
        proposalId,
      });
      expect(before).toMatchObject({
        eligible: true,
        stage: "offline_review_passed",
        independentConversations: 1,
      });
      await withdraw();
      const after = await getLearningPolicyReview(owner.merchantId, {
        proposalId,
      });
      expect(after).toMatchObject({
        eligible: false,
        stage: "stale",
        independentConversations: 0,
        evidencePreview: [],
      });
      expect(after.sourceDigest).not.toBe(before.sourceDigest);
      expect(after.latestReview!.id).toBe(before.latestReview!.id);
      await expect(
        recordLearningPolicyReview(owner.merchantId, owner.userId, {
          ...request,
          requestId: randomUUID(),
          expectedRevision: 1,
        })
      ).rejects.toThrow("changed");
    });
    it("invalidates an existing candidate through the same source reader and prevents a new candidate", async () => {
      const proposalId = await prepareProposal();
      await recordLearningPolicyReview(
        owner.merchantId,
        owner.userId,
        await reviewRequest(proposalId)
      );
      const basis = await getLearningPolicyCandidate(owner.merchantId, {
        proposalId,
      });
      const request = {
        proposalId,
        requestId: randomUUID(),
        reviewId: basis.reviewId!,
        sourceDigest: basis.sourceDigest,
        baselineDigest: basis.baselineDigest,
        expectedVersion: basis.expectedVersion,
      };
      const candidate = await createLearningPolicyCandidate(
        owner.merchantId,
        owner.userId,
        request
      );
      await withdraw();
      expect(
        await getLearningPolicyCandidate(owner.merchantId, { proposalId })
      ).toMatchObject({
        canCreate: false,
        latestCandidate: { current: false },
      });
      await expect(
        createLearningPolicyCandidate(owner.merchantId, owner.userId, {
          ...request,
          requestId: randomUUID(),
          expectedVersion: 1,
        })
      ).rejects.toThrow("changed");
      const c = await (await getPool())!.getConnection();
      try {
        await c.beginTransaction();
        await expect(
          requireCurrentLearningPolicyCandidate(
            c,
            owner.merchantId,
            candidate.id,
            candidate.artifactDigest
          )
        ).rejects.toThrow("changed");
      } finally {
        await c.rollback();
        c.release();
      }
    });
    it.each(["message", "interpretation"])(
      "holds the %s proof against concurrent changes until validation commits",
      async target => {
        const sources = await historicalSources(),
          pool = (await getPool())!;
        const c = await pool.getConnection(),
          other = await pool.getConnection();
        const [[settings]] = await other.query<any[]>(
          "SELECT @@SESSION.innodb_lock_wait_timeout AS seconds"
        );
        const sql =
          target === "message"
            ? "UPDATE messages SET content=CONCAT(content,' changed') WHERE id=?"
            : "UPDATE ai_conversation_understanding SET result_digest=REPEAT('b',64) WHERE incoming_message_id=?";
        const id = target === "message" ? previousId : input.incomingMessageId;
        try {
          await other.query("SET SESSION innodb_lock_wait_timeout=1");
          await c.beginTransaction();
          expect(
            await verifiedContextualLearningSources(
              c,
              owner.merchantId,
              sources,
              true
            )
          ).toHaveLength(2);
          await expect(other.execute(sql, [id])).rejects.toMatchObject({
            code: "ER_LOCK_WAIT_TIMEOUT",
          });
          await c.commit();
          await other.execute(sql, [id]);
          expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(0);
        } finally {
          await c.rollback();
          c.release();
          await other.query("SET SESSION innodb_lock_wait_timeout=?", [
            Number(settings.seconds),
          ]);
          other.release();
        }
      }
    );
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
        expect(await getUnanalyzedSignals(owner.merchantId)).toHaveLength(1);
        expect(await countUnanalyzedSignals(owner.merchantId)).toBe(1);
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
