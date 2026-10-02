import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Search, GraduationCap } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { ByaanSalesReview } from '@/components/ByaanSalesReview';
import { byaanDashboardOverviewSchema } from '@shared/byaan-dashboard-overview';
import { byaanDataInput, byaanDataStates, byaanDataWorkspaceSchema, type ByaanDataSelection, type ByaanDataRow, type ByaanFaqRow } from '@shared/byaan-data-workspace';
import { byaanResyncReceipt, type ByaanResyncReceipt } from '@shared/byaan-resync';
import type { ByaanConnectionWorkspace } from '@shared/byaan-connection-workspace';
import { pendingByaanResync, saveByaanResync, clearByaanResync } from '@/lib/byaan-resync-request';
import { byaanDataLabels } from '@/lib/byaan-data-labels';
import { byaanConnectionLabels } from '@/lib/byaan-connection-labels';
import { platformWorkspaceLabels } from '@/lib/platform-workspace-labels';
import '@/styles/service-catalog-workspace.css';
import '@/styles/byaan-data.css';

const fresh = { retry: false, staleTime: 0, refetchOnMount: 'always' as const, refetchOnWindowFocus: false };
type Copy = ReturnType<typeof byaanDataLabels>;
type Scope = { actorId: number; merchantId: number };
const language = (value: string) => value.startsWith('en') ? 'en' : 'ar';
const timestamp = (value: string | null, locale: string, none: string) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : none;
const rowTitle = (row: ByaanDataRow, copy: Copy) => row.kind === 'trainees' ? row.name : row.kind === 'faqs' ? row.question : row.title || copy.noTitle;
type Change = { row: ByaanFaqRow; field: 'is_active' | 'use_in_bot'; value: boolean };
const changeLabel = (change: Change, copy: Copy) => copy[change.field === 'is_active' ? change.value ? 'activate' : 'deactivate' : change.value ? 'include' : 'exclude'];

