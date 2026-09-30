import {
  performanceWindows,
  type PerformancePeriod,
  type PerformanceSnapshot,
} from "../../../shared/performance-workspace";
export function performanceFixture(): PerformanceSnapshot {
  const selection = { startDate: "2026-09-01", endDate: "2026-09-30" },
    w = performanceWindows(selection, new Date("2026-09-30T10:00:00Z"));
  const current: PerformancePeriod = {
    from: w.current.from,
    through: w.current.through,
    messages: {
      total: 10,
      incoming: 6,
      outgoing: 4,
      activeConversations: 3,
      contactPhones: 2,
      unknownPhoneMessages: 1,
    },
    orders: {
      total: 4,
      delivered: 2,
      cancelled: 1,
      deliveredShare: 50,
      values: [
        {
          currency: "SAR",
          count: 2,
          totalMinor: 12950,
          markedPaidMinor: 12000,
          excludedAmounts: 0,
        },
        {
          currency: "USD",
          count: 1,
          totalMinor: 2050,
          markedPaidMinor: 0,
          excludedAmounts: 0,
        },
      ],
    },
    orderPhones: {
      known: 2,
      repeated: 1,
      unknownPhoneOrders: 0,
      repeatShare: 50,
    },
    reviews: {
      total: 3,
      valid: 2,
      invalid: 1,
      positive: 1,
      average: 3.5,
      positiveShare: 50,
    },
  };
  const previous: PerformancePeriod = {
    from: w.previous.from,
    through: w.previous.through,
    messages: {
      total: 5,
      incoming: 3,
      outgoing: 2,
      activeConversations: 2,
      contactPhones: 2,
      unknownPhoneMessages: 0,
    },
    orders: {
      total: 2,
      delivered: 0,
      cancelled: 0,
      deliveredShare: 0,
      values: [
        {
          currency: "SAR",
          count: 1,
          totalMinor: 10000,
          markedPaidMinor: 0,
          excludedAmounts: 0,
        },
        {
          currency: "USD",
          count: 1,
          totalMinor: 1100,
          markedPaidMinor: 1100,
          excludedAmounts: 0,
        },
      ],
    },
    orderPhones: {
      known: 2,
      repeated: 0,
      unknownPhoneOrders: 0,
      repeatShare: 0,
    },
    reviews: {
      total: 0,
      valid: 0,
      invalid: 0,
      positive: 0,
      average: null,
      positiveShare: null,
    },
  };
  return {
    merchantId: 20,
    selection,
    timeZone: "UTC",
    secondsPerPeriod: w.seconds,
    partialCurrentDay: true,
    current,
    previous,
    unmeasured: {
      salesConversion: null,
      responseSeconds: null,
      customerSatisfaction: null,
      costs: null,
      netProfit: null,
      roi: null,
      salesProficiency: null,
    },
    meanings: {
      messages: "stored_messages_not_delivery",
      phones: "exact_trimmed_phone_not_unique_people",
      orders: "current_status_of_created_orders",
      values: "non_cancelled_stored_minor_not_settlement",
      repeat: "two_non_cancelled_orders_same_phone_within_period",
      reviews: "valid_order_review_records_not_csat",
      comparison: "immediately_preceding_equal_elapsed_seconds",
    },
  };
}
