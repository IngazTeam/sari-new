import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readInsightWorkspace } from "./insights-workspace";
import { insightWorkspaceInput } from "../shared/insights-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "insight evidence read model in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    beforeEach(async () => {
      owner = await createDisposableMerchant("insights");
      other = await createDisposableMerchant("insights-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    const read = (input: Record<string, unknown> = {}) =>
      readInsightWorkspace(
        owner.merchantId,
        insightWorkspaceInput.parse(input)
      );
    it("selects keyword cohorts by last seen, isolates tenants, and paginates beyond the old top ten", async () => {
      const pool = (await getPool())!;
      for (let i = 0; i < 23; i++)
        await pool.execute(
          `INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,status,suggested_response,first_seen_at,created_at,last_seen_at) VALUES (?,?,'question',?,'new',?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 120 DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL 120 DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY))`,
          [
            owner.merchantId,
            `word-${i}`,
            i,
            i === 0 ? " " : i === 1 ? "suggestion" : null,
          ]
        );
      await pool.execute(
        `INSERT INTO keyword_analysis (merchant_id,keyword,category,last_seen_at) VALUES (?,'foreign','price',UTC_TIMESTAMP()),(?,'old','price',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 50 DAY)),(?,'future','price',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))`,
        [other.merchantId, owner.merchantId, owner.merchantId]
      );
      const first = await read({ period: "7d" });
      expect(first.keywords.total).toBe(23);
      expect(first.keywords.suggested).toBe(1);
      expect(first.keywords.rows).toHaveLength(20);
      expect(first.keywords.categories).toEqual([
        { category: "question", count: 23 },
      ]);
      expect(first.keywords.rows[0]).toMatchObject({
        keyword: "word-22",
        frequency: 22,
      });
      expect(first.keywords.rows[0].firstSeenAt).toMatch(/Z$/);
      const second = await read({ period: "7d", keywordPage: 999 });
      expect(second.keywords.page).toBe(2);
      expect(second.keywords.rows).toHaveLength(3);
      expect(
        new Set(
          [...first.keywords.rows, ...second.keywords.rows].map(r => r.id)
        ).size
      ).toBe(23);
      expect((await read({ period: "90d" })).keywords.total).toBe(24);
    });
    it("uses report end dates and computes positive share from counters while exposing missing classifications", async () => {
      const pool = (await getPool())!;
      for (const [merchant, days] of [
        [owner.merchantId, 2],
        [owner.merchantId, 50],
        [other.merchantId, 2],
      ])
        await pool.execute(
          `INSERT INTO weekly_sentiment_reports (merchant_id,week_start_date,week_end_date,total_conversations,positive_count,negative_count,neutral_count,positive_percentage,satisfaction_score) VALUES (?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY),10,4,1,2,99,100)`,
          [merchant, days]
        );
      const result = await read({ period: "7d" });
      expect(result.reports.total).toBe(1);
      expect(result.reports.rows[0].observation).toMatchObject({
        total: 10,
        positiveShare: 40,
        classified: 7,
        unclassified: 3,
      });
      expect(result.reports.rows[0]).not.toHaveProperty("averageSatisfaction");
      expect((await read({ period: "90d" })).reports.total).toBe(2);
    });
    it("returns all stored A/B statuses with bounded pages and never authorizes activation or a winner", async () => {
      const pool = (await getPool())!;
      for (let i = 0; i < 22; i++)
        await pool.execute(
          `INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text,status,variant_a_usage_count,variant_a_success_count,variant_b_usage_count,variant_b_success_count,confidence_level,winner,created_at) VALUES (?,?,'shipping','A text','B text',?,0,0,10,11,99,'variant_a',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY))`,
          [owner.merchantId, `test-${i}`, i % 2 ? "paused" : "completed"]
        );
      await pool.execute(
        `INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text) VALUES (?,'foreign','other','A','B')`,
        [other.merchantId]
      );
      const result = await read({ testPage: 1 });
      expect(result.tests.total).toBe(22);
      expect(result.tests.rows).toHaveLength(20);
      expect(result.tests.activationAllowed).toBe(false);
      expect(result.tests.statisticalConfidence).toBeNull();
      expect(result.tests.rows[0].variantA).toMatchObject({
        ratio: null,
        valid: true,
      });
      expect(result.tests.rows[0].variantB).toMatchObject({
        ratio: null,
        valid: false,
      });
      expect(result.tests.rows[0].storedSelection).toBe("variant_a");
      expect((await read({ testPage: 90 })).tests.rows).toHaveLength(2);
    });
    it("returns a real empty snapshot for an empty tenant", async () => {
      const result = await read();
      expect(result.keywords).toMatchObject({
        total: 0,
        suggested: 0,
        markedResponseCreated: 0,
        rows: [],
      });
      expect(result.reports.total).toBe(0);
      expect(result.tests.total).toBe(0);
    });
  }
);