function ResyncPanel({ connection, lastRequest, refresh }: { connection: ByaanConnectionWorkspace; lastRequest: ByaanResyncReceipt | null; refresh: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation(), copy = byaanDataLabels(t), locale = language(i18n.language);
  const { actorId, merchantId } = connection, mutation = trpc.byaan.requestResync.useMutation({ retry: false }), utils = trpc.useUtils();
  const [pending, setPending] = useState<{ requestId: string; revision: string } | null>(null), [receipt, setReceipt] = useState<ByaanResyncReceipt | null>(null);
  const [review, setReview] = useState<string | null>(null), [notice, setNotice] = useState<'storage'|'changed'|'forbidden'|'rate'|'resyncUnknown'|null>(null), [busy, setBusy] = useState(false);
  const alive = useRef(true), lock = useRef(false), opener = useRef<HTMLButtonElement>(null);
  useEffect(() => { alive.current = true; try { setPending(pendingByaanResync(sessionStorage, actorId, merchantId)); } catch { setNotice('storage'); } return () => { alive.current = false; }; }, [actorId, merchantId]);
  const shown = receipt ?? lastRequest;
  function accept(value: unknown, request: { requestId: string; revision: string }) {
    const result = byaanResyncReceipt.parse(value);
    if (result.actorId !== actorId || result.merchantId !== merchantId || result.requestId !== request.requestId || result.revision !== request.revision) throw Error('Scope changed');
    setReceipt(result); setNotice(null);
    if (result.outcome !== 'unknown') { clearByaanResync(sessionStorage, actorId, merchantId, request.requestId); setPending(null); }
  }
  async function send() {
    if (lock.current || !review || review !== connection.revision) return;
    lock.current = true; setBusy(true); setNotice(null);
    let request = pending;
    try {
      if (!request) { try { request = saveByaanResync(sessionStorage, actorId, merchantId, { requestId: crypto.randomUUID(), revision: review }); setPending(request); } catch { setNotice('storage'); setReview(null); return; } }
      if (request.revision !== connection.revision) { setNotice('changed'); setReview(null); return; }
      const result = await mutation.mutateAsync(request); if (!alive.current) return;
      accept(result, request); setReview(null); await refresh();
    } catch (error) { if (alive.current) { const code = (error as any)?.data?.code; setNotice(code === 'CONFLICT' ? 'changed' : ['FORBIDDEN','UNAUTHORIZED'].includes(code) ? 'forbidden' : code === 'TOO_MANY_REQUESTS' ? 'rate' : 'resyncUnknown'); setReview(null); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function recover() {
    if (lock.current || !pending) return; lock.current = true; setBusy(true);
    try { const value = await utils.byaan.resyncAttempt.fetch({ requestId: pending.requestId }); if (alive.current) accept(value, pending); }
    catch { if (alive.current) setNotice('resyncUnknown'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function stopTracking() {
    if (!pending || lock.current) return;
    try { clearByaanResync(sessionStorage, actorId, merchantId, pending.requestId); setPending(null); setNotice(null); }
    catch { setNotice('storage'); }
  }
  const ready = connection.managedContent && !!connection.verifiedAt && ['configured','syncing','paused','error'].includes(connection.state);
  return <section className="bd-panel bd-resync" aria-labelledby="bd-resync-title"><h2 id="bd-resync-title">{copy.resync}</h2><p>{copy.resyncHelp}</p>
    {shown && <div className="bd-notice" role="status"><h3>{copy.latestRequest}</h3><p>{shown.outcome === 'unknown' ? copy.resyncUnknown : copy[shown.outcome]}</p>{shown.revision !== connection.revision && <p>{copy.earlierLink}</p>}<dl className="bd-facts"><div><dt>{copy.requestId}</dt><dd><bdi dir="ltr">{shown.requestId}</bdi></dd></div><div><dt>{copy.requestDate}</dt><dd>{timestamp(shown.createdAt, locale, copy.none)}</dd></div></dl></div>}
    {notice && <p role="alert" className="bd-notice">{copy[notice]}</p>}
    {pending && <p className="sc-muted">{copy.requestId}: <bdi dir="ltr">{pending.requestId}</bdi></p>}
    <div className="sc-actions">{pending && <Button variant="outline" disabled={busy} onClick={() => void recover()}>{copy.recover}</Button>}<Button ref={opener} disabled={busy || !ready || !!pending && pending.revision !== connection.revision} onClick={() => setReview(connection.revision)}>{pending ? copy.retrySame : copy.resync}</Button></div>
    {pending && <div className="bd-notice"><p>{copy.stopTrackingHint}</p><Button variant="ghost" disabled={busy} onClick={stopTracking}>{copy.stopTracking}</Button></div>}
    <Dialog open={!!review} onOpenChange={open => { if (!open && !busy) setReview(null); }}><DialogContent className="sc-dialog bd-dialog" closeLabel={copy.close} showCloseButton={!busy} dir={locale === 'ar' ? 'rtl' : 'ltr'} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{copy.resyncTitle}</DialogTitle><DialogDescription>{copy.resyncHelp}</DialogDescription></DialogHeader><p className="bd-domain" dir="ltr">{connection.tenantDomain}</p>{shown && <p>{copy.recentRequest}</p>}{pending && <p>{copy.requestId}: <bdi dir="ltr">{pending.requestId}</bdi></p>}{review !== connection.revision && <p role="alert">{copy.changed}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{copy.cancel}</Button><Button disabled={busy || review !== connection.revision} onClick={() => void send()}>{busy ? copy.requesting : copy.request}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}

function DataSection({ actorId, merchantId, kind }: Scope & { kind: ByaanDataSelection['kind'] }) {
  const { t, i18n } = useTranslation(), copy = byaanDataLabels(t), locale = language(i18n.language);
  const [search, setSearch] = useState(''), deferred = useDeferredValue(search.trim()), [state, setState] = useState('all'), [page, setPage] = useState(1);
  const selection = byaanDataInput.parse({ kind, search: deferred, state, page });
  const query = trpc.byaan.dataWorkspace.useQuery(selection, fresh), mutation = trpc.byaan.changeFaq.useMutation({ retry: false });
  const parsed = byaanDataWorkspaceSchema.safeParse(query.data), valid = parsed.success && parsed.data.actorId === actorId && parsed.data.merchantId === merchantId && JSON.stringify(parsed.data.selection) === JSON.stringify(selection);
  const data = !query.error && valid ? parsed.data : null;
  const [detail, setDetail] = useState<ByaanDataRow | null>(null), [change, setChange] = useState<Change | null>(null), [notice, setNotice] = useState<'saved'|'changed'|'uncertain'|'forbidden'|null>(null), [blocked, setBlocked] = useState(false), [busy, setBusy] = useState(false);
  const alive = useRef(true), lock = useRef(false), opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDetail(null); setChange(null); }, [search, state, page]);
  const current = change && data?.rows.find(row => row.kind === 'faqs' && row.id === change.row.id);
  const changed = !!change && (!current || current.kind !== 'faqs' || current.revision !== change.row.revision);
  async function refresh() {
    const result = await query.refetch(); if (!alive.current) return;
    const checked = byaanDataWorkspaceSchema.safeParse(result.data);
    if (!result.error && checked.success && checked.data.actorId === actorId && checked.data.merchantId === merchantId && JSON.stringify(checked.data.selection) === JSON.stringify(selection)) { setBlocked(false); setChange(null); setNotice(null); }
  }
  async function save() {
    if (!change || changed || lock.current || blocked || query.isFetching) return;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const result = await mutation.mutateAsync({ faqId: change.row.id, revision: change.row.revision, field: change.field, value: change.value }); if (!alive.current) return;
      if (result.actorId !== actorId || result.merchantId !== merchantId || result.faqId !== change.row.id || result.success !== true) throw Error('Scope changed');
      const updated = await query.refetch(); if (!alive.current) return;
      const checked = byaanDataWorkspaceSchema.safeParse(updated.data);
      if (updated.error || !checked.success || checked.data.actorId !== actorId || checked.data.merchantId !== merchantId || JSON.stringify(checked.data.selection) !== JSON.stringify(selection)) throw Error('Unconfirmed data');
      const row = checked.data.rows.find(row => row.id === change.row.id);
      if (row?.kind === 'faqs' && row[change.field === 'is_active' ? 'isActive' : 'useInBot'] !== change.value) throw Error('Unconfirmed choice');
      setChange(null); setDetail(null); setNotice('saved');
    } catch (error) { if (alive.current) { const code = (error as any)?.data?.code; setNotice(code === 'CONFLICT' ? 'changed' : ['FORBIDDEN','UNAUTHORIZED'].includes(code) ? 'forbidden' : 'uncertain'); setBlocked(true); setChange(null); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const pickChange = (row: ByaanFaqRow, field: Change['field'], value: boolean, button: HTMLButtonElement) => { opener.current = button; setDetail(null); setChange({ row, field, value }); };
  return <section className="bd-section" aria-label={copy[kind]}>
    <div className="sc-filters"><label className="sc-search"><span>{copy.search}</span><div><Search aria-hidden="true"/><input disabled={busy} maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} aria-describedby="bd-search-hint"/></div></label><label><span>{copy.filter}</span><select disabled={busy} value={state} onChange={event => { setState(event.target.value); setPage(1); }}><option value="all">{copy.all}</option>{byaanDataStates[kind].map(key => <option key={key} value={key}>{copy[key]}</option>)}</select></label><Button variant="outline" disabled={query.isFetching || busy} onClick={() => void refresh()}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></div>
    <p id="bd-search-hint" className="sc-muted">{copy.searchHint}</p>{kind === 'faqs' && <p className="bd-notice">{copy.knowledgeHint}</p>}{kind === 'site' && <p className="sc-muted">{copy.siteHint}</p>}{notice && <p role="status" className="bd-notice">{copy[notice]}</p>}
    {query.isLoading || query.isFetching && !data ? <WorkspaceState inline kind="loading"/> : !data ? <WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={() => void refresh()}/> : <>
      <dl className="bd-counts"><div><dt>{copy.stored}</dt><dd>{data.summary.stored.toLocaleString(locale)}</dd></div><div><dt>{copy.matched}</dt><dd>{data.summary.matched.toLocaleString(locale)}</dd></div><div><dt>{copy.results}</dt><dd>{data.pagination.total.toLocaleString(locale)}</dd></div></dl>
      <div className="bd-groups">{data.summary.groups.map(group => <span key={group.key}>{copy[group.key as keyof Copy]} <strong>{group.count.toLocaleString(locale)}</strong></span>)}</div>
      {!data.rows.length ? <div className="sc-empty"><h2>{copy.noResults}</h2><p>{copy.noResultsHelp}</p><Button variant="outline" onClick={() => { setSearch(''); setState('all'); setPage(1); }}>{copy.reset}</Button></div> : <ul className="bd-records">{data.rows.map(row => <li key={row.id} className="bd-record" data-byaan-record={row.id}>
        <div className="bd-record-heading"><h2>{rowTitle(row, copy)}</h2><Badge variant="secondary">{copy[row.state]}</Badge></div>
        {row.kind === 'trainees' ? <><dl className="bd-facts"><div><dt>{copy.phone}</dt><dd><bdi dir="ltr">{row.phone || copy.none}</bdi></dd></div><div><dt>{copy.email}</dt><dd><bdi dir="ltr">{row.email || copy.none}</bdi></dd></div></dl><p>{copy.courses}: {row.courses.length ? row.courses.slice(0, 3).join(' · ') : copy.noCourses}</p>{(row.courseDataInvalid || row.coursesTruncated) && <p className="bd-notice">{copy.courseWarning}</p>}</> : row.kind === 'faqs' ? <><p className="bd-preview">{row.answer}</p><p className="sc-muted">{copy.category}: {row.category || copy.none}</p></> : <><p className="sc-muted">{copy[row.pageType]}</p><p className="bd-preview">{row.content || copy.empty}</p></>}
        <p className="sc-muted">{copy.synced}: {timestamp(row.syncedAt, locale, copy.none)}</p>
        <div className="bd-record-actions"><Button variant="outline" onClick={event => { opener.current = event.currentTarget; setDetail(row); }}>{copy.details}</Button>{row.kind === 'faqs' && <>{row.isActive !== null && <Button variant="outline" disabled={blocked || busy || query.isFetching} onClick={event => pickChange(row, 'is_active', !row.isActive, event.currentTarget)}>{row.isActive ? copy.deactivate : copy.activate}</Button>}{row.useInBot !== null && <Button variant="outline" disabled={blocked || busy || query.isFetching} onClick={event => pickChange(row, 'use_in_bot', !row.useInBot, event.currentTarget)}>{row.useInBot ? copy.exclude : copy.include}</Button>}</>}</div>
      </li>)}</ul>}
      <nav className="sc-pagination" aria-label={copy.page}><Button variant="outline" disabled={page <= 1 || query.isFetching || busy} onClick={() => setPage(value => value - 1)}>{copy.previous}</Button><span>{copy.page} {page.toLocaleString(locale)} {copy.of} {Math.max(1, data.pagination.pages).toLocaleString(locale)}</span><Button variant="outline" disabled={page >= data.pagination.pages || query.isFetching || busy} onClick={() => setPage(value => value + 1)}>{copy.next}</Button></nav>
    </>}
    <Dialog open={!!data && (!!detail || !!change)} onOpenChange={open => { if (!open && !busy) { setDetail(null); setChange(null); } }}><DialogContent className="sc-dialog bd-dialog" closeLabel={copy.close} showCloseButton={!busy} dir={locale === 'ar' ? 'rtl' : 'ltr'} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.focus(); }} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{change ? copy.review : copy.details}</DialogTitle><DialogDescription>{change ? copy.knowledgeReview : detail?.kind === 'faqs' ? copy.knowledgeHint : detail?.kind === 'site' ? copy.siteHint : copy.trainees}</DialogDescription></DialogHeader>
      {change ? <><h3>{change.row.question}</h3><p className="bd-notice">{changeLabel(change, copy)}</p>{changed && <p role="alert">{copy.changed}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setChange(null)}>{copy.cancel}</Button><Button disabled={busy || blocked || changed || query.isFetching} onClick={() => void save()}>{busy ? copy.saving : copy.confirm}</Button></DialogFooter></> : detail && <><h3>{rowTitle(detail, copy)}</h3>{detail.kind === 'trainees' ? <><dl className="bd-facts"><div><dt>{copy.externalId}</dt><dd>{detail.externalId}</dd></div><div><dt>{copy.phone}</dt><dd><bdi dir="ltr">{detail.phone || copy.none}</bdi></dd></div><div><dt>{copy.email}</dt><dd><bdi dir="ltr">{detail.email || copy.none}</bdi></dd></div><div><dt>{copy.created}</dt><dd>{timestamp(detail.createdAt, locale, copy.none)}</dd></div></dl><h3>{copy.courses}</h3><ul className="bd-course-list">{detail.courses.map((name, index) => <li key={index}>{name}</li>)}</ul>{!detail.courses.length && <p>{copy.noCourses}</p>}{(detail.courseDataInvalid || detail.coursesTruncated) && <p>{copy.courseWarning}</p>}</> : <p className="bd-full-text">{detail.kind === 'faqs' ? detail.answer : detail.content || copy.empty}</p>}<DialogFooter><Button variant="outline" onClick={() => setDetail(null)}>{copy.close}</Button></DialogFooter></>}
    </DialogContent></Dialog>
  </section>;
}

export function ByaanDataWorkspace({ actorId, merchantId }: Scope) {
  const { t, i18n } = useTranslation(), copy = byaanDataLabels(t), connectionCopy = byaanConnectionLabels(t), platform = platformWorkspaceLabels(t), locale = language(i18n.language);
  const query = trpc.byaan.dashboardOverview.useQuery(undefined, fresh), parsed = byaanDashboardOverviewSchema.safeParse(query.data);
  const data = !query.error && parsed.success && parsed.data.connection.actorId === actorId && parsed.data.connection.merchantId === merchantId ? parsed.data : null;
  const [tab, setTab] = useState<'overview'|'trainees'|'faqs'|'site'|'sales'>('overview');
  if (query.isLoading || query.isFetching && !query.data) return <WorkspaceState kind="loading"/>;
  if (!data) return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={() => void query.refetch()}/>;
  const { connection, access } = data, ready = connection.managedContent && !!connection.verifiedAt && ['configured','syncing','paused','error'].includes(connection.state);
  const activeTab = tab === 'overview' || access[tab] ? tab : 'overview';
  const tabs = (['overview','trainees','faqs','site','sales'] as const).filter(value => value === 'overview' || access[value]);
  return <div className="service-catalog byaan-data" dir={locale === 'ar' ? 'rtl' : 'ltr'} data-byaan-data>
    <header className="sc-header"><div><p className="sc-eyebrow">{platform.byaan}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="sc-actions">{access.integrations && <Button asChild variant="outline"><Link href="/merchant/integrations/byaan">{copy.connection}</Link></Button>}<Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></div></header>
    <nav className="bd-tabs" aria-label={copy.tabs}>{tabs.map(value => <button type="button" key={value} aria-current={activeTab === value ? 'page' : undefined} onClick={() => setTab(value)}>{copy[value]}</button>)}</nav>
    {activeTab === 'overview' ? <><section className="bd-panel"><div className="bd-connection-heading"><GraduationCap aria-hidden="true"/><h2>{connection.tenantDomain || copy.connection}</h2><Badge variant="secondary">{platform[connection.state]}</Badge></div><p className="sc-muted">{connectionCopy.savedHint}</p><p>{copy.synced}: {timestamp(connection.lastSyncAt, locale, copy.none)}</p>{!ready && <p className="bd-notice">{copy.connectionRequired}</p>}{connection.hasSyncErrors && <p className="bd-notice">{connectionCopy.syncError}</p>}</section>
      <dl className="sc-summary bd-summary">{(['catalog','activeTrainees','activeFaqs','sitePages'] as const).map(key => <div key={key}><dt>{connectionCopy[key]}</dt><dd>{connection.counts[key].toLocaleString(locale)}</dd></div>)}</dl><p className="sc-muted">{copy.sourceHint}</p>
      <nav className="sc-nav" aria-label={copy.overview}><Link href="/merchant/test-sari">{copy.test}</Link>{access.faqs && <Link href="/merchant/sari-brain">{copy.knowledge}</Link>}<Link href="/merchant/products">{copy.catalog}</Link></nav>
      {access.integrations && <ResyncPanel key={actorId+':'+merchantId} connection={connection} lastRequest={data.lastRequest} refresh={query.refetch}/>}
    </> : activeTab === 'sales' ? <ByaanSalesReview/> : ready ? <DataSection key={actorId+':'+merchantId+':'+activeTab} actorId={actorId} merchantId={merchantId} kind={activeTab}/> : <section className="bd-panel"><h2>{copy[activeTab]}</h2><p>{copy.connectionRequired}</p>{access.integrations && <Button asChild variant="outline"><Link href="/merchant/integrations/byaan">{copy.connection}</Link></Button>}</section>}
  </div>;
}
