import {
  testMetricIds,
  type TestMetricsSnapshot,
} from "../../../shared/test-metrics-workspace";
export function testMetricsFixture(): TestMetricsSnapshot {
  const metrics = Object.fromEntries(
    testMetricIds.map(id => [
      id,
      {
        value: null,
        sample: 0,
        denominator: null,
        unit: id === "csatScore" || id === "npsScore" ? "score" : "percent",
        meaning: "unmeasured",
      },
    ])
  ) as TestMetricsSnapshot["metrics"];
  metrics.conversionRate = {
    value: 25,
    sample: 1,
    denominator: 4,
    unit: "percent",
    meaning: "test_deal_mark",
  };
  metrics.avgDealValue = {
    value: 149.5,
    sample: 1,
    denominator: null,
    unit: "stored_value",
    meaning: "test_value_unknown_currency",
  };
  metrics.totalRevenue = { ...metrics.avgDealValue };
  metrics.avgResponseTime = {
    value: 1500,
    sample: 2,
    denominator: 4,
    unit: "ms",
    meaning: "saved_client_latency",
  };
  metrics.avgConversationLength = {
    value: 2,
    sample: 8,
    denominator: 4,
    unit: "messages",
    meaning: "saved_message_count",
  };
  metrics.avgTimeToConversion = {
    value: 120,
    sample: 1,
    denominator: null,
    unit: "seconds",
    meaning: "elapsed_to_test_mark",
  };
  metrics.engagementRate = {
    value: 50,
    sample: 2,
    denominator: 4,
    unit: "percent",
    meaning: "three_message_threshold",
  };
  return {
    merchantId: 20,
    period: "day",
    from: "2026-09-30T00:00:00Z",
    through: "2026-09-30T10:00:00Z",
    timeZone: "UTC",
    source: "saved_test_sessions_only",
    sessions: 4,
    messages: 8,
    replies: 4,
    dealRecords: 2,
    duplicateDeals: 1,
    invalidDeals: 1,
    invalidLatency: 1,
    metrics,
    feedback: {
      positive: 1,
      negative: 1,
      unrated: 2,
      positiveShare: 50,
      meaning: "stored_test_feedback_not_customer_survey",
    },
    longSessions: { count: 1, total: 4, share: 25 },
    salesProficiency: null,
  };
}
