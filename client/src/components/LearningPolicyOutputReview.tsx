import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { compatiblePacket, completeOutputAnswer, definiteReviewError, validPreference, type Packet, type ReviewAnswer, type ReviewSubmission } from '@/lib/learning-policy-evaluation-state';

export function LearningPolicyOutputReview({ runId, onLock, active = true }: { runId: number; onLock: (locked: boolean) => void; active?: boolean }) {
  const { t, i18n } = useTranslation(), formId = useId();
  const query = trpc.sariBrain.getLearningPolicyOutputReview.useQuery({ runId }, { retry: false, refetchOnWindowFocus: false, staleTime: 0 });
  const mutation = trpc.sariBrain.recordLearningPolicyOutputReview.useMutation({ retry: false });
  const [draft, setDraft] = useState<{ key: string; packet: Packet; cases: ReviewAnswer[] } | null>(null);
  const [step, setStep] = useState(0), [attested, setAttested] = useState(false), [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), [saved, setSaved] = useState<number | null>(null);
  const submitted = useRef<ReviewSubmission | null>(null), inFlight = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const data = query.data, readable = !!data && !query.isError && !query.isLoading;
  const compatible = compatiblePacket(data, runId), key = data ? `${runId}:${data.runDigest}:${data.rubricDigest}:${data.expectedRevision}` : '';
  const changed = !!draft && (draft.key !== key || failure === 'changed' || !data?.canReview);
  const uncertain = failure === 'unknown';
  const ready = active && readable && compatible && data!.canReview && !query.isFetching && !busy && !uncertain && (!saved || data!.expectedRevision >= saved);
  const locked = !ready || changed || !!submitted.current;
  const completed = draft?.cases.filter((row, i) => completeOutputAnswer(row, draft.packet.pairs[i])).length ?? 0;
  useEffect(() => { onLock(!!draft || busy || uncertain); return () => onLock(false); }, [!!draft, busy, uncertain, onLock]);
  useEffect(() => {
    if (!draft && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [!!draft, uncertain]);
  useEffect(() => { setAttested(false); setDiscard(false); }, [key, query.isFetching, query.isError, data?.canReview, active]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [step, !!draft]);
  const outcomes = { passed: t('merchantUx.policyEvaluation.passed'), failed: t('merchantUx.policyEvaluation.rejected'), inconclusive: t('merchantUx.policyEvaluation.inconclusive') };
  const reviewedAt = (value: unknown) => { const date = new Date(String(value)); return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : t('merchantUx.policyReview.unknown'); };
  const sectors: Record<string, string> = { general: t('merchantUx.policyEvaluation.general'), training: t('merchantUx.policyEvaluation.training'), recruitment: t('merchantUx.policyEvaluation.recruitment'), store: t('merchantUx.policyEvaluation.store') };
  const names: Record<string, string> = { need: t('merchantUx.policyReview.need'), comparison: t('merchantUx.policyReview.comparison'), price: t('merchantUx.policyReview.price'), consent: t('merchantUx.policyReview.consent'), refusal: t('merchantUx.policyReview.refusal'), truth: t('merchantUx.policyReview.truth'), handoff: t('merchantUx.policyReview.handoff'), injection: t('merchantUx.policyReview.injection') };
  function start() {
    if (!ready || inFlight.current || draft) return;
    setSaved(null); setFailure(null); setStep(0); setAttested(false);
    setDraft({ key, packet: structuredClone(data!), cases: data!.pairs.map(pair => ({ caseId: pair.caseId,
      baseline: { verdict: '', quote: '', reason: '' }, candidate: { verdict: '', quote: '', reason: '' }, preference: '' })) });
  }
  function edit(arm: 'baseline' | 'candidate' | 'preference', field: string, value: string) {
    if (locked) return;
    setAttested(false); setDiscard(false);
    setDraft(old => old ? { ...old, cases: old.cases.map((row, i) => i !== step ? row : arm === 'preference'
      ? { ...row, preference: value as ReviewAnswer['preference'] } : { ...row, [arm]: { ...row[arm], [field]: value } }) } : null);
  }
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setAttested(false);
    try { const result = await query.refetch(); if (result.isError) throw Error(); if (failure === 'refresh') setFailure(null); }
    catch { if (!uncertain && failure !== 'changed') setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(retry = false) {
    if (inFlight.current || (retry ? !uncertain || !submitted.current : locked || !draft || completed !== 32 || !attested)) return;
    if (!retry) submitted.current = { runId, requestId: crypto.randomUUID(), runDigest: draft!.packet.runDigest!, rubricDigest: draft!.packet.rubricDigest,
      expectedRevision: draft!.packet.expectedRevision, reviewedAllOutputs: true,
      cases: draft!.cases.map(row => ({ caseId: row.caseId, preference: row.preference as 'baseline' | 'candidate' | 'tie',
        baseline: { verdict: row.baseline.verdict as 'pass' | 'fail', quote: row.baseline.quote.trim(), reason: row.baseline.reason.trim() },
        candidate: { verdict: row.candidate.verdict as 'pass' | 'fail', quote: row.candidate.quote.trim(), reason: row.candidate.reason.trim() } })) };
    inFlight.current = true; setBusy(true); setAttested(false); let committed = false;
    try { const result = await mutation.mutateAsync(submitted.current!); committed = true; setSaved(result.revision); setDraft(null); submitted.current = null; setFailure(null); }
    catch (error) { if (definiteReviewError(error)) { submitted.current = null; setFailure('changed'); } else setFailure('unknown'); }
    finally {
      try { const result = await query.refetch(); if (result.isError) throw Error(); } catch { if (committed) setFailure('refresh'); }
      inFlight.current = false; setBusy(false);
    }
  }
  const row = draft?.cases[step], pair = draft?.packet.pairs[step];
  const verdict = (value: string) => value === 'pass' ? t('merchantUx.policyEvaluation.pass') : t('merchantUx.policyEvaluation.fail');
  return <section className="min-w-0 space-y-4 border-t pt-5 [overflow-wrap:anywhere]" data-output-review aria-busy={busy || query.isFetching}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><h4 className="font-semibold text-lg">{t('merchantUx.policyEvaluation.reviewTitle')}</h4><p className="mt-1 text-muted-foreground">{t('merchantUx.policyEvaluation.reviewScope')}</p></div>
      <Button type="button" variant="outline" className="min-h-11 shrink-0" data-output-refresh disabled={busy || query.isFetching} onClick={() => void refresh()}>{t('merchantUx.policyEvaluation.refresh')}</Button></div>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {(query.isError || failure === 'refresh') && <p role="alert" data-output-error>{t('merchantUx.policyEvaluation.failed')}</p>}
    {saved && <p role="status" data-output-saved>{t('merchantUx.policyEvaluation.saved', { revision: saved })}</p>}
    {uncertain && <div role="alert" data-output-uncertain className="space-y-2 rounded-lg border p-3"><p>{t('merchantUx.policyEvaluation.uncertain')}</p><Button type="button" className="min-h-11 h-auto whitespace-normal" data-output-retry disabled={busy} onClick={() => void save(true)}>{t('merchantUx.policyEvaluation.retry')}</Button></div>}
    {readable && <>
      {!compatible && <p role="alert">{t('merchantUx.policyEvaluation.unsupported')}</p>}
      {!data!.canReview && <p data-output-stale>{t('merchantUx.policyEvaluation.stale')}</p>}
      <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.policyEvaluation.rules')}</summary><div className="space-y-2"><p>{t('merchantUx.policyEvaluation.gate')}</p><p>{t('merchantUx.policyEvaluation.preferenceRule')}</p><p>{t('merchantUx.policyEvaluation.acceptance')}</p></div></details>
      {!draft && <Button type="button" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" data-output-start disabled={!ready} onClick={start}>{data!.latestReview ? t('merchantUx.policyEvaluation.resumeReview') : t('merchantUx.policyEvaluation.startReview')}</Button>}
      {changed && <p role="alert" data-output-changed>{t('merchantUx.policyEvaluation.sourceChanged')}</p>}
      {draft && row && pair && <div className="space-y-4" data-output-editor>
        <p className="text-muted-foreground">{t('merchantUx.policyEvaluation.draftHint')}</p>
        <p aria-live="polite" data-output-progress>{t('merchantUx.policyEvaluation.progressReview', { completed, total: 32 })}</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="group" aria-label={t('merchantUx.policyReview.cases')}>{draft.cases.map((item, i) => <Button key={item.caseId} type="button" className="min-h-11 px-2" variant={i === step ? 'default' : 'outline'} data-output-step={i} aria-current={i === step ? 'step' : undefined} aria-label={t('merchantUx.policyEvaluation.caseNavigation', { number: i + 1 })} onClick={() => setStep(i)}>{i + 1}{completeOutputAnswer(item, draft.packet.pairs[i]) ? ' ✓' : ''}</Button>)}</div>
        <div className="space-y-2 rounded-lg bg-muted/50 p-3"><p>{t('merchantUx.policyEvaluation.position', { current: step + 1, total: 32 })}</p><h5 ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline focus-visible:outline-2">{sectors[pair.sector]} · {names[pair.caseId.split(':')[1]]}</h5><p dir="auto">{pair.criterion}</p><p dir="auto" className="whitespace-pre-wrap">{pair.userPrompt}</p></div>
        <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.policyEvaluation.context')}</summary><p dir="auto" className="whitespace-pre-wrap">{pair.systemPrompt}</p><h6 className="mt-3 font-semibold">{t('merchantUx.policyEvaluation.instruction')}</h6><p dir="auto" className="whitespace-pre-wrap">{pair.candidateStyleInstruction}</p></details>
        <fieldset disabled={locked || busy} className="min-w-0 space-y-4" data-output-fields><legend className="sr-only">{t('merchantUx.policyEvaluation.reviewTitle')}</legend>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">{(['baseline','candidate'] as const).map(arm => <div className="min-w-0 space-y-3 rounded-lg border p-3" key={arm}>
            <h6 className="font-semibold">{arm === 'baseline' ? t('merchantUx.policyEvaluation.baseline') : t('merchantUx.policyEvaluation.candidate')}</h6>
            <blockquote dir="auto" className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-base" data-output-response={arm}>{pair[arm].response}</blockquote>
            <label className="block" htmlFor={`${formId}-${arm}-verdict`}>{arm === 'baseline' ? t('merchantUx.policyReview.baselineVerdict') : t('merchantUx.policyReview.candidateVerdict')}</label>
            <select id={`${formId}-${arm}-verdict`} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base" data-output-verdict={arm} value={row[arm].verdict} onChange={event => edit(arm,'verdict',event.target.value)}><option value="">{t('merchantUx.policyEvaluation.choose')}</option><option value="pass">{t('merchantUx.policyEvaluation.pass')}</option><option value="fail">{t('merchantUx.policyEvaluation.fail')}</option></select>
            <label className="block" htmlFor={`${formId}-${arm}-quote`}>{t('merchantUx.policyEvaluation.quote')}</label><textarea id={`${formId}-${arm}-quote`} dir="auto" rows={2} maxLength={500} data-output-quote={arm} aria-describedby={`${formId}-${arm}-quote-hint`} className="block w-full min-w-0 rounded-md border bg-background p-3 text-base" value={row[arm].quote} onChange={event => edit(arm,'quote',event.target.value)} />
            <p id={`${formId}-${arm}-quote-hint`} className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.quoteHint')}</p>
            {!!row[arm].quote && !pair[arm].response.includes(row[arm].quote.trim()) && <p role="alert">{t('merchantUx.policyEvaluation.quoteInvalid')}</p>}
            <label className="block" htmlFor={`${formId}-${arm}-reason`}>{t('merchantUx.policyEvaluation.reason')}</label><textarea id={`${formId}-${arm}-reason`} dir="auto" rows={3} minLength={20} maxLength={1500} data-output-reason={arm} aria-describedby={`${formId}-${arm}-reason-hint`} className="block w-full min-w-0 rounded-md border bg-background p-3 text-base" value={row[arm].reason} onChange={event => edit(arm,'reason',event.target.value)} /><p id={`${formId}-${arm}-reason-hint`} className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.reasonHint')}</p>
          </div>)}</div>
          <label className="block" htmlFor={`${formId}-preference`}>{t('merchantUx.policyEvaluation.preference')}</label><select id={`${formId}-preference`} className="min-h-11 w-full rounded-md border bg-background px-3 text-base" data-output-preference value={row.preference} onChange={event => edit('preference','',event.target.value)}><option value="">{t('merchantUx.policyEvaluation.choose')}</option><option value="baseline">{t('merchantUx.policyEvaluation.preferBaseline')}</option><option value="candidate">{t('merchantUx.policyEvaluation.preferCandidate')}</option><option value="tie">{t('merchantUx.policyEvaluation.tie')}</option></select>
          {!!row.preference && !!row.baseline.verdict && !!row.candidate.verdict && !validPreference(row) && <p role="alert">{t('merchantUx.policyEvaluation.preferenceInvalid')}</p>}
        </fieldset>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={step === 0} onClick={() => setStep(n => n - 1)}>{t('merchantUx.policyEvaluation.previous')}</Button><Button type="button" variant="outline" className="min-h-11" disabled={step === 31} data-output-next onClick={() => setStep(n => n + 1)}>{t('merchantUx.policyEvaluation.next')}</Button></div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" data-output-attestation disabled={locked || busy || completed !== 32} checked={attested} onChange={event => setAttested(event.target.checked)} /><span>{t('merchantUx.policyEvaluation.attestation')}</span></label>
        <Button type="button" className="min-h-11 h-auto w-full whitespace-normal sm:w-auto" data-output-save disabled={locked || busy || completed !== 32 || !attested} onClick={() => void save()}>{busy ? t('merchantUx.policyEvaluation.busy') : t('merchantUx.policyEvaluation.save')}</Button>
        {!uncertain && <div className="space-y-2"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" data-output-discard-consent disabled={busy} checked={discard} onChange={event => setDiscard(event.target.checked)} /><span>{t('merchantUx.policyEvaluation.discardConsent')}</span></label><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-output-discard disabled={!discard || busy} onClick={() => { setDraft(null); setDiscard(false); submitted.current = null; setFailure(null); }}>{t('merchantUx.policyEvaluation.discard')}</Button></div>}
      </div>}
      {!!data!.history.length && <details className="rounded-lg border p-3" data-output-history><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.policyEvaluation.history')}</summary>{data!.history.map(item => <div key={item.id} className="my-3 space-y-1 border-t pt-3"><p>{t('merchantUx.policyReview.revision', { revision: item.revision })} · {outcomes[item.outcome]}</p><p>{item.current ? t('merchantUx.policyEvaluation.current') : t('merchantUx.policyEvaluation.historical')}</p><p className="text-xs text-muted-foreground">{reviewedAt(item.createdAt)} · {item.actorUserId ? t('merchantUx.policyReview.reviewer', { id: item.actorUserId }) : t('merchantUx.policyReview.removedReviewer')}</p><p>{t('merchantUx.policyEvaluation.results', { passed: item.candidatePassed, total: item.totalCases, regressions: item.regressions })}</p><p>{t('merchantUx.policyEvaluation.preferences', { candidate: item.candidateWins, baseline: item.baselineWins, ties: item.ties })}</p></div>)}</details>}
      {data!.latestReview && <details className="rounded-lg border p-3" data-output-audit><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.policyEvaluation.latest')}</summary>{data!.latestReview.review.cases.map((item: any) => <details className="my-2 rounded-md border p-3" key={item.caseId}><summary className="min-h-11 cursor-pointer py-2">{sectors[String(item.caseId).split(':')[0]]} · {names[String(item.caseId).split(':')[1]]}</summary>{(['baseline','candidate'] as const).map(arm => <div key={arm} className="my-2"><p className="font-semibold">{arm === 'baseline' ? t('merchantUx.policyEvaluation.baseline') : t('merchantUx.policyEvaluation.candidate')} · {verdict(item[arm].verdict)}</p><blockquote dir="auto" className="whitespace-pre-wrap">{String(item[arm].quote)}</blockquote><p dir="auto" className="whitespace-pre-wrap">{String(item[arm].reason)}</p></div>)}</details>)}</details>}
    </>}
    <p className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.noActivation')}</p>
  </section>;
}
