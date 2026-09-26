import { z } from 'zod';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { readSalesExperimentAssignmentRow } from './sales-experiment-assignment';
import { readSalesExperimentProtocolRow, readSalesExperimentWithdrawalRow } from './sales-experiment-protocol';
import { readSalesPaymentFact, readSalesPaymentAttribution } from './sales-payment-fact-contract';

const id = z.number().int().positive().safe();
const utc = z.string().datetime({ precision: 3 }).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
export const salesExperimentReadoutInput = z.object({ merchantId: id, protocolId: id }).strict();
// Whole-population limits: exceeding them fails the read; never sample or paginate a denominator.
export const SALES_READOUT_ASSIGNMENT_LIMIT = 10_000, SALES_READOUT_PAYMENT_LIMIT = 20_000;
export class SalesExperimentReadoutLimitExceeded extends Error {}
export class SalesExperimentReadoutConflict extends Error {}
const conflict = (): never => { throw new SalesExperimentReadoutConflict(); };
function sum(values: number[]) {
  const total = values.reduce((n, v) => n + BigInt(v), BigInt(0));
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(0)) return conflict();
  return Number(total);
}
type Assignment = ReturnType<typeof readSalesExperimentAssignmentRow>;
type Fact = ReturnType<typeof readSalesPaymentFact> & { row: any };
type Capture = { fact: Fact; assignment: Assignment; refund?: Fact };

