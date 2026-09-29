import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { closeDb, getPool } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import { readTestMetricsWorkspace } from "./test-metrics-workspace";
import { calculateAllMetrics } from "./metrics";
import { ensureTestFeedbackSchema } from "./tests/helpers/test-feedback-schema";
import { readSavedTestTranscript } from "./test-feedback-workspace";
describe.skipIf(!process.env.DATABASE_URL)(
  "saved test metrics evidence in MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner;
    const now = new Date("2026-09-30T10:00:00Z"),
      start = "2026-09-30 08:00:00",
      sent = "2026-09-30 08:01:00";
    const run = async (sql: string, args: any[] = []) => {
      const [r] = await (await getPool())!.execute<any>(sql, args);
      return Number(r.insertId);
    };
    const session = (merchant = owner.merchantId, date = start) =>
      run("INSERT INTO testConversations (merchantId,startedAt) VALUES (?,?)", [
        merchant,
        date,
      ]);
    const message = (
      id: number,
      sender = "sari",
      latency: number | null = 1000,
      rating: string | null = null,
      date = sent
    ) =>
      run(
        "INSERT INTO testMessages (conversationId,sender,content,responseTime,rating,sentAt) VALUES (?,?,'local',?,?,?)",
        [id, sender, latency, rating, date]
      );
    const deal = (
      id: number | null,
      value = 100,
      date = sent,
      merchant = owner.merchantId
    ) =>
      run(
        "INSERT INTO testDeals (conversationId,merchantId,dealValue,messageCount,timeToConversion,markedAt) VALUES (?,?,?,999,999999,?)",
        [id, merchant, value, date]
      );
    const read = () =>
      readTestMetricsWorkspace(owner.merchantId, { period: "day" }, now);
    beforeAll(ensureTestFeedbackSchema);
    beforeEach(async () => {
      owner = await createDisposableMerchant("test-metrics");
      other = await createDisposableMerchant("metrics-other");
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("excludes guardrail feedback from quality without hiding saved replies or unknown sources", async () => {
      const a = await session(),
        foreign = await session(other.merchantId);
      await message(a, "user", null, "positive");
      const guardedPositive = await message(a, "sari", 0, "positive"),
        guardedNegative = await message(a, "sari", 0, "negative"),
        modeled = await message(a, "sari", 1000, "positive"),
        unknown = await message(a, "sari", 2000, "negative"),
        unrated = await message(a, "sari", 1000);
      await run(
        "UPDATE testMessages SET replySource='guardrail' WHERE id IN (?,?)",
        [guardedPositive, guardedNegative]
      );
      await run(
        "UPDATE testMessages SET replySource='model' WHERE id IN (?,?)",
        [modeled, unrated]
      );
      await message(foreign, "sari", 500, "positive");
      const r = await read(),
        transcript = await readSavedTestTranscript(owner.merchantId, {
          conversationId: a,
        });
      expect(r.messages).toBe(6);
      expect(r.replies).toBe(5);
      expect(r.feedback).toMatchObject({
        eligibleReplies: 3,
        excludedGuardrails: 2,
        unknownSourceReplies: 1,
        positive: 1,
        negative: 1,
        unrated: 1,
        positiveShare: 50,
      });
      expect(transcript.feedback).toEqual({
        replies: r.feedback.eligibleReplies,
        positive: r.feedback.positive,
        negative: r.feedback.negative,
      });
      expect(r.metrics.avgResponseTime.denominator).toBe(5);
      expect(
        (await calculateAllMetrics(owner.merchantId, "day", now)).evidence
          .feedback
      ).toEqual(r.feedback);
      expect(unknown).toBeGreaterThan(modeled);
    });
    it("has no feedback percentage when all replies are guardrails even with legacy ratings", async () => {
      const a = await session();
      const id = await message(a, "sari", 0, "positive");
      await run("UPDATE testMessages SET replySource='guardrail' WHERE id=?", [
        id,
      ]);
      const r = await read();
      expect(r.replies).toBe(1);
      expect(r.feedback).toMatchObject({
        eligibleReplies: 0,
        excludedGuardrails: 1,
        unknownSourceReplies: 0,
        positive: 0,
        negative: 0,
        unrated: 0,
        positiveShare: null,
      });
    });
    it("returns complete empty evidence without inventing percentages or surveys", async () => {
      const r = await read();
      expect(r.sessions).toBe(0);
      expect(r.messages).toBe(0);
      expect(Object.keys(r.metrics)).toHaveLength(15);
      expect(r.metrics.conversionRate.value).toBeNull();
      expect(r.metrics.totalRevenue.value).toBe(0);
      expect(r.metrics.avgConversationLength.value).toBeNull();
      expect(r.metrics.csatScore.value).toBeNull();
      expect(r.metrics.npsScore.value).toBeNull();
      expect(r.salesProficiency).toBeNull();
    });
    it("uses all selected sessions including empty ones and bounds every message", async () => {
      const a = await session(),
        b = await session(),
        old = await session(owner.merchantId, "2026-09-29 23:59:59"),
        foreign = await session(other.merchantId);
      await message(a, "user", 900, "positive");
      await message(a, "sari", 0, "positive");
      await message(a, "sari", 2000, "negative");
      await message(a, "sari", -1);
      await message(a, "sari", 3600001);
      await message(a, "sari", 1000, null, "2026-09-30 07:59:59");
      await message(a, "sari", 1000, null, "2026-09-30 10:00:01");
      await message(old);
      await message(foreign);
      const r = await read();
      expect(r.sessions).toBe(2);
      expect(r.messages).toBe(5);
      expect(r.replies).toBe(4);
      expect(r.metrics.avgConversationLength).toMatchObject({
        value: 2.5,
        sample: 5,
        denominator: 2,
      });
      expect(r.metrics.avgResponseTime).toMatchObject({
        value: 1000,
        sample: 2,
        denominator: 4,
      });
      expect(r.invalidLatency).toBe(2);
      expect(r.metrics.engagementRate).toMatchObject({
        value: 50,
        sample: 1,
        denominator: 2,
      });
      expect(r.longSessions).toEqual({ count: 1, total: 2, share: 50 });
      expect(r.feedback).toMatchObject({
        positive: 1,
        negative: 1,
        unrated: 2,
        positiveShare: 50,
      });
      expect(b).toBeGreaterThan(a);
    });
    it("deduplicates trial agreements and derives elapsed time from bounded linked timestamps", async () => {
      const a = await session(),
        b = await session(),
        foreign = await session(other.merchantId),
        old = await session(owner.merchantId, "2026-09-29 00:00:00");
      await deal(a, 250);
      await deal(a, 900, "2026-09-30 08:02:00");
      await deal(b, -100);
      await deal(a, 800, "2026-09-30 10:00:01");
      await deal(a, 700, "2026-09-30 07:59:59");
      await deal(foreign, 9999);
      await deal(old, 9999);
      await deal(null, 9999);
      await deal(a, 9999, sent, other.merchantId);
      const r = await read();
      expect(r.metrics.conversionRate).toMatchObject({
        value: 50,
        sample: 1,
        denominator: 2,
        meaning: "test_deal_mark",
      });
      expect(r.metrics.totalRevenue.value).toBe(250);
      expect(r.metrics.avgDealValue.value).toBe(250);
      expect(r.metrics.avgTimeToConversion.value).toBe(60);
      expect(r.dealRecords).toBe(2);
      expect(r.duplicateDeals).toBe(1);
      expect(r.invalidDeals).toBe(1);
      const legacy = await calculateAllMetrics(owner.merchantId, "day", now);
      expect(legacy.evidence).toEqual(r);
      expect(legacy.conversion).toEqual({
        conversionRate: 50,
        avgDealValue: 250,
        totalRevenue: 250,
      });
      expect(legacy.time.avgTimeToConversion).toBe(60);
    });
    it("never derives unsupported business metrics from trial agreements or feedback", async () => {
      const c = await session();
      await deal(c);
      await message(c, "sari", 1000, "positive");
      await run(
        "UPDATE testMessages SET wasClicked=1,productsRecommended=? WHERE conversationId=?",
        ['["trial"]', c]
      );
      await run(
        "UPDATE testConversations SET satisfactionRating=5,npsScore=10,wasCompleted=1 WHERE id=?",
        [c]
      );
      const r = await read();
      for (const id of [
        "resolutionRate",
        "escalationRate",
        "returnRate",
        "referralRate",
        "productClickRate",
        "orderCompletionRate",
        "csatScore",
        "npsScore",
      ] as const)
        expect(r.metrics[id]).toMatchObject({
          value: null,
          meaning: "unmeasured",
        });
      expect(r.feedback.positiveShare).toBe(100);
      expect(r.salesProficiency).toBeNull();
      const legacy = await calculateAllMetrics(owner.merchantId, "day", now);
      expect(legacy.advanced).toEqual({
        productClickRate: null,
        orderCompletionRate: null,
        csatScore: null,
        npsScore: null,
      });
      expect(legacy.growth).toEqual({ returnRate: null, referralRate: null });
      expect(legacy.quality.resolutionRate).toBeNull();
      expect(legacy.evidence).toEqual(r);
    });
    it("includes exact time bounds and excludes future sessions", async () => {
      const a = await session(owner.merchantId, "2026-09-30 00:00:00"),
        b = await session(owner.merchantId, "2026-09-30 10:00:00");
      await session(owner.merchantId, "2026-09-30 10:00:01");
      await message(a, "sari", 1000, null, "2026-09-30 00:00:00");
      await message(b, "user", null, null, "2026-09-30 10:00:00");
      const r = await read();
      expect(r.sessions).toBe(2);
      expect(r.messages).toBe(2);
    });
  }
);
