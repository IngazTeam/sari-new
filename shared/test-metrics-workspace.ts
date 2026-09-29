import { z } from "zod";
export const testMetricsInput = z
  .object({ period: z.enum(["day", "week", "month"]).default("day") })
  .strict();
export type TestMetricsInput = z.infer<typeof testMetricsInput>;
export const testMetricIds = [
  "conversionRate",
  "avgDealValue",
  "totalRevenue",
  "avgResponseTime",
  "avgConversationLength",
  "avgTimeToConversion",
  "resolutionRate",
  "escalationRate",
  "engagementRate",
  "returnRate",
  "referralRate",
  "productClickRate",
  "orderCompletionRate",
  "csatScore",
  "npsScore",
] as const;
export type TestMetricId = (typeof testMetricIds)[number];
export type TestMetricObservation = {
  value: number | null;
  sample: number;
  denominator: number | null;
  unit: "percent" | "stored_value" | "ms" | "messages" | "seconds" | "score";
  meaning:
    | "test_deal_mark"
    | "test_value_unknown_currency"
    | "saved_client_latency"
    | "saved_message_count"
    | "elapsed_to_test_mark"
    | "three_message_threshold"
    | "unmeasured";
};
export type TestMetricsSnapshot = {
  merchantId: number;
  period: TestMetricsInput["period"];
  from: string;
  through: string;
  timeZone: "UTC";
  source: "saved_test_sessions_only";
  sessions: number;
  messages: number;
  replies: number;
  dealRecords: number;
  duplicateDeals: number;
  invalidDeals: number;
  invalidLatency: number;
  metrics: Record<TestMetricId, TestMetricObservation>;
  feedback: {
    positive: number;
    negative: number;
    unrated: number;
    positiveShare: number | null;
    meaning: "stored_test_feedback_not_customer_survey";
  };
  longSessions: { count: number; total: number; share: number | null };
  salesProficiency: null;
};
export function testMetricsWindow(
  period: TestMetricsInput["period"],
  now = new Date()
) {
  testMetricsInput.parse({ period });
  const through = new Date(Math.floor(now.getTime() / 1000) * 1000),
    from = new Date(through);
  from.setUTCHours(0, 0, 0, 0);
  if (period === "week") from.setUTCDate(from.getUTCDate() - 6);
  if (period === "month") from.setUTCDate(1);
  return {
    from: from.toISOString(),
    through: through.toISOString(),
    sqlFrom: from.toISOString().slice(0, 19).replace("T", " "),
    sqlThrough: through.toISOString().slice(0, 19).replace("T", " "),
  };
}
