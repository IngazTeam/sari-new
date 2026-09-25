import { useEffect, useState } from 'react';
import { getSalesSectorPlaybook, salesSectorPlaybooks } from '../../../shared/sales-sector-playbooks';
import { registerSalesExperimentProtocolInput, withdrawSalesExperimentProtocolInput } from '../../../shared/sales-experiment-protocol';
import { syntheticSalesExperimentDesign } from '../../../server/tests/helpers/sales-experiment-design';
import { calculateSalesExperimentSample } from '../../../shared/sales-experiment-sample';
const rawMode = new URL(location.href).searchParams.get('case') || '';
const mode = (rawMode.startsWith('cohort-') || rawMode.startsWith('inspection-')) ? 'cohort' : rawMode.replace('protocol-', '') || 'ready';
const win = window as any, listeners = new Set<() => void>(), records = new Map<number, any>();
const state = { sectorRevision: 0, candidateId: 4, revoked: false, newest: 45, registration: null as any, withdrawal: null as any };
const emit = () => listeners.forEach(listener => listener());
const malicious = '<img src=x onerror="window.__protocolXss=1">' + 'Unbroken'.repeat(55);
function record(id: number, registered = false) {
  const design = syntheticSalesExperimentDesign(); if (mode === 'xss') { design.title = malicious; design.hypothesis = malicious; } // invalid title tested separately below
  if (mode === 'legacy-sample') design.sample.minimumCustomersPerArm = 500;
  if (mode === 'xss') design.title = '<img src=x onerror="window.__protocolXss=1">';
  const protocolDigest = String(id % 10).repeat(64), registeredAt = new Date(Date.now() - 86_400_000).toISOString();
  return { protocolId: id, protocolDigest, state: registered ? 'registered' : 'withdrawn', eligibility: 'not_checked', activationAllowed: false, experimentStarted: false,
    actorUserId: 7, createdAt: registeredAt, protocol: { version: 'sales-experiment-protocol.v1', merchantId: 20, registeredAt,
      candidate: { id: 4, artifactDigest: 'c'.repeat(64), baselineDigest: 'b'.repeat(64), sourceDigest: 'a'.repeat(64), preparationReviewId: 2 },
      sector: { revision: 0, playbook: getSalesSectorPlaybook('general'), digest: 'd'.repeat(64) }, design,
      sampleAdequacy: 'not_independently_verified', cohortExecution: 'not_implemented', activationAllowed: false },
    withdrawal: registered ? null : { version: 'sales-experiment-withdrawal.v1', merchantId: 20, protocolId: id, protocolDigest,
      reason: mode === 'xss' ? malicious : 'Historical safety withdrawal with its original immutable reason.', winner: null, actorUserId: 7, createdAt: registeredAt } };
}
if (['history', 'xss', 'history-error', 'standalone'].includes(mode)) for (let id = 1; id <= 45; id++) records.set(id, record(id));
if (mode.startsWith('withdraw') || ['existing','unsupported','record-error','cohort','legacy-sample','corrupt-sample'].includes(mode)) records.set(45, record(45, true));
function value(kind: string, input: any) {
  if (kind === 'candidate') return { proposalId: 16, reviewId: 2, sourceDigest: 'a'.repeat(64), baselineDigest: 'b'.repeat(64), expectedVersion: 1,
    canCreate: false, activationAllowed: false, latestCandidate: mode === 'missing' ? null : { id: state.candidateId, version: state.candidateId - 3, current: mode !== 'stale', artifactDigest: 'c'.repeat(64), activationAllowed: false, bundle: { version: 'sales-style-candidate.v1' } }, evaluationRuns: [] };
  if (kind === 'sector') return { revision: state.sectorRevision, canManage: !state.revoked && mode !== 'viewer', playbook: getSalesSectorPlaybook('general'), available: salesSectorPlaybooks };
  if (kind === 'history') {
    const rows = [...records.values()].sort((a,b) => b.protocolId - a.protocolId).filter(row => !input.beforeId || row.protocolId < input.beforeId), selected = rows.slice(0, input.limit ?? 20);
    return { items: selected.map(row => ({ protocolId: row.protocolId, protocolDigest: row.protocolDigest, state: row.state, title: row.protocol.design.title,
      candidateId: row.protocol.candidate.id, createdAt: row.createdAt, activationAllowed: false, experimentStarted: false })), nextBeforeId: rows.length > selected.length ? selected.at(-1).protocolId : null };
  }
  const result = structuredClone(records.get(input.protocolId)); if (result && mode === 'unsupported') result.activationAllowed = true;
  if (result && mode === 'corrupt-sample') result.protocol.sampleCalculation = { ...calculateSalesExperimentSample(result.protocol.design.sample), requiredPerArm: 30 };
  return result;
}
function query(kind: string) {
  return { useQuery: (input: any = {}, options: any = {}) => {
    const [, tick] = useState(0), [fetching, setFetching] = useState(false), [recovered, setRecovered] = useState(false);
    useEffect(() => { const update = () => tick(n => n + 1); listeners.add(update); return () => { listeners.delete(update); }; }, []);
    const key = JSON.stringify(input);
    useEffect(() => { if (options.enabled !== false) win.__protocolReads = [...(win.__protocolReads || []), { kind, input }]; }, [key]);
    const error = () => state.revoked && kind !== 'sector' || !recovered && (mode === `${kind}-error` || mode === 'history-error' && kind === 'history' && !!input.beforeId)
      || mode === 'refresh-error' && !!state.registration && kind === 'history';
    return { data: mode === 'loading' ? undefined : value(kind, input), isLoading: mode === 'loading', isFetching: fetching || mode === 'fetching', isError: error(),
      refetch: async () => { setFetching(true); await new Promise(resolve => setTimeout(resolve, 15)); setFetching(false); setRecovered(true); return { data: value(kind, input), isError: state.revoked || mode === 'refresh-error' && !!state.registration }; } };
  } };
}
function mutation(kind: 'register' | 'withdraw') {
  return { useMutation: () => ({ mutateAsync: async (raw: any) => {
    win.__protocolWrites = [...(win.__protocolWrites || []), { kind, input: structuredClone(raw) }];
    const count = win.__protocolWrites.filter((item: any) => item.kind === kind).length;
    await new Promise(resolve => setTimeout(resolve, mode === 'slow' || mode === 'close' ? 350 : 20));
    if (mode === 'conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL' };
    if (state.revoked) throw { data: { code: 'FORBIDDEN' }, message: 'private role' };
    if (mode === 'outage' && count === 1) throw Error('private disconnected before commit');
    if (kind === 'register') {
      const input = registerSalesExperimentProtocolInput.parse(raw);
      if (!state.registration) { const row = record(++state.newest, true); row.protocol.design = input.design; row.protocol.sampleCalculation = calculateSalesExperimentSample(input.design.sample); if (row.protocol.sampleCalculation.status !== 'meets_calculated_floor') throw Error('Insufficient sample'); row.protocol.candidate.id = input.candidateId; row.protocol.candidate.artifactDigest = input.artifactDigest; row.protocol.sector.revision = input.expectedSectorRevision;
        state.registration = row; records.set(row.protocolId, row); }
      emit(); if (['unknown', 'receipt-mismatch'].includes(mode) && count === 1) {
        if (mode === 'receipt-mismatch') return { ...state.registration, protocol: { ...state.registration.protocol, candidate: { ...state.registration.protocol.candidate, id: 999 } } };
        throw Error('private lost commit acknowledgment');
      }
      return structuredClone(state.registration);
    }
    const input = withdrawSalesExperimentProtocolInput.parse(raw), row = records.get(input.protocolId);
    row.state = 'withdrawn'; row.withdrawal = { version: 'sales-experiment-withdrawal.v1', merchantId: 20, protocolId: input.protocolId,
      protocolDigest: input.protocolDigest, reason: input.reason, winner: null, actorUserId: 7, createdAt: new Date().toISOString() }; state.withdrawal = row; emit();
    if (mode === 'withdraw-unknown' && count === 1) throw Error('private lost withdrawal acknowledgment');
    return structuredClone(row);
  } }) };
}
win.__protocolChangeSector = () => { state.sectorRevision++; emit(); };
win.__protocolChangeCandidate = () => { state.candidateId++; emit(); };
win.__protocolRevoke = () => { state.revoked = true; emit(); };
win.__protocolRestore = () => { state.revoked = false; emit(); };
// A new server record does not push into a cached query; later page requests see it.
win.__protocolAddHistory = () => { records.set(++state.newest, record(state.newest)); };
export const protocolBasisFixture = { getLearningPolicyCandidate: query('candidate'), getSalesSector: query('sector') };
export const salesProtocolFixture = { getSalesExperimentProtocolHistory: query('history'), getSalesExperimentProtocol: query('record'),
  registerSalesExperimentProtocol: mutation('register'), withdrawSalesExperimentProtocol: mutation('withdraw') };

export const cohortProtocolRecord = () => structuredClone(records.get(45));
