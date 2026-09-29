import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from './ui/button';

export function KnowledgeDocumentCopies({ id, onOpen }: { id: number; onOpen: (item: { id: number; name: string }) => void }) {
  const { t } = useTranslation(), [open, setOpen] = useState(false), [page, setPage] = useState(1);
  const query = trpc.knowledgeDocs.copies.useQuery({ id, page }, { enabled: open, retry: false });
  const data = query.isError ? undefined : query.data;
  return <div className="min-w-0 space-y-3" data-document-copies>
    <Button variant="outline" className="max-w-full whitespace-normal" aria-expanded={open} onClick={() => setOpen(!open)}>{t('merchantUx.knowledgeDocument.copies')}</Button>
    {open && <>{query.isError ? <div role="alert"><p>{t('merchantUx.knowledgeDocument.copiesError')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('merchantUx.knowledgeLibrary.retry')}</Button></div>
      : query.isLoading ? <p role="status">{t('merchantUx.knowledgeLibrary.loading')}</p> : data && <>
        <p role="status">{t('merchantUx.knowledgeLibrary.count', { count: data.total })} · {t('merchantUx.knowledgeLibrary.page', { page: data.page, pages: data.totalPages })}</p>
        {!data.items.length && <p className="text-sm leading-7">{t('merchantUx.knowledgeDocument.noCopies')}</p>}
        <ul className="space-y-2">{data.items.map(item => <li key={item.id} className="min-w-0 rounded-lg border p-3"><p className="break-all">{item.fileName}</p><p className="text-sm">{item.isExtraction ? t('merchantUx.knowledgeDocument.reextract') : t('merchantUx.knowledgeDocument.derived')}</p><Button variant="outline" onClick={() => onOpen({ id: item.id, name: item.fileName })}>{t('merchantUx.knowledgeLibrary.read')}</Button></li>)}</ul>
        {data.totalPages > 1 && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching || data.page <= 1} onClick={() => setPage(data.page - 1)}>{t('merchantUx.knowledgeLibrary.previous')}</Button><Button variant="outline" disabled={query.isFetching || data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>{t('merchantUx.knowledgeLibrary.next')}</Button></div>}
      </>}</>}
  </div>;
}
