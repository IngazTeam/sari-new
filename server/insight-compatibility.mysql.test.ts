import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  getKeywordInsights,
  getWeeklyReportsList,
  getActiveABTests,
} from "./db-insights";
import { readInsightWorkspace } from "./insights-workspace";
import { insightWorkspaceInput } from "../shared/insights-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "compatibility insight evidence in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    beforeEach(async () => {
      owner = await createDisposableMerchant("compat-read");
      other = await createDisposableMerchant("compat-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("aligns keyword selection with the current workspace and keeps status flags distinct from applied responses", async () => {
      const pool = (await getPool())!;
      for (let i = 0; i < 12; i++)
        await pool.execute(
          "INSERT INTO keyword_analysis (merchant_id,keyword,category,frequency,status,suggested_response,created_at,last_seen_at) VALUES (?,?,'question',?,'response_created',?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 100 DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY))",
          [
            owner.merchantId,
            `word-${i}`,
            i,
            i === 0 ? " " : i === 1 ? "saved text" : null,
          ]
        );
      await pool.execute(
        "INSERT INTO keyword_analysis (merchant_id,keyword,category,last_seen_at) VALUES (?,'old','price',DATE_SUB(UTC_TIMESTAMP(),INTERVAL 50 DAY)),(?,'future','price',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY)),(?,'foreign','price',UTC_TIMESTAMP())",
        [owner.merchantId, owner.merchantId, other.merchantId]
      );
      const legacy = await getKeywordInsights(owner.merchantId, "7d");
      const current = await readInsightWorkspace(
        owner.merchantId,
        insightWorkspaceInput.parse({ period: "7d" })
      );
      expect(legacy).toMatchObject({
        total: 12,
        suggested: 1,
        applied: null,
        markedResponseCreated: 12,
        selectedBy: "last_seen_at",
        frequencyMeaning: "lifetime_count",
      });
      expect(legacy.total).toBe(current.keywords.total);
      expect(legacy.suggested).toBe(current.keywords.suggested);
      expect(legacy.byCategory).toEqual(current.keywords.categories);
      expect(legacy.topKeywords).toHaveLength(10);
      expect(legacy.topKeywords[0]).toMatchObject({
        keyword: "word-11",
        count: 11,
      });
    });
    it("never relabels historical positive percent as satisfaction", async () => {
      const pool = (await getPool())!;
      for (const merchant of [owner.merchantId, other.merchantId])
        await pool.execute(
          "INSERT INTO weekly_sentiment_reports (merchant_id,week_start_date,week_end_date,total_conversations,positive_count,negative_count,neutral_count,positive_percentage) VALUES (?,DATE_SUB(UTC_TIMESTAMP(),INTERVAL 9 DAY),DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY),10,4,1,2,99)",
          [merchant]
        );
      const reports = await getWeeklyReportsList(owner.merchantId, 4);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        averageSatisfaction: null,
        positiveShare: 40,
        observation: { unclassified: 3 },
      });
    });
    it("paginates running A/B observations and leaves empty or invalid ratios unavailable", async () => {
      const pool = (await getPool())!;
      const ids = [];
      for (let i = 0; i < 3; i++) {
        const [r] = await pool.execute<any>(
          "INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text,status,variant_a_usage_count,variant_a_success_count,variant_b_usage_count,variant_b_success_count) VALUES (?,'local','test','A','B','running',0,0,10,11)",
          [owner.merchantId]
        );
        ids.push(Number(r.insertId));
      }
      await pool.execute(
        "INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text,status) VALUES (?,'foreign','test','A','B','running'),(?,'paused','test','A','B','paused')",
        [other.merchantId, owner.merchantId]
      );
      const a = await getActiveABTests(owner.merchantId, { limit: 2, page: 1 }),
        b = await getActiveABTests(owner.merchantId, { limit: 2, page: 2 });
      expect([...a, ...b].map(r => r.id)).toEqual(ids.reverse());
      expect(a[0]).toMatchObject({
        successRateA: null,
        successRateB: null,
        observationA: { ratio: null, valid: true },
        observationB: { ratio: null, valid: false },
        activationAllowed: false,
        statisticalConfidence: null,
      });
      expect(
        await getActiveABTests(owner.merchantId, { limit: 2, page: 3 })
      ).toEqual([]);
    });
    it("returns valid observed ratios separately from unmeasured success", async () => {
      await (await getPool())!.execute(
        "INSERT INTO ab_test_results (merchant_id,test_name,keyword,variant_a_text,variant_b_text,status,variant_a_usage_count,variant_a_success_count,variant_b_usage_count,variant_b_success_count) VALUES (?,'sample','test','A','B','running',10,4,20,5)",
        [owner.merchantId]
      );
      expect((await getActiveABTests(owner.merchantId))[0]).toMatchObject({
        successRateA: null,
        successRateB: null,
        observationA: { ratio: 40 },
        observationB: { ratio: 25 },
      });
    });
    it("keeps empty snapshots distinct from invalid selection", async () => {
      expect(await getKeywordInsights(owner.merchantId, "7d")).toMatchObject({
        total: 0,
        suggested: 0,
        markedResponseCreated: 0,
        applied: null,
        topKeywords: [],
      });
      await expect(
        getKeywordInsights(owner.merchantId, "all" as any)
      ).rejects.toThrow();
      await expect(
        getActiveABTests(owner.merchantId, { limit: 101 })
      ).rejects.toThrow();
      await expect(getWeeklyReportsList(owner.merchantId, 0)).rejects.toThrow();
    });
  }
);
