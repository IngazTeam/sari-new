import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { selectedMerchantId } from '@/lib/merchant-selection';
import type { KnowledgeReceipt } from '@shared/knowledge-intake';
import { KnowledgeReceiptView } from './KnowledgeReceiptView';
import { KnowledgeDocumentReview } from './KnowledgeDocumentReview';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

export function KnowledgeDocumentUpload({ sourceDocumentId }: { sourceDocumentId?: number }) {
  const { t } = useTranslation(), utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null), [receipt, setReceipt] = useState<KnowledgeReceipt | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<'file' | 'unknown' | 'rejected' | 'missing' | null>(null);
  const request = useRef<string | null>(null), submitting = useRef(false), chooser = useRef<HTMLInputElement>(null);
  const reprocess = trpc.knowledgeDocs.reprocess.useMutation();
  const refreshLibrary = () => { void utils.knowledgeDocs.invalidate(); void utils.sariBrain.getSources.invalidate(); void utils.sariBrain.getActivityLog.invalidate(); };
  const check = async () => {
    if (!request.current || submitting.current) return;
    setBusy(true); submitting.current = true;
    try { const saved = await utils.sariBrain.getIntakeReceipt.fetch({ requestId: request.current }); if (saved) { setReceipt(saved); setError(null); refreshLibrary(); } else setError('missing'); }
    catch { setError('unknown'); } finally { submitting.current = false; setBusy(false); }
  };
  const start = async () => {
    if (submitting.current || receipt || (!sourceDocumentId && !file)) return;
    submitting.current = true; setBusy(true); setError(null);
    const retrying = !!request.current;
    request.current ||= crypto.randomUUID();
    try {
      let saved: KnowledgeReceipt;
      if (sourceDocumentId) saved = await reprocess.mutateAsync({ id: sourceDocumentId, requestId: request.current });
      else {
        // Multipart text fields preserve UTF-8 names; filename headers default to Latin-1 in multer.
        const body = new FormData(); body.append('fileName', file!.name); body.append('file', file!);
        const selected = selectedMerchantId();
        const response = await fetch('/api/knowledge-docs/upload', { method: 'POST', credentials: 'include', body,
          headers: { ...(selected ? { 'x-merchant-id': selected } : {}), 'x-knowledge-request-id': request.current } });
        if (!response.ok) {
          if ([400, 401, 403, 409, 429].includes(response.status)) { setError(retrying ? 'unknown' : 'rejected'); if (!retrying) request.current = null; return; }
          throw Error('Unconfirmed upload');
        }
        const data = await response.json();
        if (!data.receipt || data.receipt.requestId !== request.current) throw Error('Unexpected extraction response');
        saved = data.receipt;
      }
      setReceipt(saved); refreshLibrary();
    } catch (err) {
      const code = (err as { data?: { code?: string } }).data?.code;
      if (['BAD_REQUEST','NOT_FOUND','FORBIDDEN','UNAUTHORIZED','CONFLICT','TOO_MANY_REQUESTS'].includes(code || '')) { if (!retrying) request.current = null; setError(retrying ? 'unknown' : 'rejected'); }
      else setError('unknown');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <Card className="min-w-0" data-document-upload><CardHeader><CardTitle>{sourceDocumentId ? t('merchantUx.knowledgeDocument.reextract') : t('merchantUx.knowledgeDocument.title')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.knowledgeDocument.description')}</CardDescription></CardHeader><CardContent className="min-w-0 space-y-4">
    {sourceDocumentId ? <p className="text-sm leading-7">{t('merchantUx.knowledgeDocument.reextractHint')}</p> : <>
      <input ref={chooser} type="file" hidden accept=".pdf,.docx,.xlsx" disabled={busy || !!request.current || !!receipt} onChange={event => {
        const selected = event.target.files?.[0]; event.target.value = ''; if (!selected) return;
        if (!/\.(pdf|docx|xlsx)$/i.test(selected.name) || selected.size > 5 * 1024 * 1024 || selected.size === 0) { setError('file'); setFile(null); return; }
        setFile(selected); setError(null);
      }} />
      <Button variant="outline" className="max-w-full whitespace-normal" disabled={busy || !!request.current || !!receipt} onClick={() => chooser.current?.click()}>{t('merchantUx.knowledgeDocument.choose')}</Button>
      {file && <p className="break-all text-sm" dir="auto">{file.name}</p>}
      <p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeDocument.fileHint')}</p>
    </>}
    {error && <p role="alert" className="text-sm leading-7">{error === 'file' ? t('merchantUx.knowledgeDocument.fileError') : error === 'rejected' ? t('merchantUx.knowledgeDocument.rejected') : error === 'missing' ? t('merchantUx.knowledgeDocument.missing') : t('merchantUx.knowledgeDocument.unknown')}</p>}
    {!receipt && <Button className="w-full whitespace-normal sm:w-auto" disabled={busy || (!sourceDocumentId && !file)} onClick={() => void start()}>{busy ? t('merchantUx.knowledgeDocument.working') : request.current ? t('merchantUx.knowledgeDocument.retrySame') : t('merchantUx.knowledgeDocument.start')}</Button>}
    {!receipt && request.current && <><p className="break-all text-xs">{t('merchantUx.knowledgeIntake.receiptId')}: {request.current}</p><Button variant="outline" disabled={busy} onClick={() => void check()}>{t('merchantUx.knowledgeIntake.receiptRefresh')}</Button></>}
    {receipt && <KnowledgeReceiptView receipt={receipt} onRefresh={() => void check()} busy={busy} />}
    {receipt?.document?.extraction === 'extracted' && receipt.state === 'empty' && receipt.documentId && <KnowledgeDocumentReview key={receipt.documentId} id={receipt.documentId} />}
    {receipt && (receipt.recoveredAt || !['processing', 'uncertain'].includes(receipt.state)) && <Button variant="outline" disabled={busy} onClick={() => { setReceipt(null); setFile(null); setError(null); request.current = null; }}>{t('merchantUx.knowledgeDocument.another')}</Button>}
    <a className="block text-sm underline underline-offset-4" href="/merchant/sari-brain?view=sources">{t('merchantUx.knowledgeDocument.library')}</a>
  </CardContent></Card>;
}
