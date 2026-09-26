import { z } from 'zod';

const id = z.number().int().positive().safe();
const count = z.number().int().nonnegative().safe();
const money = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();
const limitations = {
  sourceCompleteness: z.literal('unmeasured'), currentOrderStatus: z.literal('unmeasured'),
  humanAssistance: z.literal('unmeasured'), attribution: z.literal('not_evaluated'),
  causality: z.literal('unmeasured'), partialRefunds: z.literal('not_supported_by_source'), winner: z.null(),
};
const orderView = z.object({
  version: z.literal('sales-order-settlement.v1'), merchantId: id, orderFactId: id,
  orderFactDigest: digest, orderKey: z.string().min(1).max(500), quotationId: id,
  provider: z.enum(['local', 'zid']), localOrderId: id.nullable(),
  projectionLink: z.object({ linkId: id, linkDigest: digest, linkedAt: timestamp }).nullable(),
  createdObservedAt: timestamp, currency: z.literal('SAR'), quotedAmountMinor: money,
  amountBasis: z.enum(['catalog_requires_billing_review', 'zid_reported_invoice']),
  identityBasis: z.enum(['merchant_and_local_order', 'verified_zid_store_projection', 'external_link_unverified']),
  financialState: z.enum(['external_link_unverified', 'full_refund_observed', 'capture_observed', 'payment_not_measured']),
  capturedMinor: money.nullable(), refundedMinor: money.nullable(), observedNetMinor: money.nullable(),
  invoiceDifferenceMinor: z.number().int().safe().nullable(),
  events: z.array(z.object({ factId: id, factDigest: digest, paymentId: id,
    event: z.enum(['captured', 'refunded']), amountMinor: money, verifiedAt: timestamp })).max(2),
  scope: z.literal('observed_order_payment_evidence_only'), evidenceSetDigest: digest, ...limitations,
});
const reportView = z.object({
  version: z.literal('sales-order-report.v1'), merchantId: id,
  scope: z.object({ population: z.literal('recorded_sales_order_facts'), fromFactId: id,
    throughFactId: count, completeWithinIdRange: z.literal(true), maxRecords: z.literal(200) }),
  counts: z.object({ recordedOrders: count.max(200), localOrders: count, zidOrders: count,
    captureObserved: count, fullRefundObserved: count, paymentNotMeasured: count, externalLinkUnverified: count }),
  amounts: z.object({ currency: z.literal('SAR'), quotedAmountMinor: money.nullable(), observedCapturedMinor: money.nullable(),
    observedRefundedMinor: money.nullable(), observedNetMinor: money.nullable(), invoiceDifferenceMinor: z.number().int().safe().nullable() }),
  orders: z.array(orderView).max(200), readAt: timestamp, consistency: z.literal('single_database_snapshot'),
  evidenceSetDigest: digest, ...limitations,
});

export type SalesReportRequest = { merchantId: number; fromFactId: number; throughFactId?: number };
export type SalesReportView = z.infer<typeof reportView>;

/** IDs are decimal integers, including Arabic/Persian keyboard digits; never parse a prefix. */
export function parseSalesEvidenceId(value: string): number | null {
  const normalized = value.trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6f0));
  if (!/^[0-9]{1,16}$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseSalesReportForm(merchant: string, from: string, through: string): SalesReportRequest | null {
  const merchantId = parseSalesEvidenceId(merchant), fromFactId = parseSalesEvidenceId(from);
  const throughFactId = through.trim() ? parseSalesEvidenceId(through) : undefined;
  if (merchantId === null || fromFactId === null || throughFactId === null || throughFactId !== undefined && throughFactId < fromFactId) return null;
  return { merchantId, fromFactId, ...(throughFactId === undefined ? {} : { throughFactId }) };
}

/** A display compatibility check, not a replacement for SQL authorization or server digest verification. */
export function readSalesReportView(value: unknown, request: SalesReportRequest): SalesReportView | null {
  const parsed = reportView.safeParse(value);
  if (!parsed.success) return null;
  const report = parsed.data;
  if (report.merchantId !== request.merchantId || report.scope.fromFactId !== request.fromFactId
    || request.throughFactId !== undefined && report.scope.throughFactId !== request.throughFactId
    || report.counts.recordedOrders !== report.orders.length) return null;
  const seen = new Set<number>();
  for (const order of report.orders) {
    if (order.merchantId !== request.merchantId || order.orderFactId < request.fromFactId
      || order.orderFactId > report.scope.throughFactId || seen.has(order.orderFactId)) return null;
    seen.add(order.orderFactId);
  }
  return report;
}

/** Keep the last halala even at MAX_SAFE_INTEGER; Number(minor / 100) can round it away. */
export function formatSalesEvidenceMoney(minor: number, locale: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error('Invalid minor amount');
  const absolute = BigInt(minor) < BigInt(0) ? -BigInt(minor) : BigInt(minor);
  const integer = absolute / BigInt(100), fraction = Number(absolute % BigInt(100));
  const decimalDigits = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(fraction);
  // -0 retains the minus sign for negative amounts below one riyal.
  const whole = minor < 0 ? integer === BigInt(0) ? -0 : -integer : integer;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'SAR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(whole).map(part => part.type === 'fraction' ? decimalDigits : part.value).join('');
}
