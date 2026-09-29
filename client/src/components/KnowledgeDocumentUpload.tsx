import { knowledgeUploadFailure, knowledgeRetryAfterSeconds, type KnowledgeUploadFailure } from '@shared/knowledge-upload-failure';
import { KnowledgeWorkspaceScope } from './KnowledgeWorkspaceScope';
import { readKnowledgeAttempt, rememberKnowledgeAttempt, forgetKnowledgeAttempt, knowledgeCacheEpoch, clearKnowledgeWorkspace, knowledgeFileFingerprint, readKnowledgeUploadFingerprint, rememberKnowledgeUpload } from '@/lib/knowledge-workspace-cache';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { selectedMerchantId } from '@/lib/merchant-selection';
import type { KnowledgeReceipt } from '@shared/knowledge-intake';
import { KnowledgeReceiptView } from './KnowledgeReceiptView';
import { KnowledgeDocumentReview } from './KnowledgeDocumentReview';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

export function KnowledgeDocumentUpload({ sourceDocumentId }: { sourceDocumentId?: number }) {
  return <KnowledgeWorkspaceScope slot={sourceDocumentId ? `extract-source-${sourceDocumentId}` : 'extract'}>{key => <KnowledgeDocumentUploadForm key={key} sourceDocumentId={sourceDocumentId} cacheKey={key} />}</KnowledgeWorkspaceScope>;
}
function KnowledgeDocumentUploadForm({ sourceDocumentId, cacheKey }: { sourceDocumentId?: number; cacheKey: string }) {
  const [cache] = useState(() => {
    let attempt: string | null = null, failed = false, fingerprint: string | null = null;
    try { attempt = readKnowledgeAttempt(cacheKey); if (attempt) fingerprint = readKnowledgeUploadFingerprint(cacheKey, attempt); } catch { failed = true; }
    return { attempt, fingerprint, failed, epoch: knowledgeCacheEpoch() };
  });
  const [storageError, setStorageError] = useState(cache.failed);
  const { t } = useTranslation(), utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null), [receipt, setReceipt] = useState<KnowledgeReceipt | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<KnowledgeUploadFailure | 'file' | 'missing' | 'different' | 'unreadable' | null>(null);
  const [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now);
  const waitingSeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (!retryAt) return;
    const tick = () => { const current = Date.now(); setNow(current); if (current >= retryAt) setRetryAt(0); };
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const request = useRef<string | null>(cache.attempt), submitting = useRef(false), chooser = useRef<HTMLInputElement>(null);
  const reprocess = trpc.knowledgeDocs.reprocess.useMutation();
  const canRestoreFile = !!(cache.fingerprint && request.current && !file && !sourceDocumentId);
  const chooseDisabled = storageError || busy || !!receipt || (!!request.current && !canRestoreFile);
  const forgetRequest = () => { forgetKnowledgeAttempt(cacheKey, request.current); request.current = null; };
  const refreshLibrary = () => { void utils.knowledgeDocs.invalidate(); void utils.sariBrain.getSources.invalidate(); void utils.sariBrain.getActivityLog.invalidate(); };
  const check = async () => {
    if (!request.current || submitting.current) return;
    setBusy(true); submitting.current = true;
    try { const saved = await utils.sariBrain.getIntakeReceipt.fetch({ requestId: request.current }, { staleTime: 0 }); if (saved) { setReceipt(saved); setError(null); refreshLibrary(); } else setError('missing'); }
    catch { setError('unknown'); } finally { submitting.current = false; setBusy(false); }
  };
  const start = async () => {
    if (storageError || waitingSeconds > 0 || submitting.current || receipt || (!sourceDocumentId && !file)) return;
    submitting.current = true; setBusy(true); setError(null);
    const retrying = !!request.current;
    let fingerprint: string | undefined;
    if (!sourceDocumentId) {
      try { fingerprint = await knowledgeFileFingerprint(file!); }
      catch { setError('unreadable'); setBusy(false); submitting.current = false; return; }
    }
    try { const id = request.current || crypto.randomUUID(); if (sourceDocumentId) rememberKnowledgeAttempt(cacheKey, id, cache.epoch); else rememberKnowledgeUpload(cacheKey, id, fingerprint!, cache.epoch); request.current = id; }
    catch { setStorageError(true); setBusy(false); submitting.current = false; return; }
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
          if (response.status === 401) clearKnowledgeWorkspace();
          const reason = knowledgeUploadFailure(response.status);
          if (reason !== 'unknown') {
            if (reason === 'rateLimited') { const seconds = knowledgeRetryAfterSeconds(response.headers?.get('Retry-After')); if (seconds) { const current = Date.now(); setNow(current); setRetryAt(current + seconds * 1000); } }
            setError(reason); if (!retrying) forgetRequest(); return;
          }
          throw Error('Unconfirmed upload');
        }
        const data = await response.json();
        if (!data.receipt || data.receipt.requestId !== request.current) throw Error('Unexpected extraction response');
        saved = data.receipt;
      }
      setReceipt(saved); refreshLibrary();
    } catch (err) {
      const code = (err as { data?: { code?: string } }).data?.code;
      const statuses: Record<string, number> = { BAD_REQUEST: 400, NOT_FOUND: 400, FORBIDDEN: 403, UNAUTHORIZED: 401, CONFLICT: 409, TOO_MANY_REQUESTS: 429 };
      if (code && statuses[code]) { if (!retrying) forgetRequest(); setError(knowledgeUploadFailure(statuses[code])); }
      else setError('unknown');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <Card className="min-w-0" data-document-upload><CardHeader><CardTitle>{sourceDocumentId ? t('merchantUx.knowledgeDocument.reextract') : t('merchantUx.knowledgeDocument.title')}</CardTitle><CardDescription className="leading-7">{t('merchantUx.knowledgeDocument.description')}</CardDescription></CardHeader><CardContent className="min-w-0 space-y-4">
    {storageError && <p role="alert" className="rounded-xl border p-4 text-sm leading-7">{t('merchantUx.knowledgeDraft.storageError')}</p>}
    {cache.attempt && request.current && !receipt && <div role="status" className="space-y-2 rounded-xl border p-4 text-sm leading-7"><p>{t('merchantUx.knowledgeDraft.recovered')}</p>{!sourceDocumentId && !file && <p>{canRestoreFile ? t('merchantUx.knowledgeDraft.restoreOriginal') : t('merchantUx.knowledgeDraft.recoveredUpload')}</p>}</div>}
    {sourceDocumentId ? <p className="text-sm leading-7">{t('merchantUx.knowledgeDocument.reextractHint')}</p> : <>
      <input ref={chooser} type="file" hidden accept=".pdf,.docx,.xlsx" disabled={chooseDisabled} onChange={async event => {
        const selected = event.target.files?.[0]; event.target.value = ''; if (!selected || chooseDisabled || submitting.current) return;
        if (!/\.(pdf|docx|xlsx)$/i.test(selected.name) || selected.size > 5 * 1024 * 1024 || selected.size === 0) { setError('file'); setFile(null); return; }
        if (request.current) {
          submitting.current = true; setBusy(true);
          try { if (await knowledgeFileFingerprint(selected) !== cache.fingerprint) { setError('different'); return; } }
          catch { setError('unreadable'); return; }
          finally { submitting.current = false; setBusy(false); }
        }
        setFile(selected); setError(null);
      }} />
      <Button variant="outline" className="max-w-full whitespace-normal" disabled={chooseDisabled} onClick={() => chooser.current?.click()}>{canRestoreFile ? t('merchantUx.knowledgeDraft.chooseOriginal') : t('merchantUx.knowledgeDocument.choose')}</Button>
      {file && <p className="break-all text-sm" dir="auto">{file.name}</p>}
      <p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeDocument.fileHint')}</p>
    </>}
    {error && <p role="alert" className="text-sm leading-7">{error === 'different' ? t('merchantUx.knowledgeDraft.differentFile') : error === 'unreadable' ? t('merchantUx.knowledgeDraft.fileReadError') : error === 'file' ? t('merchantUx.knowledgeDocument.fileError') : error === 'rateLimited' ? t('merchantUx.knowledgeDocument.rateLimited') : error === 'noAccess' ? t('merchantUx.knowledgeDocument.noAccess') : error === 'signedOut' ? t('merchantUx.knowledgeDocument.signedOut') : error === 'conflict' ? t('merchantUx.knowledgeDocument.conflict') : error === 'invalidFile' ? t('merchantUx.knowledgeDocument.invalidFile') : error === 'missing' ? t('merchantUx.knowledgeDraft.missingUpload') : cache.attempt && !file && !sourceDocumentId ? t('merchantUx.knowledgeIntake.receiptError') : t('merchantUx.knowledgeDocument.unknown')}</p>}
    {request.current && error && ['rateLimited', 'noAccess', 'signedOut', 'conflict', 'invalidFile'].includes(error) && <p className="text-sm leading-7">{t('merchantUx.knowledgeDocument.unknown')}</p>}
    {waitingSeconds > 0 && !receipt && <p className="text-sm leading-7 text-muted-foreground" data-upload-cooldown>{waitingSeconds < 60 ? t('merchantUx.knowledgeDocument.waitShort') : t('merchantUx.knowledgeDocument.waitMinutes', { minutes: Math.ceil(waitingSeconds / 60) })}</p>}
    {!receipt && !(cache.attempt && request.current && !file && !sourceDocumentId) && <Button className="w-full whitespace-normal sm:w-auto" disabled={storageError || waitingSeconds > 0 || busy || (!sourceDocumentId && !file)} onClick={() => void start()}>{busy ? t('merchantUx.knowledgeDocument.working') : request.current ? t('merchantUx.knowledgeDocument.retrySame') : t('merchantUx.knowledgeDocument.start')}</Button>}
    {!receipt && request.current && <><p className="break-all text-xs">{t('merchantUx.knowledgeIntake.receiptId')}: {request.current}</p><Button variant="outline" disabled={busy} onClick={() => void check()}>{t('merchantUx.knowledgeIntake.receiptRefresh')}</Button></>}
    {receipt && <KnowledgeReceiptView receipt={receipt} onRefresh={() => void check()} busy={busy} />}
    {receipt?.document?.extraction === 'extracted' && receipt.state === 'empty' && receipt.documentId && <KnowledgeDocumentReview key={receipt.documentId} id={receipt.documentId} />}
    {receipt && (receipt.recoveredAt || !['processing', 'uncertain'].includes(receipt.state)) && <Button variant="outline" disabled={busy} onClick={() => { setReceipt(null); setFile(null); setError(null); forgetRequest(); }}>{t('merchantUx.knowledgeDocument.another')}</Button>}
    <a className="block text-sm underline underline-offset-4" href="/merchant/sari-brain?view=sources">{t('merchantUx.knowledgeDocument.library')}</a>
  </CardContent></Card>;
}
