import { z } from 'zod';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';

const id = z.number().int().positive().safe(), digest = z.string().regex(/^[a-f0-9]{64}$/);
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
export const salesPaymentFact = z.object({
  version: z.literal('tap-sales-payment-fact.v1'), merchantId: id, paymentId: id,
  event: z.enum(['captured','refunded']), targetKind: z.enum(['order','booking']), targetId: id,
  customerKey: digest.nullable(), amountMinor: z.number().int().positive().safe(), currency: z.string().regex(/^[A-Z]{3}$/),
  verifiedAt: utc, timeBasis: z.literal('local_verified_transition'), refundExtent: z.enum(['none','full']),
  source: z.literal('canonical_tap_payment'),
}).strict().superRefine((s,c) => {
  if (s.refundExtent !== (s.event === 'refunded' ? 'full' : 'none')) c.addIssue({ code: 'custom', message: 'Invalid refund evidence' });
});
export type SalesPaymentFact = z.infer<typeof salesPaymentFact>;
export class SalesPaymentEvidenceConflict extends Error {
  constructor() { super('Sales payment evidence unavailable'); }
}
export function readSalesPaymentFact(row: any) {
  try {
    const raw = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot, s = salesPaymentFact.parse(raw);
    if (policyArtifactDigest(raw) !== row.fact_digest || policyArtifactDigest(s) !== row.fact_digest
      || s.merchantId !== Number(row.merchant_id) || s.paymentId !== Number(row.payment_id) || s.event !== row.event_type
      || s.targetKind !== row.target_kind || s.targetId !== Number(row.target_id) || s.customerKey !== row.customer_key) throw Error();
    return { factId: id.parse(Number(row.id)), factDigest: String(row.fact_digest), snapshot: s };
  } catch { throw new SalesPaymentEvidenceConflict(); }
}

/** Intention-to-treat evidence. This does not say a message caused a sale, or that staff did not help. */
export const salesPaymentAttribution = z.object({
  version: z.literal('sales-payment-attribution.v1'), merchantId: id, factId: id, factDigest: digest,
  captureFactId: id, captureFactDigest: digest, assignmentId: id, assignmentDigest: digest, protocolId: id, protocolDigest: digest,
  customerKey: digest, arm: z.enum(['baseline','candidate']), artifactDigest: digest, baselineDigest: digest, sectorDigest: digest,
  event: z.enum(['captured','refunded']), paymentId: id, targetKind: z.enum(['order','booking']), targetId: id,
  amountMinor: z.number().int().positive().safe(), currency: z.string().regex(/^[A-Z]{3}$/),
  assignedAt: utc, capturedAt: utc, verifiedAt: utc, observationEndsAt: utc, refundCutoff: utc,
  includedAtCutoff: z.boolean(), signedNetMinor: z.number().int().safe(),
  timeBasis: z.literal('local_verified_transition'), humanAssistance: z.literal('unmeasured'),
  scope: z.literal('intention_to_treat_only'), winner: z.null(),
}).strict().superRefine((s,c) => {
  const included = s.event === 'captured' || Date.parse(s.verifiedAt) < Date.parse(s.refundCutoff);
  if (Date.parse(s.capturedAt) < Date.parse(s.assignedAt) || Date.parse(s.capturedAt) >= Date.parse(s.observationEndsAt)
    || Date.parse(s.verifiedAt) < Date.parse(s.capturedAt) || Date.parse(s.refundCutoff) < Date.parse(s.observationEndsAt)
    || s.event === 'captured' && (s.factId !== s.captureFactId || s.factDigest !== s.captureFactDigest || s.verifiedAt !== s.capturedAt)
    || s.includedAtCutoff !== included || s.signedNetMinor !== (s.event === 'captured' ? s.amountMinor : included ? -s.amountMinor : 0))
    c.addIssue({ code: 'custom', message: 'Invalid fixed-window payment attribution' });
});
export function readSalesPaymentAttribution(row: any) {
  try {
    const fact = readSalesPaymentFact(row), raw = typeof row.attribution === 'string' ? JSON.parse(row.attribution) : row.attribution;
    const s = salesPaymentAttribution.parse(raw), f = fact.snapshot;
    if (row.attribution_state !== 'attributed' || policyArtifactDigest(raw) !== row.attribution_digest
      || policyArtifactDigest(s) !== row.attribution_digest || s.factId !== fact.factId || s.factDigest !== fact.factDigest
      || s.merchantId !== f.merchantId || s.paymentId !== f.paymentId || s.event !== f.event || s.customerKey !== f.customerKey
      || s.targetKind !== f.targetKind || s.targetId !== f.targetId || s.amountMinor !== f.amountMinor || s.currency !== f.currency
      || s.verifiedAt !== f.verifiedAt) throw Error();
    return s;
  } catch { throw new SalesPaymentEvidenceConflict(); }
}
