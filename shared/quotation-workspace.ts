import { z } from "zod";

export const quotationStatuses = [
  "sent",
  "viewed",
  "accepted",
  "rejected",
  "expired",
  "unknown",
] as const;
export type QuotationStatus = (typeof quotationStatuses)[number];
export const quotationListInput = z
  .object({
    search: z.string().trim().max(120).default(""),
    status: z.enum(["all", ...quotationStatuses]).default("all"),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const quotationReadInput = z
  .object({ id: z.number().int().positive() })
  .strict();
export type QuotationSelection = z.infer<typeof quotationListInput>;
export const quotationSelectionKey = (v: QuotationSelection) =>
  JSON.stringify([v.search, v.status, v.page, v.pageSize]);

export function quotationMonth(now: Date) {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid quotation clock");
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString(),
    through: new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}
/** Decimal database values are major units. Refuse coercion, fractions of a cent and unsafe sums. */
export function quotationMinor(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimal = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
export interface QuotationRow {
  id: number;
  merchantId: number;
  number: string;
  customerName: string | null;
  customerPhone: string | null;
  status: QuotationStatus;
  currency: string;
  subtotalMinor: number | null;
  taxMinor: number | null;
  totalMinor: number | null;
  createdAt: string;
  validUntil: string | null;
  validityElapsed: boolean;
  managed: boolean;
  provider: string | null;
  conversationId: number | null;
  orderId: number | null;
  revision: number;
}
export interface QuotationDetail extends QuotationRow {
  items: Array<{
    name: string;
    description: string | null;
    quantity: number | null;
    unitPriceMinor: number | null;
    totalMinor: number | null;
  }>;
  rawItems: string | null;
  itemsTruncated: boolean;
}
export interface QuotationWorkspace {
  merchantId: number;
  selection: QuotationSelection;
  generatedAt: string;
  timeZone: "UTC";
  total: number;
  statuses: Array<{ status: QuotationStatus; count: number }>;
  acceptedShare: number | null;
  values: Array<{
    currency: string;
    count: number;
    totalMinor: number;
    excludedAmounts: number;
  }>;
  currentMonth: ReturnType<typeof quotationMonth>;
  target: {
    id: number;
    amountMinor: number | null;
    periodStart: string;
    periodEnd: string;
  } | null;
  targetBasis: {
    created: number;
    accepted: number;
    acceptedSar: number;
    acceptedSarMinor: number;
    excludedSarAmounts: number;
    progress: number | null;
  };
  list: { items: QuotationRow[]; total: number; totalPages: number };
  unmeasured: {
    delivered: null;
    settledRevenue: null;
    salesConversion: null;
    salesProficiency: null;
  };
}
