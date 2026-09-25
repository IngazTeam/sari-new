import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { compatibleRun, definiteReviewError, evaluationCost } from '@/lib/learning-policy-evaluation-state';
import { LearningPolicyOutputReview } from './LearningPolicyOutputReview';

export function LearningPolicyEvaluationRun({ runId, active, onLock }: { runId: number; active: boolean; onLock: (locked: boolean) => void }) {
  const { t } = useTranslation();
  const query = trpc.sariBrain.getLearningPolicyEvaluation.useQuery({ runId }, { retry: false, refetchOnWindowFocus: false, staleTime: 0 });
  const advance = trpc.sariBrain.advanceLearningPolicyEvaluation.useMutation({ retry: false });
  const cancel = trpc.sariBrain.cancelLearningPolicyEvaluation.useMutation({ retry: false });
  const [busy, setBusy] = useState(false), [costConsent, setCostConsent] = useState(false), [cancelConsent, setCancelConsent] = useState(false);
  const [paused, setPaused] = useState(false), [reviewLock, setReviewLock] = useState(false), [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null);
  const stop = useRef(false), mounted = useRef(true), inFlight = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const visible = () => !!panel.current?.getClientRects().length && !panel.current.closest('details:not([open]), [hidden]');
  const pending = useRef<{ kind: 'advance'; input: { runId: number; expectedOrdinal: number } } | { kind: 'cancel'; input: { runId: number } } | null>(null);
  const data = query.data, readable = !!data && !query.isError && !query.isLoading, compatible = compatibleRun(data, runId);
  const uncertain = failure === 'unknown', ready = readable && compatible && active && !busy && !query.isFetching && !uncertain && failure !== 'changed' && failure !== 'refresh';
  const cost = data ? evaluationCost(data) : null;
  const last = data?.samples.filter(sample => sample.response).at(-1);
  const lockReview = useCallback((value: boolean) => setReviewLock(value), []);
  useEffect(() => { onLock(busy || uncertain || reviewLock); return () => onLock(false); }, [busy, uncertain, reviewLock, onLock]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => { if (!active) { stop.current = true; setPaused(true); setCostConsent(false); } }, [active]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') { stop.current = true; setPaused(true); setCostConsent(false); } };
    document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  useEffect(() => { setCostConsent(false); setCancelConsent(false); }, [runId, data?.state, query.isError]);
  useEffect(() => {
    if (!busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [busy, uncertain]);
  const statuses: Record<string, string> = { running: t('merchantUx.policyEvaluation.running'), completed: t('merchantUx.policyEvaluation.completed'), halted: t('merchantUx.policyEvaluation.halted'), cancelled: t('merchantUx.policyEvaluation.cancelled') };
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setCostConsent(false); setCancelConsent(false);
    try { const result = await query.refetch(); if (result.isError) throw Error(); if (!uncertain) setFailure(null); }
    catch { if (!uncertain) setFailure('refresh'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function act(kind: 'generate' | 'cancel' | 'retry') {
    if (inFlight.current || (kind === 'retry' ? !uncertain || !pending.current : !ready || data!.state !== 'running'
      || (kind === 'generate' ? !costConsent : !cancelConsent))) return;
    inFlight.current = true; stop.current = false; setBusy(true); setPaused(false); setCostConsent(false); setCancelConsent(false);
    try {
      if (kind === 'cancel') pending.current = { kind: 'cancel', input: { runId } };
      if (kind !== 'generate') {
        const work = pending.current!;
        if (work.kind === 'cancel') await cancel.mutateAsync(work.input); else await advance.mutateAsync(work.input);
        pending.current = null;
        if (mounted.current) { setFailure(null); const read = await query.refetch(); if (read.isError) throw Error('read'); }
      } else {
        let read = await query.refetch(); if (read.isError || !compatibleRun(read.data, runId)) throw Error('read');
        for (let count = 0; count < 64 && !stop.current && mounted.current && visible() && document.visibilityState !== 'hidden'; count++) {
          const current = read.data!; if (current.state !== 'running') break;
          const next = current.samples.find(sample => sample.state === 'dispatching') ?? current.samples.find(sample => sample.state === 'queued');
          if (!next) break;
          pending.current = { kind: 'advance', input: { runId, expectedOrdinal: next.ordinal } };
          const result = await advance.mutateAsync(pending.current.input);
          pending.current = null;
          if (!mounted.current) break;
          read = await query.refetch();
          if (read.isError || !compatibleRun(read.data, runId)) throw Error('read');
          // Do not run ahead of a stale read or another administrator's in-flight sample.
          if (result.completedSamples <= current.completedSamples || read.data!.completedSamples < result.completedSamples) break;
        }
        if (mounted.current) { setFailure(null); if (stop.current || !visible()) setPaused(true); }
      }
    } catch (error) {
      stop.current = true;
      if (mounted.current) {
        if (pending.current && !definiteReviewError(error)) setFailure('unknown');
        else { pending.current = null; setFailure(definiteReviewError(error) ? 'changed' : 'refresh'); }
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <section ref={panel} className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-5 [overflow-wrap:anywhere]" data-evaluation-run aria-busy={busy || query.isFetching}>
    <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="font-semibold text-lg">{t('merchantUx.policyEvaluation.run', { id: runId })}</h4><Button type="button" variant="outline" className="min-h-11" data-evaluation-refresh disabled={busy || query.isFetching} onClick={() => void refresh()}>{t('merchantUx.policyEvaluation.refresh')}</Button></div>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {(query.isError || failure === 'refresh') && <p role="alert" data-evaluation-error>{t('merchantUx.policyEvaluation.failed')}</p>}
    {failure === 'changed' && <p role="alert">{t('merchantUx.policyEvaluation.changed')}</p>}
    {uncertain && <div role="alert" className="space-y-2 rounded-lg border p-3" data-evaluation-uncertain><p>{t('merchantUx.policyEvaluation.uncertain')}</p><Button type="button" className="min-h-11 h-auto whitespace-normal" data-evaluation-retry disabled={busy || !active} onClick={() => void act('retry')}>{t('merchantUx.policyEvaluation.retry')}</Button></div>}
    {readable && <>
      {!compatible && <p role="alert">{t('merchantUx.policyEvaluation.unsupported')}</p>}
      <p className="font-medium" role="status" data-evaluation-state={data!.state}>{statuses[data!.state] || t('merchantUx.policyEvaluation.unsupported')}</p>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-muted-foreground">{t('merchantUx.policyEvaluation.provider')}</dt><dd dir="auto">{data!.provider === 'openai' ? 'OpenAI' : 'ZahyPi'}</dd></div><div><dt className="text-muted-foreground">{t('merchantUx.policyEvaluation.model')}</dt><dd dir="auto">{data!.observedModel || data!.model}</dd></div></dl>
      <div><label className="block" htmlFor={`evaluation-progress-${runId}`} data-evaluation-progress aria-live="polite">{t('merchantUx.policyEvaluation.progress', { completed: data!.completedSamples, total: 64 })}</label><progress id={`evaluation-progress-${runId}`} className="h-3 w-full" max={64} value={data!.completedSamples} /></div>
      {cost && <div className="space-y-1 rounded-lg bg-muted/50 p-3" data-evaluation-cost><p>{t('merchantUx.policyEvaluation.settled', { amount: cost.settled })}</p><p>{t('merchantUx.policyEvaluation.held', { amount: cost.held })}</p>{cost.incomplete && <p>{t('merchantUx.policyEvaluation.unavailable')}</p>}</div>}
      {data!.state === 'running' && <div className="space-y-3">
        {data!.samples.some(sample => sample.state === 'dispatching') && <p role="status">{t('merchantUx.policyEvaluation.waiting')}</p>}
        <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" data-evaluation-cost-consent checked={costConsent} disabled={!ready} onChange={event => setCostConsent(event.target.checked)} /><span>{t('merchantUx.policyEvaluation.costConsent')}</span></label>
        <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11 h-auto whitespace-normal" data-evaluation-generate disabled={!ready || !costConsent} onClick={() => void act('generate')}>{t('merchantUx.policyEvaluation.generate')}</Button>{busy && <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-evaluation-pause onClick={() => { stop.current = true; setPaused(true); }}>{t('merchantUx.policyEvaluation.pause')}</Button>}</div>
        {paused && <p role="status" data-evaluation-paused>{t('merchantUx.policyEvaluation.paused')}</p>}<p className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.pauseHint')}</p>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.policyEvaluation.cancel')}</summary><label className="my-2 flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" data-evaluation-cancel-consent checked={cancelConsent} disabled={!ready} onChange={event => setCancelConsent(event.target.checked)} /><span>{t('merchantUx.policyEvaluation.cancelConsent')}</span></label><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-evaluation-cancel disabled={!ready || !cancelConsent} onClick={() => void act('cancel')}>{t('merchantUx.policyEvaluation.cancel')}</Button></details>
      </div>}
      {last && <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.policyEvaluation.lastReply')}</summary><p dir="auto" className="whitespace-pre-wrap">{last.response}</p></details>}
    </>}
    {compatible && data!.state === 'completed' && <LearningPolicyOutputReview key={runId} runId={runId} active={active && readable && !busy && !query.isFetching} onLock={lockReview} />}
  </section>;
}
