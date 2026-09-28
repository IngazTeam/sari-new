import { useTranslation } from 'react-i18next';
import type { KnowledgeReceipt } from '@shared/knowledge-intake';
import { Button } from './ui/button';

export function KnowledgeReceiptView({ receipt, onRefresh, busy }: { receipt: KnowledgeReceipt; onRefresh?: () => void; busy?: boolean }) {
  const { t } = useTranslation();
  const labels = {
    processing: t('merchantUx.knowledgeIntake.receiptProcessing'), completed: t('merchantUx.knowledgeIntake.saved'),
    empty: t('merchantUx.knowledgeIntake.emptyResult'), uncertain: t('merchantUx.knowledgeIntake.uncertain'), removed: t('merchantUx.knowledgeIntake.receiptRemoved'),
    added: t('merchantUx.knowledgeIntake.added'), evolved: t('merchantUx.knowledgeIntake.evolved'),
    conflicts: t('merchantUx.knowledgeIntake.conflictCount'), unchanged: t('merchantUx.knowledgeIntake.unchanged'),
    merged: t('merchantUx.knowledgeIntake.merged'),
  };
  return <section role="status" aria-live="polite" className="min-w-0 space-y-3 rounded-xl border p-4 [overflow-wrap:anywhere]" data-knowledge-receipt>
    <h3 className="font-semibold">{labels[receipt.state]}</h3>
    {receipt.outcome && <><p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.savedHint')}</p>
      <dl className="grid grid-cols-2 gap-3">{(['added', 'evolved', 'merged', 'conflicts', 'unchanged'] as const).filter(key => receipt.outcome!.evolveResult[key] !== undefined).map(key => <div key={key} className="min-w-0 rounded-lg bg-muted p-3"><dt className="text-sm">{labels[key]}</dt><dd className="mt-1 text-xl font-semibold">{receipt.outcome!.evolveResult[key]}</dd></div>)}</dl>
      {receipt.outcome.success && !receipt.outcome.embeddingsReady && <p className="text-sm">{t('merchantUx.knowledgeIntake.indexing')}</p>}</>}
    {(receipt.state === 'processing' || receipt.state === 'uncertain') && <p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.receiptSupport')}</p>}
    <details className="text-sm leading-7"><summary className="cursor-pointer py-2">{t('merchantUx.knowledgeIntake.receiptDetails')}</summary>
      <p>{t('merchantUx.knowledgeIntake.receiptArchive')}</p>
      <p className="text-xs text-muted-foreground">{t('merchantUx.knowledgeIntake.receiptId')}: <bdi>{receipt.requestId}</bdi></p>
    </details>
    {onRefresh && <Button variant="outline" className="max-w-full whitespace-normal" disabled={busy} onClick={onRefresh}>{t('merchantUx.knowledgeIntake.receiptRefresh')}</Button>}
  </section>;
}