/** Recorded ITT evidence only. No model, transport, writes, statistical winner or activation. */
export function buildSalesExperimentReadout(value: z.input<typeof salesExperimentReadoutInput>, rows: {
  protocol: any; withdrawals: any[]; assignments: any[]; payments: any[];
}, readAt: string) {
  const input = salesExperimentReadoutInput.parse(value), now = Date.parse(utc.parse(readAt));
  if (rows.assignments.length > SALES_READOUT_ASSIGNMENT_LIMIT || rows.payments.length > SALES_READOUT_PAYMENT_LIMIT)
    throw new SalesExperimentReadoutLimitExceeded();
  const p = readSalesExperimentProtocolRow(rows.protocol), protocolDigest = String(rows.protocol.protocol_digest);
  if (Number(rows.protocol.id) !== input.protocolId || p.merchantId !== input.merchantId || Date.parse(p.registeredAt) > now) conflict();
  if (rows.withdrawals.length > 1 || (rows.protocol.state === 'withdrawn') !== (rows.withdrawals.length === 1)) conflict();
  const withdrawal = rows.withdrawals.length ? readSalesExperimentWithdrawalRow(rows.withdrawals[0], protocolDigest) : null;
  if (withdrawal && (withdrawal.protocolId !== input.protocolId || withdrawal.merchantId !== input.merchantId)) conflict();
  const w = p.design.window;
  const assignments = rows.assignments.map(readSalesExperimentAssignmentRow).sort((a,b) => a.assignmentId-b.assignmentId);
  const byCustomer = new Map<string,Assignment>(), assignmentIds = new Set<number>();
  for (const a of assignments) {
    const s = a.snapshot;
    if (s.merchantId !== input.merchantId || s.protocolId !== input.protocolId || s.protocolDigest !== protocolDigest
      || s.candidateId !== p.candidate.id || s.artifactDigest !== p.candidate.artifactDigest || s.baselineDigest !== p.candidate.baselineDigest
      || s.sectorDigest !== p.sector.digest || s.enrollmentStartsAt !== w.enrollmentStartsAt || s.enrollmentEndsAt !== w.enrollmentEndsAt
      || s.observationDays !== w.observationDays || s.decisionNotBefore !== w.decisionNotBefore || Date.parse(s.assignedAt) > now
      || p.design.cohort.population !== 'all' && s.population !== p.design.cohort.population
      || assignmentIds.has(a.assignmentId) || byCustomer.has(s.customerKey)) conflict();
    assignmentIds.add(a.assignmentId); byCustomer.set(s.customerKey,a);
  }
  // Read the merchant ledger as a whole, including recovery backlog and refunds after cutoff.
  // Filtering only on attributed rows would silently omit delayed refunds or captures.
  const facts = rows.payments.map(row => ({ ...readSalesPaymentFact(row), row })).sort((a,b) => a.factId-b.factId);
  const factIds = new Set<number>(), events = new Set<string>(), captures = new Map<number,Fact>();
  for (const f of facts) {
    const s = f.snapshot, key = `${s.paymentId}:${s.event}`;
    if (s.merchantId !== input.merchantId || factIds.has(f.factId) || events.has(key) || Date.parse(s.verifiedAt) > now
      || !['pending','review','unassigned','attributed'].includes(f.row.attribution_state)) conflict();
    factIds.add(f.factId); events.add(key);
    if (f.row.attribution_state === 'attributed') readSalesPaymentAttribution(f.row);
    else if (f.row.attribution !== null || f.row.attribution_digest !== null) conflict();
    if (s.event === 'captured') captures.set(s.paymentId,f);
  }
  const matched = new Map<number,Capture>(), targetCounts = new Map<string,number>();
  for (const f of Array.from(captures.values())) {
    const key = `${f.snapshot.targetKind}:${f.snapshot.targetId}`;
    targetCounts.set(key,(targetCounts.get(key) ?? 0)+1);
  }
  const backlog = { pending: 0, review: 0, unassigned: 0 };
  const related: Fact[] = [];
  function bind(f: Fact, a: Assignment, capture: Fact) {
    related.push(f);
    if (f.row.attribution_state !== 'attributed') {
      backlog[f.row.attribution_state as keyof typeof backlog]++;
      return;
    }
    const t = readSalesPaymentAttribution(f.row), s = a.snapshot;
    if (t.assignmentId !== a.assignmentId || t.assignmentDigest !== a.assignmentDigest || t.protocolId !== input.protocolId
      || t.protocolDigest !== protocolDigest || t.customerKey !== s.customerKey || t.arm !== s.arm || t.artifactDigest !== s.artifactDigest
      || t.baselineDigest !== s.baselineDigest || t.sectorDigest !== s.sectorDigest || t.assignedAt !== s.assignedAt
      || t.observationEndsAt !== s.observationEndsAt || t.refundCutoff !== s.decisionNotBefore
      || t.captureFactId !== capture.factId || t.captureFactDigest !== capture.factDigest || t.capturedAt !== capture.snapshot.verifiedAt) conflict();
  }
  for (const f of Array.from(captures.values())) {
    const s = f.snapshot, a = s.customerKey ? byCustomer.get(s.customerKey) : undefined;
    const belongs = a && Date.parse(s.verifiedAt) >= Date.parse(a.snapshot.assignedAt) && Date.parse(s.verifiedAt) < Date.parse(a.snapshot.observationEndsAt);
    if (!belongs) {
      if (f.row.attribution_state === 'attributed' && readSalesPaymentAttribution(f.row).protocolId === input.protocolId) conflict();
      continue;
    }
    const key = `${s.targetKind}:${s.targetId}`;
    if (targetCounts.get(key) !== 1) conflict(); // Check aliases outside the experiment window too.
    bind(f,a,f); matched.set(s.paymentId,{ fact:f,assignment:a });
  }
  for (const f of facts.filter(f => f.snapshot.event === 'refunded')) {
    const s = f.snapshot, capture = captures.get(s.paymentId), match = matched.get(s.paymentId);
    if (!match) {
      if (f.row.attribution_state === 'attributed' && readSalesPaymentAttribution(f.row).protocolId === input.protocolId) conflict();
      // An orphan refund for a cohort customer is unresolved, not proof of zero refunds.
      if (!capture && s.customerKey && byCustomer.has(s.customerKey)) {
        if (f.row.attribution_state === 'attributed') conflict();
        related.push(f); backlog[f.row.attribution_state as keyof typeof backlog]++;
      }
      continue;
    }
    const cs = match.fact.snapshot;
    if (s.customerKey !== cs.customerKey || s.targetKind !== cs.targetKind || s.targetId !== cs.targetId || s.currency !== cs.currency
      || s.amountMinor !== cs.amountMinor || Date.parse(s.verifiedAt) < Date.parse(cs.verifiedAt)) conflict();
    bind(f,match.assignment,match.fact); match.refund=f;
  }
  const enrollmentClosed = now >= Date.parse(w.enrollmentEndsAt), decisionTimeReached = now >= Date.parse(w.decisionNotBefore);
  const arms = (['baseline','candidate'] as const).map(arm => {
    const group = assignments.filter(a => a.snapshot.arm === arm), observed = group.filter(a => Date.parse(a.snapshot.observationEndsAt) <= now).length;
    return { arm, assignedCustomers: group.length, observationComplete: observed, observationPending: group.length-observed,
      minimumCustomers: p.design.sample.minimumCustomersPerArm, sampleShortfall: Math.max(0,p.design.sample.minimumCustomersPerArm-group.length) };
  });
  const blocked = Object.values(backlog).some(n => n > 0);
  const financial: Array<{ arm:'baseline'|'candidate'; currency:string; targetKind:'order'|'booking'; capturedPayments:number;
    customersWithCapture:number; customersWithRetainedCaptureAtCutoff:number; capturedMinor:number; refundedBeforeCutoffMinor:number|null;
    refundedAtOrAfterCutoffMinor:number|null; netAtCutoffObservedMinor:number; netCurrentlyObservedMinor:number }> = [];
  if (!blocked) {
    const groups = new Map<string,Capture[]>();
    for (const c of Array.from(matched.values())) {
      const key = `${c.assignment.snapshot.arm}:${c.fact.snapshot.currency}:${c.fact.snapshot.targetKind}`;
      const group = groups.get(key) ?? []; group.push(c); groups.set(key,group);
    }
    for (const key of Array.from(groups.keys()).sort()) {
      const group = groups.get(key)!, first = group[0];
      const early = group.filter(c => c.refund && Date.parse(c.refund.snapshot.verifiedAt) < Date.parse(w.decisionNotBefore));
      const late = group.filter(c => c.refund && Date.parse(c.refund.snapshot.verifiedAt) >= Date.parse(w.decisionNotBefore));
      const capturedMinor = sum(group.map(c => c.fact.snapshot.amountMinor)), refunded = sum(early.map(c => c.refund!.snapshot.amountMinor));
      const refundedLate = sum(late.map(c => c.refund!.snapshot.amountMinor));
      const earlyPayments = new Set(early.map(c => c.fact.snapshot.paymentId));
      financial.push({ arm:first.assignment.snapshot.arm, currency:first.fact.snapshot.currency, targetKind:first.fact.snapshot.targetKind,
        capturedPayments:group.length, customersWithCapture:new Set(group.map(c => c.assignment.assignmentId)).size,
        customersWithRetainedCaptureAtCutoff:new Set(group.filter(c => !earlyPayments.has(c.fact.snapshot.paymentId)).map(c => c.assignment.assignmentId)).size,
        capturedMinor, refundedBeforeCutoffMinor:early.length ? refunded : null, refundedAtOrAfterCutoffMinor:late.length ? refundedLate : null,
        netAtCutoffObservedMinor:capturedMinor-refunded, netCurrentlyObservedMinor:capturedMinor-refunded-refundedLate });
    }
  }
  return {
    version:'sales-experiment-readout.v1' as const, ...input, protocolDigest, protocolState:rows.protocol.state as 'registered'|'withdrawn',
    sector:p.sector.playbook.id, sectorDigest:p.sector.digest, readAt,
    population:'all_recorded_assigned_qualified_customers' as const, completeWithinRecordedPopulation:true as const,
    limits:{ assignments:SALES_READOUT_ASSIGNMENT_LIMIT,merchantPaymentFacts:SALES_READOUT_PAYMENT_LIMIT },
    window:w, enrollmentClosed, decisionTimeReached, arms,
    sampleStatus:arms.some(a => a.sampleShortfall > 0) ? enrollmentClosed ? 'insufficient_no_extension' as const : 'accruing' as const : 'recorded_minimum_reached' as const,
    paymentEvidence:{ status:blocked ? 'unresolved_attribution' as const : matched.size ? 'observed' as const : 'unmeasured' as const,
      unresolved:backlog, groups:financial },
    financialSource:'recorded_canonical_tap_payment_facts' as const, sourceCompleteness:'unmeasured' as const,
    partialRefunds:'not_supported_by_source' as const, humanAssistance:'unmeasured' as const, exposure:'not_evaluated' as const,
    primaryMetric:'not_established' as const, causality:'unmeasured' as const, winner:null, learningAllowed:false as const, activationAllowed:false as const,
    evidenceSetDigest:hash({ version:'sales-experiment-readout-basis.v1',...input,protocolDigest,state:rows.protocol.state,
      withdrawalDigest:rows.withdrawals[0]?.withdrawal_digest ?? null,
      assignments:assignments.map(a => [a.assignmentId,a.assignmentDigest]),
      payments:related.sort((a,b) => a.factId-b.factId).map(f => [f.factId,f.factDigest,f.row.attribution_state,f.row.attribution_digest]) }),
  };
}
