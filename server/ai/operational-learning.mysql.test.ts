import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
const model = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: model.call }));
import { closeDb, getPool } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  countUnanalyzedSignals,
  getUnanalyzedSignals,
  getLearningEvidence,
} from "../db/learning";
import * as sourceReader from "./contextual-learning-source";
import { snapshotLearningSignals } from "./learning-analysis-contract";
import {
  claimLearningAnalysis,
  dispatchLearningAnalysis,
  storeLearningResponse,
  resumeLearningAnalysis,
} from "./learning-analysis-jobs";
import { persistLearningAnalysis } from "./learning-analysis";
import { triggerPatternAnalysis } from "./learning-engine";
import {
  getLearningPolicyReview,
  recordLearningPolicyReview,
} from "./learning-policy-review";
import {
  learningPolicyReviewSuite,
  learningPolicyReviewSuiteDigest,
} from "./learning-policy-review-contract";

const unsealedSemanticTypes = [
  "positive_feedback",
  "question_repeated",
  "price_objection",
  "sales_objection",
  "knowledge_gap",
  "escalation_requested",
];
const noncanonicalTypes = [
  "unknown_learning",
  "PRICE_OBJECTION",
  "Positive_Feedback",
];

describe.skipIf(!process.env.DATABASE_URL)(
  "quarantined operational learning and historical jobs",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      conversationId: number;
    const query = async (sql: string, args: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const rows = () =>
      query(
        "SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id",
        [owner.merchantId]
      );
    const insert = (type: string, key: string | null = null) =>
      query(
        `INSERT INTO sari_learning_signals
    (merchant_id,conversation_id,signal_type,signal_weight,customer_message,context_summary,source_key)
    VALUES (?,?,?,1,'Synthetic historical transcript','Unproven operational inference',?)`,
        [owner.merchantId, conversationId, type, key]
      );
    const analysis = (signals: any[]) => ({
      updates: [
        {
          dimension: "tone_preference" as const,
          insight: "توضيح الخطوة التالية للعميل.",
          confidence: 0.7,
          supporting_signal_ids: signals.map(s => s.id),
          contrary_signal_ids: [],
        },
      ],
      knowledge_gaps: [],
    });
    // Fixture migration boundary only: construct a durable job/review using the previous
    // reader's acceptance of unmarked rows, then restore the real reader before assertions.
    const previousReader = () =>
      vi
        .spyOn(sourceReader, "verifiedContextualLearningSources")
        .mockImplementation(async (_c, _merchant, values) => values);
    beforeEach(async () => {
      model.call.mockReset();
      owner = await createDisposableMerchant("operational-learning");
      conversationId = (
        await query(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000190')",
          [owner.merchantId]
        )
      ).insertId;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId]);
    });
    afterAll(closeDb);
    it.each([
      "merchant_correction",
      "long_conversation",
      "quick_resolution",
      "customer_left",
      ...unsealedSemanticTypes,
      ...noncanonicalTypes,
    ])(
      "retains historical %s but excludes it from sampling, count and new claims",
      async type => {
        await insert(type);
        const saved = await rows();
        expect(await getUnanalyzedSignals(owner.merchantId)).toEqual([]);
        expect(await countUnanalyzedSignals(owner.merchantId)).toBe(0);
        expect(
          await claimLearningAnalysis(
            snapshotLearningSignals(owner.merchantId, saved)
          )
        ).toMatchObject({ status: "stale" });
        expect(await rows()).toEqual(saved);
        expect(model.call).not.toHaveBeenCalled();
      }
    );
    it.each(
      [...unsealedSemanticTypes, ...noncanonicalTypes].flatMap(type => [
        [type, "CONTEXTUAL_LEARNING:123:456"],
        [type, "renamed-operational-event"],
        [type, `contextual_learning:123:456`],
      ])
    )(
      "does not bypass interpretation authority for %s with source key %s",
      async (type, key) => {
        await insert(type, key);
        const saved = await rows();
        const c = await (await getPool())!.getConnection();
        try {
          expect(
            await sourceReader.verifiedContextualLearningSources(
              c,
              owner.merchantId,
              saved
            )
          ).toEqual([]);
        } finally {
          c.release();
        }
        expect(await getUnanalyzedSignals(owner.merchantId)).toEqual([]);
        expect(await rows()).toEqual(saved);
      }
    );
    it("does not start an AI analysis because fifty old operational rows exceed the old threshold", async () => {
      const values = Array.from({ length: 60 }, (_, i) => [
        owner.merchantId,
        conversationId,
        unsealedSemanticTypes[i % unsealedSemanticTypes.length],
      ]);
      await query(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type) VALUES ${values.map(() => "(?,?,?)").join(",")}`,
        values.flat()
      );
      expect(await countUnanalyzedSignals(owner.merchantId)).toBe(0);
      expect(await triggerPatternAnalysis(owner.merchantId)).toMatchObject({
        status: "insufficient_signals",
        signalCount: 0,
      });
      expect(model.call).not.toHaveBeenCalled();
      expect(await rows()).toHaveLength(60);
    });
    it.each(
      [
        "merchant_correction",
        ...unsealedSemanticTypes,
        ...noncanonicalTypes,
      ].flatMap(type =>
        ["claim", "dispatch", "response", "recovery", "projection"].map(
          checkpoint => [type, checkpoint]
        )
      )
    )(
      "rejects an unchanged pre-upgrade %s job at %s",
      async (type, checkpoint) => {
        await insert(type);
        const saved = await rows(),
          snapshot = snapshotLearningSignals(owner.merchantId, saved),
          result = analysis(saved);
        if (checkpoint === "claim")
          expect(await claimLearningAnalysis(snapshot)).toMatchObject({
            status: "stale",
          });
        else if (checkpoint === "projection")
          await expect(
            persistLearningAnalysis(snapshot, result)
          ).rejects.toThrow("source changed");
        else {
          const old = previousReader();
          const acquired = await claimLearningAnalysis(snapshot);
          if (acquired.status !== "claimed")
            throw Error("Missing historical fixture claim");
          if (checkpoint === "dispatch") {
            old.mockRestore();
            expect(await dispatchLearningAnalysis(acquired.claim)).toBe(false);
          } else {
            expect(await dispatchLearningAnalysis(acquired.claim)).toBe(true);
            if (checkpoint === "recovery") {
              expect(
                await storeLearningResponse(
                  acquired.claim,
                  JSON.stringify(result)
                )
              ).not.toBeNull();
              old.mockRestore();
              expect(
                await resumeLearningAnalysis(owner.merchantId)
              ).toMatchObject({ status: "stale" });
            } else {
              old.mockRestore();
              expect(
                await storeLearningResponse(
                  acquired.claim,
                  JSON.stringify(result)
                )
              ).toBeNull();
            }
          }
        }
        expect(
          await query(
            "SELECT id FROM ai_learning_proposals WHERE merchant_id=?",
            [owner.merchantId]
          )
        ).toEqual([]);
        expect(await rows()).toEqual(saved);
        expect(model.call).not.toHaveBeenCalled();
      }
    );
    it.each([
      "merchant_correction",
      ...unsealedSemanticTypes,
      ...noncanonicalTypes,
    ])(
      "withdraws a pre-upgrade reviewed %s proposal without deleting history or changing its source",
      async type => {
        await insert(type);
        const saved = await rows(),
          old = previousReader();
        await persistLearningAnalysis(
          snapshotLearningSignals(owner.merchantId, saved),
          analysis(saved)
        );
        const proposalId = (
          await query(
            "SELECT id FROM ai_learning_proposals WHERE merchant_id=?",
            [owner.merchantId]
          )
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
            reason: "Synthetic historical offline review.",
          })),
        });
        const stored = await rows();
        old.mockRestore();
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
        expect(
          await query(
            "SELECT id FROM ai_learning_policy_reviews WHERE merchant_id=?",
            [owner.merchantId]
          )
        ).toHaveLength(1);
        expect(await rows()).toEqual(stored);
        expect(model.call).not.toHaveBeenCalled();
      }
    );
  }
);
