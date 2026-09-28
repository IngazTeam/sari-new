import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { KnowledgeReceiptView } from './KnowledgeReceiptView';

function KnowledgeText({ id, name, onClose }: { id: number; name: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<{ page: number; revision?: string }>({ page: 1 });
  const query = trpc.knowledgeDocs.readText.useQuery({ id, ...position }, { retry: false, refetchOnWindowFocus: false });
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); }, []);
  const code = query.error?.data?.code;
  const data = query.isError ? undefined : query.data;
  return <section ref={panel} tabIndex={-1} aria-label={name} aria-busy={query.isFetching} className="min-w-0 space-y-4 rounded-xl border p-4 focus:outline-primary" data-knowledge-text>
    <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-all text-lg font-semibold">{name}</h3><Button variant="outline" onClick={onClose}>{t('merchantUx.knowledgeLibrary.close')}</Button></div>
    <p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeLibrary.textHint')}</p>
    {query.isError ? <div role="alert" className="space-y-3"><p>{code === 'CONFLICT' ? t('merchantUx.knowledgeLibrary.changed') : code === 'NOT_FOUND' ? t('merchantUx.knowledgeLibrary.missing') : t('merchantUx.knowledgeLibrary.textError')}</p>
      {code !== 'NOT_FOUND' && <Button variant="outline" onClick={() => { if (code === 'CONFLICT') setPosition({ page: 1 }); else void query.refetch(); }}>{code === 'CONFLICT' ? t('merchantUx.knowledgeLibrary.reopen') : t('merchantUx.knowledgeLibrary.retry')}</Button>}</div>
      : query.isLoading ? <p role="status">{t('merchantUx.knowledgeLibrary.textLoading')}</p> : data && <>
        {data.receipt && <KnowledgeReceiptView receipt={data.receipt} onRefresh={() => void query.refetch()} busy={query.isFetching} />}
        <div role="status" aria-live="polite" className="text-sm">{t('merchantUx.knowledgeLibrary.page', { page: data.page, pages: data.totalPages })} · {t('merchantUx.knowledgeLibrary.characters', { count: data.characterCount })}</div>
        {data.text ? <pre key={`${id}:${data.page}:${data.revision}`} dir="auto" className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 font-sans text-base leading-8 [overflow-wrap:anywhere]">{data.text}</pre> : <p>{t('merchantUx.knowledgeLibrary.noText')}</p>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={query.isFetching || data.page <= 1} onClick={() => setPosition({ page: data.page - 1, revision: data.revision })}>{t('merchantUx.knowledgeLibrary.previous')}</Button><Button variant="outline" disabled={query.isFetching || data.page >= data.totalPages} onClick={() => setPosition({ page: data.page + 1, revision: data.revision })}>{t('merchantUx.knowledgeLibrary.next')}</Button></div>
      </>}
  </section>;
}

