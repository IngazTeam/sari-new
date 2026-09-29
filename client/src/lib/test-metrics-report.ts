import {
  testMetricIds,
  type TestMetricId,
  type TestMetricsSnapshot,
} from "@shared/test-metrics-workspace";
import { insightCsv } from "@shared/insight-csv";
import { testMetricsLabels } from "./test-metrics-labels";
export const testMetricNotes = {
  conversionRate: "conversionRateNote",
  avgDealValue: "valueNote",
  totalRevenue: "valueNote",
  avgResponseTime: "latencyNote",
  avgConversationLength: "lengthNote",
  avgTimeToConversion: "elapsedNote",
  resolutionRate: "resolutionRateNote",
  escalationRate: "escalationRateNote",
  engagementRate: "engagementNote",
  returnRate: "returnRateNote",
  referralRate: "referralRateNote",
  productClickRate: "productClickRateNote",
  orderCompletionRate: "orderCompletionRateNote",
  csatScore: "csatScoreNote",
  npsScore: "npsScoreNote",
} as const;
export function testMetricsRows(
  d: TestMetricsSnapshot,
  t: (key: string) => string
): (string | number)[][] {
  const l = testMetricsLabels(t),
    v = (n: number | null) =>
      n === null ? l.unavailable : Number(n.toFixed(2)),
    unit = (id: TestMetricId) => {
      const u = d.metrics[id].unit;
      return u === "percent"
        ? "%"
        : u === "stored_value"
          ? l.unitValue
          : u === "ms"
            ? l.ms
            : u === "seconds"
              ? l.seconds
              : u === "messages"
                ? l.unitMessages
                : l.unmeasured;
    };
  return [
    [l.title],
    [l.tenant, d.merchantId],
    [l.from, d.from],
    [l.through, d.through],
    [l.zone, d.timeZone],
    [l.scope],
    [l.periodNote],
    [l.sessions, d.sessions],
    [l.messages, d.messages],
    [l.replies, d.replies],
    [],
    [l.metric, l.value, l.unit, l.sample, l.denominator, l.definition],
    ...testMetricIds.map(id => {
      const m = d.metrics[id];
      return [
        l[id],
        m.meaning === "unmeasured" ? l.unmeasured : v(m.value),
        unit(id),
        m.sample,
        m.denominator ?? l.unavailable,
        l[testMetricNotes[id]],
      ];
    }),
    [],
    [l.feedback],
    [l.feedbackNote],
    [l.eligibleReplies, d.feedback.eligibleReplies],
    [l.excludedGuardrails, d.feedback.excludedGuardrails],
    [l.unknownSourceReplies, d.feedback.unknownSourceReplies],
    [l.positive, d.feedback.positive],
    [l.negative, d.feedback.negative],
    [l.unrated, d.feedback.unrated],
    [l.positiveShare, v(d.feedback.positiveShare)],
    [],
    [
      l.longSessions,
      d.longSessions.count,
      d.longSessions.total,
      v(d.longSessions.share),
    ],
    [l.longNote],
    [],
    [l.quality],
    [l.dealRecords, d.dealRecords],
    [l.duplicateDeals, d.duplicateDeals],
    [l.invalidDeals, d.invalidDeals],
    [l.invalidLatency, d.invalidLatency],
    [l.salesSkill, l.unmeasured],
    [l.evidenceNote],
  ];
}
export const testMetricsCsv = (
  d: TestMetricsSnapshot,
  t: (key: string) => string
) => insightCsv(testMetricsRows(d, t));
