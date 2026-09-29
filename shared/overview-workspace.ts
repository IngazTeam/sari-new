import { z } from "zod";
export const overviewWorkspaceInput = z
  .object({ period: z.enum(["7d", "30d", "90d"]).default("30d") })
  .strict();
export type OverviewWorkspaceInput = z.infer<typeof overviewWorkspaceInput>;
export const overviewOrderStatuses = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export const overviewPaymentStatuses = ["unpaid", "paid", "refunded"] as const;
export const overviewCurrencies = ["SAR", "USD"] as const;
export type OverviewSnapshot = {
  merchantId: number;
  period: OverviewWorkspaceInput["period"];
  from: string;
  through: string;
  timeZone: "UTC";
  orders: {
    total: number;
    statuses: {
      status: (typeof overviewOrderStatuses)[number];
      count: number;
    }[];
    payments: {
      status: (typeof overviewPaymentStatuses)[number];
      count: number;
    }[];
    values: {
      currency: (typeof overviewCurrencies)[number];
      count: number;
      totalMinor: number;
      averageMinor: number | null;
      markedPaidCount: number;
      markedPaidMinor: number;
      excludedAmounts: number;
    }[];
    valueMeaning: "stored_minor_non_cancelled_not_settlement";
  };
  reviews: {
    total: number;
    valid: number;
    invalid: number;
    average: number | null;
    distribution: { stars: number; count: number; share: number | null }[];
    meaning: "stored_review_records_not_unique_customers";
  };
  carts: {
    total: number;
    markedRecovered: number;
    other: number;
    invalidFlags: number;
    share: number | null;
    meaning: "current_saved_recovery_flag_not_attribution";
  };
  referrals: {
    total: number;
    markedCompleted: number;
    pending: number;
    invalidFlags: number;
    share: number | null;
    meaning: "current_saved_completion_flag_not_payment";
  };
  association: {
    total: number;
    positive: number;
    ratio: number | null;
    evidenceKind: "exact_phone_match_to_any_order_in_period";
    includesAllOrderStatuses: true;
    salesConversion: null;
    salesProficiency: null;
  };
  salesProficiency: null;
};
