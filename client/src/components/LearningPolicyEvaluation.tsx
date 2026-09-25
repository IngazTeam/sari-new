import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { definiteReviewError } from '@/lib/learning-policy-evaluation-state';
import { LearningPolicyEvaluationRun } from './LearningPolicyEvaluationRun';
import { LearningPolicyRunArchive } from './LearningPolicyArchive';
import { SalesExperimentProtocol } from './SalesExperimentProtocol';
type Inputs = inferRouterInputs<AppRouter>['sariBrain'];
type Pending = { kind: 'candidate'; input: Inputs['createLearningPolicyCandidate'] } | { kind: 'run'; input: Inputs['startLearningPolicyEvaluation'] };

export function LearningPolicyEvaluation({ proposalId, active = true }: { proposalId: number; active?: boolean }) {
  const { t } = useTranslation(), id = useId();
  const [opened, setOpened] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-4"><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-evaluation-open aria-expanded={opened} aria-controls={id} onClick={() => { setMounted(true); setOpened(value => !value); }}>{opened ? t('merchantUx.policyEvaluation.close') : t('merchantUx.policyEvaluation.open')}</Button><div id={id} hidden={!opened}>{mounted && <LearningPolicyEvaluationPanel key={proposalId} proposalId={proposalId} active={active && opened} />}</div></div>;
}

