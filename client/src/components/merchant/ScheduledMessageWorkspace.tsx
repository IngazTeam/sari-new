import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { ScheduledMessageHistory, scheduledStamp } from './ScheduledMessageHistory';
import { scheduledWorkspaceLabels } from '@/lib/scheduled-workspace-labels';
import { scheduledNavigation, scheduledSelectionKey, scopedScheduledWorkspace, scopedScheduledReview, scopedScheduledResult, scopedScheduledCancellation, scheduledStorageKey, scheduledDefinitionKey, scheduledForm, scheduledFormTarget, scheduledErrorKey } from '@/lib/scheduled-workspace';
import { catalogHref } from '@/lib/service-catalog-navigation';
import type { ScheduledEvidenceRow } from '@shared/scheduled-message-evidence';
import type { ScheduledActionTarget, ScheduledActionReview } from '@shared/scheduled-message-actions';
import '@/styles/service-catalog-workspace.css';
import '@/styles/scheduled-workspace.css';
type Modal = { kind: 'details'; row: ScheduledEvidenceRow } | { kind: 'edit'; row?: ScheduledEvidenceRow } | { kind: 'review'; target: ScheduledActionTarget; row?: ScheduledEvidenceRow };
export function ScheduledMessageWorkspace({ actorId, merchantId }: { actorId: number; merchantId: number }) {
  const { t, i18n } = useTranslation(), c = scheduledWorkspaceLabels(t), locale = i18n.language.startsWith('ar') ? 'ar' : 'en', utils = trpc.useUtils();
  const [path, navigate] = useLocation(), search = useSearch(), selection = scheduledNavigation(search), key = scheduledSelectionKey(selection), storageKey = scheduledStorageKey(actorId, merchantId);
  const query = trpc.scheduledMessages.workspace.useQuery(selection, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const data = query.error ? null : scopedScheduledWorkspace(query.data, actorId, merchantId, selection);
  const reviewMutation = trpc.scheduledMessages.reviewAction.useMutation({ retry: false }), apply = trpc.scheduledMessages.applyAction.useMutation({ retry: false }), resolveMutation = trpc.scheduledMessages.resolveActionReceipt.useMutation({ retry: false });
  const [modal, setModal] = useState<Modal | null>(null), [form, setForm] = useState(() => scheduledForm()), [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [review, setReview] = useState<ScheduledActionReview | null>(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState(''), [searchDraft, setSearchDraft] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(() => { try { const k = sessionStorage.getItem(storageKey); return k && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(k) ? k : null; } catch { return null; } });
  const live = useRef(true), locked = useRef(false), scope = useRef(''), heading = useRef<HTMLHeadingElement>(null), dialogHeading = useRef<HTMLHeadingElement>(null), errorHeading = useRef<HTMLParagraphElement>(null), formElement = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null), focusHeading = useRef(false);
  scope.current = `${actorId}:${merchantId}:${key}:${locale}`;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setModal(null); setReview(null); setFailure(''); setSearchDraft(null); }, [search, locale]);
  useEffect(() => { if (query.error) { setModal(null); setReview(null); } }, [query.error]);
  useEffect(() => { if (!busy && failure) (formElement.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? errorHeading.current)?.focus(); }, [failure, busy, errors]);
  useEffect(() => { if (modal?.kind === 'review') dialogHeading.current?.focus(); }, [modal?.kind]);
  useEffect(() => { if (!review) return; const deadline = Math.min(Date.parse(review.expiresAt), review.nextDueAt ? Date.parse(review.nextDueAt) : Infinity); const timer = window.setTimeout(() => { setReview(null); setFailure(c.stale); }, Math.max(0, deadline - Date.now() + 1)); return () => window.clearTimeout(timer); }, [review, c.stale]);
  const same = !modal?.row || !!data?.rows.some(r => r.id === modal.row!.id && scheduledDefinitionKey(r) === scheduledDefinitionKey(modal.row!));
  const writable = !!data?.canManage && !query.isFetching && !busy && !pending && same;
  const days = [c.sun, c.mon, c.tue, c.wed, c.thu, c.fri, c.sat], zone = data?.timezone ?? null;
  const stamp = (value: string | null, timezone = zone) => scheduledStamp(value, locale, timezone, c);
  const change = (patch: Record<string, string | number | null>) => navigate(catalogHref(path, search, patch));
  const refresh = () => query.refetch();
  function open(value: Modal) { opener.current = document.activeElement as HTMLElement; setErrors({}); setFailure(''); setReview(null); if (value.kind === 'edit') setForm(scheduledForm(value.row)); setModal(value); }
  function clearPending(requestKey: string) { try { if (sessionStorage.getItem(storageKey) === requestKey) sessionStorage.removeItem(storageKey); } catch {} setPending(null); }
  async function prepare(target: ScheduledActionTarget, row?: ScheduledEvidenceRow) {
    if (!writable || locked.current) return; const view = scope.current; locked.current = true; setBusy(true); setFailure(''); setReview(null); setModal({ kind: 'review', target, row });
    try { const raw = await reviewMutation.mutateAsync(target); if (!live.current || view !== scope.current) return; const checked = scopedScheduledReview(raw, actorId, merchantId, target); if (!checked) throw Error();
      if (row && checked.before && scheduledDefinitionKey(row) !== scheduledDefinitionKey(checked.before)) { setFailure(c.stale); return; } setReview(checked);
    } catch (e) { if (live.current && view === scope.current) setFailure(c[scheduledErrorKey(e)]); }
    finally { locked.current = false; if (live.current) setBusy(false); }
  }
  function reviewForm() {
    if (modal?.kind !== 'edit' || !writable) return; const checked = scheduledFormTarget(form, zone, modal.row); setErrors(checked.errors);
    if (!checked.target) { setFailure(checked.noChanges ? c.noChanges : c.validation); return; } void prepare(checked.target, modal.row);
  }
  async function saved(requestKey: string) { clearPending(requestKey); setModal(null); setReview(null); setFailure(''); setNotice(c.saved); focusHeading.current = true; await refresh(); }
  async function save() {
    if (!writable || locked.current || !review || modal?.kind !== 'review') return; const view = scope.current, target = modal.target, requestKey = crypto.randomUUID(); let dispatched = false;
    locked.current = true; setBusy(true); setFailure('');
    try {
      sessionStorage.setItem(storageKey, requestKey); if (sessionStorage.getItem(storageKey) !== requestKey) throw Error('Storage unavailable'); setPending(requestKey); dispatched = true;
      const raw = await apply.mutateAsync({ target, checkedAt: review.checkedAt, reviewRevision: review.reviewRevision, requestKey });
      if (!live.current || view !== scope.current) return; if (!scopedScheduledResult(raw, actorId, merchantId, requestKey, target)) throw Error(); await saved(requestKey);
    } catch (e) {
      if (live.current && view === scope.current) {
        if (!dispatched) setFailure(c.storageError);
        else if (['CONFLICT', 'BAD_REQUEST', 'FORBIDDEN', 'NOT_FOUND', 'PRECONDITION_FAILED'].includes((e as any)?.data?.code)) { clearPending(requestKey); setReview(null); setFailure(c[scheduledErrorKey(e)]); }
        else setFailure(c.pending);
      }
    } finally { locked.current = false; if (live.current) setBusy(false); }
  }
  async function recover(resolve = false) {
    if (!pending || locked.current) return; const view = scope.current, requestKey = pending; locked.current = true; setBusy(true); setFailure('');
    try {
      const result = resolve ? await resolveMutation.mutateAsync({ requestKey }) : await utils.scheduledMessages.actionReceipt.fetch({ requestKey }, { staleTime: 0 });
      if (!live.current || view !== scope.current) return;
      if (result.state === 'saved' && scopedScheduledResult(result.result, actorId, merchantId, requestKey)) await saved(requestKey);
      else if (result.state === 'cancelled' && scopedScheduledCancellation(result.result, actorId, merchantId, requestKey)) { clearPending(requestKey); setModal(null); setReview(null); setNotice(c.cancelledRequest); await refresh(); }
      else setFailure(result.state === 'missing' ? c.missingReceipt : c.pending);
    } catch (e) { if (live.current && view === scope.current) setFailure(c[scheduledErrorKey(e)]); }
    finally { locked.current = false; if (live.current) setBusy(false); }
  }
  const pendingPanel = pending && <div className="sc-feedback sm-pending" role="status"><p>{c.pending}</p><details><summary>{c.receipt}</summary><code>{pending}</code></details><Button variant="outline" disabled={busy} onClick={() => void recover()}>{c.recover}</Button><p>{c.resolveHelp}</p><Button variant="outline" disabled={busy} onClick={() => void recover(true)}>{c.resolve}</Button></div>;
  const approvalText = (state: ScheduledEvidenceRow['authorization']['state']) => ({ missing: c.approvalMissing, revoked: c.approvalRevoked, invalid: c.approvalInvalid, changed: c.approvalChanged, recorded: c.approvalRecorded })[state];
  const effect = review ? ({ create_paused: c.createEffect, update_paused: c.updateEffect, enable: c.enableEffect, disable: c.disableEffect, delete: c.deleteEffect })[review.effect] : '';
  const rowFacts = (row: ScheduledEvidenceRow) => <><dl className="sm-facts"><div><dt>{c.day}</dt><dd>{row.dayOfWeek === null ? c.unknown : days[row.dayOfWeek]}</dd></div><div><dt>{c.time}</dt><dd><bdi>{row.time ?? c.unknown}</bdi></dd></div><div><dt>{c.approval}</dt><dd>{approvalText(row.authorization.state)}</dd></div>{row.nextDueAt && <div><dt>{c.expectedNext}</dt><dd>{stamp(row.nextDueAt)}</dd></div>}</dl>{row.nextIssue && <p className="sc-feedback">{c.errorSchedule}</p>}</>;
  return <div className="service-catalog scheduled-workspace" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={heading} tabIndex={-1}>{c.title}</h1><p>{c.intro}</p></div><div className="sc-actions"><Button variant="outline" disabled={busy || query.isFetching} onClick={() => void refresh()}><RefreshCw aria-hidden="true" />{c.refresh}</Button>{data?.canManage && <Button disabled={!writable || !zone} onClick={() => open({ kind: 'edit' })}><Plus aria-hidden="true" />{c.create}</Button>}</div></header>
    {notice && <p className="sc-feedback" role="status">{notice}</p>}{!modal && pendingPanel}{!modal && failure && <p ref={errorHeading} tabIndex={-1} role="alert" className="sc-feedback">{failure}</p>}
    {query.error ? <WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={() => void refresh()} /> : !data ? <WorkspaceState inline kind={query.isLoading || query.isFetching ? 'loading' : 'error'} onRetry={() => void refresh()} /> : <>
      {!data.canManage && <p className="sc-muted">{c.readonly}</p>}<dl className="sc-summary"><div><dt>{c.total}</dt><dd>{data.total.toLocaleString(locale)}</dd></div><div><dt>{c.paused}</dt><dd>{data.counts.disabled.toLocaleString(locale)}</dd></div><div><dt>{c.timezone}</dt><dd className="sm-zone"><bdi>{zone ?? c.unknown}</bdi></dd></div></dl>
      <p className="sc-muted">{c.timezoneHelp} <Link href="/merchant/settings">{c.settings}</Link></p>{!zone && <p className="sc-feedback" role="alert">{c.fieldTimezone}</p>}
      <section className="sc-list" aria-busy={query.isFetching}><form className="sc-filters" onSubmit={e => { e.preventDefault(); change({ q: (searchDraft ?? selection.query).trim(), page: null }); }}>
        <label className="sc-search"><span>{c.search}</span><input maxLength={100} placeholder={c.searchHint} value={searchDraft ?? selection.query} disabled={busy} onChange={e => setSearchDraft(e.target.value)} /></label><Button variant="outline" type="submit" disabled={busy}>{c.searchAction}</Button>
        <label><span>{c.state}</span><select disabled={busy} value={selection.state} onChange={e => change({ state: e.target.value === 'all' ? null : e.target.value, page: null })}><option value="all">{c.all}</option><option value="enabled">{c.enabled}</option><option value="disabled">{c.disabled}</option><option value="unknown">{c.unknownState}</option></select></label>
        <label><span>{c.day}</span><select disabled={busy} value={selection.day ?? ''} onChange={e => change({ day: e.target.value || null, page: null })}><option value="">{c.all}</option>{days.map((day, i) => <option key={i} value={i}>{day}</option>)}</select></label>
        <label><span>{c.sort}</span><select disabled={busy} value={selection.sort} onChange={e => change({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}><option value="newest">{c.newest}</option><option value="oldest">{c.oldest}</option><option value="title">{c.byTitle}</option><option value="schedule">{c.schedule}</option></select></label>
        {(selection.query || selection.state !== 'all' || selection.day !== null) && <Button variant="outline" type="button" disabled={busy} onClick={() => change({ q: null, state: null, day: null, page: null })}>{c.clear}</Button>}
      </form><p className="sc-results" aria-live="polite">{c.matches}: {data.matched.toLocaleString(locale)}</p>
        {!data.rows.length ? <div className="sc-empty"><p>{data.total ? c.noResults : c.empty}</p></div> : <div className="sm-grid">{data.rows.map(row => <article className="sm-card" key={row.id}><div className="sm-card-heading"><h2>{row.title ?? c.unknown}</h2><Badge variant="outline">{row.enabled === false ? c.paused : row.enabled === null ? c.unknownState : row.authorization.state === 'recorded' ? c.enabled : c.needsReview}</Badge></div>
          <p className="sc-description">{row.message ?? c.unknown}</p>{rowFacts(row)}
          {!!row.issues.length && <p className="sc-muted">{c.issueHelp}</p>}{row.latestOccurrence && <p className="sm-last-result">{c.accepted}: {row.latestOccurrence.acceptedByProvider?.toLocaleString(locale) ?? c.unknown} · {stamp(row.latestOccurrence.dueAt)}</p>}
          <div className="sc-record-actions"><Button variant="outline" disabled={busy} onClick={() => open({ kind: 'details', row })}>{c.details}<span className="sr-only"> #{row.id}</span></Button>{data.canManage && <><Button variant="outline" disabled={!writable} onClick={() => open({ kind: 'edit', row })}>{c.edit}<span className="sr-only"> #{row.id}</span></Button><Button disabled={!writable} onClick={() => { opener.current = document.activeElement as HTMLElement; void prepare({ action: 'toggle', id: row.id, enabled: !(row.enabled && row.authorization.state === 'recorded') }, row); }}>{row.enabled && row.authorization.state === 'recorded' ? c.disable : c.enable}<span className="sr-only"> #{row.id}</span></Button></>}</div>
        </article>)}</div>}
        {data.pages > 1 && <nav className="sc-pagination" aria-label={c.title}><Button variant="outline" disabled={busy || query.isFetching || data.currentPage <= 1} onClick={() => change({ page: data.currentPage - 1 })}>{c.previous}</Button><span>{c.page} {data.currentPage.toLocaleString(locale)} {c.of} {data.pages.toLocaleString(locale)}</span><Button variant="outline" disabled={busy || query.isFetching || data.currentPage >= data.pages} onClick={() => change({ page: data.currentPage + 1 })}>{c.next}</Button></nav>}
      </section>
    </>}
    <Dialog open={!!modal && !!data} onOpenChange={open => { if (!open && !busy) { setModal(null); setReview(null); } }}><DialogContent className="sc-dialog sm-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} showCloseButton={!busy} closeLabel={c.close} onInteractOutside={e => { if (busy) e.preventDefault(); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onOpenAutoFocus={e => { e.preventDefault(); dialogHeading.current?.focus(); }} onCloseAutoFocus={e => { e.preventDefault(); if (focusHeading.current) { heading.current?.focus(); focusHeading.current = false; } else if (opener.current?.isConnected) opener.current.focus(); else heading.current?.focus(); }}>
      <DialogHeader><DialogTitle ref={dialogHeading} tabIndex={-1}>{modal?.kind === 'details' ? c.details : modal?.kind === 'edit' ? modal.row ? c.edit : c.create : c.reviewTitle}</DialogTitle><DialogDescription>{modal?.kind === 'review' ? c.reviewIntro : modal?.kind === 'edit' ? c.draftHelp : modal?.row.title ?? c.title}</DialogDescription></DialogHeader>
      {modal?.kind === 'edit' ? <div className="sm-form" ref={formElement}>
        <label htmlFor="sm-title">{c.name}<input id="sm-title" maxLength={255} autoComplete="off" placeholder={c.titleHint} disabled={busy} value={form.title} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'sm-title-error' : undefined} onChange={e => setForm({ ...form, title: e.target.value })} />{errors.title && <span id="sm-title-error" className="sm-field-error">{c[errors.title as 'fieldRequired']}</span>}</label>
        <label htmlFor="sm-message">{c.message}<textarea id="sm-message" rows={5} maxLength={3800} disabled={busy} value={form.message} aria-invalid={!!errors.message} aria-describedby={'sm-message-help' + (errors.message ? ' sm-message-error' : '')} onChange={e => setForm({ ...form, message: e.target.value })} /><span id="sm-message-help" className="sc-muted">{c.messageHelp}</span>{errors.message && <span id="sm-message-error" className="sm-field-error">{c[errors.message as 'fieldRequired']}</span>}</label>
        <div className="sm-form-row"><label htmlFor="sm-day">{c.day}<select id="sm-day" value={form.day} disabled={busy} aria-invalid={!!errors.day} aria-describedby={errors.day ? 'sm-day-error' : undefined} onChange={e => setForm({ ...form, day: e.target.value })}><option value="">{c.day}</option>{days.map((day, i) => <option key={i} value={i}>{day}</option>)}</select>{errors.day && <span id="sm-day-error" className="sm-field-error">{c.fieldRequired}</span>}</label><label htmlFor="sm-time">{c.time}<input id="sm-time" type="time" step={60} value={form.time} disabled={busy} aria-invalid={!!errors.time} aria-describedby={errors.time ? 'sm-time-error' : undefined} onChange={e => setForm({ ...form, time: e.target.value })} />{errors.time && <span id="sm-time-error" className="sm-field-error">{c.fieldInvalid}</span>}</label></div>
        <p className="sc-muted">{c.timezone}: <bdi>{zone ?? c.unknown}</bdi></p>{errors.timezone && <p className="sm-field-error">{c.fieldTimezone}</p>}
      </div> : modal?.kind === 'details' ? <div className="sm-detail">{rowFacts(modal.row)}<p className="sm-message">{modal.row.message ?? c.unknown}</p><p className="sc-muted">{c.approvalHelp}</p>{modal.row.authorization.reviewedAt && <p className="sc-muted">{c.reviewedAt}: {stamp(modal.row.authorization.reviewedAt, modal.row.authorization.timezone)} · <bdi>{modal.row.authorization.timezone}</bdi></p>}{modal.row.legacyLastSentAt && <details><summary>{c.legacyTime}</summary><p>{stamp(modal.row.legacyLastSentAt)}</p><p className="sc-muted">{c.legacyHelp}</p></details>}<ScheduledMessageHistory key={modal.row.id} actorId={actorId} merchantId={merchantId} id={modal.row.id} c={c} locale={locale} zone={zone} /></div> : <>
        {busy && !review && <p role="status">{c.reviewing}</p>}{review && <div className="sm-review"><p className="sc-feedback">{effect}</p>{review.proposed && <><dl className="sm-facts"><div><dt>{c.name}</dt><dd>{review.proposed.title}</dd></div><div><dt>{c.schedule}</dt><dd>{days[review.proposed.dayOfWeek]} · <bdi>{review.proposed.time}</bdi></dd></div><div><dt>{c.timezone}</dt><dd><bdi>{review.proposed.timezone}</bdi></dd></div>{review.nextDueAt && <div><dt>{c.firstDue}</dt><dd>{stamp(review.nextDueAt, review.proposed.timezone)}</dd></div>}{review.instanceId && <div><dt>{c.channel}</dt><dd>{review.channelPhone ? <bdi>{review.channelPhone}</bdi> : c.primaryChannel}</dd></div>}</dl><h3>{c.preview}</h3><p className="sm-message">{review.messagePreview}</p></>}{review.effect === 'enable' && <><p>{c.audience}</p><p>{c.window}</p><p className="sc-muted">{c.noGuarantee}</p></>}<p className="sc-muted">{c.reviewExpires}: {stamp(review.expiresAt)}</p>{review.before && <details><summary>{c.before}</summary><p>{review.before.title}</p><p className="sm-message">{review.before.message}</p></details>}</div>}
      </>}
      {!same && !pending && <p className="sc-feedback" role="alert">{c.stale}</p>}{pendingPanel}{failure && <p ref={errorHeading} tabIndex={-1} role="alert" className="sc-feedback">{failure}</p>}
      <div className="sm-dialog-footer"><Button variant="outline" disabled={busy} onClick={() => setModal(null)}>{modal?.kind === 'details' ? c.close : c.cancel}</Button>
        {pending ? <Button disabled={busy} onClick={() => void recover()}>{c.recover}</Button> : modal?.kind === 'edit' ? <Button disabled={!writable} onClick={reviewForm}>{c.review}</Button> : modal?.kind === 'details' ? data?.canManage && <><Button variant="outline" disabled={!writable} onClick={() => void prepare({ action: 'delete', id: modal.row.id }, modal.row)}>{c.remove}</Button>{modal.row.enabled && <Button disabled={!writable} onClick={() => void prepare({ action: 'toggle', id: modal.row.id, enabled: false }, modal.row)}>{c.disable}</Button>}</> : <>
          {modal?.kind === 'review' && ['create', 'update'].includes(modal.target.action) && <Button variant="outline" disabled={busy} onClick={() => { setReview(null); setFailure(''); setModal({ kind: 'edit', row: modal.row }); }}>{c.back}</Button>}
          <Button disabled={!writable || !review} onClick={() => void save()}>{busy ? c.saving : c.confirm}</Button>{!review && !busy && <Button variant="outline" onClick={() => { setModal(null); void refresh(); }}>{c.refresh}</Button>}
        </>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
