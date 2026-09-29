import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import {
  testMetricsInput,
  testMetricsWindow,
  testMetricIds,
  type TestMetricsInput,
  type TestMetricsSnapshot,
  type TestMetricObservation,
} from "../shared/test-metrics-workspace";
export async function readTestMetricsWorkspace(
  merchantId: number,
  input: TestMetricsInput,
  now = new Date()
): Promise<TestMetricsSnapshot> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = testMetricsInput.parse(input),
    w = testMetricsWindow(selection.period, now),
    db = await getDb();
  if (!db) throw Error("Test metrics unavailable");
  return db.transaction(
    async tx => {
      const result = await tx.execute(sql`WITH cohort AS (
    SELECT id,startedAt FROM testConversations WHERE merchantId=${merchantId} AND startedAt>=${w.sqlFrom} AND startedAt<=${w.sqlThrough}
   ), msg AS (
    SELECT m.conversationId,COUNT(*) messageCount,
     SUM(m.sender='sari') replies,
     SUM(m.sender='sari' AND (m.replySource IS NULL OR m.replySource!='guardrail')) eligibleReplies,
     SUM(m.sender='sari' AND m.replySource='guardrail') excludedGuardrails,
     SUM(m.sender='sari' AND m.replySource IS NULL) unknownSourceReplies,
     SUM(m.sender='sari' AND m.responseTime BETWEEN 0 AND 3600000) latencyCount,
     SUM(CASE WHEN m.sender='sari' AND m.responseTime BETWEEN 0 AND 3600000 THEN m.responseTime ELSE 0 END) latencySum,
     SUM(m.sender='sari' AND m.responseTime IS NOT NULL AND (m.responseTime<0 OR m.responseTime>3600000)) invalidLatency,
     SUM(m.sender='sari' AND (m.replySource IS NULL OR m.replySource!='guardrail') AND m.rating='positive') positive,
     SUM(m.sender='sari' AND (m.replySource IS NULL OR m.replySource!='guardrail') AND m.rating='negative') negative
    FROM testMessages m JOIN cohort c ON c.id=m.conversationId
    WHERE m.sentAt>=c.startedAt AND m.sentAt<=${w.sqlThrough} GROUP BY m.conversationId
   ), deals AS (
    SELECT d.*,c.startedAt,ROW_NUMBER() OVER(PARTITION BY d.conversationId ORDER BY d.id) rn,
     COUNT(*) OVER(PARTITION BY d.conversationId) recordCount
    FROM testDeals d JOIN cohort c ON c.id=d.conversationId
    WHERE d.merchantId=${merchantId} AND d.markedAt>=c.startedAt AND d.markedAt<=${w.sqlThrough} AND d.dealValue>0
   ) SELECT COUNT(*) sessions,COALESCE(SUM(m.messageCount),0) messages,COALESCE(SUM(m.replies),0) replies,
    COALESCE(SUM(m.eligibleReplies),0) eligibleReplies,COALESCE(SUM(m.excludedGuardrails),0) excludedGuardrails,COALESCE(SUM(m.unknownSourceReplies),0) unknownSourceReplies,
    COALESCE(SUM(m.latencyCount),0) latencyCount,COALESCE(SUM(m.latencySum),0) latencySum,COALESCE(SUM(m.invalidLatency),0) invalidLatency,
    COALESCE(SUM(m.positive),0) positive,COALESCE(SUM(m.negative),0) negative,
    COALESCE(SUM(m.messageCount>=3),0) threePlus,COALESCE(SUM(m.messageCount>=5),0) fivePlus,
    COUNT(d.id) marked,COALESCE(SUM(d.recordCount),0) dealRecords,COALESCE(SUM(d.dealValue),0) dealSum,
    COALESCE(SUM(TIMESTAMPDIFF(SECOND,d.startedAt,d.markedAt)),0) elapsedSum
   FROM cohort c LEFT JOIN msg m ON m.conversationId=c.id LEFT JOIN deals d ON d.conversationId=c.id AND d.rn=1`);
      const r = (result[0] as unknown as Record<string, unknown>[])[0];
      const n = (key: string) => {
        const v = Number(r[key]);
        if (!Number.isFinite(v) || v < 0) throw Error("Invalid metrics value");
        return v;
      };
      const sessions = n("sessions"),
        messages = n("messages"),
        replies = n("replies"),
        marked = n("marked"),
        latencyCount = n("latencyCount"),
        positive = n("positive"),
        negative = n("negative"),
        dealRecords = n("dealRecords");
      const invalid = await tx.execute(
        sql`SELECT COUNT(*) n FROM testDeals d JOIN testConversations c ON c.id=d.conversationId AND c.merchantId=d.merchantId WHERE c.merchantId=${merchantId} AND c.startedAt>=${w.sqlFrom} AND c.startedAt<=${w.sqlThrough} AND d.markedAt>=c.startedAt AND d.markedAt<=${w.sqlThrough} AND d.dealValue<=0`
      );
      const invalidDeals = Number(
        (invalid[0] as unknown as { n: number }[])[0].n
      );
      const ratio = (a: number, b: number) => (b ? (a / b) * 100 : null);
      const metric = (
        value: number | null,
        sample: number,
        denominator: number | null,
        unit: TestMetricObservation["unit"],
        meaning: TestMetricObservation["meaning"]
      ): TestMetricObservation => ({
        value,
        sample,
        denominator,
        unit,
        meaning,
      });
      const metrics = Object.fromEntries(
        testMetricIds.map(id => [
          id,
          metric(
            null,
            0,
            null,
            id === "csatScore" || id === "npsScore" ? "score" : "percent",
            "unmeasured"
          ),
        ])
      ) as TestMetricsSnapshot["metrics"];
      metrics.conversionRate = metric(
        ratio(marked, sessions),
        marked,
        sessions,
        "percent",
        "test_deal_mark"
      );
      metrics.avgDealValue = metric(
        marked ? n("dealSum") / marked : null,
        marked,
        null,
        "stored_value",
        "test_value_unknown_currency"
      );
      metrics.totalRevenue = metric(
        n("dealSum"),
        marked,
        null,
        "stored_value",
        "test_value_unknown_currency"
      );
      metrics.avgResponseTime = metric(
        latencyCount ? n("latencySum") / latencyCount : null,
        latencyCount,
        replies,
        "ms",
        "saved_client_latency"
      );
      metrics.avgConversationLength = metric(
        sessions ? messages / sessions : null,
        messages,
        sessions,
        "messages",
        "saved_message_count"
      );
      metrics.avgTimeToConversion = metric(
        marked ? n("elapsedSum") / marked : null,
        marked,
        null,
        "seconds",
        "elapsed_to_test_mark"
      );
      metrics.engagementRate = metric(
        ratio(n("threePlus"), sessions),
        n("threePlus"),
        sessions,
        "percent",
        "three_message_threshold"
      );
      return {
        merchantId,
        period: selection.period,
        from: w.from,
        through: w.through,
        timeZone: "UTC",
        source: "saved_test_sessions_only",
        sessions,
        messages,
        replies,
        dealRecords,
        duplicateDeals: dealRecords - marked,
        invalidDeals,
        invalidLatency: n("invalidLatency"),
        metrics,
        feedback: {
          eligibleReplies: n("eligibleReplies"),
          excludedGuardrails: n("excludedGuardrails"),
          unknownSourceReplies: n("unknownSourceReplies"),
          positive,
          negative,
          unrated: n("eligibleReplies") - positive - negative,
          positiveShare: ratio(positive, positive + negative),
          meaning: "stored_test_feedback_not_customer_survey",
        },
        longSessions: {
          count: n("fivePlus"),
          total: sessions,
          share: ratio(n("fivePlus"), sessions),
        },
        salesProficiency: null,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
