import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesOrderFact, SalesOrderEvidenceConflict } from './sales-order-fact-contract';
import { readSalesPaymentFact } from './sales-payment-fact-contract';

export const inspectSalesOrderSettlementInput = z.object({
  merchantId: z.number().int().positive().safe(),
  factId: z.number().int().positive().safe(),
}).strict();
// The current canonical Tap ledger admits one capture and one full refund per target.
// Read an extra row in SQL to detect incompatible history instead of truncating it.
export const SALES_ORDER_SETTLEMENT_LIMIT = 2;
export class SalesOrderSettlementLimitExceeded extends Error {}

/** Evidence-only financial view. Missing evidence is not unpaid, zero revenue or no refund.
 * Never merge providers by phone, invoice value, quotation number or external ID alone.
 */
export function buildSalesOrderSettlement(orderRow: unknown, paymentRows: unknown[]) {
  const order = readSalesOrderFact(orderRow), o = order.snapshot;
  if (paymentRows.length > SALES_ORDER_SETTLEMENT_LIMIT) throw new SalesOrderSettlementLimitExceeded();
  const events = paymentRows.map(readSalesPaymentFact).sort((a,b) => a.snapshot.event === b.snapshot.event
    ? a.factId-b.factId : a.snapshot.event === 'captured' ? -1 : 1);
  const conflict = (): never => { throw new SalesOrderEvidenceConflict(); };
  if (o.provider !== 'local' && events.length) return conflict();
  for (const event of events) {
    const p = event.snapshot;
    if (p.merchantId !== o.merchantId || p.targetKind !== 'order' || p.targetId !== o.localOrderId
      || p.customerKey !== o.customerKey || p.currency !== o.currency
      || Date.parse(p.verifiedAt) < Date.parse(o.observedAt)) return conflict();
  }
  const captures = events.filter(e => e.snapshot.event === 'captured');
  const refunds = events.filter(e => e.snapshot.event === 'refunded');
  if (captures.length > 1 || refunds.length > 1 || refunds.length && captures.length !== 1) return conflict();
  const capture = captures[0], refund = refunds[0];
  if (refund && (refund.factId === capture.factId || refund.snapshot.paymentId !== capture.snapshot.paymentId
    || refund.snapshot.amountMinor !== capture.snapshot.amountMinor
    || Date.parse(refund.snapshot.verifiedAt) < Date.parse(capture.snapshot.verifiedAt))) return conflict();
  const basis = {
    version: 'sales-order-settlement.v1' as const,
    merchantId: o.merchantId, orderFactId: order.factId, orderFactDigest: order.factDigest,
    orderKey: o.orderKey, quotationId: o.quotationId, provider: o.provider, localOrderId: o.localOrderId,
    createdObservedAt: o.observedAt, currency: o.currency, quotedAmountMinor: o.quotedAmountMinor,
    amountBasis: o.amountBasis,
    identityBasis: o.provider === 'local' ? 'merchant_and_local_order' as const : 'external_link_unverified' as const,
    financialState: o.provider !== 'local' ? 'external_link_unverified' as const : refund ? 'full_refund_observed' as const
      : capture ? 'capture_observed' as const : 'payment_not_measured' as const,
    capturedMinor: capture?.snapshot.amountMinor ?? null,
    refundedMinor: refund?.snapshot.amountMinor ?? null,
    observedNetMinor: capture ? capture.snapshot.amountMinor - (refund?.snapshot.amountMinor ?? 0) : null,
    invoiceDifferenceMinor: capture ? capture.snapshot.amountMinor - o.quotedAmountMinor : null,
    events: events.map(e => ({ factId: e.factId, factDigest: e.factDigest, paymentId: e.snapshot.paymentId,
      event: e.snapshot.event, amountMinor: e.snapshot.amountMinor, verifiedAt: e.snapshot.verifiedAt })),
    scope: 'observed_order_payment_evidence_only' as const,
    attribution: 'not_evaluated' as const, sourceCompleteness: 'unmeasured' as const,
    currentOrderStatus: 'unmeasured' as const, humanAssistance: 'unmeasured' as const,
    causality: 'unmeasured' as const, partialRefunds: 'not_supported_by_source' as const, winner: null,
  };
  return { ...basis, evidenceSetDigest: hash(basis) };
}
