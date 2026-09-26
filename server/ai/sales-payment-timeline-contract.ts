import { z } from 'zod';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { readSalesPaymentAttribution, SalesPaymentEvidenceConflict } from './sales-payment-fact-contract';
import { readSalesExperimentExposure } from './sales-experiment-exposure-contract';

const id = z.number().int().positive().safe();
export const inspectSalesPaymentTimelineInput = z.object({ merchantId: id, factId: id }).strict();
export const SALES_PAYMENT_TIMELINE_LIMIT = 100;
export class SalesPaymentTimelineLimitExceeded extends Error {}
const conflict = (): never => { throw new SalesPaymentEvidenceConflict(); };

/** Compare local observations only. Neither a dispatch attempt nor a later projection is delivery proof. */
export function buildSalesPaymentTimeline(factRow: any, captureRow: any, exposureRows: any[]) {
  const event = readSalesPaymentAttribution(factRow), capture = readSalesPaymentAttribution(captureRow);
  if (capture.event !== 'captured' || event.captureFactId !== capture.factId || event.captureFactDigest !== capture.factDigest) conflict();
  for (const key of ['merchantId','paymentId','targetKind','targetId','amountMinor','currency','assignmentId','assignmentDigest',
    'protocolId','protocolDigest','customerKey','arm','artifactDigest','baselineDigest','sectorDigest',
    'assignedAt','capturedAt','observationEndsAt','refundCutoff'] as const) {
    if (event[key] !== capture[key]) conflict();
  }
  if (exposureRows.length > SALES_PAYMENT_TIMELINE_LIMIT) throw new SalesPaymentTimelineLimitExceeded();
  const ids = new Set<number>(), deliveries = new Set<number>(), outboxes = new Set<number>();
  const exposures = exposureRows.map(row => {
    let s: ReturnType<typeof readSalesExperimentExposure>, exposureId: number;
    try { s = readSalesExperimentExposure(row); exposureId = id.parse(Number(row.id)); } catch { return conflict(); }
    for (const key of ['merchantId','protocolId','assignmentId','assignmentDigest','customerKey','arm','artifactDigest','baselineDigest','sectorDigest','observationEndsAt'] as const) {
      if (s[key] !== capture[key]) conflict();
    }
    if (s.assignmentAt !== capture.assignedAt || ids.has(exposureId) || deliveries.has(s.deliveryId) || outboxes.has(s.outboxId)) conflict();
    ids.add(exposureId); deliveries.add(s.deliveryId); outboxes.add(s.outboxId);
    const paidAt = Date.parse(capture.capturedAt), startedAt = Date.parse(s.dispatchStartedAt), acceptedAt = Date.parse(s.acceptanceObservedAt);
    const timing = s.observationTiming === 'clock_regression' ? 'clock_regression' as const
      : startedAt >= paidAt ? 'dispatch_at_or_after_capture' as const
      : acceptedAt < paidAt ? 'acceptance_before_capture' as const
      : acceptedAt === paidAt ? 'acceptance_at_capture' as const : 'in_flight_at_capture' as const;
    return { exposureId, exposureDigest: String(row.exposure_digest), deliveryId: s.deliveryId,
      dispatchStartedAt: s.dispatchStartedAt, acceptanceObservedAt: s.acceptanceObservedAt, timing,
      provider: s.provider, styleApplied: s.styleApplied, styleReason: s.styleReason };
  }).sort((a,b) => Date.parse(a.dispatchStartedAt) - Date.parse(b.dispatchStartedAt) || a.exposureId - b.exposureId);
  const realPrior = exposures.filter(e => e.provider !== 'mock' && e.timing === 'acceptance_before_capture');
  const basis = {
    version: 'sales-payment-timeline.v1' as const, merchantId: capture.merchantId,
    factId: event.factId, factDigest: event.factDigest, attributionDigest: String(factRow.attribution_digest),
    captureFactId: capture.factId, captureFactDigest: capture.factDigest, captureAttributionDigest: String(captureRow.attribution_digest),
    assignmentId: capture.assignmentId, assignmentDigest: capture.assignmentDigest,
    protocolId: capture.protocolId, protocolDigest: capture.protocolDigest, arm: capture.arm,
    event: event.event, capturedAt: capture.capturedAt, eventVerifiedAt: event.verifiedAt,
    amountMinor: event.amountMinor, currency: event.currency, signedNetMinor: event.signedNetMinor, includedAtCutoff: event.includedAtCutoff,
    exposures,
    counts: {
      recorded: exposures.length, realAcceptanceBeforeCapture: realPrior.length,
      candidateStyleBeforeCapture: realPrior.filter(e => e.styleApplied).length,
      acceptanceAtCapture: exposures.filter(e => e.provider !== 'mock' && e.timing === 'acceptance_at_capture').length,
      inFlightAtCapture: exposures.filter(e => e.provider !== 'mock' && e.timing === 'in_flight_at_capture').length,
      dispatchAtOrAfterCapture: exposures.filter(e => e.provider !== 'mock' && e.timing === 'dispatch_at_or_after_capture').length,
      clockRegression: exposures.filter(e => e.timing === 'clock_regression').length,
      synthetic: exposures.filter(e => e.provider === 'mock').length,
    },
    timeBasis: 'local_observations_only' as const, scope: 'transport_chronology_only' as const,
    deliveryBeforeCapture: 'not_measured' as const, readingBeforeCapture: 'not_measured' as const,
    completeness: 'not_established' as const, humanAssistance: 'unmeasured' as const,
    causality: 'not_established' as const, denominator: 'all_assigned_qualified_customers' as const,
    aggregateRevenueAllowed: false as const, learningAllowed: false as const, winner: null,
  };
  // Stable for the same evidence, changes when late recovery adds a receipt. No raw customer or message data.
  return { ...basis, basisDigest: policyArtifactDigest(basis) };
}
