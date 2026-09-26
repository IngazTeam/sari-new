import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertSalesPaymentFactSchema } from './sales-payment-facts';
import { loadSalesExperimentAssignment, SalesExperimentAssignmentConflict } from './sales-experiment-assignment';
import { loadSalesExperimentProtocol, SalesExperimentProtocolConflict } from './sales-experiment-protocol';
import { policyArtifactDigest } from './learning-policy-evaluation-bundle';
import { readSalesPaymentFact, readSalesPaymentAttribution, salesPaymentAttribution, SalesPaymentEvidenceConflict } from './sales-payment-fact-contract';

const identity = z.number().int().positive().safe();
const conflict = (): never => { throw new SalesPaymentEvidenceConflict(); };
async function bind(c: PoolConnection, row: any) {
  const f = readSalesPaymentFact(row), s = f.snapshot;
  if (!s.customerKey && s.event === 'captured') return null;
  let capture = f, assignmentId: number;
  if (s.event === 'refunded') {
    const [parents] = await c.execute<any[]>("SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND payment_id=? AND event_type='captured' FOR SHARE", [s.merchantId,s.paymentId]);
    if (parents.length !== 1) return conflict(); // Legacy captures cannot be reconstructed at today's clock.
    const parent = parents[0]; capture = readSalesPaymentFact(parent); const cs = capture.snapshot;
    if (cs.targetKind !== s.targetKind || cs.targetId !== s.targetId || cs.customerKey !== s.customerKey
      || cs.amountMinor !== s.amountMinor || cs.currency !== s.currency || Date.parse(s.verifiedAt) < Date.parse(cs.verifiedAt)) return conflict();
    if (parent.attribution_state === 'pending') throw Error('Capture attribution pending');
    if (parent.attribution_state === 'unassigned') return null;
    const previous = readSalesPaymentAttribution(parent);
    assignmentId = previous.assignmentId;
  } else {
    // Match enrollment, not exposure: unexposed assigned customers must remain in the denominator.
    const [candidates] = await c.execute<any[]>(`SELECT id FROM ai_sales_experiment_assignments
      WHERE merchant_id=? AND customer_key=? ORDER BY id LIMIT 101 FOR SHARE`, [s.merchantId,s.customerKey]);
    if (candidates.length > 100) return conflict();
    const matches = [];
    for (const candidate of candidates) {
      const a = await loadSalesExperimentAssignment(c,s.merchantId,Number(candidate.id));
      if (a.snapshot.customerKey !== s.customerKey) return conflict();
      if (Date.parse(a.snapshot.assignedAt) <= Date.parse(s.verifiedAt) && Date.parse(s.verifiedAt) < Date.parse(a.snapshot.observationEndsAt)) matches.push(a);
    }
    if (matches.length > 1) return conflict();
    if (!matches.length) return null;
    assignmentId = matches[0].assignmentId;
  }
  const a = await loadSalesExperimentAssignment(c,s.merchantId,assignmentId), as = a.snapshot;
  const p = await loadSalesExperimentProtocol(c,s.merchantId,as.protocolId), ps = p.protocol, w = ps.design.window;
  if (as.customerKey !== s.customerKey || as.protocolDigest !== p.protocolDigest || as.candidateId !== ps.candidate.id
    || as.artifactDigest !== ps.candidate.artifactDigest || as.baselineDigest !== ps.candidate.baselineDigest || as.sectorDigest !== ps.sector.digest
    || as.enrollmentStartsAt !== w.enrollmentStartsAt || as.enrollmentEndsAt !== w.enrollmentEndsAt
    || as.observationDays !== w.observationDays || as.decisionNotBefore !== w.decisionNotBefore) return conflict();
  const includedAtCutoff = s.event === 'captured' || Date.parse(s.verifiedAt) < Date.parse(as.decisionNotBefore);
  const attribution = salesPaymentAttribution.parse({ version: 'sales-payment-attribution.v1', merchantId: s.merchantId,
    factId: f.factId, factDigest: f.factDigest, captureFactId: capture.factId, captureFactDigest: capture.factDigest,
    assignmentId, assignmentDigest: a.assignmentDigest, protocolId: as.protocolId, protocolDigest: as.protocolDigest,
    customerKey: s.customerKey, arm: as.arm, artifactDigest: as.artifactDigest, baselineDigest: as.baselineDigest, sectorDigest: as.sectorDigest,
    event: s.event, paymentId: s.paymentId, targetKind: s.targetKind, targetId: s.targetId, amountMinor: s.amountMinor, currency: s.currency,
    assignedAt: as.assignedAt, capturedAt: capture.snapshot.verifiedAt, verifiedAt: s.verifiedAt, observationEndsAt: as.observationEndsAt,
    refundCutoff: as.decisionNotBefore, includedAtCutoff, signedNetMinor: s.event === 'captured' ? s.amountMinor : includedAtCutoff ? -s.amountMinor : 0,
    timeBasis: 'local_verified_transition', humanAssistance: 'unmeasured', scope: 'intention_to_treat_only', winner: null });
  // A refund inherits the original capture's arm and frozen authority even after withdrawal/revocation.
  if (s.event === 'refunded') {
    const [parents] = await c.execute<any[]>('SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND id=? FOR SHARE', [s.merchantId,capture.factId]);
    const prior = readSalesPaymentAttribution(parents[0]);
    for (const key of ['assignmentDigest','protocolDigest','customerKey','arm','artifactDigest','baselineDigest','sectorDigest','assignedAt','observationEndsAt','refundCutoff'] as const)
      if (prior[key] !== attribution[key]) return conflict();
  }
  return attribution;
}

