import { useEffect, useState } from 'react';
import { freezeSalesCohortInput, salesCohortSnapshot } from '../../../shared/sales-experiment-cohort';
import { cohortProtocolRecord } from './sales-protocol-ui-trpc';
const mode = new URL(location.href).searchParams.get('case')?.replace('cohort-', '') || 'ready';
const win = window as any, listeners = new Set<() => void>(), emit = () => listeners.forEach(fn => fn());
const state = { frozen: null as any, request: null as any, blocked: false, readError: false };
const malicious = '<img src=x onerror="window.__cohortXss=1">' + 'Unbroken'.repeat(45);
function receipt(raw: any) {
  const input = freezeSalesCohortInput.parse(raw), p = cohortProtocolRecord();
  return { cohortId: 8, cohortDigest: '8'.repeat(64), snapshot: salesCohortSnapshot.parse({ version: 'sales-cohort-snapshot.v1', merchantId: 20,
    protocolId: p.protocolId, protocolDigest: p.protocolDigest, frozenAt: new Date().toISOString(), population: p.protocol.design.cohort.population,
    enrollmentStartsAt: p.protocol.design.window.enrollmentStartsAt, enrollmentEndsAt: p.protocol.design.window.enrollmentEndsAt,
    rules: input.rules, matchesRegisteredDefinition: true, mappingReview: input.mappingReview, mappingApproval: 'operator_attestation_only', activationAllowed: false }),
    actorUserId: mode === 'deleted-actor' ? null : 7, createdAt: new Date().toISOString(), eligibility: 'not_checked', activationAllowed: false, experimentStarted: false };
}
if ((new URL(location.href).searchParams.get('case')?.startsWith('cohort-') && ['frozen','xss','deleted-actor'].includes(mode)) || new URL(location.href).searchParams.get('case')?.startsWith('inspection-')) {
  const p = cohortProtocolRecord();
  state.frozen = receipt({ protocolId: p.protocolId, protocolDigest: p.protocolDigest, requestId: '00000000-0000-4000-8000-000000000001',
    rules: { version: 'sales-cohort-rules.v1', historyDefinition: 'owned_inbound_before_enrollment', messageType: 'text', minimumCharacters: 1, maximumCharacters: 4000,
      requiredAnyTerms: [], excludedPhones: [], allowedDealStages: ['new'], requireActiveConversation: true, excludeHumanTakeover: true, requireLatestInbound: true, requirePostHandoffInbound: true },
    mappingReview: mode === 'xss' ? malicious : 'These bounded conditions match the registered qualification rules.', matchesRegisteredDefinition: true });
}
function preparation() {
  const p = cohortProtocolRecord(), status = state.frozen ? 'already_frozen' : state.blocked ? 'source_changed' : ['withdrawn','window_started','source_changed'].includes(mode) ? mode : 'available';
  return { protocolId: p.protocolId, protocolDigest: mode === 'unsupported' ? 'a'.repeat(64) : p.protocolDigest, preparedAt: new Date().toISOString(), status,
    canFreeze: status === 'available', frozen: structuredClone(state.frozen), activationAllowed: false, experimentStarted: false };
}
win.__cohortBlock = () => { state.blocked = true; emit(); };
win.__cohortReadError = () => { state.readError = true; emit(); };
export const salesCohortFixture = {
  prepareSalesExperimentCohort: { useQuery: () => {
    const [, tick] = useState(0), [fetching, setFetching] = useState(false), [recovered, setRecovered] = useState(false);
    useEffect(() => { const update = () => tick(n => n + 1); listeners.add(update); win.__cohortReads = (win.__cohortReads || 0) + 1; return () => { listeners.delete(update); }; }, []);
    const error = () => state.readError || mode === 'read-error' && !recovered || mode === 'refresh-error' && !!state.frozen;
    return { data: mode === 'loading' ? undefined : preparation(), isLoading: mode === 'loading', isFetching: fetching || mode === 'fetching', isError: error(),
      refetch: async () => { setFetching(true); await new Promise(resolve => setTimeout(resolve, 20)); setRecovered(true); setFetching(false); return { data: preparation(), isError: state.readError || mode === 'refresh-error' && !!state.frozen }; } };
  } },
  freezeSalesExperimentCohort: { useMutation: () => ({ mutateAsync: async (raw: any) => {
    win.__cohortWrites = [...(win.__cohortWrites || []), structuredClone(raw)]; const count = win.__cohortWrites.length;
    await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 300 : 25));
    if (mode === 'conflict') throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL' };
    if (mode === 'outage' && count === 1) throw Error('private disconnected before commit');
    if (state.request && JSON.stringify(raw) !== JSON.stringify(state.request)) throw Error('Changed retry');
    if (!state.frozen) { state.frozen = receipt(raw); state.request = structuredClone(raw); }
    emit();
    if (mode === 'unknown' && count === 1) throw Error('private lost commit acknowledgment');
    if (mode === 'receipt-mismatch' && count === 1) return { ...state.frozen, snapshot: { ...state.frozen.snapshot, mappingReview: 'A different submitted explanation must not be accepted.' } };
    return structuredClone(state.frozen);
  } }) },
};
