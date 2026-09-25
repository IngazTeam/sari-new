import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { ProtocolDesignSummary } from './SalesExperimentDesign';
import { RulesSummary } from './SalesCohortQualification';
import { definiteReviewError } from '@/lib/learning-policy-evaluation-state';
import type { ProtocolRecord } from '@/lib/sales-experiment-form';
import { compatibleReviewWorkspace, compatiblePlanningHistory, emptyReviewAssessment, matchingPlanningReceipt, reviewFields,
  validReviewAssessment, type ReviewWorkspace, type ReviewAssessment, type PlanningReviewReceipt } from '@/lib/sales-experiment-review';
import { recordSalesExperimentReviewInput, type RecordSalesExperimentReviewInput } from '../../../shared/sales-experiment-review';

const options = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
type Draft = { packet: ReviewWorkspace; assessment: ReviewAssessment; verdict: '' | 'approved' | 'rejected'; seen: string[] };
export function SalesExperimentReview({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-4"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-open aria-expanded={open} aria-controls={id}
    onClick={() => { setMounted(true); setOpen(value => !value); }}>{open ? t('merchantUx.experimentReview.close') : t('merchantUx.experimentReview.open')}</Button>
    <div id={id} hidden={!open}>{mounted && <ReviewPanel record={record} active={active && open} onLock={onLock} />}</div></div>;
}
function ReviewPanel({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const query = trpc.sariBrain.getSalesExperimentReviewWorkspace.useQuery({ protocolId: record.protocolId }, { ...options, enabled: active });
  const history = trpc.sariBrain.getSalesExperimentReviewHistory.useQuery({ protocolId: record.protocolId, beforeId: cursors.at(-1), limit: 20 }, { ...options, enabled: active });
  const mutation = trpc.sariBrain.recordSalesExperimentReview.useMutation({ retry: false });
  const [draft, setDraft] = useState<Draft | null>(null), [step, setStep] = useState(0), [pairIndex, setPairIndex] = useState(0);
  const [consents, setConsents] = useState([false, false]), [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), [saved, setSaved] = useState<PlanningReviewReceipt | null>(null);
  const pending = useRef<{ packet: ReviewWorkspace; input: RecordSalesExperimentReviewInput } | null>(null), inFlight = useRef(false);
  const readable = !query.isLoading && !query.isError && compatibleReviewWorkspace(query.data, record), packet = readable ? query.data! : null;
  const historyReadable = !history.isLoading && !history.isError && compatiblePlanningHistory(history.data, record, cursors.at(-1));
  const uncertain = failure === 'unknown', fetching = query.isFetching || history.isFetching;
  const changed = !!draft && (!packet || !packet.canReview || draft.packet.basisDigest !== packet.basisDigest
    || draft.packet.expectedRevision !== packet.expectedRevision || draft.packet.reviewerUserId !== packet.reviewerUserId);
  const editable = active && !!packet?.canReview && !fetching && !busy && !failure && !changed;
  const locked = !!draft || busy || uncertain;
  const labels = { baselineAndSample: t('merchantUx.experimentReview.baselineAndSample'), recruitmentFeasibility: t('merchantUx.experimentReview.recruitmentFeasibility'),
    qualificationMapping: t('merchantUx.experimentReview.qualificationMapping'), safetyAndMeasurement: t('merchantUx.experimentReview.safetyAndMeasurement') };
  const hints = { baselineAndSample: t('merchantUx.experimentReview.baselineHint'), recruitmentFeasibility: t('merchantUx.experimentReview.recruitmentHint'),
    qualificationMapping: t('merchantUx.experimentReview.qualificationHint'), safetyAndMeasurement: t('merchantUx.experimentReview.safetyHint') };
  const steps = [t('merchantUx.experimentReview.evidenceStep'), t('merchantUx.experimentReview.outputsStep'), t('merchantUx.experimentReview.decisionStep')];
  useEffect(() => { onLock(locked); return () => onLock(false); }, [locked, onLock]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [step, !!draft]);
  useEffect(() => { setConsents([false, false]); }, [active, readable, packet?.basisDigest, packet?.expectedRevision, packet?.canReview]);
  useEffect(() => { if (!locked) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [locked]);
  async function reload() {
    const [w, h] = await Promise.all([query.refetch(), history.refetch()]);
    if (w.isError || !compatibleReviewWorkspace(w.data, record) || h.isError || !compatiblePlanningHistory(h.data, record, cursors.at(-1))) throw Error('Unavailable');
  }
  async function refresh() {
    if (inFlight.current || !active) return; inFlight.current = true; setBusy(true); setConsents([false, false]);
    try { await reload(); if (!uncertain) setFailure(null); } catch { if (!uncertain && !draft) setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(retry = false) {
    if (inFlight.current || !active || (retry ? !uncertain || !pending.current : !editable || !draft || draft.seen.length !== 32
      || !validReviewAssessment(draft.assessment) || !draft.verdict || !consents.every(Boolean))) return;
    if (!retry) pending.current = { packet: structuredClone(draft!.packet), input: recordSalesExperimentReviewInput.parse({
      protocolId: record.protocolId, runId: draft!.packet.basis.runId, basisDigest: draft!.packet.basisDigest, expectedRevision: draft!.packet.expectedRevision,
      requestId: crypto.randomUUID(), verdict: draft!.verdict, assessment: draft!.assessment, reviewedFrozenDesignAndOutputs: true, understandsNoActivation: true }) };
    inFlight.current = true; setBusy(true); setConsents([false, false]); let committed = false;
    try {
      const request = pending.current!, result = await mutation.mutateAsync(request.input);
      if (!matchingPlanningReceipt(result, request.packet, request.input)) throw Error('Mismatched receipt');
      committed = true; setSaved(result); setDraft(null); setDiscard(false); setFailure(null); pending.current = null; setCursors([undefined]);
    } catch (error) { if (definiteReviewError(error)) { pending.current = null; setFailure('changed'); } else setFailure('unknown'); }
    finally { try { await reload(); } catch { if (committed) setFailure('refresh'); } inFlight.current = false; setBusy(false); }
  }
  const navigate = (next: Array<number | undefined>) => { if (active && !locked && !fetching) setCursors(next); };
  return <section data-plan-review-panel className="mt-4 min-w-0 space-y-4 rounded-lg border bg-background p-3 sm:p-5 [overflow-wrap:anywhere]" aria-busy={busy || fetching}>
    <h5 className="text-lg font-semibold">{t('merchantUx.experimentReview.title')}</h5><p>{t('merchantUx.experimentReview.scope')}</p>
    <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-refresh disabled={!active || busy || fetching} onClick={() => void refresh()}>{t('merchantUx.experimentReview.refresh')}</Button>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {!query.isLoading && !readable && <p role="alert" data-plan-review-unavailable>{t('merchantUx.experimentReview.unavailable')}</p>}
    {(changed || failure === 'changed') && <p role="alert" data-plan-review-changed>{t('merchantUx.experimentReview.changed')}</p>}
    {failure === 'refresh' && saved && <p role="alert" data-plan-review-refresh-error>{t('merchantUx.experimentReview.refreshFailed')}</p>}
    {packet && !packet.canReview && <p role="status" data-plan-review-self>{t('merchantUx.experimentReview.self')}</p>}
    {packet && <p data-plan-review-status>{packet.stage === 'approved' ? t('merchantUx.experimentReview.approved') : packet.stage === 'rejected' ? t('merchantUx.experimentReview.rejected')
      : packet.stage === 'review_stale' ? t('merchantUx.experimentReview.stale') : t('merchantUx.experimentReview.notReviewed')}</p>}
    {uncertain && <div role="alert" data-plan-review-unknown className="space-y-3"><p>{t('merchantUx.experimentReview.unknown')}</p><Button type="button" className="h-auto min-h-11 whitespace-normal" data-plan-review-retry disabled={!active || busy} onClick={() => void save(true)}>{t('merchantUx.experimentReview.retry')}</Button></div>}
    {saved && <div data-plan-review-saved className="space-y-3"><p role="status">{t('merchantUx.experimentReview.saved', { revision: saved.snapshot.revision })}</p><ReviewDecision record={saved} /></div>}
    {!draft && packet && <Button type="button" className="h-auto min-h-11 whitespace-normal" data-plan-review-start disabled={!editable || cursors.length !== 1} onClick={() => {
      if (!editable) return; setDraft({ packet: structuredClone(packet), assessment: emptyReviewAssessment(), verdict: '', seen: [] }); setStep(0); setPairIndex(0); setSaved(null); setConsents([false, false]);
    }}>{t('merchantUx.experimentReview.start')}</Button>}
    {draft && <div data-plan-review-editor className="space-y-4"><p>{t('merchantUx.experimentReview.draft')}</p><p className="text-muted-foreground">{t('merchantUx.experimentReview.draftFrozen')}</p>
      <ol className="grid gap-2 sm:grid-cols-3">{steps.map((label, index) => <li className={`rounded-md border p-2 ${step === index ? 'border-primary font-semibold' : ''}`} aria-current={step === index ? 'step' : undefined} key={label}>{label}</li>)}</ol>
      <h6 ref={heading} tabIndex={-1} data-plan-review-step={step} className="text-base font-semibold focus-visible:outline">{steps[step]}</h6>
      <p>{t('merchantUx.experimentReview.basis', { run: draft.packet.basis.runId, provider: draft.packet.basis.provider === 'openai' ? 'OpenAI' : 'ZahyPi', model: draft.packet.basis.observedModel })}</p>
      {step === 0 && <div className="space-y-4"><h6 className="font-semibold">{t('merchantUx.experimentReview.plan')}</h6><ProtocolDesignSummary design={draft.packet.evidence.protocol.protocol.design} sampleRecorded />
        <h6 className="font-semibold">{t('merchantUx.experimentReview.rules')}</h6><RulesSummary rules={draft.packet.evidence.cohort.snapshot.rules} review={draft.packet.evidence.cohort.snapshot.mappingReview} />
        <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.experimentReview.identity')}</summary><p>{t('merchantUx.experimentReview.reviewer', { id: draft.packet.reviewerUserId })}</p><p>{t('merchantUx.experimentReview.basisDigest')}</p><p dir="ltr">{draft.packet.basisDigest}</p></details></div>}
      {step === 1 && <ReviewComparison packet={draft.packet} index={pairIndex} seen={draft.seen} disabled={!editable}
        onIndex={setPairIndex} onMark={() => { if (!editable) return; const caseId = draft.packet.evidence.pairs[pairIndex].caseId;
          setDraft(old => old ? { ...old, seen: old.seen.includes(caseId) ? old.seen : [...old.seen, caseId] } : old); setConsents([false, false]); }} />}
      {step === 2 && <fieldset disabled={!editable} className="min-w-0 space-y-4"><legend className="sr-only">{t('merchantUx.experimentReview.decisionStep')}</legend>
        {reviewFields.map(field => <div key={field} className="space-y-2"><label htmlFor={`${id}-${field}`} className="block font-medium">{labels[field]}</label><p id={`${id}-${field}-hint`}>{hints[field]}</p>
          <textarea id={`${id}-${field}`} data-plan-review-field={field} dir="auto" rows={4} minLength={30} maxLength={3000} value={draft.assessment[field]} aria-describedby={`${id}-${field}-hint ${id}-limits`}
            className="w-full min-w-0 rounded-md border bg-background p-3 text-base" onChange={e => { const value = e.target.value; setDraft(old => old ? { ...old, assessment: { ...old.assessment, [field]: value } } : old); setConsents([false, false]); }} /></div>)}
        <p id={`${id}-limits`} className="text-sm text-muted-foreground">{t('merchantUx.experimentReview.reasonHint')}</p>
        <label htmlFor={`${id}-verdict`} className="block font-medium">{t('merchantUx.experimentReview.verdict')}</label><select id={`${id}-verdict`} data-plan-review-verdict className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base" value={draft.verdict}
          onChange={e => { const value = e.target.value as Draft['verdict']; setDraft(old => old ? { ...old, verdict: value } : old); setConsents([false, false]); }}>
          <option value="">{t('merchantUx.experimentReview.choose')}</option><option value="approved">{t('merchantUx.experimentReview.approveOption')}</option><option value="rejected">{t('merchantUx.experimentReview.rejectOption')}</option></select>
        {[t('merchantUx.experimentReview.attestation'), t('merchantUx.experimentReview.noActivationConsent')].map((label, index) => <label className="flex min-h-11 items-start gap-2 rounded-md border p-3" key={index}><input type="checkbox" data-plan-review-consent={index} className="mt-1 size-5 shrink-0" checked={consents[index]}
          disabled={!editable || !validReviewAssessment(draft.assessment) || !draft.verdict || draft.seen.length !== 32} onChange={e => { const value = e.target.checked; setConsents(old => old.map((v, i) => i === index ? value : v)); }} /><span>{label}</span></label>)}
        <Button type="button" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" data-plan-review-save disabled={!editable || !consents.every(Boolean) || !draft.verdict || !validReviewAssessment(draft.assessment) || draft.seen.length !== 32} onClick={() => void save()}>{busy ? t('merchantUx.experimentReview.busy') : t('merchantUx.experimentReview.save')}</Button>
      </fieldset>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" data-plan-review-back disabled={!active || busy || uncertain || !step} onClick={() => { setStep(n => n - 1); setConsents([false, false]); }}>{t('merchantUx.experimentReview.back')}</Button>
        {step < 2 && <Button type="button" className="min-h-11" data-plan-review-next disabled={!editable || step === 1 && draft.seen.length !== 32} onClick={() => { setStep(n => n + 1); setConsents([false, false]); }}>{t('merchantUx.experimentReview.next')}</Button>}</div>
      {!uncertain && <div className="space-y-2 border-t pt-3"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-plan-review-discard-consent className="size-5 shrink-0" checked={discard} disabled={!active || busy} onChange={e => setDiscard(e.target.checked)} /><span>{t('merchantUx.experimentReview.discardConsent')}</span></label>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-discard disabled={!active || busy || !discard} onClick={() => { setDraft(null); setDiscard(false); setConsents([false, false]); setFailure(null); }}>{t('merchantUx.experimentReview.discard')}</Button></div>}
    </div>}
    <section data-plan-review-history className="space-y-3 border-t pt-4"><h6 className="font-semibold">{t('merchantUx.experimentReview.history')}</h6>
      {history.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
      {!history.isLoading && !historyReadable && <p role="alert">{t('merchantUx.experimentReview.historyError')}</p>}
      {historyReadable && <><p>{t('merchantUx.policyEvaluation.archivePage', { page: cursors.length })}</p>{!history.data!.items.length && <p>{t('merchantUx.experimentReview.empty')}</p>}
        {history.data!.items.map(item => <ReviewDecision key={item.reviewId} record={item} />)}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-history-back disabled={!active || locked || fetching || cursors.length < 2} onClick={() => navigate(cursors.slice(0, -1))}>{t('merchantUx.policyEvaluation.archivePrevious')}</Button>
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-history-next disabled={!active || locked || fetching || !history.data!.nextBeforeId} onClick={() => navigate([...cursors, history.data!.nextBeforeId!])}>{t('merchantUx.policyEvaluation.archiveNext')}</Button></div></>}
    </section><p className="text-sm text-muted-foreground">{t('merchantUx.experimentReview.noActivation')}</p>
  </section>;
}
function ReviewDecision({ record }: { record: PlanningReviewReceipt }) {
  const { t } = useTranslation(), s = record.snapshot, labels = [t('merchantUx.experimentReview.baselineAndSample'), t('merchantUx.experimentReview.recruitmentFeasibility'), t('merchantUx.experimentReview.qualificationMapping'), t('merchantUx.experimentReview.safetyAndMeasurement')];
  return <details data-plan-review-record={record.reviewId} className="min-w-0 rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.experimentReview.revision', { revision: s.revision })} · {s.verdict === 'approved' ? t('merchantUx.experimentReview.approved') : t('merchantUx.experimentReview.rejected')}</summary>
    <div className="space-y-3"><p>{t('merchantUx.experimentReview.historical')}</p><p>{record.reviewerPresent ? t('merchantUx.experimentReview.reviewer', { id: s.reviewerUserId }) : t('merchantUx.experimentReview.removed')} · <bdi>{s.reviewedAt}</bdi></p>
      {reviewFields.map((field, i) => <div key={field}><h6 className="font-medium">{labels[i]}</h6><p dir="auto" className="whitespace-pre-wrap">{s.assessment[field]}</p></div>)}
      <p className="font-medium">{t('merchantUx.experimentReview.decisionEvidence')}</p><p>{t('merchantUx.experimentReview.basis', { run: s.runId, provider: s.basis.provider === 'openai' ? 'OpenAI' : 'ZahyPi', model: s.basis.observedModel })}</p><p dir="ltr">{s.basisDigest}</p>
    </div></details>;
}
function ReviewComparison({ packet, index, seen, disabled, onIndex, onMark }: { packet: ReviewWorkspace; index: number; seen: string[]; disabled: boolean; onIndex: (value: number) => void; onMark: () => void }) {
  const { t } = useTranslation(), heading = useRef<HTMLHeadingElement>(null), pair = packet.evidence.pairs[index], row = packet.evidence.outputReview.cases.find((row: any) => row.caseId === pair.caseId);
  useEffect(() => { heading.current?.focus(); }, [index]);
  return <div className="min-w-0 space-y-4" data-plan-review-comparison={index}><p aria-live="polite" data-plan-review-progress>{t('merchantUx.experimentReview.progress', { completed: seen.length })}</p><p className="text-muted-foreground">{t('merchantUx.experimentReview.note')}</p>
    <h6 ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline">{t('merchantUx.experimentReview.case', { number: index + 1 })}</h6><p dir="auto" className="whitespace-pre-wrap">{pair.userPrompt}</p>
    <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.experimentReview.context')}</summary><p dir="auto" className="whitespace-pre-wrap">{pair.criterion}</p><p dir="auto" className="whitespace-pre-wrap">{pair.systemPrompt}</p><p dir="auto" className="whitespace-pre-wrap">{pair.candidateStyleInstruction}</p></details>
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">{(['baseline', 'candidate'] as const).map(arm => <article className="min-w-0 space-y-3 rounded-md border p-3" key={arm}><h6 className="font-semibold">{arm === 'baseline' ? t('merchantUx.policyEvaluation.baseline') : t('merchantUx.policyEvaluation.candidate')}</h6>
      <blockquote dir="auto" className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-base">{pair[arm].response}</blockquote><p className="font-medium">{t('merchantUx.experimentReview.outputJudgment')} · {row[arm].verdict === 'pass' ? t('merchantUx.policyEvaluation.pass') : t('merchantUx.policyEvaluation.fail')}</p><blockquote dir="auto" className="whitespace-pre-wrap">{row[arm].quote}</blockquote><p dir="auto" className="whitespace-pre-wrap">{row[arm].reason}</p></article>)}</div>
    <p>{row.preference === 'candidate' ? t('merchantUx.policyEvaluation.preferCandidate') : t('merchantUx.policyEvaluation.tie')}</p>
    <Button type="button" className="h-auto min-h-11 whitespace-normal" data-plan-review-mark disabled={disabled || seen.includes(pair.caseId)} onClick={onMark}>{seen.includes(pair.caseId) ? t('merchantUx.experimentReview.marked') : t('merchantUx.experimentReview.mark')}</Button>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-case-back disabled={disabled || index === 0} onClick={() => onIndex(index - 1)}>{t('merchantUx.experimentReview.previousCase')}</Button><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-plan-review-case-next disabled={disabled || index === 31} onClick={() => onIndex(index + 1)}>{t('merchantUx.experimentReview.nextCase')}</Button></div>
  </div>;
}
