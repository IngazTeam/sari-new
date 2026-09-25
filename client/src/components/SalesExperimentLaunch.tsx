import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { ProtocolDesignSummary } from './SalesExperimentDesign';
import { definiteReviewError } from '@/lib/learning-policy-evaluation-state';
import type { ProtocolRecord } from '@/lib/sales-experiment-form';
import { compatibleLaunchPrepared, compatibleLaunchStatus, matchingLaunchAuthorization, matchingLaunchRevocation,
  type LaunchPrepared, type LaunchReceipt } from '@/lib/sales-experiment-launch';
import { authorizeSalesExperimentLaunchInput, revokeSalesExperimentLaunchInput,
  type AuthorizeSalesExperimentLaunchInput, type RevokeSalesExperimentLaunchInput } from '../../../shared/sales-experiment-launch';

const options = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
const formatTime = (value: string, language: string) => new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar' : 'en',
  { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
type Draft = { kind: 'authorize'; packet: LaunchPrepared } | { kind: 'revoke'; receipt: LaunchReceipt; operatorUserId: number };
type Pending = { kind: 'authorize'; packet: LaunchPrepared; input: AuthorizeSalesExperimentLaunchInput }
  | { kind: 'revoke'; receipt: LaunchReceipt; operatorUserId: number; input: RevokeSalesExperimentLaunchInput };
export function SalesExperimentLaunch({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-4"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-launch-open aria-expanded={open} aria-controls={id}
    onClick={() => { setMounted(true); setOpen(v => !v); }}>{open ? t('merchantUx.experimentLaunch.close') : t('merchantUx.experimentLaunch.open')}</Button>
    <div id={id} hidden={!open}>{mounted && <LaunchPanel record={record} active={active && open} onLock={onLock} />}</div></div>;
}
function LaunchPanel({ record, active, onLock }: { record: ProtocolRecord; active: boolean; onLock: (value: boolean) => void }) {
  const { t, i18n } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const statusQuery = trpc.sariBrain.getSalesExperimentLaunchStatus.useQuery({ protocolId: record.protocolId }, { ...options, enabled: active });
  const status = !statusQuery.isLoading && !statusQuery.isError && compatibleLaunchStatus(statusQuery.data, record) ? statusQuery.data : null;
  const needsPreparation = status?.stage === 'not_authorized';
  const prepareQuery = trpc.sariBrain.prepareSalesExperimentLaunch.useQuery({ protocolId: record.protocolId }, { ...options, enabled: active && needsPreparation });
  const packet = needsPreparation && !prepareQuery.isLoading && !prepareQuery.isError && compatibleLaunchPrepared(prepareQuery.data, record)
    && prepareQuery.data.operatorUserId === status.operatorUserId ? prepareQuery.data : null;
  const authorize = trpc.sariBrain.authorizeSalesExperimentLaunch.useMutation({ retry: false }), revoke = trpc.sariBrain.revokeSalesExperimentLaunch.useMutation({ retry: false });
  const [draft, setDraft] = useState<Draft | null>(null), [reason, setReason] = useState(''), [consents, setConsents] = useState([false, false]);
  const [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false), [saved, setSaved] = useState<LaunchReceipt | null>(null);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), pending = useRef<Pending | null>(null), inFlight = useRef(false);
  const uncertain = failure === 'unknown', fetching = statusQuery.isFetching || needsPreparation && prepareQuery.isFetching;
  const changed = !!draft && (draft.kind === 'authorize' ? !packet?.canAuthorize || packet.basisDigest !== draft.packet.basisDigest
    || packet.operatorUserId !== draft.packet.operatorUserId || !!status?.authorization || packet.basis.reviewId !== draft.packet.basis.reviewId
    || packet.basis.reviewDigest !== draft.packet.basis.reviewDigest : !status || status.operatorUserId !== draft.operatorUserId
    || status.authorization?.state !== 'authorized' || status.authorization.launchDigest !== draft.receipt.launchDigest
    || status.authorization.launchId !== draft.receipt.launchId);
  const editable = active && !busy && !fetching && !failure && !changed;
  const reasonValid = reason.trim().length >= 30 && reason.trim().length <= 3000, locked = !!draft || busy || uncertain;
  const canSave = editable && !!draft && reasonValid && consents[0] && (draft.kind === 'revoke' || consents[1]);
  const states = { not_authorized: t('merchantUx.experimentLaunch.notAuthorized'), scheduled: t('merchantUx.experimentLaunch.scheduled'),
    enrollment_open: t('merchantUx.experimentLaunch.enrollmentOpen'), enrollment_closed: t('merchantUx.experimentLaunch.enrollmentClosed'),
    revoked: t('merchantUx.experimentLaunch.revoked'), stale: t('merchantUx.experimentLaunch.stale'), unavailable: t('merchantUx.experimentLaunch.statusUnavailable') };
  useEffect(() => { onLock(locked); return () => onLock(false); }, [locked, onLock]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [!!draft]);
  useEffect(() => { setConsents([false, false]); setDiscard(false); }, [active, changed, packet?.basisDigest, packet?.operatorUserId, status?.operatorUserId, status?.authorization?.state]);
  useEffect(() => { if (!locked) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [locked]);
  async function reload() {
    const result = await statusQuery.refetch();
    if (result.isError || !compatibleLaunchStatus(result.data, record)) throw Error('Unavailable');
    if (result.data.stage === 'not_authorized') {
      const p = await prepareQuery.refetch(); if (p.isError || !compatibleLaunchPrepared(p.data, record)) throw Error('Unavailable');
    }
  }
  async function refresh() {
    if (!active || inFlight.current) return; inFlight.current = true; setBusy(true); setConsents([false, false]);
    try { await reload(); if (!uncertain) setFailure(null); } catch { if (!uncertain && !draft) setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function begin(next: Draft) {
    if (!editable || draft) return; onLock(true); setDraft(structuredClone(next)); setReason(''); setSaved(null); setDiscard(false); setConsents([false, false]);
  }
  async function save(retry = false) {
    if (inFlight.current || !active || (retry ? !uncertain || !pending.current : !canSave)) return;
    if (!retry && draft) pending.current = draft.kind === 'authorize' ? { ...structuredClone(draft), input: authorizeSalesExperimentLaunchInput.parse({
      protocolId: record.protocolId, requestId: crypto.randomUUID(), basisDigest: draft.packet.basisDigest, reviewId: draft.packet.basis.reviewId,
      reviewDigest: draft.packet.basis.reviewDigest, reason, reviewedBoundPlanAndDecision: true, understandsNoMessagesSent: true }) }
      : { ...structuredClone(draft), input: revokeSalesExperimentLaunchInput.parse({ launchId: draft.receipt.launchId, launchDigest: draft.receipt.launchDigest, requestId: crypto.randomUUID(), reason }) };
    inFlight.current = true; setBusy(true); setConsents([false, false]); let committed = false;
    try {
      const p = pending.current!, result = p.kind === 'authorize' ? await authorize.mutateAsync(p.input) : await revoke.mutateAsync(p.input);
      if (!(p.kind === 'authorize' ? matchingLaunchAuthorization(result, p.packet, p.input, record) : matchingLaunchRevocation(result, p.receipt, p.operatorUserId, p.input, record))) throw Error('Mismatched receipt');
      committed = true; setSaved(result); setDraft(null); setReason(''); setDiscard(false); setFailure(null); pending.current = null;
    } catch (error) {
      // A later access error cannot disprove an earlier uncertain commit. Preserve its exact request.
      if (!retry && definiteReviewError(error)) { pending.current = null; setFailure('changed'); } else setFailure('unknown');
    } finally { try { await reload(); } catch { if (committed) setFailure('refresh'); } inFlight.current = false; setBusy(false); }
  }
  const currentReceipt = status?.authorization ?? null;
  return <section data-launch-panel className="mt-4 min-w-0 space-y-4 rounded-lg border bg-background p-3 sm:p-5 [overflow-wrap:anywhere]" aria-busy={busy || fetching}>
    <h5 className="text-lg font-semibold">{t('merchantUx.experimentLaunch.title')}</h5><p>{t('merchantUx.experimentLaunch.scope')}</p>
    <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-launch-refresh disabled={!active || busy || fetching} onClick={() => void refresh()}>{t('merchantUx.experimentLaunch.refresh')}</Button>
    {(statusQuery.isLoading || needsPreparation && prepareQuery.isLoading) && <p role="status">{t('merchantUx.experimentLaunch.loading')}</p>}
    {!statusQuery.isLoading && !status && <p role="alert" data-launch-unavailable>{t('merchantUx.experimentLaunch.unavailable')}</p>}
    {status && <div className="space-y-2 rounded-md border p-3"><p className="font-semibold" data-launch-status={status.stage}>{states[status.stage]}</p><p className="text-sm">{t('merchantUx.experimentLaunch.checked', { time: formatTime(status.checkedAt, i18n.language) })}</p></div>}
    {needsPreparation && !packet && !prepareQuery.isLoading && <p role="alert" data-launch-preparation-error>{t('merchantUx.experimentLaunch.preparationUnavailable')}</p>}
    {packet && !packet.canAuthorize && !packet.existing && <p role="status">{t('merchantUx.experimentLaunch.closedBeforeAuthorization')}</p>}
    {(changed || failure === 'changed') && <p role="alert" data-launch-changed>{t('merchantUx.experimentLaunch.changed')}</p>}
    {failure === 'refresh' && saved && <p role="alert" data-launch-refresh-error>{t('merchantUx.experimentLaunch.refreshFailed')}</p>}
    {uncertain && <div role="alert" data-launch-unknown className="space-y-3"><p>{t('merchantUx.experimentLaunch.unknown')}</p><Button type="button" className="h-auto min-h-11 whitespace-normal" data-launch-retry disabled={!active || busy} onClick={() => void save(true)}>{t('merchantUx.experimentLaunch.retry')}</Button></div>}
    {saved && <div data-launch-saved><p role="status" className="mb-3 font-semibold">{saved.state === 'revoked' ? t('merchantUx.experimentLaunch.savedRevocation') : t('merchantUx.experimentLaunch.saved')}</p><LaunchRecord receipt={saved} /></div>}
    {currentReceipt && (!saved || saved.launchId !== currentReceipt.launchId || saved.state !== currentReceipt.state) && <LaunchRecord receipt={currentReceipt} />}
    {!draft && <div className="flex flex-wrap gap-2">{packet?.canAuthorize && !status?.authorization && <Button type="button" className="h-auto min-h-11 whitespace-normal" data-launch-authorize disabled={!editable} onClick={() => begin({ kind: 'authorize', packet })}>{t('merchantUx.experimentLaunch.authorize')}</Button>}
      {currentReceipt?.state === 'authorized' && status && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-launch-revoke disabled={!editable} onClick={() => begin({ kind: 'revoke', receipt: currentReceipt, operatorUserId: status.operatorUserId })}>{t('merchantUx.experimentLaunch.revoke')}</Button>}</div>}
    {draft && <div data-launch-editor className="space-y-4 border-t pt-4"><h6 ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline">{draft.kind === 'authorize' ? t('merchantUx.experimentLaunch.authorizationDraft') : t('merchantUx.experimentLaunch.revocationDraft')}</h6><p>{t('merchantUx.experimentLaunch.draftHint')}</p>
      {draft.kind === 'authorize' ? <><dl className="grid gap-3 sm:grid-cols-3">
        {[[t('merchantUx.salesProtocol.enrollmentStartsAt'), draft.packet.basis.window.enrollmentStartsAt], [t('merchantUx.salesProtocol.enrollmentEndsAt'), draft.packet.basis.window.enrollmentEndsAt],
          [t('merchantUx.salesProtocol.decisionNotBefore'), draft.packet.basis.window.decisionNotBefore]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border p-3"><dt className="text-muted-foreground">{label}</dt><dd><time dateTime={value}>{formatTime(value, i18n.language)}</time></dd></div>)}</dl>
        <details data-launch-plan className="min-w-0 rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.experimentReview.plan')}</summary><ProtocolDesignSummary design={record.protocol.design} sampleRecorded /></details>
        <LaunchReview basis={draft.packet.basis} /></> : <LaunchRecord receipt={draft.receipt} />}
      <fieldset disabled={!editable} className="min-w-0 space-y-3"><legend className="sr-only">{t('merchantUx.experimentLaunch.reason')}</legend>
        <label htmlFor={`${id}-reason`} className="block font-medium">{t('merchantUx.experimentLaunch.reason')}</label>
        <textarea id={`${id}-reason`} data-launch-reason dir="auto" rows={4} minLength={30} maxLength={3000} value={reason} aria-describedby={`${id}-hint`} className="w-full min-w-0 rounded-md border bg-background p-3 text-base"
          onChange={e => { setReason(e.target.value); setConsents([false, false]); }} /><p id={`${id}-hint`} className="text-sm text-muted-foreground">{t('merchantUx.experimentLaunch.reasonHint')}</p>
        {(draft.kind === 'authorize' ? [t('merchantUx.experimentLaunch.reviewConsent'), t('merchantUx.experimentLaunch.scopeConsent')] : [t('merchantUx.experimentLaunch.revokeConsent')]).map((label, index) =>
          <label className="flex min-h-11 items-start gap-2 rounded-md border p-3" key={index}><input type="checkbox" data-launch-consent={index} className="mt-1 size-5 shrink-0" checked={consents[index]} disabled={!editable || !reasonValid}
            onChange={e => { const v = e.target.checked; setConsents(old => old.map((x, i) => i === index ? v : x)); }} /><span>{label}</span></label>)}
        <Button type="button" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" data-launch-save disabled={!canSave} onClick={() => void save()}>{busy ? t('merchantUx.experimentLaunch.saving') : draft.kind === 'authorize' ? t('merchantUx.experimentLaunch.saveAuthorization') : t('merchantUx.experimentLaunch.saveRevocation')}</Button>
      </fieldset>
      {!uncertain && <div className="space-y-2"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" data-launch-discard-consent className="size-5 shrink-0" checked={discard} disabled={!active || busy} onChange={e => setDiscard(e.target.checked)} /><span>{t('merchantUx.experimentLaunch.discardConsent')}</span></label>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-launch-discard disabled={!active || busy || !discard} onClick={() => { setDraft(null); setReason(''); setConsents([false, false]); setDiscard(false); setFailure(null); }}>{t('merchantUx.experimentLaunch.discard')}</Button></div>}
    </div>}<p className="text-sm text-muted-foreground">{t('merchantUx.experimentLaunch.noDispatch')}</p>
  </section>;
}
function LaunchReview({ basis }: { basis: LaunchPrepared['basis'] }) {
  const { t, i18n } = useTranslation(), review = basis.review, a = review.assessment;
  const rows = [[t('merchantUx.experimentReview.baselineAndSample'), a.baselineAndSample], [t('merchantUx.experimentReview.recruitmentFeasibility'), a.recruitmentFeasibility],
    [t('merchantUx.experimentReview.qualificationMapping'), a.qualificationMapping], [t('merchantUx.experimentReview.safetyAndMeasurement'), a.safetyAndMeasurement]];
  return <div className="min-w-0 space-y-3 rounded-md border p-3" data-launch-review><h6 className="font-semibold">{t('merchantUx.experimentLaunch.review')}</h6>
    <p>{t('merchantUx.experimentLaunch.revision', { id: basis.reviewId, revision: review.revision })} · {t('merchantUx.experimentLaunch.reviewer', { id: review.reviewerUserId })}</p>
    <p><time dateTime={review.reviewedAt}>{formatTime(review.reviewedAt, i18n.language)} (UTC)</time></p>{rows.map(([label, text]) => <div key={label}><h6 className="font-medium">{label}</h6><p dir="auto" className="whitespace-pre-wrap">{text}</p></div>)}</div>;
}
function LaunchRecord({ receipt }: { receipt: LaunchReceipt }) {
  const { t, i18n } = useTranslation(), s = receipt.snapshot, r = receipt.revocation;
  return <details data-launch-record={receipt.launchId} className="min-w-0 rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.experimentLaunch.launchReference', { id: receipt.launchId })}</summary>
    <div className="space-y-3"><p>{t('merchantUx.experimentLaunch.historical')}</p><p>{t('merchantUx.experimentLaunch.authorizedAt', { time: formatTime(s.authorizedAt, i18n.language) })}</p>
      <p>{receipt.actorPresent ? t('merchantUx.experimentLaunch.actor', { id: s.actorUserId }) : t('merchantUx.experimentLaunch.removedActor')}</p><p dir="auto" className="whitespace-pre-wrap">{s.reason}</p>
      {r && <div data-launch-revocation className="space-y-2 border-t pt-3"><p className="font-semibold">{t('merchantUx.experimentLaunch.revoked')}</p><p>{t('merchantUx.experimentLaunch.revokedAt', { time: formatTime(r.snapshot.revokedAt, i18n.language) })}</p>
        <p>{r.actorPresent ? t('merchantUx.experimentLaunch.actor', { id: r.snapshot.actorUserId }) : t('merchantUx.experimentLaunch.removedActor')}</p><p dir="auto" className="whitespace-pre-wrap">{r.snapshot.reason}</p></div>}
      <LaunchReview basis={s.basis} /><details><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.experimentLaunch.identity')}</summary>
        {[[t('merchantUx.experimentLaunch.launchDigest'), receipt.launchDigest], [t('merchantUx.experimentLaunch.basisDigest'), s.basisDigest], [t('merchantUx.experimentLaunch.reviewDigest'), s.basis.reviewDigest]].map(([label, value]) => <div key={label}><p>{label}</p><p dir="ltr">{value}</p></div>)}</details></div>
  </details>;
}
