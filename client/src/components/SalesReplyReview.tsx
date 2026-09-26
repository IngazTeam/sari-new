import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { SalesReplySend } from './SalesReplySend';
import { replyReviewCriteria, replyReviewList, type ReplyReviewReceipt, type ReplyReviewSubmission } from '../../../shared/sales-reply-review';
import { buildReplyReviewSubmission, definiteFirstReplyReviewError, emptyReplyReviewDraft, matchingReplyReviewReceipt,
  replyReviewKey, reviewWorkspace, type ReplyReviewDraft } from '@/lib/sales-reply-review-state';

const queryOptions = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
const control = 'min-h-11 h-auto whitespace-normal';
type Pending = { input: ReplyReviewSubmission; actor: number; critical: boolean };

export function SalesReplyReview() {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  return <section className="min-w-0 border-t pt-4" data-reply-review>
    <Button type="button" variant="outline" className={control} data-reply-open aria-expanded={open} aria-controls={id}
      onClick={() => { setMounted(true); setOpen(v => !v); }}>{open ? t('merchantUx.replyReview.close') : t('merchantUx.replyReview.open')}</Button>
    <div id={id} hidden={!open}>{mounted && <SalesReplyReviewPanel active={open} />}</div>
  </section>;
}
export function SalesReplyReviewPanel({ active }: { active: boolean }) {
  const { t, i18n } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]), [selected, setSelected] = useState<number | null>(null);
  const list = trpc.sariBrain.listSalesReplyReviews.useQuery({ beforeId: cursors.at(-1), limit: 10 }, { ...queryOptions, enabled: active });
  const read = trpc.sariBrain.getSalesReplyReviewWorkspace.useQuery({ generationId: selected ?? 1 }, { ...queryOptions, enabled: active && !!selected });
  const write = trpc.sariBrain.submitSalesReplyReview.useMutation({ retry: false });
  const parsedList = replyReviewList.safeParse(list.data), rows = !list.isError && !list.isLoading && parsedList.success ? parsedList.data : null;
  const workspace = selected && !read.isError && !read.isLoading ? reviewWorkspace(read.data, selected) : null;
  const [draft, setDraft] = useState<ReplyReviewDraft | null>(null), [draftKey, setDraftKey] = useState('');
  const [attested, setAttested] = useState(false), [acknowledged, setAcknowledged] = useState(false), [discard, setDiscard] = useState(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<'unknown' | 'changed' | 'refresh' | null>(null), [saved, setSaved] = useState<ReplyReviewReceipt | null>(null);
  const pending = useRef<Pending | null>(null), inFlight = useRef(false), [now, setNow] = useState(Date.now());
  const [sendLocked, setSendLocked] = useState(false);
  const unknown = failure === 'unknown', locked = !!draft || busy || unknown || sendLocked;
  const key = workspace ? replyReviewKey(workspace) : '', changed = !!draft && (!workspace || key !== draftKey || !workspace.canReview);
  const expired = !!workspace?.basis && now >= Date.parse(workspace.basis.observationEndsAt);
  const editable = active && !!workspace?.canReview && !read.isFetching && !busy && !sendLocked && !failure && !changed && !expired;
  const canBrowse = active && !!rows && !list.isFetching && !locked;
  const labels = {
    answersQuestion: t('merchantUx.replyReview.answersQuestion'), groundedInBusiness: t('merchantUx.replyReview.groundedInBusiness'),
    appropriateNextStep: t('merchantUx.replyReview.appropriateNextStep'), respectsCustomerDecision: t('merchantUx.replyReview.respectsCustomerDecision'),
    noUnverifiedCommitment: t('merchantUx.replyReview.noUnverifiedCommitment'), languageAndClarity: t('merchantUx.replyReview.languageAndClarity'),
  };
  const states = { dispatching: t('merchantUx.replyReview.dispatching'), responded: t('merchantUx.replyReview.responded'), invalid: t('merchantUx.replyReview.invalid'),
    blocked: t('merchantUx.replyReview.blocked'), uncertain: t('merchantUx.replyReview.uncertain') };
  const outcome = (value: 'approved' | 'rejected' | null) => value === 'approved' ? t('merchantUx.replyReview.approved') : value === 'rejected' ? t('merchantUx.replyReview.rejected') : t('merchantUx.replyReview.unreviewed');
  const time = (value: string) => new Date(value).toLocaleString(i18n.language === 'ar' ? 'ar-SA' : 'en-GB');
  const validation = draft && workspace ? buildReplyReviewSubmission(workspace, draft, '00000000-0000-4000-8000-000000000001') : null;
  useEffect(() => { if (!active) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  useEffect(() => { setAttested(false); setAcknowledged(false); }, [key, workspace?.canReview, expired]);
  useEffect(() => { if (draft) heading.current?.focus(); }, [!!draft]);
  useEffect(() => {
    if (!locked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [locked]);
  const update = (fn: (previous: ReplyReviewDraft) => ReplyReviewDraft) => {
    if (!editable || !draft) return; setDraft(previous => previous ? fn(previous) : previous); setAttested(false); setAcknowledged(false);
  };
  async function refresh() {
    if (!active || inFlight.current) return;
    inFlight.current = true; setBusy(true); setAttested(false); setAcknowledged(false);
    try {
      const result = await list.refetch();
      const detail = selected ? await read.refetch() : null;
      if (result.error || !replyReviewList.safeParse(result.data).success || detail && (detail.error || !reviewWorkspace(detail.data, selected!))) throw Error('refresh');
      if (!pending.current) setFailure(null);
    } catch { if (!pending.current) setFailure(saved ? 'refresh' : 'changed'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save() {
    if (!active || inFlight.current) return;
    const recovering = !!pending.current;
    if (!recovering) {
      if (!editable || !workspace || !draft || !attested || !acknowledged) return;
      const input = buildReplyReviewSubmission(workspace, draft, crypto.randomUUID());
      if (!input || !workspace.basis) return;
      pending.current = { input, actor: workspace.actorUserId, critical: workspace.basis.gate.some(v => v.severity === 'critical') };
    }
    const request = pending.current!;
    inFlight.current = true; setBusy(true);
    try {
      const result = await write.mutateAsync(request.input), receipt = matchingReplyReviewReceipt(result, request.input, request.actor, request.critical);
      if (!receipt) throw Error('Unconfirmed receipt');
      setSaved(receipt); pending.current = null; setDraft(null); setDraftKey(''); setAttested(false); setAcknowledged(false); setDiscard(false); setFailure(null);
      try {
        const refreshed = await read.refetch(), refreshedList = await list.refetch();
        if (refreshed.error || !reviewWorkspace(refreshed.data, request.input.generationId) || refreshedList.error || !replyReviewList.safeParse(refreshedList.data).success) throw Error('refresh');
      } catch { setFailure('refresh'); }
    } catch (error) {
      if (!recovering && definiteFirstReplyReviewError(error)) { pending.current = null; setFailure('changed'); }
      else setFailure('unknown');
      setAttested(false); setAcknowledged(false);
    } finally { setBusy(false); inFlight.current = false; }
  }
  const receiptView = (r: ReplyReviewReceipt) => <div className="min-w-0 space-y-2 rounded-lg border p-3" key={r.reviewId} data-reply-receipt>
    <p className="font-semibold">{t('merchantUx.replyReview.revision', { revision: r.revision })} · {outcome(r.outcome)}</p>
    <time dateTime={r.reviewedAt}>{time(r.reviewedAt)}</time>
    <p className="text-sm text-muted-foreground">{t('merchantUx.replyReview.historical')}</p>
    <details><summary className="flex min-h-11 cursor-pointer items-center underline">{t('merchantUx.replyReview.viewReason')}</summary>
      <ul className="space-y-2 py-2">{replyReviewCriteria.map(criterion => <li key={criterion}>{labels[criterion]}: <strong>{r.checks[criterion] ? t('merchantUx.replyReview.pass') : t('merchantUx.replyReview.fail')}</strong></li>)}</ul>
      <blockquote className="whitespace-pre-wrap border-s-2 ps-3 [overflow-wrap:anywhere]" dir="auto">{r.quote}</blockquote>
      <p className="mt-3 whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">{r.rationale}</p>
    </details>
  </div>;
  return <div className="min-w-0 space-y-5 pt-4 [overflow-wrap:anywhere]" data-reply-panel>
    <div className="space-y-2"><h2 className="text-xl font-semibold">{t('merchantUx.replyReview.title')}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.replyReview.scope')}</p></div>
    <Button type="button" variant="outline" className={control} data-reply-refresh disabled={!active || busy || list.isFetching || !!selected && read.isFetching} onClick={() => void refresh()}>{t('merchantUx.replyReview.refresh')}</Button>
    {list.isLoading ? <p role="status">{t('merchantUx.replyReview.loading')}</p> : !rows ? <p role="alert">{t('merchantUx.replyReview.loadFailed')}</p> : <>
      {!rows.items.length && <p>{t('merchantUx.replyReview.empty')}</p>}
      <ul className="grid min-w-0 gap-2 sm:grid-cols-2">{rows.items.map(row => <li key={row.generationId} className="min-w-0">
        <Button type="button" variant={row.generationId === selected ? 'secondary' : 'outline'} className={`${control} w-full flex-col items-start gap-1 p-3 text-start`} data-reply-select={row.generationId}
          disabled={!canBrowse} aria-pressed={row.generationId === selected} onClick={() => { setSelected(row.generationId); setSaved(null); setFailure(null); }}>
          <span>{t('merchantUx.replyReview.select', { id: row.generationId })}</span><span className="text-xs">{states[row.state]} · {outcome(row.reviewOutcome)}</span>
        </Button></li>)}</ul>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className={control} data-reply-newer disabled={!canBrowse || cursors.length < 2}
        onClick={() => { setCursors(v => v.slice(0, -1)); setSelected(null); setSaved(null); }}>{t('merchantUx.replyReview.previous')}</Button>
        <Button type="button" variant="outline" className={control} data-reply-older disabled={!canBrowse || !rows.nextCursor}
          onClick={() => { setCursors(v => [...v, rows.nextCursor!]); setSelected(null); setSaved(null); }}>{t('merchantUx.replyReview.next')}</Button></div>
    </>}
    {failure && <p role="alert" data-reply-failure className="rounded-lg border p-3">{failure === 'unknown' ? t('merchantUx.replyReview.unknown') : failure === 'refresh' ? t('merchantUx.replyReview.refreshFailed') : t('merchantUx.replyReview.changed')}</p>}
    {unknown && <Button type="button" className={control} data-reply-retry disabled={!active || busy} onClick={() => void save()}>{busy ? t('merchantUx.replyReview.saving') : t('merchantUx.replyReview.retry')}</Button>}
    {saved && <div className="space-y-2" data-reply-saved><p role="status">{t('merchantUx.replyReview.saved', { revision: saved.revision })}</p>{receiptView(saved)}</div>}
    {selected && (read.isLoading ? <p role="status">{t('merchantUx.replyReview.loading')}</p> : !workspace ? <p role="alert">{t('merchantUx.replyReview.loadFailed')}</p> : <div className="min-w-0 space-y-4" data-reply-workspace>
      <p>{expired ? t('merchantUx.replyReview.expired') : workspace.stage === 'ready' ? t('merchantUx.replyReview.ready') : workspace.stage === 'owner_required' ? t('merchantUx.replyReview.ownerOnly') : workspace.stage === 'incomplete' ? t('merchantUx.replyReview.incomplete') : t('merchantUx.replyReview.unavailable')}</p>
      {workspace.basis && <>
        <p className="rounded-lg bg-muted p-3 text-sm leading-relaxed">{t('merchantUx.replyReview.contextScope')}</p>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">{[{ label: t('merchantUx.replyReview.customer'), text: workspace.basis.customerMessage },
          { label: t('merchantUx.replyReview.previousReply'), text: workspace.basis.lastAssistantMessage || t('merchantUx.replyReview.noPrevious') }].map(row => <div key={row.label} className="min-w-0 rounded-lg border p-3"><h3 className="mb-2 font-semibold">{row.label}</h3><p className="whitespace-pre-wrap" dir="auto">{row.text}</p></div>)}</div>
        <p className="text-xs text-muted-foreground">{t('merchantUx.replyReview.checked')}: {time(workspace.basis.checkedAt)} · {t('merchantUx.replyReview.ends')}: {time(workspace.basis.observationEndsAt)}</p>
      </>}
      {workspace.responseText && <div className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">{t('merchantUx.replyReview.response')}</h3><p className="whitespace-pre-wrap leading-relaxed" data-reply-original dir="auto">{workspace.responseText}</p></div>}
      {!!workspace.basis?.gate.length && <div className="rounded-lg border border-amber-500 p-3" data-reply-gate><p>{t('merchantUx.replyReview.safety')}</p>
        <ul>{workspace.basis.gate.map((g, i) => <li key={i}>{g.severity === 'critical' ? t('merchantUx.replyReview.critical') : t('merchantUx.replyReview.warning')}: <code dir="ltr">{g.rule}</code></li>)}</ul></div>}
      {!draft && <Button type="button" className={control} data-reply-start disabled={!editable} onClick={() => { setDraft(emptyReplyReviewDraft()); setDraftKey(key); setSaved(null); }}>{t('merchantUx.replyReview.start')}</Button>}
      <details data-reply-history><summary className="flex min-h-11 cursor-pointer items-center font-semibold">{t('merchantUx.replyReview.history')} ({workspace.history.length})</summary>
        <div className="space-y-3">{workspace.reviewCurrentAtRead && <p>{t('merchantUx.replyReview.current')}</p>}{!workspace.history.length && <p>{t('merchantUx.replyReview.historyEmpty')}</p>}{workspace.history.map(receiptView)}</div></details>
      {workspace.stage !== 'owner_required' && workspace.history.some(r => r.outcome === 'approved') && <SalesReplySend key={selected} generationId={selected}
        active={active && !draft && !busy && !unknown && !read.isFetching} reviewKey={key} onLockedChange={setSendLocked} />}
    </div>)}
    {draft && <div className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-5" data-reply-draft>
      <h3 ref={heading} tabIndex={-1} className="font-semibold">{t('merchantUx.replyReview.criteria')}</h3><p className="text-sm text-muted-foreground">{t('merchantUx.replyReview.draftHint')}</p>
      {changed && <p role="alert" data-reply-changed>{t('merchantUx.replyReview.changed')}</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">{replyReviewCriteria.map(criterion => <label className="min-w-0 space-y-2 rounded-lg border p-3" key={criterion}>
        <span className="block text-sm font-medium">{labels[criterion]}</span>
        <select className="min-h-11 w-full min-w-0 rounded-md border bg-background px-2 text-base" data-reply-criterion={criterion} value={draft.checks[criterion]} disabled={!editable}
          onChange={event => update(d => ({ ...d, checks: { ...d.checks, [criterion]: event.target.value as '' | 'pass' | 'fail' } }))}>
          <option value="">{t('merchantUx.replyReview.choose')}</option><option value="pass">{t('merchantUx.replyReview.pass')}</option><option value="fail">{t('merchantUx.replyReview.fail')}</option>
        </select></label>)}</div>
      <label className="block space-y-2"><span className="font-medium">{t('merchantUx.replyReview.quote')}</span><span id={`${id}-quote`} className="block text-sm text-muted-foreground">{t('merchantUx.replyReview.quoteHint')}</span>
        <textarea className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3 text-base" data-reply-quote value={draft.quote} maxLength={2000} disabled={!editable} dir="auto" aria-describedby={`${id}-quote`}
          onChange={event => update(d => ({ ...d, quote: event.target.value }))} /></label>
      <label className="block space-y-2"><span className="font-medium">{t('merchantUx.replyReview.rationale')}</span><span id={`${id}-rationale`} className="block text-sm text-muted-foreground">{t('merchantUx.replyReview.rationaleHint')}</span>
        <textarea className="min-h-28 w-full min-w-0 rounded-md border bg-background p-3 text-base" data-reply-rationale value={draft.rationale} maxLength={3000} disabled={!editable} dir="auto" aria-describedby={`${id}-rationale`}
          onChange={event => update(d => ({ ...d, rationale: event.target.value }))} /></label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" data-reply-attest checked={attested} disabled={!editable} onChange={e => setAttested(e.target.checked)} /><span>{t('merchantUx.replyReview.attestation')}</span></label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 shrink-0" data-reply-ack checked={acknowledged} disabled={!editable} onChange={e => setAcknowledged(e.target.checked)} /><span>{t('merchantUx.replyReview.acknowledge')}</span></label>
      <div className="flex flex-wrap gap-2"><Button type="button" className={control} data-reply-save disabled={!editable || !validation || !attested || !acknowledged} onClick={() => void save()}>{busy ? t('merchantUx.replyReview.saving') : t('merchantUx.replyReview.save')}</Button>
        <Button type="button" variant="outline" className={control} data-reply-discard disabled={!active || busy || unknown} onClick={() => setDiscard(true)}>{t('merchantUx.replyReview.discard')}</Button></div>
      {discard && <div className="space-y-2 rounded-lg border p-3" role="group" aria-label={t('merchantUx.replyReview.confirmDiscard')}><p>{t('merchantUx.replyReview.confirmDiscard')}</p><div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" className={control} data-reply-discard-confirm disabled={!active || busy || unknown} onClick={() => { setDraft(null); setDraftKey(''); setAttested(false); setAcknowledged(false); setDiscard(false); setFailure(null); }}>{t('merchantUx.replyReview.confirm')}</Button>
        <Button type="button" variant="outline" className={control} disabled={!active || busy} onClick={() => setDiscard(false)}>{t('merchantUx.replyReview.keep')}</Button></div></div>}
    </div>}
  </div>;
}