export function KnowledgeLibrary() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{ page: number; search: string; status: 'all' | 'pending' | 'processing' | 'completed' | 'failed' }>({ page: 1, search: '', status: 'all' });
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const query = trpc.knowledgeDocs.list.useQuery(filters, { retry: false });
  const statuses = { all: t('merchantUx.knowledgeLibrary.all'), pending: t('merchantUx.knowledgeLibrary.pending'), processing: t('merchantUx.knowledgeLibrary.processing'), completed: t('merchantUx.knowledgeLibrary.completed'), failed: t('merchantUx.knowledgeLibrary.failed') };
  const intakeStatuses = { processing: t('merchantUx.knowledgeIntake.receiptProcessing'), completed: t('merchantUx.knowledgeIntake.saved'), empty: t('merchantUx.knowledgeIntake.receiptEmpty'), uncertain: t('merchantUx.knowledgeIntake.receiptUncertain') };
  const formatDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(i18n.language); };
  const data = query.isError ? undefined : query.data;
  return <Card className="min-w-0" data-knowledge-library><CardHeader><CardTitle>{t('merchantUx.knowledgeLibrary.title')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.knowledgeLibrary.description')}</CardDescription></CardHeader>
    <CardContent className="min-w-0 space-y-5">
      <p className="rounded-lg bg-muted p-3 text-sm leading-7">{t('merchantUx.knowledgeLibrary.scope')}</p>
      <form className="grid min-w-0 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); setSelected(null); setFilters({ ...filters, search: search.trim(), page: 1 }); }}>
        <div className="min-w-0 space-y-2"><Label htmlFor="knowledge-library-search">{t('merchantUx.knowledgeLibrary.search')}</Label><Input id="knowledge-library-search" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} className="text-base" /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="knowledge-library-status">{t('merchantUx.knowledgeLibrary.status')}</Label><select id="knowledge-library-status" className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-base" value={filters.status} onChange={e => { setSelected(null); setFilters({ ...filters, status: e.target.value as typeof filters.status, page: 1 }); }}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <Button type="submit">{t('merchantUx.knowledgeLibrary.searchAction')}</Button>
      </form>
      {query.isError ? <div role="alert" className="space-y-3"><p>{t('merchantUx.knowledgeLibrary.error')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('merchantUx.knowledgeLibrary.retry')}</Button></div>
        : query.isLoading ? <p role="status">{t('merchantUx.knowledgeLibrary.loading')}</p> : data && <>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{t('merchantUx.knowledgeLibrary.count', { count: data.total })} · {t('merchantUx.knowledgeLibrary.page', { page: data.page, pages: data.totalPages })}</p>
          {!data.canReadText && <p className="text-sm">{t('merchantUx.knowledgeLibrary.restricted')}</p>}
          {data.items.length === 0 ? <div className="space-y-2 rounded-xl border border-dashed p-5"><h3 className="font-semibold">{t('merchantUx.knowledgeLibrary.empty')}</h3><p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeLibrary.emptyHint')}</p></div> : <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{data.items.map(item => <li key={item.id} className="min-w-0 space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-all font-semibold">{item.fileName}</h3><Badge variant={item.extractionStatus === 'failed' ? 'destructive' : 'secondary'}>{statuses[item.extractionStatus]}</Badge></div>
            <p className="break-words text-sm text-muted-foreground">{item.fileType.toUpperCase()} · {t('merchantUx.knowledgeLibrary.size', { count: Math.ceil(item.fileSize / 1024) })} · {t('merchantUx.knowledgeLibrary.characters', { count: item.characterCount })}</p>
            <p className="text-sm text-muted-foreground">{t('merchantUx.knowledgeLibrary.uploaded')}: {formatDate(item.uploadedAt)} · {t('merchantUx.knowledgeLibrary.updated')}: {formatDate(item.updatedAt)}</p>
            {item.intakeRequestId && <p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.receiptLibrary')}</p>}
            {item.intakeState && <p className="text-sm font-medium">{intakeStatuses[item.intakeState]}</p>}
            {data.canReadText && <Button variant="outline" className="w-full sm:w-auto" aria-label={t('merchantUx.knowledgeLibrary.readNamed', { name: item.fileName })} onClick={e => { opener.current = e.currentTarget; setSelected({ id: item.id, name: item.fileName }); }}>{t('merchantUx.knowledgeLibrary.read')}</Button>}
          </li>)}</ul>}
          {data.totalPages > 1 && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={query.isFetching || data.page <= 1} onClick={() => { setSelected(null); setFilters({ ...filters, page: data.page - 1 }); }}>{t('merchantUx.knowledgeLibrary.previous')}</Button><Button variant="outline" disabled={query.isFetching || data.page >= data.totalPages} onClick={() => { setSelected(null); setFilters({ ...filters, page: data.page + 1 }); }}>{t('merchantUx.knowledgeLibrary.next')}</Button></div>}
        </>}
      {selected && data?.canReadText && <KnowledgeText key={selected.id} id={selected.id} name={selected.name} onClose={() => { setSelected(null); opener.current?.focus(); }} />}
    </CardContent>
  </Card>;
}
