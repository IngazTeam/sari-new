import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { supportedLearningPolicyReviewSuiteDigest } from '@/lib/learning-policy-review-version';

type Submission = inferRouterInputs<AppRouter>['sariBrain']['recordLearningPolicyReview'];
type CaseId = Submission['cases'][number]['caseId'];
type Answer = Omit<Submission['cases'][number], 'baselineVerdict' | 'candidateVerdict'> & { baselineVerdict: '' | 'pass' | 'fail'; candidateVerdict: '' | 'pass' | 'fail' };
const caseIds: CaseId[] = ['need', 'comparison', 'price', 'consent', 'refusal', 'truth', 'handoff', 'injection'];
const complete = (row: Answer) => !!row.baselineVerdict && !!row.candidateVerdict
  && row.baselineResponse.trim().length > 0 && row.baselineResponse.trim().length <= 2000
  && row.candidateResponse.trim().length > 0 && row.candidateResponse.trim().length <= 2000
  && row.reason.trim().length >= 20 && row.reason.trim().length <= 1000;

/** Mount only on demand, and preserve the in-page draft when the disclosure closes. */
export function LearningPolicyReview({ proposalId }: { proposalId: number }) {
  const { t } = useTranslation(), id = useId();
  const [opened, setOpened] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="mt-4 min-w-0 border-t pt-3">
    <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal text-start"
      aria-expanded={opened} aria-controls={id} data-policy-review-open onClick={() => { setMounted(true); setOpened(value => !value); }}>
      {opened ? t('merchantUx.policyReview.close') : t('merchantUx.policyReview.open')}
    </Button>
    <div id={id} hidden={!opened}>{mounted && <LearningPolicyReviewPanel key={proposalId} proposalId={proposalId} />}</div>
  </div>;
}

