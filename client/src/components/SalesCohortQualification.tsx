import { SalesCohortInspection } from './SalesCohortInspection';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { definiteReviewError } from '@/lib/learning-policy-evaluation-state';
import { cohortStages, compatibleCohortPreparation, emptyCohortDraft, matchingCohortReceipt, validateCohortDraft, type CohortDraft, type CohortReceipt } from '@/lib/sales-cohort-form';
import type { ProtocolRecord } from '@/lib/sales-experiment-form';
import type { FreezeSalesCohortInput, SalesCohortRules } from '../../../shared/sales-experiment-cohort';

export function SalesCohortQualification({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-4"><Button type="button" variant="outline" data-cohort-open className="h-auto min-h-11 whitespace-normal" aria-expanded={open} aria-controls={id}
    onClick={() => { setMounted(true); setOpen(value => !value); }}>{open ? t('merchantUx.salesCohort.close') : t('merchantUx.salesCohort.open')}</Button>
    <div id={id} hidden={!open}>{mounted && <CohortPanel record={record} active={active && open} onLock={onLock} />}</div></div>;
}
function CohortPanel({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const query = trpc.sariBrain.prepareSalesExperimentCohort.useQuery({ protocolId: record.protocolId }, { retry: false, refetchOnWindowFocus: false, staleTime: 0 });
  const mutation = trpc.sariBrain.freezeSalesExperimentCohort.useMutation({ retry: false });
  const [draft, setDraft] = useState<CohortDraft | null>(null), [basis, setBasis] = useState<ProtocolRecord | null>(null), [review, setReview] = useState(false);
  const [consent, setConsent] = useState(false), [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), [saved, setSaved] = useState<CohortReceipt | null>(null);
  const pending = useRef<{ record: ProtocolRecord; input: FreezeSalesCohortInput } | null>(null), inFlight = useRef(false);
  const readable = !query.isError && !query.isLoading && compatibleCohortPreparation(query.data, record), data = readable ? query.data : null;
  const uncertain = failure === 'unknown', stale = !!draft && (!data?.canFreeze || basis?.protocolDigest !== record.protocolDigest || record.state !== 'registered');
  const editable = active && readable && data?.canFreeze && !query.isFetching && !busy && !failure && !stale;
  const validation = draft ? validateCohortDraft(draft) : null, frozen = saved ?? data?.frozen;
  useEffect(() => { onLock(!!draft || busy || uncertain); return () => onLock(false); }, [draft, busy, uncertain, onLock]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [review, !!draft]);
  useEffect(() => { setConsent(false); }, [record.protocolDigest, record.state, active, readable, data?.canFreeze]);
  async function refresh() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setConsent(false);
    try { const result = await query.refetch(); if (result.isError || !compatibleCohortPreparation(result.data, record)) throw Error('Read failed'); if (!uncertain) setFailure(null); }
    catch { if (!uncertain) setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(retry = false) {
    if (inFlight.current || !active || (retry ? !uncertain || !pending.current : !editable || !consent || !validation?.rules || !validation.reviewValid || !basis)) return;
    if (!retry) pending.current = { record: structuredClone(basis!), input: { protocolId: basis!.protocolId, protocolDigest: basis!.protocolDigest,
      requestId: crypto.randomUUID(), rules: validation!.rules!, mappingReview: validation!.review, matchesRegisteredDefinition: true } };
    const request = pending.current!; inFlight.current = true; setBusy(true); let committed = false;
    try {
      const result = await mutation.mutateAsync(request.input);
      if (!matchingCohortReceipt(result, request.record, request.input)) throw Error('Unexpected receipt');
      committed = true; setSaved(result); setDraft(null); setBasis(null); setConsent(false); setDiscard(false); setFailure(null); pending.current = null;
    } catch (error) {
      if (definiteReviewError(error)) { pending.current = null; setFailure('changed'); setConsent(false); }
      else setFailure('unknown');
    } finally {
      try { const result = await query.refetch(); if (result.isError || !compatibleCohortPreparation(result.data, record)) throw Error('Read failed'); }
      catch { if (committed) setFailure('refresh'); }
      inFlight.current = false; setBusy(false);
    }
  }
  function update(key: keyof CohortDraft, value: string | CohortDraft['stages']) { setDraft(old => old ? { ...old, [key]: value } : old); setConsent(false); }
  const field = (key: 'minimum' | 'maximum' | 'terms' | 'phones' | 'review', label: string, hint: string, multiline = false) => <div className="min-w-0 space-y-2">
    <label htmlFor={`${id}-${key}`} className="block font-medium">{label}</label>
    {multiline ? <textarea id={`${id}-${key}`} data-cohort-field={key} rows={key === 'review' ? 4 : 3} maxLength={key === 'phones' ? 3400 : key === 'terms' ? 1700 : 3000} dir="auto" className="w-full min-w-0 rounded-md border bg-background p-3 text-base" disabled={!editable} value={draft![key]} aria-describedby={`${id}-${key}-hint`} onChange={e => update(key, e.target.value)} />
      : <input id={`${id}-${key}`} data-cohort-field={key} inputMode="numeric" maxLength={4} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base" disabled={!editable} value={draft![key]} aria-describedby={`${id}-${key}-hint`} onChange={e => update(key, e.target.value)} />}
    <p id={`${id}-${key}-hint`} className="text-sm text-muted-foreground">{hint}</p></div>;
  return <section data-cohort-panel className="mt-4 min-w-0 space-y-4 rounded-lg border p-3 sm:p-4 [overflow-wrap:anywhere]" aria-busy={busy || query.isFetching}>
    <h5 className="text-base font-semibold">{t('merchantUx.salesCohort.title')}</h5><p>{t('merchantUx.salesCohort.scope')}</p>
    <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-cohort-refresh disabled={!active || busy || query.isFetching} onClick={() => void refresh()}>{t('merchantUx.salesCohort.refresh')}</Button>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {(!query.isLoading && !readable || failure === 'refresh') && <p role="alert" data-cohort-read-error>{t('merchantUx.salesCohort.unavailable')}</p>}
    {data && !data.canFreeze && !data.frozen && <p role="status" data-cohort-blocked>{data.status === 'withdrawn' ? t('merchantUx.salesCohort.withdrawn') : data.status === 'window_started' ? t('merchantUx.salesCohort.window_started') : t('merchantUx.salesCohort.source_changed')}</p>}
    {failure === 'changed' && <p role="alert" data-cohort-changed>{t('merchantUx.salesCohort.changed')}</p>}
    {uncertain && <div role="alert" data-cohort-unknown className="space-y-3"><p>{t('merchantUx.salesCohort.unknown')}</p><Button type="button" className="h-auto min-h-11 whitespace-normal" data-cohort-retry disabled={!active || busy} onClick={() => void save(true)}>{t('merchantUx.salesCohort.retry')}</Button></div>}
    {saved && <p role="status" data-cohort-saved>{t('merchantUx.salesCohort.saved')}</p>}
    {!draft && !frozen && data?.canFreeze && <Button type="button" className="h-auto min-h-11 whitespace-normal" data-cohort-start disabled={!editable} onClick={() => { setDraft(emptyCohortDraft()); setBasis(structuredClone(record)); setReview(false); setConsent(false); }}>{t('merchantUx.salesCohort.start')}</Button>}
    {draft && <div className="space-y-4" data-cohort-editor><h6 ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline">{review ? t('merchantUx.salesCohort.next') : t('merchantUx.salesCohort.start')}</h6><p className="text-muted-foreground">{t('merchantUx.salesCohort.draft')}</p>
      {stale && <p role="alert" data-cohort-stale>{t('merchantUx.salesCohort.stale')}</p>}
      <dl className="space-y-3 rounded-md border p-3"><div><dt className="font-medium">{t('merchantUx.salesProtocol.qualificationRule')}</dt><dd dir="auto" className="whitespace-pre-wrap">{basis?.protocol.design.cohort.qualificationRule}</dd></div><div><dt className="font-medium">{t('merchantUx.salesProtocol.exclusions')}</dt><dd dir="auto" className="whitespace-pre-wrap">{basis?.protocol.design.cohort.exclusions}</dd></div></dl>
      {!review ? <><div className="grid gap-4 sm:grid-cols-2">{field('minimum', t('merchantUx.salesCohort.minimum'), t('merchantUx.salesCohort.lengthHint'))}{field('maximum', t('merchantUx.salesCohort.maximum'), t('merchantUx.salesCohort.lengthHint'))}</div>
        <fieldset className="space-y-2" disabled={!editable}><legend className="font-medium">{t('merchantUx.salesCohort.stages')}</legend><p>{t('merchantUx.salesCohort.stagesHint')}</p><div className="grid gap-2 sm:grid-cols-2">{cohortStages.map(stage => <label key={stage} className="flex min-h-11 items-center gap-2 rounded-md border px-3 py-2"><input type="checkbox" data-cohort-stage={stage} className="size-5 shrink-0" checked={draft.stages.includes(stage)} onChange={e => update('stages', e.target.checked ? [...draft.stages, stage] : draft.stages.filter(value => value !== stage))} /><span>{stageLabels(t)[stage]}</span></label>)}</div></fieldset>
        {field('terms', t('merchantUx.salesCohort.terms'), t('merchantUx.salesCohort.termsHint'), true)}{field('phones', t('merchantUx.salesCohort.phones'), t('merchantUx.salesCohort.phonesHint'), true)}
        <FixedConditions />{field('review', t('merchantUx.salesCohort.review'), t('merchantUx.salesCohort.reviewHint'), true)}
        {(!validation?.rules || !validation.reviewValid) && <p data-cohort-invalid>{t('merchantUx.salesCohort.invalid')}</p>}
        <Button type="button" className="h-auto min-h-11 whitespace-normal" data-cohort-next disabled={!editable || !validation?.rules || !validation.reviewValid} onClick={() => { setReview(true); setConsent(false); }}>{t('merchantUx.salesCohort.next')}</Button></>
        : validation?.rules && <><RulesSummary rules={validation.rules} review={validation.review} /><label className="flex min-h-11 items-start gap-2 rounded-md border p-3"><input type="checkbox" data-cohort-consent className="mt-1 size-5 shrink-0" disabled={!editable} checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{t('merchantUx.salesCohort.consent')}</span></label>
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-cohort-back disabled={busy || uncertain || !active} onClick={() => { setReview(false); setConsent(false); }}>{t('merchantUx.salesCohort.back')}</Button>
            <Button type="button" className="h-auto min-h-11 whitespace-normal" data-cohort-save disabled={!editable || !consent} onClick={() => void save()}>{t('merchantUx.salesCohort.save')}</Button></div></>}
      {!uncertain && <div className="space-y-2 border-t pt-3"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-cohort-discard-consent className="size-5 shrink-0" disabled={busy} checked={discard} onChange={e => setDiscard(e.target.checked)} /><span>{t('merchantUx.salesCohort.discardConsent')}</span></label><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-cohort-discard disabled={busy || !discard} onClick={() => { setDraft(null); setBasis(null); setConsent(false); setDiscard(false); setFailure(null); }}>{t('merchantUx.salesCohort.discard')}</Button></div>}
    </div>}
    {frozen && !draft && <div data-cohort-audit className="space-y-3 border-t pt-3"><h6 className="font-semibold">{t('merchantUx.salesCohort.audit')}</h6><p>{t('merchantUx.salesCohort.historical')}</p>
      <RulesSummary rules={frozen.snapshot.rules} review={frozen.snapshot.mappingReview} /><p>{t('merchantUx.salesCohort.frozenAt')}: <bdi>{frozen.snapshot.frozenAt}</bdi></p>
      <p>{frozen.actorUserId ? t('merchantUx.policyReview.reviewer', { id: frozen.actorUserId }) : t('merchantUx.policyReview.removedReviewer')}</p>
      <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.salesCohort.fingerprint')}</summary><p dir="ltr">{frozen.cohortDigest}</p></details></div>}
    {frozen && !draft && <SalesCohortInspection protocolId={record.protocolId} cohortDigest={frozen.cohortDigest} active={active && readable && !query.isFetching && !busy && record.state === 'registered'} />}
  </section>;
}
function stageLabels(t: ReturnType<typeof useTranslation>['t']) { return { new: t('merchantUx.salesCohort.new'), interested: t('merchantUx.salesCohort.interested'), qualified: t('merchantUx.salesCohort.qualified'), ready: t('merchantUx.salesCohort.ready'), payment_link_sent: t('merchantUx.salesCohort.payment_link_sent'), payment_failed: t('merchantUx.salesCohort.payment_failed'), stalled: t('merchantUx.salesCohort.stalled') }; }
function FixedConditions() { const { t } = useTranslation(); return <div className="space-y-2 rounded-md bg-muted/50 p-3"><p className="font-medium">{t('merchantUx.salesCohort.fixed')}</p><p>{t('merchantUx.salesCohort.safeguards')}</p><p>{t('merchantUx.salesCohort.history')}</p></div>; }
export function RulesSummary({ rules, review }: { rules: SalesCohortRules; review: string }) {
  const { t } = useTranslation(), labels = stageLabels(t);
  return <div className="space-y-3" data-cohort-summary><dl className="grid gap-3 sm:grid-cols-2">{[
    [t('merchantUx.salesCohort.minimum'), rules.minimumCharacters], [t('merchantUx.salesCohort.maximum'), rules.maximumCharacters],
    [t('merchantUx.salesCohort.stages'), rules.allowedDealStages.map(stage => labels[stage]).join(' · ')],
    [t('merchantUx.salesCohort.terms'), rules.requiredAnyTerms.join('\n') || t('merchantUx.salesCohort.none')],
    [t('merchantUx.salesCohort.phones'), rules.excludedPhones.join('\n') || t('merchantUx.salesCohort.noPhones')],
    [t('merchantUx.salesCohort.review'), review],
  ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="font-medium">{label}</dt><dd dir="auto" className="whitespace-pre-wrap">{value}</dd></div>)}</dl><FixedConditions /></div>;
}