export function LearningPolicyEvaluationPanel({ proposalId, active = true }: { proposalId: number; active?: boolean }) {
  const { t } = useTranslation(), id = useId();
  const query = trpc.sariBrain.getLearningPolicyCandidate.useQuery({ proposalId }, { retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const create = trpc.sariBrain.createLearningPolicyCandidate.useMutation({ retry: false }), start = trpc.sariBrain.startLearningPolicyEvaluation.useMutation({ retry: false });
  const [runId, setRunId] = useState<number | null>(null), [busy, setBusy] = useState(false), [runLock, setRunLock] = useState(false), [protocolLock, setProtocolLock] = useState(false);
  const childLock = runLock || protocolLock;
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null);
  const [jumpToRun, setJumpToRun] = useState(0), panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!jumpToRun) return;
    const heading = panel.current?.querySelector<HTMLElement>('[data-evaluation-heading]');
    heading?.focus(); heading?.scrollIntoView({ block: 'start' });
  }, [jumpToRun]);
  const pending = useRef<Pending | null>(null), inFlight = useRef(false);
  const data = query.data, readable = !!data && !query.isError && !query.isLoading, uncertain = failure === 'unknown';
  const ready = readable && !query.isFetching && !busy && !childLock && !uncertain && active && failure !== 'refresh' && failure !== 'changed';
  const current = data?.latestCandidate?.current && data.latestCandidate.bundle?.version === 'sales-style-candidate.v1' && data.latestCandidate.activationAllowed === false;
  const lockChild = useCallback((value: boolean) => setRunLock(value), []);
  const lockProtocol = useCallback((value: boolean) => setProtocolLock(value), []);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);
  async function refresh() {
    if (inFlight.current || childLock) return;
    inFlight.current = true; setBusy(true);
    try { const result = await query.refetch(); if (result.isError) throw Error(); if (!uncertain) setFailure(null); }
    catch { if (!uncertain) setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(kind: 'candidate' | 'run' | 'retry') {
    if (inFlight.current || childLock || (kind === 'retry' ? !uncertain || !pending.current : !ready)) return;
    if (kind === 'candidate') {
      if (!data!.canCreate || !data!.reviewId) return;
      pending.current = { kind, input: { proposalId, requestId: crypto.randomUUID(), reviewId: data!.reviewId, sourceDigest: data!.sourceDigest, baselineDigest: data!.baselineDigest, expectedVersion: data!.expectedVersion } };
    } else if (kind === 'run') {
      if (!current || data!.evaluationRuns.some(row => row.state === 'running')) return;
      pending.current = { kind, input: { candidateId: data!.latestCandidate!.id, artifactDigest: data!.latestCandidate!.artifactDigest, requestId: crypto.randomUUID() } };
    }
    inFlight.current = true; setBusy(true); let committed = false;
    try {
      const request = pending.current!;
      if (request.kind === 'candidate') await create.mutateAsync(request.input);
      else { const result = await start.mutateAsync(request.input); setRunId(result.runId); }
      committed = true; pending.current = null; setFailure(null);
    } catch (error) { if (definiteReviewError(error)) { pending.current = null; setFailure('changed'); } else setFailure('unknown'); }
    finally {
      try { const result = await query.refetch(); if (result.isError) throw Error(); } catch { if (committed) setFailure('refresh'); }
      inFlight.current = false; setBusy(false);
    }
  }
  return <section ref={panel} className="mt-4 min-w-0 space-y-4 rounded-xl border bg-background p-3 text-sm leading-relaxed sm:p-5 [overflow-wrap:anywhere]" data-evaluation-panel aria-busy={busy || query.isFetching}>
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">{t('merchantUx.policyEvaluation.title')}</h3><p className="mt-1 text-muted-foreground">{t('merchantUx.policyEvaluation.scope')}</p></div><Button type="button" variant="outline" className="min-h-11 shrink-0" data-candidate-refresh disabled={busy || childLock || query.isFetching} onClick={() => void refresh()}>{t('merchantUx.policyEvaluation.refresh')}</Button></div>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {(query.isError || failure === 'refresh') && <p role="alert" data-candidate-error>{t('merchantUx.policyEvaluation.failed')}</p>}
    {failure === 'changed' && <p role="alert">{t('merchantUx.policyEvaluation.changed')}</p>}
    {uncertain && <div role="alert" className="space-y-2 rounded-lg border p-3" data-candidate-uncertain><p>{t('merchantUx.policyEvaluation.uncertain')}</p><Button type="button" className="min-h-11 h-auto whitespace-normal" data-candidate-retry disabled={busy || childLock || !active} onClick={() => void save('retry')}>{t('merchantUx.policyEvaluation.retry')}</Button></div>}
    {readable && <>
      {current ? <p data-candidate-ready>{t('merchantUx.policyEvaluation.prepared', { version: data!.latestCandidate!.version })}</p> : <p>{data!.latestCandidate ? t('merchantUx.policyEvaluation.stale') : t('merchantUx.policyEvaluation.prepareHint')}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-candidate-create disabled={!ready || !data!.canCreate} onClick={() => void save('candidate')}>{t('merchantUx.policyEvaluation.prepare')}</Button><Button type="button" className="min-h-11 h-auto whitespace-normal" data-evaluation-create disabled={!ready || !current || data!.evaluationRuns.some(row => row.state === 'running')} onClick={() => void save('run')}>{t('merchantUx.policyEvaluation.createRun')}</Button></div>
      <label className="block" htmlFor={`${id}-run`}>{t('merchantUx.policyEvaluation.chooseRun')}</label><select id={`${id}-run`} data-evaluation-select className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base" value={runId ?? ''} disabled={busy || childLock || uncertain || query.isFetching || !active} onChange={event => setRunId(event.target.value ? Number(event.target.value) : null)}><option value="">{t('merchantUx.policyEvaluation.none')}</option>{runId && !data!.evaluationRuns.some(row => row.runId === runId) && <option value={runId}>{t('merchantUx.policyEvaluation.run', { id: runId })}</option>}{data!.evaluationRuns.map(row => <option key={row.runId} value={row.runId}>{t('merchantUx.policyEvaluation.run', { id: row.runId })} · {row.provider === 'openai' ? 'OpenAI' : 'ZahyPi'} · {row.model}</option>)}</select>
    </>}
    <LearningPolicyRunArchive proposalId={proposalId} active={active && !busy && !childLock && !uncertain && !query.isFetching} onSelect={id => { setRunId(id); setJumpToRun(n => n + 1); }} />
    {runId && <LearningPolicyEvaluationRun key={runId} runId={runId} active={active && !busy && !protocolLock} onLock={lockChild} />}
    <SalesExperimentProtocol proposalId={proposalId} active={active && !busy && !runLock && !uncertain} onLock={lockProtocol} />
  </section>;
}
