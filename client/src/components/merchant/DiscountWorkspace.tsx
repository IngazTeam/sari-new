import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Plus, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { discountNavigation, discountSelectionKey, scopedDiscountWorkspace } from '@/lib/discount-workspace';
import { discountWorkspaceLabels } from '@/lib/discount-workspace-labels';
import { catalogHref } from '@/lib/service-catalog-navigation';
import { discountStates, type DiscountWorkspaceRow } from '@shared/discount-workspace';
import { DiscountEditor } from './DiscountEditor';
import { DiscountSummary } from './DiscountSummary';
import '@/styles/service-catalog-workspace.css';
import '@/styles/discount-workspace.css';
type Action = { kind: 'create' } | { kind: 'details' | 'edit' | 'toggle' | 'delete'; row: DiscountWorkspaceRow };
export function DiscountWorkspace({ actorId, merchantId }: { actorId: number; merchantId: number }) {
  const { t, i18n } = useTranslation(), c = discountWorkspaceLabels(t), locale = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const [path, navigate] = useLocation(), search = useSearch(), selection = discountNavigation(search), selectionKey = discountSelectionKey(selection);
  const query = trpc.discounts.workspace.useQuery(selection, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const create = trpc.discounts.create.useMutation({ retry: false }), update = trpc.discounts.update.useMutation({ retry: false }), remove = trpc.discounts.delete.useMutation({ retry: false });
  const data = query.error ? null : scopedDiscountWorkspace(query.data, actorId, merchantId, selection);
  const [searchEdit, setSearchEdit] = useState<string | null>(null), [action, setAction] = useState<Action | null>(null), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const live = useRef(true), locked = useRef(false), view = useRef(''), opener = useRef<HTMLElement | null>(null), title = useRef<HTMLHeadingElement>(null), results = useRef<HTMLHeadingElement>(null), focusResults = useRef(false), focusAfterWrite = useRef(false), returnToTitle = useRef(false);
  view.current = `${actorId}:${merchantId}:${selectionKey}`;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { setSearchEdit(null); setAction(null); }, [search]);
  useEffect(() => { if (data && !query.isFetching && focusResults.current) { results.current?.focus(); focusResults.current = false; } }, [selectionKey, !!data, query.isFetching]);
  useEffect(() => { if (data && !query.isFetching && !action && focusAfterWrite.current) { title.current?.focus(); focusAfterWrite.current = false; } }, [data, query.isFetching, action]);
  const change = (patch: Record<string, string | number | null>) => { focusResults.current = true; navigate(catalogHref(path, search, patch)); };
  const open = (next: Action) => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setFailure(''); setAction(next); };
  const refresh = async () => { const scope = view.current, result = await query.refetch(); if (!live.current || scope !== view.current) return; if (!result.error && scopedDiscountWorkspace(result.data, actorId, merchantId, selection)) { setBlocked(false); setFailure(''); setAction(null); } };
  const current = action && action.kind !== 'create' ? data?.rows.find(row => row.id === action.row.id) : null;
  const same = !action || action.kind === 'create' || current?.revision === action.row.revision;
  const writable = !!data?.canManage && same && !query.isFetching && !busy && !blocked;
  async function save(input?: any): Promise<'duplicate' | void> {
    if (!action || !writable || locked.current) return;
    const submitted = action, scope = view.current; locked.current = true; setBusy(true); setFailure('');
    try {
      const result = submitted.kind === 'create' ? await create.mutateAsync(input)
        : submitted.kind === 'delete' ? await remove.mutateAsync({ id: submitted.row.id, expectedRevision: submitted.row.revision })
          : await update.mutateAsync(submitted.kind === 'edit' ? input : { id: submitted.row.id, expectedRevision: submitted.row.revision, isActive: !submitted.row.isActive });
      if (result?.success !== true || submitted.kind === 'create' && (!('discountCode' in result) || result.discountCode.merchantId !== merchantId || !Number.isSafeInteger(result.discountCode.id) || result.discountCode.id <= 0)) throw Error('Unconfirmed discount result');
      if (!live.current || scope !== view.current) return;
      returnToTitle.current = true; focusAfterWrite.current = true; setAction(null); setNotice(submitted.kind === 'create' ? c.createdNotice : submitted.kind === 'delete' ? c.deletedNotice : c.saved); setBlocked(true); await refresh();
    } catch (error) {
      if (!live.current || scope !== view.current) return;
      const code = (error as any)?.data?.code;
      if (submitted.kind === 'create' && code === 'CONFLICT') return 'duplicate';
      setFailure(code === 'CONFLICT' ? c.conflict : c.uncertain); setBlocked(true);
    } finally { locked.current = false; if (live.current) setBusy(false); }
  }
  if (query.error) return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={() => void refresh()}/>;
  if (!data) return <WorkspaceState kind={query.isLoading || query.isFetching ? 'loading' : 'error'} onRetry={() => void refresh()}/>;
  const number = (value: number) => value.toLocaleString(locale), selected = action && action.kind !== 'create' ? action.row : undefined;
  const dialogTitle = action?.kind === 'create' ? c.create : action?.kind === 'edit' ? c.edit : action?.kind === 'delete' ? c.remove : action?.kind === 'toggle' ? selected?.isActive ? c.disable : c.enable : c.details;
  const dialogHelp = action?.kind === 'create' ? c.description : action?.kind === 'edit' ? c.editHelp : action?.kind === 'delete' ? c.deleteHelp : action?.kind === 'toggle' ? c.toggleHelp : c.evidence;
  return <div className="service-catalog discount-workspace" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={title} tabIndex={-1}>{c.title}</h1><p>{c.description}</p></div><div className="sc-actions"><Button variant="outline" disabled={busy || query.isFetching} onClick={() => void refresh()}><RefreshCw aria-hidden="true"/>{c.refresh}</Button>{data.canManage && <Button disabled={busy || blocked || query.isFetching} onClick={() => open({ kind: 'create' })}><Plus aria-hidden="true"/>{c.create}</Button>}</div></header>
    {!data.canManage && <p>{c.readOnly}</p>}{notice && <p role="status" className="sc-feedback">{notice}</p>}{blocked && !action && <p role="alert" className="sc-feedback">{failure || c.uncertain}</p>}
    <dl className="sc-summary"><div><dt>{c.total}</dt><dd>{number(data.total)}</dd></div><div><dt>{c.available}</dt><dd>{number(data.counts.available)}</dd></div><div><dt>{c.usage}</dt><dd>{number(data.usage.recorded)}</dd></div></dl><p className="sc-muted">{c.evidence}</p>{data.usage.invalidRows > 0 && <p className="sc-feedback">{c.excluded}</p>}
    <section className="sc-list" aria-busy={query.isFetching}><form className="sc-filters" onSubmit={event => { event.preventDefault(); change({ q: (searchEdit ?? selection.query).trim(), page: null }); }}><label className="sc-search"><span>{c.search}</span><input value={searchEdit ?? selection.query} maxLength={80} onChange={event => setSearchEdit(event.target.value)}/></label><Button type="submit" variant="outline">{c.searchAction}</Button><label><span>{c.status}</span><select value={selection.status} onChange={event => change({ status: event.target.value, page: null })}>{(['all', ...discountStates] as const).map(status => <option key={status} value={status}>{c[status]}{status === 'all' ? '' : ` (${number(data.counts[status])})`}</option>)}</select></label><label><span>{c.origin}</span><select value={selection.origin} onChange={event => change({ origin: event.target.value, page: null })}>{(['all', 'manual', 'automatic'] as const).map(origin => <option key={origin} value={origin}>{c[origin]}</option>)}</select></label>{(selection.query || selection.status !== 'all' || selection.origin !== 'all') && <Button variant="ghost" type="button" onClick={() => change({ q: null, status: null, origin: null, page: null })}>{c.clear}</Button>}</form>
    <h2 ref={results} tabIndex={-1} className="dc-results">{c.matches} · {number(data.matched)}</h2>
    {data.rows.length === 0 ? <div className="sc-empty"><p>{data.total === 0 ? c.empty : data.matched === 0 ? c.noResults : c.outOfRange}</p>{selection.page > 1 && <Button variant="outline" onClick={() => change({ page: null })}>{c.first}</Button>}</div> : <div className="dc-codes">{data.rows.map(row => <article className="dc-code" key={row.id}><div className="dc-code-heading"><div><p className="sc-muted">#{row.id} · {row.isAutoGenerated === null ? c.unknown : row.isAutoGenerated ? c.automatic : c.manual}</p><h3><bdi>{row.code || c.unknown}</bdi></h3></div><Badge variant={row.state === 'available' ? 'default' : 'secondary'}>{c[row.state]}</Badge></div><p className="dc-value">{row.value === null ? c.unknown : number(row.value)} {row.type === 'percentage' ? '%' : row.type === 'fixed' ? c.wholeCurrency : ''}</p><dl className="dc-facts"><div><dt>{c.uses}</dt><dd>{row.usedCount === null ? c.unknown : number(row.usedCount)} / {row.maxUses === null ? row.issues.includes('limit') ? c.unknown : c.unlimited : number(row.maxUses)}</dd></div><div><dt>{c.expiry}</dt><dd><bdi>{row.expiresAt ? row.expiresAt.slice(0, 10) + ' · UTC' : row.issues.includes('expiry') ? c.unknown : c.noExpiry}</bdi></dd></div></dl><div className="sc-actions"><Button variant="outline" onClick={() => open({ kind: 'details', row })}>{c.details}<span className="sr-only"> {row.code}</span></Button>{data.canManage && <Button variant="ghost" disabled={blocked || busy || query.isFetching || row.isActive === null} onClick={() => open({ kind: 'toggle', row })}>{row.isActive ? c.disable : c.enable}<span className="sr-only"> {row.code}</span></Button>}</div></article>)}</div>}
    {data.pages > 1 && <nav className="sc-pagination" aria-label={c.page}><Button variant="outline" disabled={selection.page <= 1 || query.isFetching || busy} onClick={() => change({ page: selection.page - 1 })}>{c.previous}</Button><span>{c.page} {number(selection.page)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={selection.page >= data.pages || query.isFetching || busy} onClick={() => change({ page: selection.page + 1 })}>{c.next}</Button></nav>}</section>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null); }}><DialogContent className="sc-dialog dc-dialog" closeLabel={c.close} dir={locale === 'ar' ? 'rtl' : 'ltr'} showCloseButton={!busy && action?.kind !== 'create' && action?.kind !== 'edit'} onEscapeKeyDown={event => { if (busy || action?.kind === 'create' || action?.kind === 'edit') event.preventDefault(); }} onInteractOutside={event => { if (busy || action?.kind === 'create' || action?.kind === 'edit') event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); (returnToTitle.current ? title.current : opener.current?.isConnected ? opener.current : title.current)?.focus(); returnToTitle.current = false; }}><DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialogHelp}</DialogDescription></DialogHeader>
      {failure && <p role="alert" className="sc-feedback">{failure}</p>}{!same && <p role="alert" className="sc-feedback">{c.conflict}</p>}{selected?.issues.length ? <p className="sc-feedback">{c.invalidHelp}</p> : null}{selected?.isAutoGenerated && <p className="sc-muted">{c.automaticHelp}</p>}
      {action?.kind === 'create' || action?.kind === 'edit' ? <DiscountEditor key={action.kind + (selected?.id ?? '')} row={action.kind === 'edit' ? selected : undefined} busy={busy} blocked={!writable} save={save} cancel={() => setAction(null)}/> : selected && <><DiscountSummary row={selected}/><div className="sc-actions"><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>{c.close}</Button>{action?.kind === 'details' ? data.canManage && <><Button variant="outline" disabled={blocked || query.isFetching} onClick={() => setAction({ kind: 'edit', row: selected })}>{c.edit}</Button><Button variant="destructive" disabled={blocked || query.isFetching} onClick={() => setAction({ kind: 'delete', row: selected })}>{c.remove}</Button></> : <Button variant={action?.kind === 'delete' ? 'destructive' : 'default'} disabled={!writable} onClick={() => void save()}>{busy ? c.saving : c.confirm}</Button>}</div></>}
      {(blocked || !same) && <Button variant="outline" disabled={busy || query.isFetching} onClick={() => void refresh()}>{c.refresh}</Button>}
    </DialogContent></Dialog>
  </div>;
}
