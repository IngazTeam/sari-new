import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { parseMerchantDate } from '@/lib/merchant-date';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export function KnowledgeDocumentSections({ documentId }: { documentId: number }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const query = trpc.knowledgeDocs.sections.useQuery({ id: documentId, page }, { retry: false, refetchOnWindowFocus: false });
  const data = query.isError ? undefined : query.data;
  const heading = useRef<HTMLHeadingElement>(null), focusAfterPage = useRef(false);
  useEffect(() => {
    if (focusAfterPage.current && !query.isFetching && (data || query.isError)) {
      heading.current?.focus(); focusAfterPage.current = false;
    }
  }, [data, query.isFetching, query.isError]);
  const changePage = (next: number) => { focusAfterPage.current = true; setPage(next); };
  const actions = { add: t('merchantUx.knowledgeLibrary.linkAdded'), update: t('merchantUx.knowledgeLibrary.linkUpdated'), conflict: t('merchantUx.knowledgeLibrary.linkConflict'), unchanged: t('merchantUx.knowledgeLibrary.linkUnchanged') };
  const statuses = { approved: t('merchantUx.knowledgeLibrary.linkApproved'), auto_approved: t('merchantUx.knowledgeLibrary.linkAutoApproved'), pending_review: t('merchantUx.knowledgeLibrary.linkPending') };
  const modes = { fact: t('merchantUx.knowledgeLibrary.linkFact'), behavior: t('merchantUx.knowledgeLibrary.linkBehavior'), none: t('merchantUx.knowledgeLibrary.linkNone') };
  const date = (value: string | null) => {
    if (!value) return t('merchantUx.knowledgeLibrary.linkNoExpiry');
    const parsed = parseMerchantDate(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(i18n.language);
  };
  return <section aria-label={t('merchantUx.knowledgeLibrary.linksTitle')} aria-busy={query.isFetching} className="min-w-0 space-y-3 border-t py-4 [overflow-wrap:anywhere]" data-knowledge-section-links>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 ref={heading} tabIndex={-1} className="font-semibold focus:outline-primary">{t('merchantUx.knowledgeLibrary.linksTitle')}</h3><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>{t('merchantUx.knowledgeLibrary.linksRefresh')}</Button></div>
    <p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeLibrary.linksHint')}</p>
    {query.isError ? <p role="alert">{query.error?.data?.code === 'NOT_FOUND' ? t('merchantUx.knowledgeLibrary.missing') : t('merchantUx.knowledgeLibrary.linksError')}</p>
      : query.isLoading ? <p role="status">{t('merchantUx.knowledgeLibrary.linksLoading')}</p>
      : data && (!data.available ? <p className="rounded-lg bg-muted p-3 text-sm leading-7">{t('merchantUx.knowledgeLibrary.linksUnavailable')}</p>
        : <>
          <p role="status" aria-live="polite" className="text-sm">{t('merchantUx.knowledgeLibrary.linksCount', { count: data.total })} · {t('merchantUx.knowledgeLibrary.page', { page: data.page, pages: data.totalPages })}</p>
          {!data.total && <p>{t('merchantUx.knowledgeLibrary.linksEmpty')}</p>}
          <ul className="min-w-0 space-y-4">{data.items.map(item => <li key={item.planIndex} className="min-w-0 space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="min-w-0 font-semibold" dir="auto">{item.current?.title || item.saved.title}</h4><Badge variant="secondary">{!item.current ? t('merchantUx.knowledgeLibrary.linkRemoved') : item.contentChanged || item.settingsChanged ? t('merchantUx.knowledgeLibrary.linkChanged') : t('merchantUx.knowledgeLibrary.linkSame')}</Badge></div>
            <p className="text-sm text-muted-foreground">{actions[item.action]} · {t('merchantUx.knowledgeLibrary.linkId', { id: item.sectionId })}</p>
            {item.contentChanged && <p className="text-sm">{t('merchantUx.knowledgeLibrary.linkContentChanged')}</p>}
            {item.settingsChanged && <p className="text-sm">{t('merchantUx.knowledgeLibrary.linkSettingsChanged')}</p>}
            {!item.current && <p className="text-sm">{t('merchantUx.knowledgeLibrary.linkRemovedHint')}</p>}
            {item.current && <details className="min-w-0"><summary className="cursor-pointer py-3 text-sm font-medium">{t('merchantUx.knowledgeLibrary.linkSettings')}</summary><dl className="grid min-w-0 gap-3 rounded-lg bg-muted p-3 text-sm sm:grid-cols-2">
              <div><dt>{t('merchantUx.knowledgeLibrary.linkReviewStatus')}</dt><dd className="font-medium">{item.current.status ? statuses[item.current.status] : t('merchantUx.knowledgeLibrary.linkUnknown')}</dd></div>
              <div><dt>{t('merchantUx.knowledgeLibrary.linkPermission')}</dt><dd className="font-medium">{item.current.useInBot ? t('merchantUx.knowledgeLibrary.linkAllowed') : t('merchantUx.knowledgeLibrary.linkDisabled')}</dd></div>
              <div><dt>{t('merchantUx.knowledgeLibrary.linkMode')}</dt><dd className="font-medium">{item.current.injectAs ? modes[item.current.injectAs] : t('merchantUx.knowledgeLibrary.linkUnknown')}</dd></div>
              <div><dt>{t('merchantUx.knowledgeLibrary.linkExpiry')}</dt><dd className="font-medium">{date(item.current.validUntil)}</dd></div>
              <div><dt>{t('merchantUx.knowledgeLibrary.linkParent')}</dt><dd className="font-medium">{item.current.parentId === null ? t('merchantUx.knowledgeLibrary.linkNoParent') : t('merchantUx.knowledgeLibrary.linkId', { id: item.current.parentId })}</dd></div>
            </dl></details>}
            <details className="min-w-0"><summary className="cursor-pointer py-3 text-sm font-medium">{item.current ? t('merchantUx.knowledgeLibrary.linkCompare') : t('merchantUx.knowledgeLibrary.linkSavedOnly')}</summary>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2"><h5 className="text-sm font-semibold">{t('merchantUx.knowledgeLibrary.linkSaved')}</h5><p className="text-sm font-medium" dir="auto">{item.saved.title}</p><div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-7" dir="auto">{item.saved.content}</div><p className="text-sm text-muted-foreground" dir="auto">{item.saved.summary}</p></div>
                {item.current && <div className="min-w-0 space-y-2"><h5 className="text-sm font-semibold">{t('merchantUx.knowledgeLibrary.linkCurrent')}</h5><p className="text-sm font-medium" dir="auto">{item.current.title}</p><div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-7" dir="auto">{item.current.content}</div><p className="text-sm text-muted-foreground" dir="auto">{item.current.summary}</p></div>}
              </div>
            </details>
          </li>)}</ul>
          {data.totalPages > 1 && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={query.isFetching || data.page <= 1} onClick={() => changePage(data.page - 1)}>{t('merchantUx.knowledgeLibrary.previous')}</Button><Button variant="outline" disabled={query.isFetching || data.page >= data.totalPages} onClick={() => changePage(data.page + 1)}>{t('merchantUx.knowledgeLibrary.next')}</Button></div>}
        </>)}
  </section>;
}
