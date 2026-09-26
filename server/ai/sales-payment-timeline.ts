import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertSalesPaymentFactSchema } from './sales-payment-facts';
import { assertSalesExperimentExposureSchema, loadSalesReplyExposure } from './sales-experiment-exposure';
import { readSalesReplyDeliveryRecord } from './sales-reply-delivery';
import { databaseTimeEpoch } from '../db/time';
import { loadSalesExperimentAssignment } from './sales-experiment-assignment';
import { loadSalesExperimentProtocol } from './sales-experiment-protocol';
import { readSalesPaymentAttribution, SalesPaymentEvidenceConflict } from './sales-payment-fact-contract';
import { buildSalesPaymentTimeline, inspectSalesPaymentTimelineInput, SALES_PAYMENT_TIMELINE_LIMIT } from './sales-payment-timeline-contract';

export class SalesPaymentTimelineAccessDenied extends Error {}
export class SalesPaymentTimelineNotReady extends Error {}

/** Diagnostic read only. Merchant share lock keeps cooperating projections/withdrawals outside this view.
 * No enrollment, sending, model call, finance mutation, attribution retry or winner selection.
 */
export async function inspectSalesPaymentTimeline(actorUserId: number, value: z.infer<typeof inspectSalesPaymentTimelineInput>) {
  if (!z.number().int().positive().safe().safeParse(actorUserId).success) throw new SalesPaymentTimelineAccessDenied();
  const input = inspectSalesPaymentTimelineInput.parse(value);
  const pool = await getPool(); if (!pool) throw Error('Payment timeline unavailable');
  const c = await pool.getConnection(); let reusable = true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await c.beginTransaction();
    const [actors] = await c.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active'", [actorUserId]);
    if (actors.length !== 1) throw new SalesPaymentTimelineAccessDenied();
    await assertSalesPaymentFactSchema(); await assertSalesExperimentExposureSchema();
    const [merchants] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR SHARE', [input.merchantId]);
    if (merchants.length !== 1) throw new SalesPaymentTimelineNotReady();
    // Use locking reads consistently: never mix an old MVCC view with newer frozen evidence.
    const [rows] = await c.execute<any[]>('SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND id=? FOR SHARE', [input.merchantId,input.factId]);
    if (rows.length !== 1 || rows[0].attribution_state !== 'attributed') throw new SalesPaymentTimelineNotReady();
    const event = readSalesPaymentAttribution(rows[0]);
    const [captures] = await c.execute<any[]>('SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND id=? FOR SHARE', [input.merchantId,event.captureFactId]);
    if (captures.length !== 1) throw new SalesPaymentEvidenceConflict();
    const assignment = await loadSalesExperimentAssignment(c,input.merchantId,event.assignmentId), a = assignment.snapshot;
    const protocol = await loadSalesExperimentProtocol(c,input.merchantId,event.protocolId), p = protocol.protocol, w = p.design.window;
    if (assignment.assignmentDigest !== event.assignmentDigest || a.protocolDigest !== protocol.protocolDigest
      || a.candidateId !== p.candidate.id || a.artifactDigest !== p.candidate.artifactDigest || a.baselineDigest !== p.candidate.baselineDigest
      || a.sectorDigest !== p.sector.digest || a.enrollmentStartsAt !== w.enrollmentStartsAt || a.enrollmentEndsAt !== w.enrollmentEndsAt
      || a.observationDays !== w.observationDays || a.decisionNotBefore !== w.decisionNotBefore) throw new SalesPaymentEvidenceConflict();
    for (const key of ['protocolId','protocolDigest','customerKey','arm','artifactDigest','baselineDigest','sectorDigest','assignedAt','observationEndsAt'] as const) {
      if (event[key] !== a[key]) throw new SalesPaymentEvidenceConflict();
    }
    if (event.refundCutoff !== a.decisionNotBefore) throw new SalesPaymentEvidenceConflict();
    // The extra row detects overflow; never silently summarize a truncated history as complete.
    const [exposures] = await c.execute<any[]>(`SELECT * FROM ai_sales_experiment_exposures
      WHERE merchant_id=? AND protocol_id=? AND assignment_id=? ORDER BY id LIMIT ${SALES_PAYMENT_TIMELINE_LIMIT + 1} FOR SHARE`,
    [input.merchantId,event.protocolId,event.assignmentId]);
    const result = buildSalesPaymentTimeline(rows[0],captures[0],exposures);
    for (const exposure of result.exposures) {
      const [deliveries] = await c.execute<any[]>('SELECT * FROM ai_sales_reply_deliveries WHERE merchant_id=? AND id=? FOR SHARE', [input.merchantId,exposure.deliveryId]);
      if (deliveries.length !== 1) throw new SalesPaymentEvidenceConflict();
      const delivery = readSalesReplyDeliveryRecord(deliveries[0]), bound = await loadSalesReplyExposure(c,delivery);
      if (!bound || bound.dispatchStartedAt !== new Date(databaseTimeEpoch(deliveries[0].dispatch_started_at)).toISOString()) throw new SalesPaymentEvidenceConflict();
    }
    // End the read transaction without creating any audit/payment/exposure rows.
    await c.rollback(); return result;
  } catch (error) {
    try { await c.rollback(); } catch { reusable = false; c.destroy(); }
    throw error;
  } finally { if (reusable) c.release(); }
}
