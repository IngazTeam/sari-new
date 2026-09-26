import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { buildSalesOrderSettlement } from './sales-order-settlement-contract';

const id = z.number().int().positive().safe();
export const salesOrderReportInput = z.object({
  merchantId: id,
  fromFactId: id.default(1),
  throughFactId: id.optional(),
}).strict().refine(v => v.throughFactId === undefined || v.throughFactId >= v.fromFactId);
export const SALES_ORDER_REPORT_LIMIT = 200;
export class SalesOrderReportLimitExceeded extends Error {}
export type SalesOrderReportEntry = { order: unknown; payments: unknown[]; link?: unknown };

/** A bounded census of recorded order evidence, not all merchant sales or experiment revenue. */
export function buildSalesOrderReport(
  value: z.input<typeof salesOrderReportInput>, entries: SalesOrderReportEntry[], throughFactId: number,
) {
  const input = salesOrderReportInput.parse(value);
  z.number().int().nonnegative().safe().parse(throughFactId);
  if (input.throughFactId !== undefined && throughFactId !== input.throughFactId) throw new SalesOrderEvidenceConflict();
  if (entries.length > SALES_ORDER_REPORT_LIMIT) throw new SalesOrderReportLimitExceeded();
  const orders = entries.map(e => buildSalesOrderSettlement(e.order, e.payments, e.link)).sort((a,b) => a.orderFactId-b.orderFactId);
  const seen = new Set<string>();
  const unique = (key: string) => { if (seen.has(key)) throw new SalesOrderEvidenceConflict(); seen.add(key); };
  for (const order of orders) {
    if (order.merchantId !== input.merchantId || order.orderFactId < input.fromFactId || order.orderFactId > throughFactId) throw new SalesOrderEvidenceConflict();
    unique(`fact:${order.orderFactId}`); unique(`order:${order.orderKey}`); unique(`quote:${order.quotationId}`);
    if (order.localOrderId !== null) unique(`local:${order.localOrderId}`);
    for (const event of order.events) unique(`payment-fact:${event.factId}`);
    // A capture and its full refund share one payment; that payment cannot fund two orders.
    for (const paymentId of Array.from(new Set(order.events.map(e => e.paymentId)))) unique(`payment:${paymentId}`);
  }
  const sum = (values: number[]) => {
    const total = values.reduce((n,v) => n + BigInt(v), BigInt(0));
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new SalesOrderReportLimitExceeded();
    return Number(total);
  };
  const money = (values: Array<number|null>) => { const known = values.filter((v):v is number => v !== null); return known.length ? sum(known) : null; };
  const basis = {
    version: 'sales-order-report.v1' as const,
    merchantId: input.merchantId,
    scope: { population: 'recorded_sales_order_facts' as const, fromFactId: input.fromFactId, throughFactId,
      completeWithinIdRange: true, maxRecords: SALES_ORDER_REPORT_LIMIT },
    counts: {
      recordedOrders: orders.length,
      localOrders: orders.filter(o => o.provider === 'local').length,
      zidOrders: orders.filter(o => o.provider === 'zid').length,
      captureObserved: orders.filter(o => o.capturedMinor !== null).length,
      fullRefundObserved: orders.filter(o => o.refundedMinor !== null).length,
      paymentNotMeasured: orders.filter(o => o.financialState === 'payment_not_measured').length,
      externalLinkUnverified: orders.filter(o => o.financialState === 'external_link_unverified').length,
    },
    amounts: { currency: 'SAR' as const, quotedAmountMinor: money(orders.map(o => o.quotedAmountMinor)),
      observedCapturedMinor: money(orders.map(o => o.capturedMinor)), observedRefundedMinor: money(orders.map(o => o.refundedMinor)),
      observedNetMinor: money(orders.map(o => o.observedNetMinor)), invoiceDifferenceMinor: money(orders.map(o => o.invoiceDifferenceMinor)) },
    orders,
    sourceCompleteness: 'unmeasured' as const, currentOrderStatus: 'unmeasured' as const,
    humanAssistance: 'unmeasured' as const, attribution: 'not_evaluated' as const, causality: 'unmeasured' as const,
    partialRefunds: 'not_supported_by_source' as const, winner: null,
  };
  return { ...basis, evidenceSetDigest: hash(basis) };
}
