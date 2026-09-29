import {
  overviewOrderStatuses,
  overviewPaymentStatuses,
  type OverviewSnapshot,
} from "../../../shared/overview-workspace";
export function overviewWorkspaceFixture(): OverviewSnapshot {
  return {
    merchantId: 20,
    period: "30d",
    from: "2026-09-01T00:00:00Z",
    through: "2026-09-30T10:00:00Z",
    timeZone: "UTC",
    orders: {
      total: 12,
      statuses: overviewOrderStatuses.map(status => ({ status, count: 2 })),
      payments: overviewPaymentStatuses.map(status => ({ status, count: 4 })),
      values: [
        {
          currency: "SAR",
          count: 6,
          totalMinor: 123456,
          averageMinor: 20576,
          markedPaidCount: 2,
          markedPaidMinor: 45678,
          excludedAmounts: 0,
        },
        {
          currency: "USD",
          count: 3,
          totalMinor: 12000,
          averageMinor: 4000,
          markedPaidCount: 1,
          markedPaidMinor: 3000,
          excludedAmounts: 1,
        },
      ],
      valueMeaning: "stored_minor_non_cancelled_not_settlement",
    },
    reviews: {
      total: 4,
      valid: 3,
      invalid: 1,
      average: 4,
      distribution: [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: stars > 2 ? 1 : 0,
        share: stars > 2 ? 100 / 3 : 0,
      })),
      meaning: "stored_review_records_not_unique_customers",
    },
    carts: {
      total: 5,
      markedRecovered: 1,
      other: 3,
      invalidFlags: 1,
      share: 20,
      meaning: "current_saved_recovery_flag_not_attribution",
    },
    referrals: {
      total: 4,
      markedCompleted: 1,
      pending: 2,
      invalidFlags: 1,
      share: 25,
      meaning: "current_saved_completion_flag_not_payment",
    },
    association: {
      total: 20,
      positive: 4,
      ratio: 20,
      evidenceKind: "exact_phone_match_to_any_order_in_period",
      includesAllOrderStatuses: true,
      salesConversion: null,
      salesProficiency: null,
    },
    salesProficiency: null,
  };
}
