import { z } from "zod";

export const orderStates = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "unknown",
] as const;
export const orderPayments = ["unpaid", "paid", "refunded", "unknown"] as const;
export const orderListInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(["all", ...orderStates]).default("all"),
    payment: z.enum(["all", ...orderPayments]).default("all"),
    page: z.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const orderReadInput = z
  .object({ id: z.number().int().positive().safe() })
  .strict();
export type OrderSelection = z.infer<typeof orderListInput>;
export const orderSelectionKey = (v: OrderSelection) =>
  JSON.stringify([v.search, v.status, v.payment, v.page]);
export function orderMinor(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
export interface OrderListRow {
  id: number;
  merchantId: number;
  number: string | null;
  customerName: string;
  customerPhone: string;
  status: (typeof orderStates)[number];
  paymentStatus: (typeof orderPayments)[number];
  currency: string;
  totalMinor: number | null;
  externalReference: string | null;
  checkoutReviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface OrderDetail extends OrderListRow {
  customerEmail: string | null;
  address: string | null;
  city: string | null;
  trackingNumber: string | null;
  notes: string | null;
  paymentUrl: string | null;
  discountCode: string | null;
  subtotalMinor: number | null;
  discountMinor: number | null;
  discountReleased: boolean;
  isGift: boolean;
  giftRecipientName: string | null;
  giftMessage: string | null;
  reviewRequested: boolean;
  reviewRequestedAt: string | null;
  items: Array<{
    name: string | null;
    quantity: number | null;
    unitPriceMinor: number | null;
    totalMinor: number | null;
  }>;
  rawItems: string;
  itemsState: "parsed" | "legacy" | "truncated";
  truncatedFields: string[];
}
export interface OrderWorkspace {
  merchantId: number;
  selection: OrderSelection;
  generatedAt: string;
  timeZone: "UTC";
  page: number;
  pageSize: 25;
  pages: number;
  total: number;
  filtered: number;
  items: OrderListRow[];
  statuses: Array<{ status: (typeof orderStates)[number]; count: number }>;
  payments: Array<{ status: (typeof orderPayments)[number]; count: number }>;
  values: Array<{
    currency: string;
    count: number;
    totalMinor: number;
    markedPaidMinor: number;
    excludedAmounts: number;
  }>;
  valueBasis: "filtered_non_cancelled_stored_orders";
  unmeasured: {
    settledRevenue: null;
    profit: null;
    salesConversion: null;
    salesProficiency: null;
  };
}