export function LearningPolicyReviewPanel({ proposalId }: { proposalId: number }) {
  const { t, i18n } = useTranslation(), formId = useId();
  const query = trpc.sariBrain.getLearningPolicyReview.useQuery({ proposalId }, { retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const mutation = trpc.sariBrain.recordLearningPolicyReview.useMutation({ retry: false });
  const [draft, setDraft] = useState<{ key: string; sourceDigest: string; suiteDigest: string; revision: number; cases: Answer[] } | null>(null);
  const [step, setStep] = useState(0), [attested, setAttested] = useState(false), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null);
  const [saved, setSaved] = useState<{ revision: number; outcome: 'passed' | 'failed' } | null>(null);
  const inFlight = useRef(false), submitted = useRef<Submission | null>(null);
  const caseHeading = useRef<HTMLHeadingElement>(null);
  const data = query.data, readable = !!data && !query.isError && !query.isLoading;
  const key = data ? `${proposalId}:${data.sourceDigest}:${data.suiteDigest}:${data.revision}` : '';
  const compatible = !!data && data.suite.version === 'sales-style-human-review.v1'
    && data.suiteDigest === supportedLearningPolicyReviewSuiteDigest
    && data.suite.cases.length === caseIds.length && data.suite.cases.every((row, index) => row.id === caseIds[index]);
  const changed = !!draft && (draft.key !== key || failure === 'changed');
  const uncertain = failure === 'unknown';
  const canStart = readable && data!.canReview && data!.eligible && compatible && !query.isFetching && !busy && !uncertain
    && (!saved || data!.revision >= saved.revision);
  const locked = !canStart || changed || !!submitted.current;
  const completed = draft?.cases.filter(complete).length || 0;
  const dirty = !!draft?.cases.some(row => row.baselineResponse || row.candidateResponse || row.reason || row.baselineVerdict || row.candidateVerdict);
  useEffect(() => {
    if (!dirty && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, uncertain]);
  useEffect(() => { setAttested(false); }, [key, query.isError, query.isFetching, data?.canReview]);
  useEffect(() => { if (draft) caseHeading.current?.focus(); }, [step, !!draft]);
  const copy: Record<CaseId, { title: string; scenario: string; criterion: string }> = {
    need: { title: t('merchantUx.policyReview.need'), scenario: t('merchantUx.policyReview.needScenario'), criterion: t('merchantUx.policyReview.needCriterion') },
    comparison: { title: t('merchantUx.policyReview.comparison'), scenario: t('merchantUx.policyReview.comparisonScenario'), criterion: t('merchantUx.policyReview.comparisonCriterion') },
    price: { title: t('merchantUx.policyReview.price'), scenario: t('merchantUx.policyReview.priceScenario'), criterion: t('merchantUx.policyReview.priceCriterion') },
    consent: { title: t('merchantUx.policyReview.consent'), scenario: t('merchantUx.policyReview.consentScenario'), criterion: t('merchantUx.policyReview.consentCriterion') },
    refusal: { title: t('merchantUx.policyReview.refusal'), scenario: t('merchantUx.policyReview.refusalScenario'), criterion: t('merchantUx.policyReview.refusalCriterion') },
    truth: { title: t('merchantUx.policyReview.truth'), scenario: t('merchantUx.policyReview.truthScenario'), criterion: t('merchantUx.policyReview.truthCriterion') },
    handoff: { title: t('merchantUx.policyReview.handoff'), scenario: t('merchantUx.policyReview.handoffScenario'), criterion: t('merchantUx.policyReview.handoffCriterion') },
    injection: { title: t('merchantUx.policyReview.injection'), scenario: t('merchantUx.policyReview.injectionScenario'), criterion: t('merchantUx.policyReview.injectionCriterion') },
  };
  const stages: Record<string, string> = { not_reviewed: t('merchantUx.policyReview.notReviewed'), stale: t('merchantUx.policyReview.stale'),
    offline_review_passed: t('merchantUx.policyReview.passed'), offline_review_failed: t('merchantUx.policyReview.failed') };
  const verdict = (value: string) => value === 'pass' ? t('merchantUx.policyReview.pass') : value === 'fail' ? t('merchantUx.policyReview.fail') : t('merchantUx.policyReview.unknown');
  const date = (value: unknown) => {
    const parsed = new Date(String(value));
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA' : 'en-GB',
      { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : t('merchantUx.policyReview.unknown');
  };
  function start() {
    if (!canStart || inFlight.current) return;
    submitted.current = null; setSaved(null); setFailure(null); setAttested(false); setStep(0);
    setDraft({ key, sourceDigest: data!.sourceDigest, suiteDigest: data!.suiteDigest, revision: data!.revision,
      cases: caseIds.map(caseId => ({ caseId, baselineResponse: '', candidateResponse: '', baselineVerdict: '', candidateVerdict: '', reason: '' })) });
  }
  function edit(field: keyof Omit<Answer, 'caseId'>, value: string) {
    if (locked) return;
    setAttested(false); setDraft(previous => previous ? { ...previous, cases: previous.cases.map((row, index) => index === step ? { ...row, [field]: value } as Answer : row) } : null);
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setAttested(false);
    try { const result = await query.refetch(); if (result.isError) throw Error('refresh'); if (failure === 'refresh') setFailure(null); }
    catch { if (!uncertain && failure !== 'changed') setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(retry = false) {
    if (inFlight.current) return;
    if (retry ? !uncertain || !submitted.current : locked || !draft || completed !== 8 || !attested) return;
    if (!retry) {
      try { submitted.current = { proposalId, requestId: crypto.randomUUID(), sourceDigest: draft!.sourceDigest,
        suiteDigest: draft!.suiteDigest, expectedRevision: draft!.revision, styleOnly: true,
        cases: draft!.cases.map(row => ({ ...row, baselineResponse: row.baselineResponse.trim(), candidateResponse: row.candidateResponse.trim(),
          reason: row.reason.trim(), baselineVerdict: row.baselineVerdict as 'pass' | 'fail', candidateVerdict: row.candidateVerdict as 'pass' | 'fail' })) }; }
      catch { setFailure('changed'); return; }
    }
    inFlight.current = true; setBusy(true); setAttested(false);
    let committed = false;
    try {
      const result = await mutation.mutateAsync(submitted.current!);
      setSaved({ revision: result.revision, outcome: result.outcome }); setDraft(null); submitted.current = null; setFailure(null); committed = true;
    } catch (error) {
      const code = (error as { data?: { code?: string } }).data?.code;
      if (['PRECONDITION_FAILED', 'FORBIDDEN', 'UNAUTHORIZED', 'BAD_REQUEST'].includes(code || '')) { submitted.current = null; setFailure('changed'); }
      else setFailure('unknown');
    } finally {
      try { const result = await query.refetch(); if (result.isError || (committed && !result.data)) throw Error('refresh'); }
      catch { if (committed) setFailure('refresh'); }
      inFlight.current = false; setBusy(false);
    }
  }
  const row = draft?.cases[step], currentCopy = row ? copy[row.caseId] : null;
  return <section className="mt-4 min-w-0 space-y-4 rounded-xl border bg-background p-3 text-sm leading-relaxed sm:p-5" data-policy-review aria-busy={busy || query.isFetching}>
    <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
      <div className="min-w-0 w-full flex-1 sm:w-auto" data-policy-intro><h3 className="font-semibold text-base">{t('merchantUx.policyReview.title', { id: proposalId })}</h3>
        <p className="mt-1 text-muted-foreground">{t('merchantUx.policyReview.scope')}</p></div>
      <Button type="button" variant="outline" className="min-h-11 w-full shrink-0 sm:w-auto" disabled={busy || query.isFetching} onClick={() => void refresh()} data-policy-refresh>{t('merchantUx.policyReview.refresh')}</Button>
    </div>
    {query.isLoading && <p role="status">{t('merchantUx.policyReview.loading')}</p>}
    {(query.isError || failure === 'refresh') && <p role="alert" data-policy-error>{t('merchantUx.policyReview.loadFailed')}</p>}
    {saved && <p role="status" data-policy-saved className="rounded-lg border p-3">{t('merchantUx.policyReview.saved', { revision: saved.revision })} {saved.outcome === 'passed' ? t('merchantUx.policyReview.passed') : t('merchantUx.policyReview.failed')}</p>}
    {uncertain && <div role="alert" className="space-y-2 rounded-lg border p-3" data-policy-uncertain>
      <p>{t('merchantUx.policyReview.uncertain')}</p><Button type="button" className="min-h-11 h-auto whitespace-normal" disabled={busy} onClick={() => void save(true)} data-policy-retry>{t('merchantUx.policyReview.retrySame')}</Button>
    </div>}
    {readable && <>
      <div className="space-y-2 rounded-lg bg-muted/50 p-3">
        <p role="status" data-policy-stage={data!.stage} className="font-medium">{stages[data!.stage] || t('merchantUx.policyReview.unknown')}</p>
        <p dir="auto" className="whitespace-pre-wrap break-words" data-policy-insight>{data!.proposal.insight}</p>
        <p className="text-xs text-muted-foreground">{t('merchantUx.policyReview.evidenceCount', { conversations: data!.independentConversations, links: data!.evidenceLinks })}</p>
      </div>
      <details className="rounded-lg border p-3" data-policy-evidence>
        <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2">{t('merchantUx.policyReview.evidence')}</summary>
        <p className="my-2 text-xs text-muted-foreground">{t('merchantUx.policyReview.evidencePreview', { shown: data!.evidencePreview.length, total: data!.evidenceLinks })}</p>
        {data!.evidencePreview.map(item => <blockquote key={item.signalId} className="my-3 border-s-2 ps-3">
          <p className="text-xs text-muted-foreground">#{item.signalId} · {item.relation === 'supporting' ? t('merchantUx.learningEvidence.supporting') : item.relation === 'contrary' ? t('merchantUx.learningEvidence.contrary') : t('merchantUx.learningEvidence.observed')}</p>
          <p dir="auto" className="whitespace-pre-wrap break-words">{item.excerpt}</p>
        </blockquote>)}
      </details>
      {!data!.canReview && <p data-policy-readonly>{t('merchantUx.policyReview.readOnly')}</p>}
      {!data!.eligible && <p data-policy-ineligible>{t('merchantUx.policyReview.ineligible')}</p>}
      {!compatible && <p role="alert">{t('merchantUx.policyReview.unsupported')}</p>}
      {changed && <p role="alert" data-policy-changed>{t('merchantUx.policyReview.changed')}</p>}
      {!draft && data!.canReview && <Button type="button" className="min-h-11" disabled={!canStart} onClick={start} data-policy-start>{t('merchantUx.policyReview.start')}</Button>}
      {changed && !uncertain && data!.canReview && <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={!canStart} onClick={start} data-policy-restart>{t('merchantUx.policyReview.restart')}</Button>}
      {draft && row && currentCopy && <div className="space-y-4" data-policy-editor>
        <p className="text-muted-foreground">{t('merchantUx.policyReview.draftHint')}</p>
        <p aria-live="polite" data-policy-progress>{t('merchantUx.policyReview.progress', { completed, total: 8 })}</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="group" aria-label={t('merchantUx.policyReview.cases')}>
          {draft.cases.map((item, index) => <Button key={item.caseId} type="button" variant={index === step ? 'default' : 'outline'} className="min-h-11 px-2"
            aria-current={index === step ? 'step' : undefined} aria-label={t('merchantUx.policyReview.caseNavigation', { number: index + 1, name: copy[item.caseId].title })}
            onClick={() => setStep(index)} data-policy-step={index}>{index + 1}{complete(item) ? ' ✓' : ''}</Button>)}
        </div>
        <div className="rounded-lg border p-3" data-policy-scenario><h4 ref={caseHeading} tabIndex={-1} className="font-semibold focus-visible:outline focus-visible:outline-2">{step + 1}. {currentCopy.title}</h4>
          <p className="mt-2">{currentCopy.scenario}</p><p className="mt-2 text-muted-foreground">{currentCopy.criterion}</p></div>
        <fieldset disabled={locked || busy} className="min-w-0 space-y-4" data-policy-fields>
          <legend className="sr-only">{currentCopy.title}</legend>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {(['baseline', 'candidate'] as const).map(kind => <div className="min-w-0 space-y-2" key={kind}>
              <label htmlFor={`${formId}-${kind}`}>{kind === 'baseline' ? t('merchantUx.policyReview.baseline') : t('merchantUx.policyReview.candidate')}</label>
              <textarea dir="auto" id={`${formId}-${kind}`} data-policy-response={kind} className="block min-h-32 w-full min-w-0 rounded-md border bg-background p-3 text-base" maxLength={2000} rows={5}
                value={row[`${kind}Response`]} onChange={event => edit(`${kind}Response`, event.target.value)} />
              <label htmlFor={`${formId}-${kind}-verdict`} className="block">{kind === 'baseline' ? t('merchantUx.policyReview.baselineVerdict') : t('merchantUx.policyReview.candidateVerdict')}</label>
              <select id={`${formId}-${kind}-verdict`} data-policy-verdict={kind} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base"
                value={row[`${kind}Verdict`]} onChange={event => edit(`${kind}Verdict`, event.target.value)}>
                <option value="">{t('merchantUx.policyReview.choose')}</option><option value="pass">{t('merchantUx.policyReview.pass')}</option><option value="fail">{t('merchantUx.policyReview.fail')}</option>
              </select>
            </div>)}
          </div>
          <div className="space-y-2"><label htmlFor={`${formId}-reason`}>{t('merchantUx.policyReview.reason')}</label>
            <textarea dir="auto" id={`${formId}-reason`} data-policy-reason className="block min-h-24 w-full rounded-md border bg-background p-3 text-base" rows={3} minLength={20} maxLength={1000}
              aria-describedby={`${formId}-reason-hint`} value={row.reason} onChange={event => edit('reason', event.target.value)} />
            <p id={`${formId}-reason-hint`} className="text-xs text-muted-foreground">{t('merchantUx.policyReview.reasonHint')}</p>
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={step === 0} onClick={() => setStep(value => value - 1)}>{t('merchantUx.policyReview.previous')}</Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={step === 7} data-policy-next onClick={() => setStep(value => value + 1)}>{t('merchantUx.policyReview.next')}</Button></div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" data-policy-attestation disabled={locked || busy || completed !== 8}
            checked={attested} onChange={event => setAttested(event.target.checked)} /><span>{t('merchantUx.policyReview.attestation')}</span>
        </label>
        <Button type="button" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" disabled={locked || busy || completed !== 8 || !attested} onClick={() => void save()} data-policy-save>
          {busy ? t('merchantUx.policyReview.saving') : t('merchantUx.policyReview.save')}
        </Button>
      </div>}
      {!!data!.history.length && <details className="rounded-lg border p-3" data-policy-history>
        <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2">{t('merchantUx.policyReview.history')}</summary>
        <p className="my-2 text-xs text-muted-foreground">{t('merchantUx.policyReview.historyScope')}</p>
        <ol className="space-y-3">{data!.history.map(item => <li key={item.id} className="rounded-lg bg-muted/50 p-3">
          <p>{t('merchantUx.policyReview.revision', { revision: item.revision })} · {item.outcome === 'passed' ? t('merchantUx.policyReview.passed') : t('merchantUx.policyReview.failed')}</p>
          <p className="text-xs text-muted-foreground">{date(item.createdAt)} · {item.actorUserId ? t('merchantUx.policyReview.reviewer', { id: item.actorUserId }) : t('merchantUx.policyReview.removedReviewer')} · {item.current ? t('merchantUx.policyReview.current') : t('merchantUx.policyReview.historical')}</p>
          <p className="text-xs">{t('merchantUx.policyReview.result', { passed: item.passedCases, total: item.totalCases, regressions: item.regressions })}</p>
        </li>)}</ol>
      </details>}
      {data!.latestReview && <details className="rounded-lg border p-3" data-policy-audit>
        <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline focus-visible:outline-2">{t('merchantUx.policyReview.latest')}</summary>
        <p dir="auto" className="my-3 whitespace-pre-wrap break-words">{String(data!.latestReview.proposal?.insight || '')}</p>
        {Array.isArray(data!.latestReview.assessmentDetail?.cases) && data!.latestReview.assessmentDetail.cases.map((item: any, index: number) => <details key={index} className="my-2 rounded-lg border p-3">
          <summary className="min-h-11 cursor-pointer py-2">{copy[item.caseId as CaseId]?.title || String(item.caseId)}</summary>
          <dl className="grid min-w-0 gap-3 lg:grid-cols-2">
            <div className="min-w-0"><dt className="font-medium">{t('merchantUx.policyReview.baseline')} · {verdict(item.baselineVerdict)}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{String(item.baselineResponse || '')}</dd></div>
            <div className="min-w-0"><dt className="font-medium">{t('merchantUx.policyReview.candidate')} · {verdict(item.candidateVerdict)}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{String(item.candidateResponse || '')}</dd></div>
            <div className="min-w-0 lg:col-span-2"><dt className="font-medium">{t('merchantUx.policyReview.reason')}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{String(item.reason || '')}</dd></div>
          </dl>
        </details>)}
      </details>}
    </>}
  </section>;
}
