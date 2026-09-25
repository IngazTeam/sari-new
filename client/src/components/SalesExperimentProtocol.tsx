import { SalesExperimentLaunch } from './SalesExperimentLaunch';
import { SalesCohortQualification } from './SalesCohortQualification';
import { SalesExperimentReview } from './SalesExperimentReview';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { definiteReviewError } from '@/lib/learning-policy-evaluation-state';
import { compatibleProtocolRecord, emptyProtocolDraft, protocolStepFields, validateProtocolDraft, type ProtocolDraft, type ProtocolRecord } from '@/lib/sales-experiment-form';
import { ProtocolDesignSummary, ProtocolDiscard, ProtocolDraftFields } from './SalesExperimentDesign';

type Inputs = inferRouterInputs<AppRouter>['sariBrain'];
type Pending = { kind: 'register'; input: Inputs['registerSalesExperimentProtocol'] } | { kind: 'withdraw'; input: Inputs['withdrawSalesExperimentProtocol'] };
type Basis = { candidateId: number; artifactDigest: string; expectedSectorRevision: number; version: number; sector: string };
const options = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
const ignoreLock = (_locked: boolean) => {};

export function SalesExperimentProtocol({ proposalId, active = true, onLock = ignoreLock }: { proposalId?: number; active?: boolean; onLock?: (locked: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), [opened, setOpened] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-4"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-open aria-expanded={opened} aria-controls={id}
    onClick={() => { setMounted(true); setOpened(v => !v); }}>{opened ? t('merchantUx.salesProtocol.close') : proposalId ? t('merchantUx.salesProtocol.open') : t('merchantUx.salesProtocol.history')}</Button>
    <div id={id} hidden={!opened}>{mounted && <SalesExperimentProtocolPanel key={proposalId} proposalId={proposalId} active={active && opened} onLock={onLock} />}</div></div>;
}
export function SalesExperimentProtocolPanel({ proposalId, active, onLock }: { proposalId?: number; active: boolean; onLock: (locked: boolean) => void }) {
  const { t } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]), [selected, setSelected] = useState<number | null>(null), [recordVersion, setRecordVersion] = useState(0);
  const candidate = trpc.sariBrain.getLearningPolicyCandidate.useQuery({ proposalId: proposalId ?? 1 }, { ...options, enabled: !!proposalId }), sector = trpc.sariBrain.getSalesSector.useQuery(undefined, options);
  const history = trpc.sariBrain.getSalesExperimentProtocolHistory.useQuery({ beforeId: cursors.at(-1), limit: 20 }, options);
  const register = trpc.sariBrain.registerSalesExperimentProtocol.useMutation({ retry: false }), withdraw = trpc.sariBrain.withdrawSalesExperimentProtocol.useMutation({ retry: false });
  const [draft, setDraft] = useState<ProtocolDraft | null>(null), [basis, setBasis] = useState<Basis | null>(null), [step, setStep] = useState(0);
  const [attested, setAttested] = useState(false), [discard, setDiscard] = useState(false), [busy, setBusy] = useState(false), [withdrawLock, setWithdrawLock] = useState(false);
  const [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), [saved, setSaved] = useState<{ id: number; kind: 'register' | 'withdraw' } | null>(null);
  const pending = useRef<Pending | null>(null), inFlight = useRef(false), uncertain = failure === 'unknown';
  const loading = !!proposalId && candidate.isLoading || sector.isLoading || history.isLoading, fetching = !!proposalId && candidate.isFetching || sector.isFetching || history.isFetching;
  const readable = !loading && (!proposalId || !candidate.isError && !!candidate.data) && !sector.isError && !history.isError && !!sector.data && !!history.data;
  const canManage = sector.data?.canManage === true;
  const current = !!proposalId && readable && candidate.data!.latestCandidate?.current && candidate.data!.latestCandidate?.activationAllowed === false
    && candidate.data!.latestCandidate?.bundle?.version === 'sales-style-candidate.v1' && candidate.data!.proposalId === proposalId;
  const liveBasis: Basis | null = current ? { candidateId: candidate.data!.latestCandidate!.id, artifactDigest: candidate.data!.latestCandidate!.artifactDigest,
    expectedSectorRevision: sector.data!.revision, version: candidate.data!.latestCandidate!.version, sector: sector.data!.playbook.id } : null;
  const changed = !!draft && (!liveBasis || JSON.stringify(basis) !== JSON.stringify(liveBasis));
  const validation = draft ? validateProtocolDraft(draft) : null;
  const writeReady = active && canManage && !sector.isError && !sector.isLoading && !sector.isFetching && !busy && !uncertain && !failure;
  const editable = writeReady && readable && !fetching && !changed;
  const historyReadable = !history.isError && !history.isLoading && !!history.data;
  const browseReady = active && historyReadable && !history.isFetching && !busy && !uncertain && !draft && !withdrawLock;
  const names: Record<string, string> = { general: t('merchantUx.salesSector.general'), training: t('merchantUx.salesSector.training'), recruitment: t('merchantUx.salesSector.recruitment'), store: t('merchantUx.salesSector.store') };
  const steps = [t('merchantUx.salesProtocol.cohortStep'), t('merchantUx.salesProtocol.sampleStep'), t('merchantUx.salesProtocol.windowStep'), t('merchantUx.salesProtocol.reviewStep')];
  const lockWithdrawal = useCallback((value: boolean) => setWithdrawLock(value), []);
  useEffect(() => { onLock(!!draft || withdrawLock || busy || uncertain); return () => onLock(false); }, [draft, withdrawLock, busy, uncertain, onLock]);
  useEffect(() => {
    if (!draft && !withdrawLock && !busy && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft, withdrawLock, busy, uncertain]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [step, !!draft]);
  async function reload() {
    const results = await Promise.all([...(proposalId ? [candidate.refetch()] : []), sector.refetch(), history.refetch()]);
    if (results.some(result => result.isError)) throw Error('Read failed');
  }
  async function refresh() {
    if (inFlight.current) return; inFlight.current = true; setBusy(true);
    try { await reload(); if (!withdrawLock) setRecordVersion(n => n + 1); if (!uncertain) setFailure(null); }
    catch { if (!uncertain) setFailure('refresh'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(request: Pending | null) {
    if (inFlight.current || !active || !canManage || (request ? request.kind === 'register' ? !editable : !writeReady : !uncertain || !pending.current)) return;
    if (request) pending.current = structuredClone(request);
    inFlight.current = true; setBusy(true); setSaved(null); let committed = false;
    try {
      const item = pending.current!, result = item.kind === 'register' ? await register.mutateAsync(item.input) : await withdraw.mutateAsync(item.input);
      const expectedId = item.kind === 'withdraw' ? item.input.protocolId : result.protocolId;
      if (!compatibleProtocolRecord(result, expectedId)) throw Error('Unsupported save receipt');
      if (item.kind === 'register' && (result.protocol.candidate.id !== item.input.candidateId || result.protocol.candidate.artifactDigest !== item.input.artifactDigest
        || result.protocol.sector.revision !== item.input.expectedSectorRevision || JSON.stringify(result.protocol.design) !== JSON.stringify(item.input.design))) throw Error('Mismatched save receipt');
      if (item.kind === 'withdraw' && (result.state !== 'withdrawn' || result.protocolDigest !== item.input.protocolDigest || result.withdrawal?.reason !== item.input.reason)) throw Error('Mismatched withdrawal receipt');
      committed = true; setSaved({ id: result.protocolId, kind: result.state === 'withdrawn' ? 'withdraw' : 'register' }); setSelected(result.protocolId); setRecordVersion(n => n + 1);
      setCursors([undefined]); setDraft(null); setBasis(null); setAttested(false); setDiscard(false); pending.current = null; setFailure(null);
    } catch (error) {
      if (definiteReviewError(error)) { pending.current = null; setFailure('changed'); setAttested(false); }
      else setFailure('unknown');
    } finally {
      try { await reload(); } catch { if (committed) setFailure('refresh'); }
      inFlight.current = false; setBusy(false);
    }
  }
  function registerDraft() {
    if (!draft || !basis || !attested || !editable) return;
    const design = validateProtocolDraft(draft).design; if (!design) { setAttested(false); return; }
    void save({ kind: 'register', input: { candidateId: basis.candidateId, artifactDigest: basis.artifactDigest,
      expectedSectorRevision: basis.expectedSectorRevision, requestId: crypto.randomUUID(), design } });
  }
  const navigate = (next: Array<number | undefined>) => { if (browseReady) { setCursors(next); setSelected(null); setSaved(null); } };
  return <section className="mt-4 min-w-0 space-y-4 rounded-xl border bg-background p-3 text-sm leading-relaxed sm:p-5 [overflow-wrap:anywhere]" data-protocol-panel aria-busy={busy || fetching}>
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><div><h3 className="text-lg font-semibold">{proposalId ? t('merchantUx.salesProtocol.title') : t('merchantUx.salesProtocol.history')}</h3><p className="mt-1 text-muted-foreground">{proposalId ? t('merchantUx.salesProtocol.scope') : t('merchantUx.salesProtocol.recordScope')}</p></div>
      <Button type="button" variant="outline" className="min-h-11 shrink-0" data-protocol-refresh disabled={busy || fetching || !active} onClick={() => void refresh()}>{t('merchantUx.policyEvaluation.refresh')}</Button></div>
    {loading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {(!loading && !readable || failure === 'refresh') && <p role="alert" data-protocol-error>{t('merchantUx.salesProtocol.refreshFailed')}</p>}
    {failure === 'changed' && <p role="alert" data-protocol-changed>{t('merchantUx.salesProtocol.changed')}</p>}
    {saved && <p role="status" data-protocol-saved>{saved.kind === 'register' ? t('merchantUx.salesProtocol.saved', { id: saved.id }) : t('merchantUx.salesProtocol.withdrawnSaved', { id: saved.id })}</p>}
    {uncertain && <div role="alert" className="space-y-2 rounded-lg border p-3" data-protocol-uncertain><p>{t('merchantUx.salesProtocol.unknown')}</p>
      <Button type="button" className="h-auto min-h-11 whitespace-normal" data-protocol-retry disabled={busy || !active || !canManage} onClick={() => void save(null)}>{t('merchantUx.policyEvaluation.retry')}</Button></div>}
    {readable && !draft && !!proposalId && <>
      {!canManage && <p>{t('merchantUx.salesSector.readOnly')}</p>}
      {!current && <p>{t('merchantUx.salesProtocol.requiresCandidate')}</p>}
      {history.data!.items.some(row => row.state === 'registered') && <p>{t('merchantUx.salesProtocol.activeExists')}</p>}
      <Button type="button" className="h-auto min-h-11 whitespace-normal" data-protocol-start disabled={!editable || !current || withdrawLock || cursors.length !== 1 || history.data!.items.some(row => row.state === 'registered')}
        onClick={() => { if (!editable || !liveBasis || withdrawLock) return; setBasis(structuredClone(liveBasis)); setDraft(emptyProtocolDraft()); setStep(0); setSaved(null); setAttested(false); }}>{t('merchantUx.salesProtocol.start')}</Button>
    </>}
    {draft && <div className="space-y-4" data-protocol-editor>
      <p className="text-muted-foreground">{t('merchantUx.salesProtocol.draft')}</p>
      {basis && <p>{t('merchantUx.salesProtocol.basis', { version: basis.version, sector: names[basis.sector] || basis.sector })}</p>}
      {changed && <p role="alert" data-protocol-stale>{t('merchantUx.salesProtocol.basisChanged')}</p>}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('merchantUx.salesProtocol.steps')}>{steps.map((label, i) => <li key={i} aria-current={step === i ? 'step' : undefined} className={`rounded-md border p-2 ${step === i ? 'border-primary bg-primary/5 font-semibold' : 'text-muted-foreground'}`}>{i + 1}. {label}</li>)}</ol>
      <h4 ref={heading} tabIndex={-1} className="text-base font-semibold focus-visible:outline" data-protocol-step={step}>{steps[step]}</h4>
      {step < 3 ? <ProtocolDraftFields draft={draft} step={step} disabled={!editable} onChange={(key, value) => { setDraft(old => old ? { ...old, [key]: value } : old); setAttested(false); }} />
        : validation?.design && <><ProtocolDesignSummary design={validation.design} /><label className="flex min-h-11 items-start gap-2 rounded-lg border p-3"><input data-protocol-attestation type="checkbox" className="mt-1 size-5 shrink-0" checked={attested} disabled={!editable} onChange={e => setAttested(e.target.checked)} /><span>{t('merchantUx.salesProtocol.freeze')}</span></label>
          <Button type="button" className="h-auto min-h-11 whitespace-normal" data-protocol-save disabled={!editable || !attested} onClick={registerDraft}>{t('merchantUx.salesProtocol.save')}</Button></>}
      {step === 3 && !validation?.design && <p role="alert">{t('merchantUx.salesProtocol.invalid')}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" data-protocol-back disabled={step === 0 || busy || uncertain || !active} onClick={() => { setStep(step - 1); setAttested(false); }}>{t('merchantUx.salesProtocol.previous')}</Button>
        {step < 3 && <Button type="button" className="min-h-11" data-protocol-next disabled={!editable || protocolStepFields[step].some(key => validation!.invalid.has(key))} onClick={() => setStep(step + 1)}>{t('merchantUx.salesProtocol.next')}</Button>}</div>
      {!uncertain && <ProtocolDiscard confirmed={discard} onConfirm={setDiscard} disabled={busy || !active} onDiscard={() => { setDraft(null); setBasis(null); setAttested(false); setDiscard(false); setFailure(null); }} />}
    </div>}
    {historyReadable && <div className="space-y-3 border-t pt-4" data-protocol-history><h4 className="font-semibold">{t('merchantUx.salesProtocol.history')}</h4><p>{t('merchantUx.policyEvaluation.archivePage', { page: cursors.length })}</p>
      {!history.data!.items.length && <p>{t('merchantUx.salesProtocol.empty')}</p>}
      {history.data!.items.map(row => <article className="min-w-0 space-y-2 rounded-lg border p-3" key={row.protocolId} data-protocol-history-id={row.protocolId}><h5 dir="auto" className="font-medium">{row.title}</h5><p>{t('merchantUx.salesProtocol.reference', { id: row.protocolId })} · {row.state === 'registered' ? t('merchantUx.salesProtocol.registered') : t('merchantUx.salesProtocol.withdrawn')}</p>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-read={row.protocolId} disabled={!browseReady} onClick={() => { setSelected(row.protocolId); setRecordVersion(n => n + 1); }}>{t('merchantUx.salesProtocol.read')}</Button></article>)}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-history-back disabled={!browseReady || cursors.length < 2} onClick={() => navigate(cursors.slice(0, -1))}>{t('merchantUx.policyEvaluation.archivePrevious')}</Button>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-history-next disabled={!browseReady || !history.data!.nextBeforeId} onClick={() => navigate([...cursors, history.data!.nextBeforeId!])}>{t('merchantUx.policyEvaluation.archiveNext')}</Button></div>
    </div>}
    {selected && <ProtocolRecordView key={`${selected}:${recordVersion}`} protocolId={selected} active={writeReady && !draft} onLock={lockWithdrawal}
      onWithdraw={(record, reason) => void save({ kind: 'withdraw', input: { protocolId: record.protocolId, protocolDigest: record.protocolDigest, requestId: crypto.randomUUID(), reason } })} />}
  </section>;
}

function ProtocolRecordView({ protocolId, active, onLock, onWithdraw }: { protocolId: number; active: boolean; onLock: (value: boolean) => void; onWithdraw: (record: ProtocolRecord, reason: string) => void }) {
  const { t } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const query = trpc.sariBrain.getSalesExperimentProtocol.useQuery({ protocolId }, options), [reason, setReason] = useState(''), [attested, setAttested] = useState(false);
  const data = query.data, readable = !query.isError && !query.isLoading && compatibleProtocolRecord(data, protocolId);
  const [cohortLock, setCohortLock] = useState(false), lockCohort = useCallback((value: boolean) => setCohortLock(value), []);
  const [launchLock, setLaunchLock] = useState(false), lockLaunch = useCallback((value: boolean) => setLaunchLock(value), []);
  const [reviewLock, setReviewLock] = useState(false), lockReview = useCallback((value: boolean) => setReviewLock(value), []);
  const lastRecord = useRef<ProtocolRecord | null>(null); if (readable) lastRecord.current = data;
  const eligible = readable && data.state === 'registered' && active && !query.isFetching && !cohortLock && !reviewLock && !launchLock;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { onLock(!!reason || cohortLock || reviewLock || launchLock); return () => onLock(false); }, [reason, cohortLock, reviewLock, launchLock, onLock]);
  useEffect(() => { setAttested(false); if (data?.state === 'withdrawn') setReason(''); }, [data?.protocolDigest, data?.state, query.isError]);
  return <section className="min-w-0 space-y-4 rounded-lg border p-3" data-protocol-record aria-busy={query.isFetching}>
    <h4 ref={heading} tabIndex={-1} className="text-base font-semibold focus-visible:outline">{t('merchantUx.salesProtocol.reference', { id: protocolId })}</h4><p className="text-muted-foreground">{t('merchantUx.salesProtocol.recordScope')}</p>
    <Button type="button" variant="outline" className="min-h-11" data-protocol-record-refresh disabled={!active || query.isFetching || cohortLock || reviewLock || launchLock} onClick={() => { setAttested(false); void query.refetch(); }}>{t('merchantUx.policyEvaluation.refresh')}</Button>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {query.isError && <p role="alert">{t('merchantUx.salesProtocol.refreshFailed')}</p>}
    {!query.isError && !query.isLoading && !readable && <p role="alert" data-protocol-unsupported>{t('merchantUx.salesProtocol.unsupported')}</p>}
    {readable && <><p data-protocol-state={data.state}>{data.state === 'registered' ? t('merchantUx.salesProtocol.registered') : t('merchantUx.salesProtocol.withdrawn')}</p>
      <ProtocolDesignSummary design={data.protocol.design} sampleRecorded={!!data.protocol.sampleCalculation} />
      <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer py-2 font-medium">{t('merchantUx.salesProtocol.source')}</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {[[t('merchantUx.salesProtocol.created'), data.protocol.registeredAt], [t('merchantUx.salesProtocol.candidate'), data.protocol.candidate.id],
          [t('merchantUx.salesProtocol.artifact'), data.protocol.candidate.artifactDigest], [t('merchantUx.salesProtocol.baseline'), data.protocol.candidate.baselineDigest],
          [t('merchantUx.salesProtocol.sourceDigest'), data.protocol.candidate.sourceDigest], [t('merchantUx.salesProtocol.review'), data.protocol.candidate.preparationReviewId],
          [t('merchantUx.salesProtocol.sector'), data.protocol.sector.playbook.id], [t('merchantUx.salesProtocol.sectorRevision'), data.protocol.sector.revision]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd dir="auto">{value}</dd></div>)}
      </dl></details>
      {data.withdrawal && <div className="space-y-2 rounded-lg border p-3" data-protocol-withdrawal-audit><h5 className="font-semibold">{t('merchantUx.salesProtocol.withdrawalAudit')}</h5><p dir="auto" className="whitespace-pre-wrap">{data.withdrawal.reason}</p><p>{data.withdrawal.actorUserId ? t('merchantUx.policyReview.reviewer', { id: data.withdrawal.actorUserId }) : t('merchantUx.policyReview.removedReviewer')}</p></div>}
      {data.state === 'registered' && <div className="space-y-3 border-t pt-4"><label htmlFor={id} className="block font-medium">{t('merchantUx.salesProtocol.withdrawalReason')}</label>
        <textarea id={id} data-protocol-withdraw-reason maxLength={3000} rows={3} className="w-full min-w-0 rounded-md border bg-background p-3 text-base" value={reason} disabled={!eligible} aria-describedby={`${id}-hint`} onChange={e => { setReason(e.target.value); setAttested(false); }} />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t('merchantUx.salesProtocol.textHint')}</p>
        <label className="flex min-h-11 items-start gap-2 py-2"><input type="checkbox" data-protocol-withdraw-consent className="mt-1 size-5 shrink-0" checked={attested} disabled={!eligible || reason.trim().length < 30} onChange={e => setAttested(e.target.checked)} /><span>{t('merchantUx.salesProtocol.withdrawalConsent')}</span></label>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-protocol-withdraw disabled={!eligible || !attested || reason.trim().length < 30} onClick={() => { if (eligible && attested && reason.trim().length >= 30) onWithdraw(data, reason.trim()); }}>{t('merchantUx.salesProtocol.withdraw')}</Button>
      </div>}
    </>}
    {lastRecord.current && <SalesCohortQualification record={lastRecord.current} active={active && readable && !query.isFetching && !reason && !reviewLock && !launchLock} onLock={lockCohort} />}
    {lastRecord.current && <SalesExperimentReview record={lastRecord.current} active={active && readable && !query.isFetching && !reason && !cohortLock && !launchLock} onLock={lockReview} />}
    {lastRecord.current && <SalesExperimentLaunch record={lastRecord.current} active={active && readable && !query.isFetching && !reason && !cohortLock && !reviewLock} onLock={lockLaunch} />}
  </section>;
}
