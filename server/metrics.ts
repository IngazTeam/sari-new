import { readTestMetricsWorkspace } from "./test-metrics-workspace";
import type {
  TestMetricsInput,
  TestMetricsSnapshot,
} from "../shared/test-metrics-workspace";

/** Legacy group names remain for callers; nullable values and evidence carry their actual meaning. */
export function legacyTestMetrics(snapshot: TestMetricsSnapshot) {
  const m = snapshot.metrics;
  return {
    conversion: {
      conversionRate: m.conversionRate.value,
      avgDealValue: m.avgDealValue.value,
      totalRevenue: m.totalRevenue.value,
    },
    time: {
      avgResponseTime: m.avgResponseTime.value,
      avgConversationLength: m.avgConversationLength.value,
      avgTimeToConversion: m.avgTimeToConversion.value,
    },
    quality: {
      resolutionRate: m.resolutionRate.value,
      escalationRate: m.escalationRate.value,
      engagementRate: m.engagementRate.value,
    },
    growth: {
      returnRate: m.returnRate.value,
      referralRate: m.referralRate.value,
    },
    advanced: {
      productClickRate: m.productClickRate.value,
      orderCompletionRate: m.orderCompletionRate.value,
      csatScore: m.csatScore.value,
      npsScore: m.npsScore.value,
    },
    evidence: snapshot,
  };
}
export async function calculateAllMetrics(
  merchantId: number,
  period: TestMetricsInput["period"],
  now = new Date()
) {
  return legacyTestMetrics(
    await readTestMetricsWorkspace(merchantId, { period }, now)
  );
}
