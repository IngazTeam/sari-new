import { buildSalesOrderReport } from '../../../server/ai/sales-order-report-contract';
import { policyArtifactDigest as hash } from '../../../server/ai/learning-policy-evaluation-bundle';
import { salesOrderIdentity } from '../../../server/ai/sales-order-fact-contract';
import { zidOrderProjectionId } from '../../../server/integrations/zid-commerce-normalization';

const at = '2026-09-26T10:00:00.000Z', d = 'a'.repeat(64);
export function salesReportFixture(mode = 'mixed', merchantId = 7) {
  const order = (id: number, provider: 'local' | 'zid' = 'local', amount = 1000) => {
    const s = { version: 'sales-order-fact.v1', merchantId, quotationId: id, conversationId: 1, sourceMessageId: 2, consentMessageId: 3,
      customerKey: d, ...salesOrderIdentity(merchantId, provider, provider === 'local' ? String(merchantId) : '11', String(id)),
      localOrderId: provider === 'local' ? id : null, agreementDigest: d, quotedAmountMinor: amount, currency: 'SAR',
      amountBasis: provider === 'local' ? 'catalog_requires_billing_review' : 'zid_reported_invoice', observedAt: at,
      timeBasis: 'local_verified_creation', stage: 'order_created', paymentEvidence: 'not_measured', origin: provider === 'local' ? 'local_agreement' : 'zid_create_response' };
    return { id, merchant_id: merchantId, quotation_id: id, provider, order_key: s.orderKey, local_order_id: s.localOrderId, customer_key: d, fact_digest: hash(s), snapshot: s };
  };
  const payment = (id: number, amount: number, event = 'captured') => {
    const s = { version: 'tap-sales-payment-fact.v1', merchantId, paymentId: id, event, targetKind: 'order', targetId: id, customerKey: d,
      amountMinor: amount, currency: 'SAR', verifiedAt: at, timeBasis: 'local_verified_transition', refundExtent: event === 'captured' ? 'none' : 'full', source: 'canonical_tap_payment' };
    return { id: id * 2 + (event === 'captured' ? 0 : 1), merchant_id: merchantId, payment_id: id, event_type: event, target_kind: 'order', target_id: id, customer_key: d, snapshot: s, fact_digest: hash(s) };
  };
  const linkedOrder = order(5, 'zid', 500);
  const link = { version: 'zid-order-projection-link.v1', merchantId, orderFactId: 5, orderFactDigest: linkedOrder.fact_digest, orderKey: linkedOrder.order_key,
    sourceRowId: 5, storeId: '11', orderReference: '5', localOrderId: 5, projectionId: zidOrderProjectionId('11', '5'), linkedAt: at, identityBasis: 'verified_zid_store_projection' };
  const entries = mode === 'empty' ? [] : mode === 'unmeasured' ? [{ order: order(1), payments: [] }]
    : mode === 'refund' ? [{ order: order(1), payments: [payment(1, 1000), payment(1, 1000, 'refunded')] }]
    : mode === 'huge' ? [{ order: order(1, 'local', Number.MAX_SAFE_INTEGER), payments: [payment(1, Number.MAX_SAFE_INTEGER)] }]
    : mode === 'limit' ? Array.from({ length: 200 }, (_, i) => ({ order: order(i + 1), payments: [] }))
    : [{ order: order(1), payments: [payment(1, 1200)] },
      { order: order(2), payments: [payment(2, 2000), payment(2, 2000, 'refunded')] },
      { order: order(3), payments: [] }, { order: order(4, 'zid'), payments: [] },
      { order: linkedOrder, payments: [payment(5, 500)], link: { id: 1, merchant_id: merchantId, order_fact_id: 5, order_fact_digest: link.orderFactDigest,
        order_key: link.orderKey, source_row_id: 5, local_order_id: 5, link_digest: hash(link), snapshot: link } }];
  return { ...buildSalesOrderReport({ merchantId }, entries, mode === 'empty' ? 0 : mode === 'limit' ? 200 : 5), readAt: at, consistency: 'single_database_snapshot' as const };
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/sales-order-report-data.ts')) {
  process.stdout.write(JSON.stringify(Object.fromEntries(['mixed', 'empty', 'unmeasured', 'refund', 'huge', 'limit'].map(mode => [mode, salesReportFixture(mode)]))));
}
