import { useEffect, useState } from 'react';
import { cohortProtocolRecord } from './sales-protocol-ui-trpc';
import { launchFixture, launchFixtureReceipt, launchFixtureRevocation, launchFixtureStatus } from './sales-launch-data';
import { authorizeSalesExperimentLaunchInput, revokeSalesExperimentLaunchInput } from '../../../shared/sales-experiment-launch';
const mode = (new URL(location.href).searchParams.get('case') || '').replace('launch-', ''), win = window as any, listeners = new Set<() => void>();
const state = { packet: null as any, row: null as any, saved: false, changed: false, actor: 7, stage: null as string | null };
const committedRequests = new Set<string>();
const emit = () => listeners.forEach(f => f());
function initialize() {
  if (state.packet) return;
  state.packet = launchFixture(cohortProtocolRecord());
  if (mode.startsWith('revoke-') || ['scheduled', 'enrollment_open', 'enrollment_closed', 'revoked', 'stale', 'unavailable', 'removed-actor', 'xss'].includes(mode)) state.row = launchFixtureReceipt(state.packet);
  if (mode === 'revoked') state.row = launchFixtureRevocation(state.row);
  if (mode === 'removed-actor') state.row.actorPresent = false;
  if (mode === 'xss') state.row.snapshot.reason = '<img src=x onerror="window.__launchXss=1">' + 'Unbroken'.repeat(50);
}
function data(kind: string) {
  initialize();
  if (kind === 'prepare') {
    const p = structuredClone(state.packet); p.existing = state.row; p.canAuthorize = !state.row; p.operatorUserId = state.actor;
    if (mode === 'expired') { p.checkedAt = p.basis.window.enrollmentStartsAt; p.canAuthorize = false; }
    if (mode === 'mismatch-actor') p.operatorUserId = 99; if (mode === 'unsupported') p.activationAllowed = true;
    if (mode === 'foreign') p.basis.review.protocolId = 99; return p;
  }
  const s = launchFixtureStatus(structuredClone(state.row)); s.operatorUserId = state.actor;
  if (s.authorization?.state === 'authorized') {
    s.stage = state.stage ?? (['enrollment_open', 'enrollment_closed', 'stale', 'unavailable'].includes(mode) ? mode : mode === 'removed-actor' ? 'stale' : 'scheduled');
    s.authorizationCurrent = !['stale', 'unavailable'].includes(s.stage);
    if (s.stage === 'enrollment_open') s.checkedAt = state.packet.basis.window.enrollmentStartsAt;
    if (s.stage === 'enrollment_closed') s.checkedAt = state.packet.basis.window.enrollmentEndsAt;
  }
  if (mode === 'bad-status') s.activationAllowed = true; return s;
}
function query(kind: string) { return { useQuery: (_input: any, _options: any) => {
  const [, tick] = useState(0), [fetching, setFetching] = useState(false);
  useEffect(() => { const f = () => tick(n => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const failed = () => mode === 'read-error' || kind === 'prepare' && mode === 'no-approval' || mode.endsWith('refresh-error') && state.saved;
  return { data: mode === 'loading' ? undefined : data(kind), isError: failed(), isLoading: mode === 'loading', isFetching: fetching || mode === 'fetching',
    refetch: async () => { setFetching(true); await new Promise(r => setTimeout(r, 20)); setFetching(false); return { data: data(kind), isError: failed() }; } };
} }; }
function mutation(kind: 'authorize' | 'revoke') { return { useMutation: () => ({ mutateAsync: async (raw: any) => {
  initialize(); win.__launchWrites = [...(win.__launchWrites || []), { kind, input: structuredClone(raw) }]; const count = win.__launchWrites.length;
  await new Promise(r => setTimeout(r, mode.endsWith('slow') ? 400 : 20));
  if (mode.endsWith('conflict')) throw { data: { code: 'PRECONDITION_FAILED' }, message: 'private SQL failure' };
  if (mode.endsWith('outage') && count === 1) throw Error('private disconnected');
  if (mode === 'retry-forbidden' && count === 2) throw { data: { code: 'FORBIDDEN' }, message: 'private membership error' };
  if (!committedRequests.has(`${kind}:${raw.requestId}`)) {
    if (kind === 'authorize') { const input = authorizeSalesExperimentLaunchInput.parse(raw); state.row = launchFixtureReceipt(state.packet); state.row.snapshot.reason = input.reason; }
    else { const input = revokeSalesExperimentLaunchInput.parse(raw); state.row = launchFixtureRevocation(state.row, state.actor, input.reason); }
    committedRequests.add(`${kind}:${raw.requestId}`); state.saved = true; emit();
  }
  if (count === 1 && (mode.endsWith('unknown') || mode === 'retry-forbidden')) throw Error('private acknowledgement lost');
  if (count === 1 && mode === 'revoked-recovery') { state.row = launchFixtureRevocation(state.row); emit(); throw Error('private acknowledgement lost'); }
  if (count === 1 && mode.endsWith('mismatch')) return { ...structuredClone(state.row), launchId: 99, reused: false, snapshot: { ...state.row.snapshot, actorUserId: 99 } };
  return { ...structuredClone(state.row), reused: count > 1 };
} }) }; }
export const launchFixtureApi = { prepareSalesExperimentLaunch: query('prepare'), getSalesExperimentLaunchStatus: query('status'),
  authorizeSalesExperimentLaunch: mutation('authorize'), revokeSalesExperimentLaunch: mutation('revoke') };
win.__launchChange = (kind: string) => { initialize();
  if (kind === 'basis') state.packet.basisDigest = 'b'.repeat(64);
  if (kind === 'actor') state.actor = 8;
  if (kind === 'review') state.packet.basis.reviewId++;
  if (kind === 'authorization') state.row = launchFixtureReceipt(state.packet);
  if (kind === 'revocation') state.row = launchFixtureRevocation(state.row);
  if (kind === 'stale') state.stage = 'stale';
  emit();
};
