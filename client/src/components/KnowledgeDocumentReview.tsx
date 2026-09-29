import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { KnowledgeIntake } from './KnowledgeIntake';
import { Button } from './ui/button';

export function KnowledgeDocumentReview({ id }: { id: number }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const source = trpc.knowledgeDocs.reviewSource.useQuery({ id }, { enabled: open, retry: false, refetchOnWindowFocus: false, staleTime: Infinity });
  return <div className="min-w-0 space-y-3" data-document-review>
    {!open ? <Button className="w-full whitespace-normal sm:w-auto" onClick={() => setOpen(true)}>{t('merchantUx.knowledgeDocument.review')}</Button>
      : source.isError ? <div role="alert" className="space-y-3"><p>{t('merchantUx.knowledgeDocument.reviewError')}</p><Button variant="outline" onClick={() => void source.refetch()}>{t('merchantUx.knowledgeLibrary.retry')}</Button></div>
        : source.isLoading ? <p role="status">{t('merchantUx.knowledgeDocument.reviewLoading')}</p>
          : source.data && <KnowledgeIntake key={`${id}:${source.data.sourceDocument.revision}`} initialSource={source.data} />}
  </div>;
}
