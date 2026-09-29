import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { applyTapOrderPaymentState } from "../payment/order-payment-state";
import { getLearningEvidence, getUnanalyzedSignals } from "../db/learning";
import { verifiedContextualLearningSources } from "./contextual-learning-source";
import { snapshotLearningSignals } from "./learning-analysis-contract";
import { persistLearningAnalysis } from "./learning-analysis";
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
  learningPolicyReviewSuite,
  learningPolicyReviewSuiteDigest,
} from "./learning-policy-review-contract";
import { randomUUID } from "node:crypto";

describe.skipIf(!process.env.DATABASE_URL)(
  "verified payment memory and learning",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
    let conversationId: number;
    const phone = "966500000084";
    const query = async (sql: string, params: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, params))[0];
    const profile = async () =>
      (
        await query(
          "SELECT * FROM customer_profiles WHERE merchant_id = ? AND customer_phone = ?",
          [fixture.merchantId, phone]
        )
      )[0];
    beforeEach(async () => {
      fixture = await createDisposableMerchant("verified-memory");
      const c = await query(
        "INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, ?, 'active')",
        [fixture.merchantId, phone]
      );
      conversationId = c.insertId;
    });
    afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
    afterAll(closeDb);
    async function payment(
      amount = 23000,
      currency = "SAR",
      attributedConversation = conversationId
    ) {
      const order = await query(
        `INSERT INTO orders (merchantId, customerPhone, customerName, items, totalAmount, currency)
      VALUES (?, ?, 'Synthetic', ?, ?, ?)`,
        [
          fixture.merchantId,
          phone,
          JSON.stringify([
            { productId: 1, name: "سماعة اختبار", quantity: 1, price: amount },
          ]),
          amount,
          currency,
        ]
      );
      const charge = `chg_brain_order_${order.insertId}`;
      const p = await query(
        `INSERT INTO order_payments (merchant_id, order_id, customer_phone, amount, currency, status, tap_charge_id, metadata)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          fixture.merchantId,
          order.insertId,
          phone,
          amount,
          currency,
          charge,
          JSON.stringify({ conversationId: attributedConversation }),
        ]
      );
      return {
        paymentId: p.insertId,
        tapChargeId: charge,
        expectedMerchantId: fixture.merchantId,
        expectedAmount: amount,
        expectedCurrency: currency,
        providerStatus: "CAPTURED",
      };
    }
    const storedSignals = () =>
      query(
        "SELECT * FROM sari_learning_signals WHERE merchant_id=? ORDER BY id",
        [fixture.merchantId]
      );
    const booking = async () => {
      const service = await query(
        "INSERT INTO services(merchant_id,name,duration_minutes,base_price) VALUES (?,'Synthetic service',60,23000)",
        [fixture.merchantId]
      );
      return (
        await query(
          "INSERT INTO bookings(merchant_id,service_id,customer_phone,booking_date,start_time,end_time,duration_minutes,base_price,final_price) VALUES (?,?,?,'2026-12-20','10:00','11:00',60,23000,23000)",
          [fixture.merchantId, service.insertId, phone]
        )
      ).insertId;
    };
    it("verifies booking payments and refunds through the same canonical owner contract", async () => {
      const input = await payment(),
        bookingId = await booking();
      await query(
        "UPDATE order_payments SET order_id=NULL,booking_id=? WHERE id=?",
        [bookingId, input.paymentId]
      );
      await applyTapOrderPaymentState(input);
      expect(
        (await getUnanalyzedSignals(fixture.merchantId)).map(
          (s: any) => s.signal_type
        )
      ).toEqual(["purchase_completed"]);
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 1,
      });
      await applyTapOrderPaymentState({ ...input, providerStatus: "REFUNDED" });
      expect(
        (await getUnanalyzedSignals(fixture.merchantId)).map(
          (s: any) => s.signal_type
        )
      ).toEqual(["purchase_refunded"]);
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 0,
        verifiedRefunds: 1,
      });
      await query("DELETE FROM bookings WHERE id=?", [bookingId]);
      expect(await getUnanalyzedSignals(fixture.merchantId)).toEqual([]);
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 0,
        verifiedRefunds: 0,
      });
    });
    it("rejects an ambiguous payment linked to both an order and booking", async () => {
      const input = await payment();
      await applyTapOrderPaymentState(input);
      await query("UPDATE order_payments SET booking_id=? WHERE id=?", [
        await booking(),
        input.paymentId,
      ]);
      expect(await getUnanalyzedSignals(fixture.merchantId)).toEqual([]);
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 0,
      });
    });
    const analysis = (rows: any[]) => ({
      updates: [
        {
          dimension: "objection_handling" as const,
          insight: "Explain available value without inventing a discount",
          confidence: 0.7,
          supporting_signal_ids: rows.map(r => r.id),
          contrary_signal_ids: [],
        },
      ],
      knowledge_gaps: [],
    });
    it("uses only the current canonical outcome after refund while retaining both historical events", async () => {
      const input = await payment();
      await applyTapOrderPaymentState(input);
      expect(
        (await getUnanalyzedSignals(fixture.merchantId)).map(
          (s: any) => s.signal_type
        )
      ).toEqual(["purchase_completed"]);
      await applyTapOrderPaymentState({ ...input, providerStatus: "REFUNDED" });
      expect(
        (await getUnanalyzedSignals(fixture.merchantId)).map(
          (s: any) => s.signal_type
        )
      ).toEqual(["purchase_refunded"]);
      expect(await storedSignals()).toHaveLength(2);
    });
    it.each([
      "status",
      "charge",
      "deleted_payment",
      "deleted_order",
      "deleted_event",
      "event_version",
      "deleted_profile",
      "profile_phone",
      "payment_phone",
      "order_phone",
      "conversation_phone",
      "attribution",
      "metadata_id",
      "metadata_outcome",
      "source_key",
      "unmarked",
      "copied_text",
      "weight",
      "currency",
      "amount",
    ])(
      "excludes payment learning with %s drift and counts only surviving canonical ownership",
      async change => {
        const input = await payment();
        await applyTapOrderPaymentState(input);
        if (change === "status")
          await query("UPDATE order_payments SET status='pending' WHERE id=?", [
            input.paymentId,
          ]);
        if (change === "charge")
          await query(
            "UPDATE order_payments SET tap_charge_id=NULL WHERE id=?",
            [input.paymentId]
          );
        if (change === "deleted_payment")
          await query("DELETE FROM order_payments WHERE id=?", [
            input.paymentId,
          ]);
        if (change === "deleted_order")
          await query("DELETE FROM orders WHERE merchantId=?", [
            fixture.merchantId,
          ]);
        if (change === "deleted_event")
          await query("DELETE FROM ai_purchase_outcomes WHERE merchant_id=?", [
            fixture.merchantId,
          ]);
        if (change === "event_version")
          await query(
            "UPDATE ai_purchase_outcomes SET schema_version=2 WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "deleted_profile")
          await query("DELETE FROM customer_profiles WHERE merchant_id=?", [
            fixture.merchantId,
          ]);
        if (change === "profile_phone")
          await query(
            "UPDATE customer_profiles SET customer_phone='966500123456' WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "payment_phone")
          await query(
            "UPDATE order_payments SET customer_phone='966500123456' WHERE id=?",
            [input.paymentId]
          );
        if (change === "order_phone")
          await query(
            "UPDATE orders SET customerPhone='966500123456' WHERE merchantId=?",
            [fixture.merchantId]
          );
        if (change === "conversation_phone")
          await query(
            "UPDATE conversations SET customerPhone='966500123456' WHERE id=?",
            [conversationId]
          );
        if (change === "attribution")
          await query(
            "UPDATE ai_purchase_outcomes SET conversation_id=NULL WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "metadata_id")
          await query(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.paymentId',999999999) WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "metadata_outcome")
          await query(
            "UPDATE sari_learning_signals SET context_summary=JSON_SET(context_summary,'$.outcome','purchase_refunded') WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "source_key")
          await query(
            "UPDATE sari_learning_signals SET source_key=NULL WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "unmarked")
          await query(
            "UPDATE sari_learning_signals SET source_key=NULL,context_summary=NULL WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "copied_text")
          await query(
            "UPDATE sari_learning_signals SET customer_message='أنا دفعت' WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "weight")
          await query(
            "UPDATE sari_learning_signals SET signal_weight=9 WHERE merchant_id=?",
            [fixture.merchantId]
          );
        if (change === "currency")
          await query("UPDATE order_payments SET currency='sar' WHERE id=?", [
            input.paymentId,
          ]);
        if (change === "amount")
          await query("UPDATE order_payments SET amount=-1 WHERE id=?", [
            input.paymentId,
          ]);
        expect(await getUnanalyzedSignals(fixture.merchantId)).toEqual([]);
        expect(await storedSignals()).toHaveLength(1);
        const keepsPayment = [
          "conversation_phone",
          "attribution",
          "metadata_id",
          "metadata_outcome",
          "source_key",
          "unmarked",
          "copied_text",
          "weight",
        ].includes(change);
        expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
          verifiedPurchases: keepsPayment ? 1 : 0,
          verifiedRefunds: 0,
        });
      }
    );
    it("rejects a payment outcome reassigned to another tenant profile without losing the original records", async () => {
      const input = await payment();
      await applyTapOrderPaymentState(input);
      const other = await createDisposableMerchant("foreign-payment-source");
      try {
        const foreign = await query(
          "INSERT INTO customer_profiles(merchant_id,customer_phone) VALUES (?,?)",
          [other.merchantId, phone]
        );
        await query(
          "UPDATE ai_purchase_outcomes SET profile_id=? WHERE merchant_id=?",
          [foreign.insertId, fixture.merchantId]
        );
        expect(await getUnanalyzedSignals(fixture.merchantId)).toEqual([]);
        expect(await getUnanalyzedSignals(other.merchantId)).toEqual([]);
        expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
          verifiedPurchases: 0,
        });
        expect(await storedSignals()).toHaveLength(1);
      } finally {
        await cleanupDisposableMerchants([other.userId]);
      }
    });
    it.each(["claim", "dispatch", "response", "recovery", "projection"])(
      "invalidates the pre-refund capture at %s",
      async checkpoint => {
        const input = await payment();
        await applyTapOrderPaymentState(input);
        const sources = await storedSignals(),
          snapshot = snapshotLearningSignals(fixture.merchantId, sources),
          result = analysis(sources);
        const refund = () =>
          applyTapOrderPaymentState({ ...input, providerStatus: "REFUNDED" });
        if (checkpoint === "claim") {
          await refund();
          expect(await claimLearningAnalysis(snapshot)).toMatchObject({
            status: "stale",
          });
        } else if (checkpoint === "projection") {
          await refund();
          await expect(
            persistLearningAnalysis(snapshot, result)
          ).rejects.toThrow("source changed");
        } else {
          const acquired = await claimLearningAnalysis(snapshot);
          if (acquired.status !== "claimed")
            throw Error("Expected isolated claim");
          if (checkpoint === "dispatch") {
            await refund();
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
              await refund();
              expect(
                await resumeLearningAnalysis(fixture.merchantId)
              ).toMatchObject({ status: "stale" });
            } else {
              await refund();
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
            [fixture.merchantId]
          )
        ).toEqual([]);
      }
    );
    it("withdraws an already reviewed success proposal after refund without deleting the review or charging again", async () => {
      const input = await payment();
      await applyTapOrderPaymentState(input);
      const sources = await storedSignals();
      await persistLearningAnalysis(
        snapshotLearningSignals(fixture.merchantId, sources),
        analysis(sources)
      );
      const proposalId = (
        await query(
          "SELECT id FROM ai_learning_proposals WHERE merchant_id=?",
          [fixture.merchantId]
        )
      )[0].id;
      const before = await getLearningPolicyReview(fixture.merchantId, {
        proposalId,
      });
      await recordLearningPolicyReview(fixture.merchantId, fixture.userId, {
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
          reason: "Synthetic independent case assessment.",
        })),
      });
      await applyTapOrderPaymentState({ ...input, providerStatus: "REFUNDED" });
      expect(
        await getLearningPolicyReview(fixture.merchantId, { proposalId })
      ).toMatchObject({
        stage: "stale",
        eligible: false,
        independentConversations: 0,
      });
      expect(
        (await getLearningEvidence(fixture.merchantId)).proposals[0]
      ).toMatchObject({ evidenceCount: 0, evidence: [] });
      expect(
        await query(
          "SELECT id FROM ai_learning_policy_reviews WHERE merchant_id=?",
          [fixture.merchantId]
        )
      ).toHaveLength(1);
      expect(
        await query("SELECT status FROM order_payments WHERE id=?", [
          input.paymentId,
        ])
      ).toEqual([{ status: "refunded" }]);
    });
    it.each(["payment", "owner", "outcome"])(
      "holds the canonical %s until the final evidence transaction finishes",
      async target => {
        const input = await payment();
        await applyTapOrderPaymentState(input);
        const sources = await storedSignals();
        const pool = (await getPool())!,
          c = await pool.getConnection(),
          other = await pool.getConnection();
        const [[settings]] = await other.query<any[]>(
          "SELECT @@SESSION.innodb_lock_wait_timeout AS seconds"
        );
        const sql =
          target === "payment"
            ? "UPDATE order_payments SET status='pending' WHERE id=?"
            : target === "owner"
              ? "UPDATE orders SET customerPhone='966500123456' WHERE id=(SELECT order_id FROM order_payments WHERE id=?)"
              : "UPDATE ai_purchase_outcomes SET schema_version=2 WHERE payment_id=?";
        try {
          await other.query("SET SESSION innodb_lock_wait_timeout=1");
          await c.beginTransaction();
          expect(
            await verifiedContextualLearningSources(
              c,
              fixture.merchantId,
              sources,
              true
            )
          ).toHaveLength(1);
          await expect(
            other.execute(sql, [input.paymentId])
          ).rejects.toMatchObject({ code: "ER_LOCK_WAIT_TIMEOUT" });
          await c.commit();
          await other.execute(sql, [input.paymentId]);
          expect(await getUnanalyzedSignals(fixture.merchantId)).toEqual([]);
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
    it("projects a verified payment and its learning signal once on duplicate delivery", async () => {
      const input = await payment();
      await applyTapOrderPaymentState(input);
      const before = await profile();
      await applyTapOrderPaymentState(input);
      const after = await profile();
      expect(Number(after.total_spent)).toBe(230);
      expect(after.verified_purchase_count).toBe(1);
      expect(after.memory_version).toBe(before.memory_version);
      expect(JSON.parse(after.purchase_history)).toEqual(["سماعة اختبار"]);
      expect(
        await query(
          "SELECT id FROM ai_purchase_outcomes WHERE merchant_id = ?",
          [fixture.merchantId]
        )
      ).toHaveLength(1);
      expect(
        await query(
          "SELECT signal_type FROM sari_learning_signals WHERE merchant_id = ?",
          [fixture.merchantId]
        )
      ).toEqual([
        expect.objectContaining({ signal_type: "purchase_completed" }),
      ]);
    });
    it("reverses purchase count, revenue and tier on a verified refund without reviving a late capture", async () => {
      const input = await payment(600000);
      await applyTapOrderPaymentState(input);
      expect((await profile()).customer_tier).toBe("vip");
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 1,
        verifiedRefunds: 0,
      });
      await applyTapOrderPaymentState({ ...input, providerStatus: "REFUNDED" });
      await applyTapOrderPaymentState(input);
      const actual = await profile();
      expect(Number(actual.total_spent)).toBe(0);
      expect(actual.verified_purchase_count).toBe(0);
      expect(actual.customer_tier).toBe("new");
      expect(await getLearningEvidence(fixture.merchantId)).toMatchObject({
        verifiedPurchases: 0,
        verifiedRefunds: 1,
      });
      expect(JSON.parse(actual.purchase_history)).toEqual([]);
      expect(
        await query(
          "SELECT outcome_type FROM ai_purchase_outcomes WHERE merchant_id = ? ORDER BY id",
          [fixture.merchantId]
        )
      ).toEqual([
        expect.objectContaining({ outcome_type: "purchase_completed" }),
        expect.objectContaining({ outcome_type: "purchase_refunded" }),
      ]);
    });
    it("keeps currencies separate in customer memory", async () => {
      await applyTapOrderPaymentState(await payment(23000, "SAR"));
      await applyTapOrderPaymentState(await payment(60000, "USD"));
      const actual = await profile();
      expect(Number(actual.total_spent)).toBe(230);
      expect(JSON.parse(actual.verified_spend_by_currency)).toEqual({
        SAR: 23000,
        USD: 60000,
      });
      expect(actual.verified_purchase_count).toBe(2);
    });
    it.each([2, 6])(
      "does not lose %i concurrent payments for different orders of the same customer",
      async count => {
        const inputs = [];
        for (let index = 0; index < count; index++)
          inputs.push(await payment(11000));
        await Promise.all(inputs.map(applyTapOrderPaymentState));
        expect(Number((await profile()).total_spent)).toBe(110 * count);
        expect((await profile()).verified_purchase_count).toBe(count);
      }
    );
    it("does not learn payment success from authorization or failure", async () => {
      const input = await payment();
      await applyTapOrderPaymentState({
        ...input,
        providerStatus: "AUTHORIZED",
      });
      await applyTapOrderPaymentState({ ...input, providerStatus: "FAILED" });
      expect(await profile()).toBeUndefined();
      expect(
        await query(
          "SELECT id FROM ai_purchase_outcomes WHERE merchant_id = ?",
          [fixture.merchantId]
        )
      ).toHaveLength(0);
    });
    it("does not attribute a real payment to a different customer conversation", async () => {
      const other = await query(
        "INSERT INTO conversations (merchantId, customerPhone, status) VALUES (?, '966500999999', 'active')",
        [fixture.merchantId]
      );
      await applyTapOrderPaymentState(
        await payment(23000, "SAR", other.insertId)
      );
      expect((await profile()).verified_purchase_count).toBe(1);
      expect(
        await query(
          "SELECT id FROM sari_learning_signals WHERE merchant_id = ?",
          [fixture.merchantId]
        )
      ).toHaveLength(0);
      const outcomes = await query(
        "SELECT conversation_id FROM ai_purchase_outcomes WHERE merchant_id = ?",
        [fixture.merchantId]
      );
      expect(outcomes[0].conversation_id).toBeNull();
    });
    it("keeps the payment unchanged if a caller supplies another merchant identity", async () => {
      const input = await payment();
      await expect(
        applyTapOrderPaymentState({
          ...input,
          expectedMerchantId: fixture.merchantId + 999999,
        })
      ).rejects.toThrow();
      expect(
        (
          await query("SELECT status FROM order_payments WHERE id = ?", [
            input.paymentId,
          ])
        )[0].status
      ).toBe("pending");
      expect(await profile()).toBeUndefined();
    });
  }
);
