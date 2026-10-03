import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Upload, RefreshCw, ImageIcon, FileText, Grid3x3, List, Copy, ExternalLink, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { mediaWorkspaceLabels } from '@/lib/media-workspace-labels';
import { mediaNavigation, mediaSelectionKey, scopedMediaWorkspace, scopedMediaReceipt, mediaReceiptStorageKey, mediaFileIssue, mediaErrorReason } from '@/lib/media-workspace';
import { catalogHref } from '@/lib/service-catalog-navigation';
import { mediaCategories, type MediaWorkspaceRow } from '@shared/media-workspace';
import { mediaFileName, type MediaUploadInput } from '@shared/media-actions';
import '@/styles/service-catalog-workspace.css';
import '@/styles/media-workspace.css';

type Labels = ReturnType<typeof mediaWorkspaceLabels>;
type Modal = { kind: 'upload' } | { kind: 'details' | 'remove'; row: MediaWorkspaceRow } | { kind: 'close'; requestKey: string; actorId: number };
type ChosenFile = { file: File; base64: string; preview: string | null };
function Thumbnail({ url, name, kind, c }: { url: string | null; name: string; kind: string; c: Labels }) {
  const [broken, setBroken] = useState(false); useEffect(() => setBroken(false), [url]);
  return <div className="ml-thumbnail">{kind === 'image' && url && !broken
    ? <img src={url} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
    : <><FileText aria-hidden="true" /><span>{kind === 'pdf' ? c.pdf : broken ? c.previewFailed : c[kind as 'image' | 'other']}</span></>}</div>;
}
export function MediaWorkspace({ actorId, merchantId }: { actorId: number; merchantId: number }) {
  const { t, i18n } = useTranslation(), c = mediaWorkspaceLabels(t), locale = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const [path, navigate] = useLocation(), search = useSearch(), selection = mediaNavigation(search), key = mediaSelectionKey(selection);
  const utils = trpc.useUtils(), query = trpc.media.workspace.useQuery(selection, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const data = query.error ? null : scopedMediaWorkspace(query.data, actorId, merchantId, selection);
  const upload = trpc.media.uploadReviewed.useMutation({ retry: false }), remove = trpc.media.removeReviewed.useMutation({ retry: false }), close = trpc.media.closeRequest.useMutation({ retry: false });
  const storageKey = mediaReceiptStorageKey(actorId, merchantId);
  const [pending, setPending] = useState<string | null>(() => { try { const v = sessionStorage.getItem(storageKey); return v && /^[a-f0-9-]{36}$/i.test(v) ? v : null; } catch { return null; } });
  const [modal, setModal] = useState<Modal | null>(null), [file, setFile] = useState<ChosenFile | null>(null), [category, setCategory] = useState<typeof mediaCategories[number]>('general');
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [dragging, setDragging] = useState(false);
  const [failure, setFailure] = useState(''), [notice, setNotice] = useState(''), [fileError, setFileError] = useState(''), [categoryError, setCategoryError] = useState(''), [searchText, setSearchText] = useState<string | null>(null);
  const live = useRef(true), lock = useRef(false), scope = useRef(''), picker = useRef<HTMLInputElement>(null), title = useRef<HTMLHeadingElement>(null), opener = useRef<HTMLElement | null>(null), reader = useRef<FileReader | null>(null);
  scope.current = `${actorId}:${merchantId}:${key}:${locale}`;
  const view = new URLSearchParams(search).get('view') === 'list' ? 'list' : 'grid';
  useEffect(() => { live.current = true; return () => { live.current = false; reader.current?.abort(); }; }, []);
  useEffect(() => () => { if (file?.preview) URL.revokeObjectURL(file.preview); }, [file]);
  useEffect(() => { setModal(null); setFile(null); setSearchText(null); setFailure(''); }, [key, locale]);
  useEffect(() => { if (query.error) { setModal(null); setFile(null); } }, [query.error]);
  const writable = !!data && !busy && !reading && !query.isFetching && !pending;
  const currentRow = modal && 'row' in modal ? data?.rows.find(r => r.id === modal.row.id && r.revision === modal.row.revision) : undefined;
  const number = (n: number) => n.toLocaleString(locale);
  const size = (n: number | null) => n === null ? c.unknown : `${(n / (n >= 1048576 ? 1048576 : n >= 1024 ? 1024 : 1)).toLocaleString(locale, { maximumFractionDigits: 1 })} ${n >= 1048576 ? 'MB' : n >= 1024 ? 'KB' : 'B'}`;
  const stamp = (date: string | null) => date ? new Date(date).toLocaleString(locale, { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }) : c.unknown;
  const change = (patch: Record<string, string | number | null>) => navigate(catalogHref(path, search, patch));
  const refresh = async () => { await query.refetch(); };
  function open(value: Modal) {
    opener.current = document.activeElement as HTMLElement; setFailure(''); setNotice(''); setFileError(''); setCategoryError('');
    if (value.kind === 'upload') { setFile(null); setCategory(data?.allowedUploadCategories.includes('general') ? 'general' : data?.allowedUploadCategories[0] || 'general'); }
    setModal(value);
  }
  async function choose(files: FileList | null) {
    if (!writable || lock.current) return;
    if (!files?.length) return;
    const selected = files?.[0] || null, issue = mediaFileIssue(selected, files?.length || 0);
    setFileError(issue ? c[issue] : ''); if (issue || !selected) { setFile(null); return; }
    const initial = scope.current; setReading(true); lock.current = true;
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader(); reader.current = r;
        r.onerror = r.onabort = () => reject(Error('file read failed'));
        r.onload = () => typeof r.result === 'string' && r.result.includes(',') ? resolve(r.result.slice(r.result.indexOf(',') + 1)) : reject(Error());
        r.readAsDataURL(selected);
      });
      if (!live.current || initial !== scope.current) return;
      setFile({ file: selected, base64, preview: selected.type.startsWith('image/') ? URL.createObjectURL(selected) : null });
    } catch { if (live.current && initial === scope.current) setFileError(c.readFailed); }
    finally { lock.current = false; reader.current = null; if (live.current) setReading(false); }
  }
  async function copy(url: string) {
    const initial = scope.current;
    try { await navigator.clipboard.writeText(url); if (live.current && initial === scope.current) setNotice(c.copied); }
    catch { if (live.current && initial === scope.current) setFailure(c.copyFailed); }
  }
  async function accept(raw: unknown, requestKey: string, requestActor = actorId, expected?: { kind: 'upload' | 'remove'; id?: number }) {
    const result = scopedMediaReceipt(raw, requestActor, merchantId, requestKey); if (!result) throw Error('receipt scope');
    if (result.state === 'missing' || result.state === 'uploading') { setFailure(result.state === 'missing' ? c.notFoundReceipt : c.pendingStill); return; }
    if (expected && result.state !== 'cancelled' && (result.kind !== expected.kind || expected.id !== undefined && result.assetId !== expected.id)) throw Error('receipt target');
    try { if (sessionStorage.getItem(storageKey) === requestKey) sessionStorage.removeItem(storageKey); } catch {}
    setPending(prior => prior === requestKey ? null : prior); setModal(null); setFile(null); setFailure('');
    setNotice(result.state === 'uploaded' ? c.uploaded : result.state === 'removed' ? c.removed : c.closedRequest); await refresh();
  }
  async function submit() {
    if (!writable || lock.current || !modal || modal.kind !== 'upload' && modal.kind !== 'remove') return;
    const operation = modal;
    if (operation.kind === 'upload') {
      const problem = mediaFileIssue(file?.file || null); setFileError(problem ? c[problem] : '');
      const categoryOk = data!.allowedUploadCategories.includes(category); setCategoryError(categoryOk ? '' : c.categoryError);
      if (problem || !file || !categoryOk) return;
    } else if (!currentRow?.canDelete) { setFailure(c.stale); return; }
    const initial = scope.current, requestKey = crypto.randomUUID();
    try { sessionStorage.setItem(storageKey, requestKey); } catch { setFailure(c.storageUnavailable); return; }
    setPending(requestKey); setFailure(''); setBusy(true); lock.current = true;
    try {
      const result = operation.kind === 'upload'
        ? await upload.mutateAsync({ requestKey, originalName: file!.file.name, mimeType: file!.file.type as MediaUploadInput['mimeType'], category, fileBase64: file!.base64 })
        : await remove.mutateAsync({ requestKey, id: operation.row.id, revision: operation.row.revision });
      if (!live.current || initial !== scope.current) return;
      await accept(result, requestKey, actorId, { kind: operation.kind === 'upload' ? 'upload' : 'remove', ...(operation.kind === 'remove' ? { id: operation.row.id } : {}) });
    } catch (error) {
      if (live.current && initial === scope.current) {
        const reason = mediaErrorReason(error);
        if (['forbidden', 'invalid', 'limit', 'stale', 'missing'].includes(reason)) { try { sessionStorage.removeItem(storageKey); } catch {} setPending(null); }
        setFailure(reason === 'unknown' ? c.unknownResult : c[reason as keyof Labels]);
      }
    } finally { lock.current = false; if (live.current) setBusy(false); }
  }
  async function recover(requestKey: string, requestActor = actorId, resolve = false) {
    if (lock.current) return; const initial = scope.current; lock.current = true; setBusy(true); setFailure('');
    try {
      const result = resolve ? await close.mutateAsync({ requestKey }) : await utils.media.requestReceipt.fetch({ requestKey }, { staleTime: 0 });
      if (!live.current || initial !== scope.current) return; await accept(result, requestKey, requestActor);
    } catch (error) { if (live.current && initial === scope.current) { const reason = mediaErrorReason(error); setFailure(reason === 'unknown' ? c.unknownResult : c[reason as keyof Labels]); } }
    finally { lock.current = false; if (live.current) setBusy(false); }
  }
  const pendingPanel = pending && !busy && <div className="sc-feedback ml-pending" role="status"><strong>{c.pendingTitle}</strong><p>{c.pendingHint}</p>
    <details><summary>{c.request}</summary><code>{pending}</code></details><div className="sc-actions"><Button variant="outline" disabled={busy || reading} onClick={() => void recover(pending)}>{c.checkResult}</Button>
      <Button variant="outline" disabled={busy || reading} onClick={() => open({ kind: 'close', requestKey: pending, actorId })}>{c.closeRequest}</Button></div></div>;
  return <div className="service-catalog media-workspace" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div><div className="sc-actions">
      <Button variant="outline" disabled={busy || reading || query.isFetching} onClick={() => void refresh()}><RefreshCw aria-hidden="true" />{c.refresh}</Button>
      {!!data?.allowedUploadCategories.length && <Button disabled={!writable} onClick={() => open({ kind: 'upload' })}><Upload aria-hidden="true" />{c.upload}</Button>}</div></header>
    {notice && <p className="sc-feedback" role="status">{notice}</p>}{!modal && pendingPanel}{!modal && failure && <p role="alert" className="sc-feedback">{failure}</p>}
    {query.error ? <WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={() => void refresh()} /> : !data ? <WorkspaceState inline kind={query.isLoading || query.isFetching ? 'loading' : 'error'} onRetry={() => void refresh()} /> : <>
      {!data.allowedUploadCategories.length && <p className="sc-muted">{c.readonly}</p>}
      <dl className="sc-summary"><div><dt>{c.total}</dt><dd>{number(data.total)}</dd></div><div><dt>{c.registeredSize}</dt><dd>{size(data.totalSizeBytes)}</dd></div><div><dt>{c.pendingCount}</dt><dd>{number(data.pendingUploadCount)}</dd></div></dl><p className="sc-muted">{c.spaceHint}</p>
      <form className="sc-filters" onSubmit={event => { event.preventDefault(); change({ q: searchText ?? selection.query, page: null }); }}>
        <label className="sc-search"><span>{c.search}</span><div><Search aria-hidden="true" /><input maxLength={100} placeholder={c.searchHint} value={searchText ?? selection.query} onChange={e => setSearchText(e.target.value)} disabled={busy || reading} /></div></label>
        <Button variant="outline" type="submit" disabled={busy || reading}>{c.searchButton}</Button>
        {([['category', ['all', ...mediaCategories]], ['kind', ['all', 'image', 'pdf', 'other']], ['sort', ['newest', 'oldest', 'name', 'largest']]] as const).map(([field, options]) => <label key={field}><span>{c[field]}</span><select value={selection[field]} disabled={busy || reading} onChange={e => change({ [field]: e.target.value, page: null })}>{options.map(option => <option key={option} value={option}>{c[option]}</option>)}</select></label>)}
      </form>
      <div className="ml-results"><p className="sc-results" aria-live="polite">{c.matches}: {number(data.matched)} {c.of} {number(data.total)}</p><div className="sc-actions" role="group" aria-label={c.preview}><Button variant="outline" aria-pressed={view === 'grid'} onClick={() => change({ view: null })}><Grid3x3 aria-hidden="true" />{c.grid}</Button><Button variant="outline" aria-pressed={view === 'list'} onClick={() => change({ view: 'list' })}><List aria-hidden="true" />{c.list}</Button></div></div>
      {!data.rows.length ? <div className="sc-empty"><ImageIcon aria-hidden="true" /><h2>{data.total ? c.noResults : c.emptyTitle}</h2><p>{data.total ? c.noResultsText : c.emptyText}</p>{data.total ? <Button variant="outline" onClick={() => change({ q: null, category: null, kind: null, page: null })}>{c.reset}</Button> : !!data.allowedUploadCategories.length && <Button disabled={!writable} onClick={() => open({ kind: 'upload' })}>{c.upload}</Button>}</div>
        : <ul className={`ml-files ml-${view}`} aria-busy={query.isFetching}>{data.rows.map(row => <li className="ml-file" key={row.id}>
          <button type="button" className="ml-preview-button" aria-label={`${c.preview}: ${row.originalName || '#' + row.id}`} onClick={() => open({ kind: 'details', row })}><Thumbnail url={row.previewUrl} name={row.originalName || ''} kind={row.kind} c={c} /></button>
          <div className="ml-file-body"><h2>{row.originalName || c.unknown}</h2><p className="sc-muted">{row.category ? c[row.category] : c.other} · {size(row.fileSize)}</p>{!!row.issues.length && <p className="ml-issue">{c.needsReview}</p>}
            <div className="sc-record-actions"><Button variant="outline" onClick={() => open({ kind: 'details', row })}>{c.details} #{row.id}</Button>{row.canDelete && <Button variant="ghost" disabled={!writable} onClick={() => open({ kind: 'remove', row })}>{c.remove}</Button>}</div></div></li>)}</ul>}
      {data.pages > 1 && <nav className="sc-pagination" aria-label={c.page}><Button variant="outline" disabled={data.currentPage <= 1 || busy} onClick={() => change({ page: data.currentPage - 1 })}>{c.previous}</Button><span>{c.page} {number(data.currentPage)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={data.currentPage >= data.pages || busy} onClick={() => change({ page: data.currentPage + 1 })}>{c.next}</Button></nav>}
      {!!data.pendingUploadCount && <section className="ml-unsettled"><h2>{c.pendingCount}</h2><p className="sc-muted">{c.pendingHint}</p><ul>{data.pendingUploads.map(request => <li key={request.requestKey}><div><strong>{request.originalName}</strong><p>{c.reserved}: {size(request.fileSize)}</p><small>{stamp(request.createdAt)}</small></div><div className="sc-actions"><Button variant="outline" disabled={busy || reading || !request.canRead} onClick={() => void recover(request.requestKey, request.actorId)}>{c.checkResult}</Button>{request.canClose && <Button variant="outline" disabled={busy || reading} onClick={() => open({ kind: 'close', requestKey: request.requestKey, actorId: request.actorId })}>{c.closeRequest}</Button>}</div></li>)}</ul>
        {data.pendingPages > 1 && <nav className="sc-pagination" aria-label={c.pendingCount}><Button variant="outline" disabled={data.currentRequestPage <= 1 || busy} onClick={() => change({ requests: data.currentRequestPage - 1 })}>{c.previous}</Button><span>{c.page} {number(data.currentRequestPage)} {c.of} {number(data.pendingPages)}</span><Button variant="outline" disabled={data.currentRequestPage >= data.pendingPages || busy} onClick={() => change({ requests: data.currentRequestPage + 1 })}>{c.next}</Button></nav>}</section>}
    </>}
    <Dialog open={!!modal} onOpenChange={isOpen => { if (!isOpen && !busy && !reading) { setModal(null); setFile(null); } }}><DialogContent closeLabel={c.close} className="sc-dialog ml-dialog" dir={locale === 'ar' ? 'rtl' : 'ltr'} onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); opener.current?.isConnected && opener.current.focus(); }}>
      <DialogHeader><DialogTitle ref={title} tabIndex={-1}>{modal?.kind === 'upload' ? c.uploadTitle : modal?.kind === 'remove' ? c.removeTitle : modal?.kind === 'close' ? c.closeRequestTitle : c.details}</DialogTitle><DialogDescription>{modal?.kind === 'upload' ? c.uploadHint : modal?.kind === 'remove' ? c.removeHint : modal?.kind === 'close' ? c.closeRequestHint : c.previewHint}</DialogDescription></DialogHeader>
      {failure && <p role="alert" className="sc-feedback">{failure}</p>}{notice && <p role="status">{notice}</p>}{pending && modal?.kind !== 'close' && pendingPanel}
      {modal?.kind === 'upload' && <div className="ml-upload"><div className={`ml-drop ${dragging ? 'ml-dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (writable) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files); }}>
        {file ? <><Thumbnail url={file.preview} kind={file.file.type === 'application/pdf' ? 'pdf' : 'image'} name={file.file.name} c={c} /><p>{c.reviewUpload}: <strong>{mediaFileName(file.file.name)}</strong></p><p>{size(file.file.size)}</p></> : <><Upload aria-hidden="true" /><p>{c.dropHint}</p></>}
        <Button variant="outline" disabled={!writable} onClick={() => picker.current?.click()} aria-describedby={fileError ? 'media-file-error' : undefined}>{reading ? c.reading : file ? c.replace : c.chooseFile}</Button>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" tabIndex={-1} aria-label={c.chooseFile} onChange={e => { void choose(e.target.files); e.target.value = ''; }} /><p className="sc-muted">{c.fileHelp}</p></div>
        {fileError && <p id="media-file-error" role="alert" className="ml-issue">{fileError}</p>}
        <label><span>{c.category}</span><select value={category} disabled={!writable} aria-invalid={!!categoryError} aria-describedby={categoryError ? 'media-category-error' : undefined} onChange={e => { setCategory(e.target.value as typeof category); setCategoryError(''); }}>{data?.allowedUploadCategories.map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>
        {categoryError && <p id="media-category-error" role="alert" className="ml-issue">{categoryError}</p>}
      </div>}
      {modal && 'row' in modal && <div className="ml-detail"><h2>{modal.row.originalName || c.unknown}</h2>{modal.row.originalName&&modal.row.originalName.length>100&&<details><summary>{c.fullName}</summary><p className="ml-full-name">{modal.row.originalName}</p></details>}{modal.kind === 'details' && <Thumbnail url={modal.row.previewUrl} name={modal.row.originalName || ''} kind={modal.row.kind} c={c} />}
        <dl className="sc-facts">{[[c.size, size(modal.row.fileSize)], [c.category, modal.row.category ? c[modal.row.category] : c.other], [c.created, stamp(modal.row.createdAt)], [c.mime, modal.row.mimeType || c.unknown]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        {!currentRow && <p role="alert" className="ml-issue">{c.stale}</p>}
        {modal.kind === 'details' && <>{modal.row.previewUrl && <><div className="sc-actions"><Button variant="outline" asChild><a href={modal.row.previewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink aria-hidden="true" />{c.open}</a></Button><Button variant="outline" onClick={() => void copy(modal.row.previewUrl!)}><Copy aria-hidden="true" />{c.copy}</Button></div><label><span>{c.link}</span><input readOnly value={modal.row.previewUrl} dir="ltr" onFocus={e => e.target.select()} /></label></>}
          {!!modal.row.issues.length && <p className="ml-issue">{c.needsReview}</p>}<details><summary>{c.technical}</summary><dl className="sc-facts"><div><dt>{c.storageKey}</dt><dd>{modal.row.fileName || c.unknown}</dd></div><div><dt>ID</dt><dd>{modal.row.id}</dd></div></dl></details></>}
      </div>}
      {modal?.kind === 'close' && <details><summary>{c.request}</summary><code>{modal.requestKey}</code></details>}
      <div className="ml-dialog-footer"><Button variant="outline" disabled={busy || reading} onClick={() => { setModal(null); setFile(null); }}>{modal?.kind === 'details' ? c.close : c.cancel}</Button>
        {modal?.kind === 'upload' && <Button disabled={!writable} onClick={() => void submit()}>{busy ? c.uploading : c.confirmUpload}</Button>}
        {modal?.kind === 'remove' && <Button disabled={!writable || !currentRow?.canDelete} onClick={() => void submit()}>{busy ? c.saving : c.confirmRemove}</Button>}
        {modal?.kind === 'close' && <Button disabled={busy || reading} onClick={() => void recover(modal.requestKey, modal.actorId, true)}>{busy ? c.saving : c.confirmClose}</Button>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
