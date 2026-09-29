import { useTranslation } from 'react-i18next';
import { parseMerchantDate } from '@/lib/merchant-date';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { KnowledgeReceipt } from '@shared/knowledge-intake';
import { Button } from './ui/button';
import { KnowledgeAnalysisReport } from './KnowledgeAnalysisReport';
import { KnowledgePlanView } from './KnowledgePlanView';

function KnowledgeRecoveryControl({ receipt, onRecovered }: { receipt: KnowledgeReceipt; onRecovered: (receipt: KnowledgeReceipt) => void }) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const utils = trpc.useUtils();
  const recover = trpc.sariBrain.recoverIntakeReceipt.useMutation({ onSuccess: result => {
    onRecovered(result); void utils.knowledgeDocs.invalidate(); void utils.sariBrain.getActivityLog.invalidate();
  } });
  if (receipt.recovery !== 'available') return <p className="text-sm leading-7">{receipt.recovery === 'legacy' ? t('merchantUx.knowledgeIntake.recoveryLegacy') : t('merchantUx.knowledgeIntake.recoveryWaiting')}</p>;
  return <div className="space-y-3 rounded-lg bg-muted p-3">
    <p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.recoveryAvailable')}</p>
    <label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" className="mt-2 h-4 w-4 shrink-0" checked={acknowledged} disabled={recover.isPending} onChange={event => setAcknowledged(event.target.checked)} />{t('merchantUx.knowledgeIntake.recoveryAcknowledge')}</label>
    <Button className="h-auto min-h-10 w-full whitespace-normal" disabled={!acknowledged || recover.isPending} onClick={() => recover.mutate({ requestId: receipt.requestId, acknowledged: true })}>{recover.isPending ? t('merchantUx.knowledgeIntake.recoverySaving') : t('merchantUx.knowledgeIntake.recoveryAction')}</Button>
    {recover.isError && <p role="alert" className="text-sm leading-7">{t('merchantUx.knowledgeIntake.recoveryError')}</p>}
  </div>;
}

export function KnowledgeReceiptView({ receipt: savedReceipt, onRefresh, busy }: { receipt: KnowledgeReceipt; onRefresh?: () => void; busy?: boolean }) {
  const { t, i18n } = useTranslation();
  const [recovered, setRecovered] = useState<KnowledgeReceipt | null>(null);
  const receipt = savedReceipt.state === 'processing' && recovered?.requestId === savedReceipt.requestId ? recovered : savedReceipt;
  const labels = {
    processing: t('merchantUx.knowledgeIntake.receiptProcessing'), completed: t('merchantUx.knowledgeIntake.saved'),
    empty: t('merchantUx.knowledgeIntake.emptyResult'), uncertain: t('merchantUx.knowledgeIntake.uncertain'), removed: t('merchantUx.knowledgeIntake.receiptRemoved'),
    added: t('merchantUx.knowledgeIntake.added'), evolved: t('merchantUx.knowledgeIntake.evolved'),
    conflicts: t('merchantUx.knowledgeIntake.conflictCount'), unchanged: t('merchantUx.knowledgeIntake.unchanged'),
    merged: t('merchantUx.knowledgeIntake.merged'),
  };
  return <section role="status" aria-live="polite" className="min-w-0 space-y-3 border-y py-4 sm:rounded-xl sm:border sm:p-4 [overflow-wrap:anywhere]" data-knowledge-receipt>
    <h3 className="font-semibold">{receipt.document && receipt.state === 'empty' ? receipt.document.extraction === 'extracted' ? t('merchantUx.knowledgeDocument.ready') : t('merchantUx.knowledgeDocument.failed') : receipt.recoveredAt && receipt.state === 'uncertain' ? t('merchantUx.knowledgeIntake.receiptRecovered') : labels[receipt.state]}</h3>
    {receipt.document && <div className="space-y-2 text-sm leading-7">
      <p>{t('merchantUx.knowledgeDocument.extractionOnly')}</p>
      {receipt.document.issue && <p>{receipt.document.issue === 'too_large' ? t('merchantUx.knowledgeDocument.tooLarge') : receipt.document.issue === 'empty' ? t('merchantUx.knowledgeDocument.empty') : t('merchantUx.knowledgeDocument.unreadable')}</p>}
      {!receipt.document.originalStored && receipt.state !== 'processing' && <p>{t('merchantUx.knowledgeDocument.noOriginal')}</p>}
    </div>}
    {receipt.review?.sourceDocument && <p className="text-sm leading-7">{t('merchantUx.knowledgeDocument.fromSource', { name: receipt.review.sourceDocument.fileName })}</p>}
    {receipt.outcome && <><p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.savedHint')}</p>
      <dl className="grid grid-cols-2 gap-3">{(['added', 'evolved', 'merged', 'conflicts', 'unchanged'] as const).filter(key => receipt.outcome!.evolveResult[key] !== undefined).map(key => <div key={key} className="min-w-0 rounded-lg bg-muted p-3"><dt className="text-sm">{labels[key]}</dt><dd className="mt-1 text-xl font-semibold">{receipt.outcome!.evolveResult[key]}</dd></div>)}</dl>
      {receipt.outcome.success && !receipt.outcome.embeddingsReady && <p className="text-sm">{t('merchantUx.knowledgeIntake.indexing')}</p>}</>}
    {receipt.state === 'uncertain' && !receipt.recoveredAt && <p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.receiptSupport')}</p>}
    {receipt.state === 'processing' && <KnowledgeRecoveryControl key={receipt.requestId} receipt={receipt} onRecovered={result => { setRecovered(result); onRefresh?.(); }} />}
    {receipt.recoveredAt && <p className="rounded-lg bg-muted p-3 text-sm leading-7">{t('merchantUx.knowledgeIntake.recoveryDone')}</p>}
    {receipt.review ? <details className="space-y-3 border-t pt-3 text-sm leading-7" data-knowledge-saved-review><summary className="cursor-pointer py-2 font-medium">{t('merchantUx.knowledgeIntake.savedReview')}</summary>
      <p>{t('merchantUx.knowledgeIntake.reviewScope')}</p>
      <p>{t('merchantUx.knowledgeIntake.reviewAcceptedAt')}: <bdi>{parseMerchantDate(receipt.review.acceptedAt).toLocaleString(i18n?.language || 'ar')}</bdi></p>
      <KnowledgeAnalysisReport analysis={receipt.review.analysis} />
      {receipt.review.plan ? <KnowledgePlanView plan={receipt.review.plan} archived /> : <p className="text-muted-foreground">{t('merchantUx.knowledgeIntake.planLegacy')}</p>}
    </details> : receipt.state !== 'removed' && !receipt.document && <p className="text-sm text-muted-foreground">{t('merchantUx.knowledgeIntake.reviewUnavailable')}</p>}
    <details className="text-sm leading-7"><summary className="cursor-pointer py-2">{t('merchantUx.knowledgeIntake.receiptDetails')}</summary>
      <p>{t('merchantUx.knowledgeIntake.receiptArchive')}</p>
      <p className="text-xs text-muted-foreground">{t('merchantUx.knowledgeIntake.receiptId')}: <bdi>{receipt.requestId}</bdi></p>
    </details>
    {onRefresh && <Button variant="outline" className="max-w-full whitespace-normal" disabled={busy} onClick={onRefresh}>{t('merchantUx.knowledgeIntake.receiptRefresh')}</Button>}
  </section>;
}
