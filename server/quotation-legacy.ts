import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getPool } from "./db/connection";
import {
  readQuotationWorkspace,
  readQuotationDetail,
  readQuotationLegacyList,
} from "./quotation-workspace";
import {
  createManualQuotation,
  changeManualQuotation,
  changeQuotationTarget,
  QuotationConflict,
  QuotationUnavailable,
} from "./quotation-mutations";
import { quotationMinor } from "../shared/quotation-workspace";
import type { QuotationDetail } from "../shared/quotation-workspace";
import type { QuotationItem } from "./db/sales-quotations";

const selection = { search: "", status: "all" as const, page: 1, pageSize: 1 };
const id = z.number().int().positive();
const major = (minor: number | null) => (minor === null ? null : minor / 100);
export function legacyQuotation(q: QuotationDetail) {
  return {
    id: q.id,
    merchantId: q.merchantId,
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    quotationNumber: q.number,
    items: q.items.map(v => ({
      name: v.name,
      description: v.description ?? undefined,
      quantity: v.quantity,
      unitPrice: major(v.unitPriceMinor),
      total: major(v.totalMinor),
    })),
    rawItems: q.rawItems,
    itemsTruncated: q.itemsTruncated,
    subtotal: major(q.subtotalMinor),
    taxAmount: major(q.taxMinor),
    total: major(q.totalMinor),
    taxRate: q.taxBasisPoints === null ? null : q.taxBasisPoints / 10000,
    currency: q.currency,
    status: q.status,
    validUntil: q.validUntil,
    pdfUrl: null,
    conversationId: q.conversationId,
    createdAt: new Date(q.createdAt),
    managed: q.managed,
    offerVersion: q.revision,
    validityElapsed: q.validityElapsed,
  };
}
export type LegacyQuotation = ReturnType<typeof legacyQuotation>;
export function assertQuotationDocument(
  q: LegacyQuotation
): asserts q is LegacyQuotation & {
  items: QuotationItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
} {
  if (
    q.managed ||
    q.rawItems !== null ||
    q.itemsTruncated ||
    !q.items.length ||
    q.items.some(
      v => v.quantity === null || v.unitPrice === null || v.total === null
    ) ||
    q.subtotal === null ||
    q.taxAmount === null ||
    q.total === null
  )
    throw new QuotationConflict();
}
export async function getQuotations(merchantId: number, limit = 50) {
  return (await readQuotationLegacyList(merchantId, limit)).map(
    legacyQuotation
  );
}
export async function getQuotationById(
  quotationId: number,
  merchantId: number
) {
  const q = await readQuotationDetail(merchantId, quotationId);
  return q ? legacyQuotation(q) : null;
}
export async function createQuotation(data: {
  merchantId: number;
  actorId: number;
  requestId?: string;
  customerPhone?: string | null;
  customerName?: string | null;
  items: QuotationItem[];
  taxRate?: number;
  currency?: string;
  validDays?: number;
  conversationId?: number | null;
}) {
  const rate = data.taxRate ?? 0.15;
  if (
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 1 ||
    !/^\d+(?:\.\d{1,4})?$/.test(String(rate))
  )
    throw new QuotationConflict();
  const receipt = await createManualQuotation(data.merchantId, data.actorId, {
    requestId: data.requestId ?? randomUUID(),
    customerPhone: data.customerPhone || undefined,
    customerName: data.customerName || undefined,
    items: data.items.map(({ name, description, quantity, unitPrice }) => ({
      name,
      description,
      quantity,
      unitPrice,
    })),
    taxBasisPoints: Math.round(rate * 10000),
    currency: data.currency ?? "SAR",
    validDays: data.validDays ?? 7,
    conversationId: data.conversationId ?? undefined,
  });
  const quotation = await getQuotationById(receipt.recordId, data.merchantId);
  if (!quotation) throw new QuotationUnavailable();
  return { ...quotation, receipt };
}
export async function updateQuotationStatus(
  quotationId: number,
  merchantId: number,
  status: "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired",
  review: {
    actorId: number;
    requestId?: string;
    expectedRevision: number;
    expectedStatus: QuotationDetail["status"];
  }
) {
  return changeManualQuotation(merchantId, review.actorId, {
    requestId: review.requestId ?? randomUUID(),
    id: quotationId,
    expectedRevision: review.expectedRevision,
    expectedStatus: review.expectedStatus,
    status,
  });
}
export async function getQuotationStats(merchantId: number) {
  const evidence = await readQuotationWorkspace(merchantId, selection);
  const count = (status: string) =>
    evidence.statuses.find(v => v.status === status)?.count ?? 0;
  return {
    total: evidence.total,
    draft: count("draft"),
    sent: count("sent"),
    accepted: count("accepted"),
    rejected: count("rejected"),
    totalRevenue: null,
    conversionRate: null,
    acceptedShare: evidence.acceptedShare,
    acceptedAmounts: evidence.values,
    evidence,
  };
}
export async function getTargetHistory(merchantId: number, limit = 12) {
  id.parse(merchantId);
  z.number().int().min(1).max(24).parse(limit);
  const pool = await getPool();
  if (!pool) throw Error("Quotations unavailable");
  const [rows] = await pool.execute<any[]>(
    `SELECT t.id,t.merchant_id merchantId,t.period_type periodType,
    DATE_FORMAT(t.period_start,'%Y-%m-%d') periodStart,DATE_FORMAT(t.period_end,'%Y-%m-%d') periodEnd,
    t.target_amount targetAmount,t.revision,t.created_at createdAt,
    (SELECT COUNT(*) FROM sales_quotations q WHERE q.merchant_id=t.merchant_id AND q.created_at>=t.period_start AND q.created_at<DATE_ADD(t.period_end,INTERVAL 1 DAY) AND q.created_at<=UTC_TIMESTAMP()) created,
    (SELECT COUNT(*) FROM sales_quotations q WHERE q.merchant_id=t.merchant_id AND q.created_at>=t.period_start AND q.created_at<DATE_ADD(t.period_end,INTERVAL 1 DAY) AND q.created_at<=UTC_TIMESTAMP() AND BINARY q.status='accepted' AND BINARY q.currency='SAR' AND q.total>=0) accepted,
    (SELECT COALESCE(SUM(q.total),0) FROM sales_quotations q WHERE q.merchant_id=t.merchant_id AND q.created_at>=t.period_start AND q.created_at<DATE_ADD(t.period_end,INTERVAL 1 DAY) AND q.created_at<=UTC_TIMESTAMP() AND BINARY q.status='accepted' AND BINARY q.currency='SAR' AND q.total>=0) achieved
    FROM sales_targets t WHERE t.merchant_id=? ORDER BY t.period_start DESC,t.id DESC LIMIT ${limit}`,
    [merchantId]
  );
  return rows.map(r => ({
    id: Number(r.id),
    merchantId,
    periodType: r.periodType as "monthly" | "quarterly" | "yearly",
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    targetAmount: major(quotationMinor(r.targetAmount)),
    achievedAmount: major(quotationMinor(r.achieved)),
    quotationsSent: null,
    quotationsCreated: Number(r.created),
    quotationsWon: Number(r.accepted),
    revision: Number(r.revision),
    createdAt: new Date(r.createdAt),
    basis: "current_accepted_sar_created_in_period" as const,
  }));
}
export async function getCurrentTarget(merchantId: number) {
  const evidence = await readQuotationWorkspace(merchantId, selection),
    t = evidence.target;
  return t
    ? {
        id: t.id,
        merchantId,
        periodType: "monthly" as const,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        targetAmount: major(t.amountMinor),
        achievedAmount: evidence.targetBasis.acceptedSarMinor / 100,
        quotationsSent: null,
        quotationsCreated: evidence.targetBasis.created,
        quotationsWon: evidence.targetBasis.acceptedSar,
        revision: t.revision,
        basis: "current_accepted_sar_created_in_period" as const,
      }
    : null;
}
export async function setMonthlyTarget(
  merchantId: number,
  targetAmount: number,
  review: {
    actorId: number;
    requestId?: string;
    expectedRevision: number | null;
    period: string;
  }
) {
  const receipt = await changeQuotationTarget(merchantId, review.actorId, {
    requestId: review.requestId ?? randomUUID(),
    period: review.period,
    expectedRevision: review.expectedRevision,
    amount: targetAmount,
  });
  const target = await getCurrentTarget(merchantId);
  if (!target) throw new QuotationUnavailable();
  return { ...target, receipt };
}