/** SQL-only, bounded recovery. Merchant -> fact locks serialize competing workers without leases or provider calls. */
export async function attributeSalesPaymentFact(merchantId: number, factId: number) {
  const merchant = identity.parse(merchantId), fact = identity.parse(factId);
  await assertSalesPaymentFactSchema(); const pool = await getPool(); if (!pool) throw Error('Payment attribution unavailable');
  const c = await pool.getConnection(); let reusable = true, attempted = false;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await c.beginTransaction();
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchant]);
    const [rows] = await c.execute<any[]>(`SELECT * FROM ai_sales_payment_facts WHERE merchant_id=? AND id=?
      AND attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3) FOR UPDATE`, [merchant,fact]);
    if (!rows.length) { await c.rollback(); return 'skipped' as const; }
    attempted = true;
    if (Number(rows[0].attempts) >= 8) return conflict();
    const attribution = await bind(c,rows[0]), state = attribution ? 'attributed' : 'unassigned';
    await c.execute(`UPDATE ai_sales_payment_facts SET attribution_state=?,attribution_digest=?,attribution=?,
      attempts=attempts+1,next_at=NULL,last_error=NULL WHERE merchant_id=? AND id=?`,
      [state,attribution ? policyArtifactDigest(attribution) : null,attribution ? JSON.stringify(attribution) : null,merchant,fact]);
    try { await c.commit(); } catch (error) { reusable = false; c.destroy(); throw error; }
    return state as 'attributed' | 'unassigned';
  } catch (error) {
    if (reusable) { try { await c.rollback(); } catch { reusable = false; c.destroy(); } }
    if (!attempted) throw error;
    // Conditional update cannot overwrite a successful uncertain commit or another worker's finished projection.
    const terminal = error instanceof SalesPaymentEvidenceConflict || error instanceof z.ZodError
      || error instanceof SalesExperimentAssignmentConflict || error instanceof SalesExperimentProtocolConflict;
    const [result] = await pool.execute<any>(`UPDATE ai_sales_payment_facts SET
      attribution_state=IF(? OR attempts>=7,'review','pending'),
      next_at=IF(? OR attempts>=7,NULL,TIMESTAMPADD(SECOND,LEAST(3600,30*POW(2,LEAST(attempts,7))),UTC_TIMESTAMP(3))),
      last_error=?,attempts=LEAST(8,attempts+1) WHERE merchant_id=? AND id=? AND attribution_state='pending'`,
      [terminal,terminal,terminal ? 'evidence_unavailable' : 'projection_unavailable',merchant,fact]);
    return Number(result.affectedRows) ? 'deferred' as const : 'skipped' as const;
  } finally { if (reusable) c.release(); }
}

export async function runSalesPaymentAttributionBatch(limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw Error('Invalid payment attribution batch');
  await assertSalesPaymentFactSchema(); const pool = await getPool(); if (!pool) throw Error('Payment attribution unavailable');
  const [rows] = await pool.execute<any[]>(`SELECT id,merchant_id FROM ai_sales_payment_facts
    WHERE attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3) ORDER BY next_at,id LIMIT ${limit}`);
  const result = { selected: rows.length, attributed: 0, unassigned: 0, deferred: 0, skipped: 0 };
  for (const row of rows) { try { result[await attributeSalesPaymentFact(Number(row.merchant_id),Number(row.id))]++; } catch { result.deferred++; } }
  return result;
}

export class SalesPaymentHealthAccessDenied extends Error {}
export async function salesPaymentAttributionHealth(actorUserId: number) {
  if (!identity.safeParse(actorUserId).success) throw new SalesPaymentHealthAccessDenied();
  const pool = await getPool(); if (!pool) throw Error('Payment attribution unavailable');
  const [actors] = await pool.execute<any[]>("SELECT id FROM users WHERE id=? AND role='admin' AND account_status='active'", [actorUserId]);
  if (actors.length !== 1) throw new SalesPaymentHealthAccessDenied();
  await assertSalesPaymentFactSchema();
  const [rows] = await pool.execute<any[]>(`SELECT attribution_state AS status,COUNT(*) AS count,
    SUM(attribution_state='pending' AND next_at<=UTC_TIMESTAMP(3)) AS due FROM ai_sales_payment_facts GROUP BY attribution_state`);
  return rows.map(row => ({ status: String(row.status), count: Number(row.count), due: Number(row.due) }));
}
export async function startSalesPaymentAttributionWorker() {
  await assertSalesPaymentFactSchema(); let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = runSalesPaymentAttributionBatch().then(result => {
      if (result.deferred) console.warn('[SalesPaymentAttribution] Local evidence needs recovery', { count: result.deferred });
    }).catch(() => console.error('[SalesPaymentAttribution] Local recovery deferred')).finally(() => { active = undefined; });
  };
  const timer = setInterval(tick,60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
