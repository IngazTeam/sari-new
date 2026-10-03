import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Star } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { reviewWorkspaceLabels } from '@/lib/review-workspace-labels';
import { reviewNavigation, reviewSelectionKey, scopedReviewWorkspace, scopedReviewDetail, scopedReplyResult } from '@/lib/review-workspace';
import { catalogHref } from '@/lib/service-catalog-navigation';
import type { ReviewKind, ReviewRow } from '@shared/review-workspace';
import '@/styles/service-catalog-workspace.css';
import '@/styles/review-workspace.css';

export function ReviewWorkspace({ actorId, merchantId, kind }: { actorId: number; merchantId: number; kind: ReviewKind }) {
  const { t, i18n } = useTranslation(), c = reviewWorkspaceLabels(t), locale = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const utils = trpc.useUtils();
  const [path, navigate] = useLocation(), search = useSearch(), selection = reviewNavigation(search), key = reviewSelectionKey(selection);
  const orders = trpc.reviews.workspace.useQuery(selection, { enabled: kind === 'order', retry: false, staleTime: 0, refetchOnMount: 'always' });
  const bookings = trpc.bookingReviews.workspace.useQuery(selection, { enabled: kind === 'booking', retry: false, staleTime: 0, refetchOnMount: 'always' });
  const query = kind === 'order' ? orders : bookings;
  const data = query.error ? null : scopedReviewWorkspace(query.data, actorId, merchantId, kind, selection);
  const orderSave = trpc.reviews.saveReply.useMutation({ retry: false }), bookingSave = trpc.bookingReviews.saveReply.useMutation({ retry: false });
  const saveMutation = kind === 'order' ? orderSave : bookingSave;
  const [selected, setSelected] = useState<number | null>(null), [row, setRow] = useState<ReviewRow | null>(null), [canReply, setCanReply] = useState(false);
  const [draft, setDraft] = useState(''), [fieldError, setFieldError] = useState(''), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [searchDraft, setSearchDraft] = useState<string | null>(null);
  const alive = useRef(true), lock = useRef(false), epoch = useRef(0), scope = useRef(''), opener = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), dialogTitle = useRef<HTMLHeadingElement>(null), replyField = useRef<HTMLTextAreaElement>(null), errorHeading = useRef<HTMLParagraphElement>(null), noticeHeading = useRef<HTMLParagraphElement>(null);
  scope.current = `${actorId}:${merchantId}:${kind}:${key}:${locale}`;
  useEffect(() => { alive.current = true; return () => { alive.current = false; epoch.current++; }; }, []);
  useEffect(() => { epoch.current++; setSelected(null); setRow(null); setFailure(''); setNotice(''); setSearchDraft(null); }, [search, locale]);
  useEffect(() => { if (query.error) { epoch.current++; setSelected(null); setRow(null); } }, [query.error]);
  useEffect(() => { if (!busy && fieldError) replyField.current?.focus(); else if (!busy && failure) errorHeading.current?.focus(); }, [fieldError, failure, busy]);
  useEffect(() => { if (!busy && notice) noticeHeading.current?.focus(); }, [notice, busy]);
  const title = kind === 'order' ? c.orderTitle : c.bookingTitle, number = (n: number) => n.toLocaleString(locale);
  const change = (patch: Record<string, string | number | null>) => navigate(catalogHref(path, search, patch));
  const stamp = (value: string | null) => { if (!value) return c.unknown; try { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return c.unknown; } };
  const stars = (rating: number | null) => <span className="rw-stars" aria-label={rating === null ? c.unknown : `${number(rating)} / ${number(5)}`}>
    {rating === null ? c.unknown : <><bdi>{number(rating)} / {number(5)}</bdi><Star aria-hidden="true" /></>}</span>;
  const state = (r: ReviewRow) => r.replyState === 'unknown' ? c.unknown : r.replyState === 'replied' ? c.replied : c.pending;
  const visibility = (r: ReviewRow) => r.isPublic === null ? c.unknownVisibility : r.isPublic ? c.public : c.private;
  async function load(id: number, checking = false) {
    if (lock.current) return; lock.current = true; const view = scope.current, token = ++epoch.current; setBusy(true); setFailure(''); setFieldError(''); setRow(null); setCanReply(false);
    try {
      const raw = kind === 'order' ? await utils.reviews.detail.fetch({ id }, { staleTime: 0 }) : await utils.bookingReviews.detail.fetch({ id }, { staleTime: 0 });
      if (!alive.current || view !== scope.current || token !== epoch.current) return;
      const d = scopedReviewDetail(raw, actorId, merchantId, kind, id); if (!d) throw Error();
      setRow(d.row); setCanReply(d.canReply); setDraft(d.row.merchantReply ?? ''); setBlocked(false); if (checking) setNotice(c.checked);
    } catch (e) { if (alive.current && view === scope.current && token === epoch.current) { setFailure((e as any)?.data?.code === 'FORBIDDEN' ? c.denied : c.failed); setBlocked(true); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function open(id: number) {
    opener.current = document.activeElement as HTMLElement; setSelected(id); setNotice(''); setDraft(''); setBlocked(false); void load(id);
  }
  const writable = !!data?.canReply && canReply && row?.integrity === 'linked' && !busy && !blocked && !query.isFetching;
  async function save() {
    if (!writable || !row || lock.current) return;
    const text = draft.trim(); if (!text || text.length > 1000) { setFieldError(text ? c.tooLong : c.required); return; }
    const view = scope.current, token = epoch.current, id = row.id;
    lock.current = true; setBusy(true); setFailure(''); setFieldError(''); setNotice('');
    try {
      const raw = await saveMutation.mutateAsync({ id, revision: row.revision, reply: text });
      if (!alive.current || view !== scope.current || token !== epoch.current) return;
      const result = scopedReplyResult(raw, actorId, merchantId, kind, id, text); if (!result) throw Error();
      setRow(result.row); setDraft(result.row.merchantReply ?? ''); setNotice(result.effect === 'saved' ? c.saved : c.alreadyCurrent);
      void query.refetch();
    } catch (e) {
      if (alive.current && view === scope.current && token === epoch.current) {
        const code = (e as any)?.data?.code; setBlocked(true);
        setFailure(code === 'CONFLICT' ? c.stale : code === 'FORBIDDEN' ? c.denied : ['NOT_FOUND', 'PRECONDITION_FAILED', 'BAD_REQUEST'].includes(code) ? c.failed : c.uncertain);
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="service-catalog review-workspace" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{c.intro}</p></div><div className="sc-actions"><Button variant="outline" disabled={busy || query.isFetching} onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" />{c.refresh}</Button></div></header>
    {query.error ? <WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={() => void query.refetch()} /> : !data ? <WorkspaceState inline kind={query.isFetching || query.isLoading ? 'loading' : 'error'} onRetry={() => void query.refetch()} /> : <>
      {!data.canReply && <p className="sc-muted">{c.readonly}</p>}
      <dl className="sc-summary"><div><dt>{c.total}</dt><dd>{number(data.stats.total)}</dd></div><div><dt>{c.average}</dt><dd>{data.stats.average === null ? '—' : data.stats.average.toLocaleString(locale, { maximumFractionDigits: 1 })}</dd></div><div><dt>{c.pending}</dt><dd>{number(data.stats.pending)}</dd></div></dl>
      <div className="rw-evidence"><p className="sc-muted">{c.statsHelp}</p>{data.stats.unlinked > 0 && <p>{c.excluded}: {number(data.stats.unlinked)}</p>}{data.stats.invalidRatings > 0 && <p>{c.invalidRatings}: {number(data.stats.invalidRatings)}</p>}
        <details><summary>{c.distribution}</summary><dl className="rw-distribution">{([5, 4, 3, 2, 1] as const).map(n => <div key={n}><dt>{number(n)} {c.star}</dt><dd>{number(data.stats.distribution[n])}</dd></div>)}</dl></details></div>
      <section className="sc-list" aria-busy={query.isFetching}><form className="sc-filters" onSubmit={e => { e.preventDefault(); change({ q: (searchDraft ?? selection.query).trim(), page: null }); }}>
        <label className="sc-search"><span>{c.search}</span><input maxLength={100} placeholder={c.searchHint} value={searchDraft ?? selection.query} disabled={busy} onChange={e => setSearchDraft(e.target.value)} /></label><Button variant="outline" type="submit" disabled={busy}>{c.searchAction}</Button>
        <label><span>{c.rating}</span><select value={selection.rating ?? ''} disabled={busy} onChange={e => change({ rating: e.target.value || null, page: null })}><option value="">{c.all}</option>{[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{number(n)} {c.star}</option>)}</select></label>
        <label><span>{c.replyState}</span><select value={selection.reply} disabled={busy} onChange={e => change({ reply: e.target.value === 'all' ? null : e.target.value, page: null })}><option value="all">{c.all}</option><option value="pending">{c.pending}</option><option value="replied">{c.replied}</option></select></label>
        <label><span>{c.visibility}</span><select value={selection.visibility} disabled={busy} onChange={e => change({ visibility: e.target.value === 'all' ? null : e.target.value, page: null })}><option value="all">{c.all}</option><option value="public">{c.public}</option><option value="private">{c.private}</option><option value="unknown">{c.unknownVisibility}</option></select></label>
        <label><span>{c.integrity}</span><select value={selection.integrity} disabled={busy} onChange={e => change({ integrity: e.target.value === 'all' ? null : e.target.value, page: null })}><option value="all">{c.all}</option><option value="linked">{c.linked}</option><option value="unlinked">{c.unlinked}</option></select></label>
        <label><span>{c.sort}</span><select value={selection.sort} disabled={busy} onChange={e => change({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}><option value="newest">{c.newest}</option><option value="oldest">{c.oldest}</option><option value="highest">{c.highest}</option><option value="lowest">{c.lowest}</option></select></label>
        {(selection.query || selection.rating || selection.reply !== 'all' || selection.visibility !== 'all' || selection.integrity !== 'all') && <Button variant="outline" type="button" disabled={busy} onClick={() => change({ q: null, rating: null, reply: null, visibility: null, integrity: null, page: null })}>{c.clear}</Button>}
      </form><p className="sc-results" aria-live="polite">{c.matches}: {number(data.matched)}</p>
        {!data.rows.length ? <div className="sc-empty"><p>{data.stats.total ? c.noResults : c.empty}</p></div> : <div className="rw-grid">{data.rows.map(r => <article className="rw-card" key={r.id}>
          <div className="rw-card-heading"><h2>{r.integrity === 'unlinked' ? c.unlinked : r.customerName || c.customer}<small>#{number(r.id)}</small></h2>{stars(r.rating)}</div>
          {r.integrity === 'unlinked' ? <p className="sc-muted">{c.referenceHelp}</p> : <><p className="sc-description">{r.comment || c.noComment}</p><div className="rw-badges"><Badge variant="outline">{state(r)}</Badge><Badge variant="outline">{visibility(r)}</Badge></div>{r.service && <p className="sc-muted">{r.service.name}</p>}{r.product && <p className="sc-muted">{r.product.name}</p>}</>}
          <p className="sc-muted">{stamp(r.createdAt)}</p><div className="sc-record-actions"><Button variant="outline" disabled={busy || query.isFetching} onClick={() => open(r.id)}>{c.details}<span className="sr-only"> #{r.id}</span></Button></div>
        </article>)}</div>}
        {data.pages > 1 && <nav className="sc-pagination" aria-label={title}><Button variant="outline" disabled={busy || query.isFetching || data.currentPage <= 1} onClick={() => change({ page: data.currentPage - 1 })}>{c.previous}</Button><span>{c.page} {number(data.currentPage)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={busy || query.isFetching || data.currentPage >= data.pages} onClick={() => change({ page: data.currentPage + 1 })}>{c.next}</Button></nav>}
      </section><p className="sc-muted">{c.evidenceHelp}</p>
    </>}
    <Dialog open={selected !== null && !!data} onOpenChange={open => { if (!open && !busy) { epoch.current++; setSelected(null); setRow(null); } }}><DialogContent className="sc-dialog rw-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} closeLabel={c.close} showCloseButton={!busy}
      onInteractOutside={e => { if (busy) e.preventDefault(); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }}
      onOpenAutoFocus={e => { e.preventDefault(); dialogTitle.current?.focus(); }} onCloseAutoFocus={e => { e.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); else heading.current?.focus(); }}>
      <DialogHeader><DialogTitle ref={dialogTitle} tabIndex={-1}>{c.details}</DialogTitle><DialogDescription>{row?.customerName || `${title} #${selected}`}</DialogDescription></DialogHeader>
      {notice && <p ref={noticeHeading} tabIndex={-1} role="status" className="sc-feedback">{notice}</p>}{failure && <p ref={errorHeading} tabIndex={-1} role="alert" className="sc-feedback">{failure}</p>}
      {busy && !row ? <WorkspaceState inline kind="loading" /> : row && <div className="rw-detail">
        {row.integrity === 'unlinked' ? <p className="sc-feedback">{c.referenceHelp}</p> : <>
          <div className="rw-card-heading">{stars(row.rating)}<Badge variant="outline">{visibility(row)}</Badge></div>
          <p className="rw-text">{row.comment || c.noComment}</p><dl className="rw-facts">
            <div><dt>{c.customer}</dt><dd><bdi>{row.customerPhone || c.unknown}</bdi></dd></div><div><dt>{c.created}</dt><dd>{stamp(row.createdAt)}</dd></div>
            <div><dt>{c.record}</dt><dd>{row.record?.label || (row.record ? `#${row.record.id}` : c.unknown)}</dd></div>
            {row.product && <div><dt>{c.product}</dt><dd>{row.product.name}</dd></div>}{row.service && <div><dt>{c.service}</dt><dd>{row.service.name}</dd></div>}{row.staff && <div><dt>{c.staff}</dt><dd>{row.staff.name}</dd></div>}
            {row.dimensions && (['quality', 'professionalism', 'value'] as const).map(k => <div key={k}><dt>{c[k]}</dt><dd>{row.dimensions![k] === null ? c.unknown : `${number(row.dimensions![k]!)} / ${number(5)}`}</dd></div>)}
          </dl><section className="rw-saved"><h3>{c.savedReply}</h3><p className="rw-text">{row.merchantReply || c.noReply}</p>{row.repliedAt && <p className="sc-muted">{c.replyDate}: {stamp(row.repliedAt)}</p>}</section>
          {canReply && data?.canReply ? <label className="rw-form" htmlFor="rw-reply"><span id="rw-reply-label">{c.replyLabel}</span><textarea id="rw-reply" ref={replyField} rows={4} value={draft} disabled={busy || blocked} aria-labelledby="rw-reply-label" aria-invalid={!!fieldError} aria-describedby={fieldError ? 'rw-field-error rw-reply-help' : 'rw-reply-help'} onChange={e => { setDraft(e.target.value); setFieldError(''); }} />
            {fieldError && <span id="rw-field-error" className="rw-field-error">{fieldError}</span>}<span id="rw-reply-help" className="sc-muted">{c.replyHelp}</span><span className="sc-muted"><bdi>{number(draft.trim().length)} / {number(1000)}</bdi></span></label> : <p className="sc-muted">{c.readonly}</p>}
        </>}
        {!!row.issues.length && row.integrity === 'linked' && <p className="sc-muted">{c.invalidHelp}</p>}<p className="sc-muted">{c.datesHelp}</p><p className="sc-muted">{c.evidenceHelp}</p>
      </div>}
      <div className="rw-footer"><Button variant="outline" disabled={busy} onClick={() => { epoch.current++; setSelected(null); setRow(null); }}>{c.close}</Button>
        {selected !== null && (blocked || !row) && <Button variant="outline" disabled={busy} onClick={() => void load(selected, true)}>{c.check}</Button>}
        {row?.integrity === 'linked' && canReply && data?.canReply && !blocked && <Button disabled={!writable} onClick={() => void save()}>{busy ? c.saving : c.save}</Button>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
