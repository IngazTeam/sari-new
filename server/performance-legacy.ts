import {
  performanceChange,
  type PerformanceSnapshot,
} from "../shared/performance-workspace";
/** Preserve the historical keys, but never infer causal, customer or financial outcomes. */
export function legacyPerformanceResult(snapshot: PerformanceSnapshot) {
  const c = snapshot.current,
    p = snapshot.previous;
  return {
    totalMessages: c.messages.total,
    messageChange: performanceChange(c.messages.total, p.messages.total),
    responseTime: null,
    responseTimeChange: null,
    conversionRate: null,
    conversionRateChange: null,
    customerSatisfaction: null,
    customerSatisfactionChange: null,
    orderFulfillmentRate: c.orders.deliveredShare,
    orderFulfillmentRateChange:
      c.orders.deliveredShare === null || p.orders.deliveredShare === null
        ? null
        : performanceChange(c.orders.deliveredShare, p.orders.deliveredShare),
    repeatPurchaseRate: null,
    repeatPurchaseRateChange: null,
    totalRevenue: null,
    revenueChange: null,
    totalCost: null,
    netProfit: null,
    roi: null,
    roiChange: null,
    uniqueCustomers: null,
    repeatCustomers: null,
    totalOrders: c.orders.total,
    completedOrders: c.orders.delivered,
    evidence: snapshot,
  };
}
