import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { knowledgeAnalysisSchema, knowledgeReviewSchema, type KnowledgeAnalysis, type KnowledgeReview, type KnowledgeReceipt } from '@shared/knowledge-intake';
import { KnowledgeAnalysisReport } from './KnowledgeAnalysisReport';
import { KnowledgeReceiptView } from './KnowledgeReceiptView';
import { KNOWLEDGE_PREVIEW_LIMIT, readKnowledgePreview } from '@shared/knowledge-preview';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

export function KnowledgeIntake() {
  const { t } = useTranslation();
  const labels = {
    title: t('merchantUx.knowledgeIntake.title'),
    description: t('merchantUx.knowledgeIntake.description'),
    name: t('merchantUx.knowledgeIntake.name'),
    content: t('merchantUx.knowledgeIntake.content'),
    type: t('merchantUx.knowledgeIntake.type'),
    document: t('merchantUx.knowledgeIntake.document'),
    products: t('merchantUx.knowledgeIntake.products'),
    custom: t('merchantUx.knowledgeIntake.custom'),
    choose: t('merchantUx.knowledgeIntake.choose'),
    fileHint: t('merchantUx.knowledgeIntake.fileHint'),
    contentError: t('merchantUx.knowledgeIntake.contentError'),
    nameError: t('merchantUx.knowledgeIntake.nameError'),
    analyzing: t('merchantUx.knowledgeIntake.analyzing'),
    analyze: t('merchantUx.knowledgeIntake.analyze'),
    analysisError: t('merchantUx.knowledgeIntake.analysisError'),
    report: t('merchantUx.knowledgeIntake.report'),
    impact: t('merchantUx.knowledgeIntake.impact'),
    conflicts: t('merchantUx.knowledgeIntake.conflicts'),
    samples: t('merchantUx.knowledgeIntake.samples'),
    low: t('merchantUx.knowledgeIntake.low'),
    medium: t('merchantUx.knowledgeIntake.medium'),
    high: t('merchantUx.knowledgeIntake.high'),
    approve: t('merchantUx.knowledgeIntake.approve'),
    review: t('merchantUx.knowledgeIntake.review'),
    reject: t('merchantUx.knowledgeIntake.reject'),
    reviewed: t('merchantUx.knowledgeIntake.reviewed'),
    save: t('merchantUx.knowledgeIntake.save'),
    saving: t('merchantUx.knowledgeIntake.saving'),
    saved: t('merchantUx.knowledgeIntake.saved'),
    savedHint: t('merchantUx.knowledgeIntake.savedHint'),
    added: t('merchantUx.knowledgeIntake.added'),
    evolved: t('merchantUx.knowledgeIntake.evolved'),
    unchanged: t('merchantUx.knowledgeIntake.unchanged'),
    conflictCount: t('merchantUx.knowledgeIntake.conflictCount'),
    indexing: t('merchantUx.knowledgeIntake.indexing'),
    emptyResult: t('merchantUx.knowledgeIntake.emptyResult'),
    uncertain: t('merchantUx.knowledgeIntake.uncertain'),
    newContent: t('merchantUx.knowledgeIntake.newContent'),
    sourcesError: t('merchantUx.knowledgeIntake.sourcesError'),
    retry: t('merchantUx.knowledgeIntake.retry'),
    activityError: t('merchantUx.knowledgeIntake.activityError'),
    statusError: t('merchantUx.knowledgeIntake.statusError'),
    statusMissing: t('merchantUx.knowledgeIntake.statusMissing'),
  };
  const copy = (key: keyof typeof labels) => labels[key];
  const utils = trpc.useUtils();
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'document' | 'products' | 'custom'>('document');
  const [analysis, setAnalysis] = useState<KnowledgeAnalysis | null>(null);
  const [review, setReview] = useState<KnowledgeReview | null>(null);
  const [reviewExpired, setReviewExpired] = useState(false);
  const [result, setResult] = useState<KnowledgeReceipt | null>(null);
  const requestId = useRef<string | null>(null);
  const submitting = useRef(false);
  const [checking, setChecking] = useState(false);
  const [receiptError, setReceiptError] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [errors, setErrors] = useState({ name: false, content: false });
  const [analysisError, setAnalysisError] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const textField = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const refresh = () => {
    void utils.knowledgeDocs.invalidate();
    void utils.sariBrain.getSources.invalidate(); void utils.sariBrain.getKnowledgeSections.invalidate();
    void utils.sariBrain.getHealthScore.invalidate(); void utils.sariBrain.getActivityLog.invalidate();
    void utils.sariBrain.getPendingReviews.invalidate();
  };
  const analyze = trpc.sariBrain.analyzeContent.useMutation({
    onSuccess: data => { const parsed = knowledgeAnalysisSchema.safeParse(data.analysis), saved = knowledgeReviewSchema.safeParse(data.review); if (!parsed.success || !saved.success) { setAnalysisError(true); return; } setAnalysis(parsed.data); setReview(saved.data); void utils.sariBrain.getActivityLog.invalidate(); },
    onError: () => setAnalysisError(true),
  });
  const ingest = trpc.sariBrain.ingestAnalyzedContent.useMutation({
    onSuccess: data => { setResult(data); refresh(); },
    onError: error => {
      if (error.data?.code === 'PRECONDITION_FAILED') { setAnalysis(null); setReview(null); setReviewed(false); setReviewExpired(true); requestId.current = null; submitting.current = false; return; }
      setRejected(['CONFLICT', 'TOO_MANY_REQUESTS', 'BAD_REQUEST', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED'].includes(error.data?.code || '')); setUncertain(true); refresh();
    },
  });
  const readReceipt = async () => {
    if (!requestId.current || checking) return;
    const generationAtStart = generation.current;
    setChecking(true); setReceiptError(false);
    try {
      const saved = await utils.sariBrain.getIntakeReceipt.fetch({ requestId: requestId.current });
      if (generationAtStart !== generation.current) return;
      if (saved) { setResult(saved); setUncertain(false); refresh(); } else setReceiptError(true);
    } catch { if (generationAtStart === generation.current) setReceiptError(true); }
    finally { if (generationAtStart === generation.current) setChecking(false); }
  };
  const busy = reading || analyze.isPending || ingest.isPending;
  const locked = busy || !!result || uncertain;
  const invalidate = () => { generation.current++; setAnalysis(null); setReview(null); setReviewExpired(false); setReviewed(false); setAnalysisError(false); setFileError(''); };
  const reset = () => { invalidate(); setContent(''); setName(''); setResult(null); setUncertain(false); setErrors({ name: false, content: false }); requestId.current = null; submitting.current = false; setReceiptError(false); setRejected(false); textField.current?.focus(); };
  const runAnalysis = () => {
    if (locked) return;
    const next = { name: name.trim().length > 255, content: content.trim().length < 10 || content.length > KNOWLEDGE_PREVIEW_LIMIT };
    setErrors(next); if (next.name || next.content) { (next.name ? nameField.current : textField.current)?.focus(); return; }
    setAnalysis(null); setReview(null); setReviewExpired(false); setReviewed(false); setAnalysisError(false);
    analyze.mutate({ content, contentType: type, fileName: name.trim() || undefined });
  };
  return <Card className="min-w-0" data-knowledge-intake><CardHeader><CardTitle>{copy('title')}</CardTitle><CardDescription className="leading-7">{copy('description')}</CardDescription></CardHeader>
    <CardContent className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2"><Label htmlFor="knowledge-name">{copy('name')}</Label><Input id="knowledge-name" ref={nameField} value={name} disabled={locked} onChange={e => { setName(e.target.value); invalidate(); }} aria-invalid={errors.name} aria-describedby={errors.name ? 'knowledge-name-error' : undefined} />{errors.name && <p id="knowledge-name-error" role="alert" className="text-sm text-destructive">{copy('nameError')}</p>}</div>
        <div className="min-w-0 space-y-2"><Label htmlFor="knowledge-type">{copy('type')}</Label><select id="knowledge-type" className="h-10 w-full rounded-md border bg-background px-3 text-base" value={type} disabled={locked} onChange={e => { setType(e.target.value as typeof type); invalidate(); }}><option value="document">{copy('document')}</option><option value="products">{copy('products')}</option><option value="custom">{copy('custom')}</option></select></div>
      </div>
      <div className="space-y-2"><input type="file" ref={file} hidden accept=".txt,.csv" disabled={locked} onChange={async e => {
        const selected = e.target.files?.[0]; e.target.value = ''; if (!selected || locked) return;
        const request = ++generation.current; setReading(true); setFileError('');
        const value = await readKnowledgePreview(selected);
        if (request !== generation.current) return;
        setReading(false);
        if ('error' in value) { setFileError(value.error === 'tooLong' ? t('knowledgePreviewUx.tooLong') : value.error === 'unsupported' ? t('knowledgePreviewUx.unsupported') : value.error === 'empty' ? t('knowledgePreviewUx.empty') : t('knowledgePreviewUx.unreadable'));  return; }
        setContent(value.content); setName(value.name); invalidate(); setErrors({ name: false, content: false });
      }} /><Button type="button" variant="outline" disabled={locked} className="max-w-full whitespace-normal" onClick={() => file.current?.click()}>{copy('choose')}</Button><p className="text-sm text-muted-foreground">{copy('fileHint')}</p>{fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}</div>
      <div className="space-y-2"><Label htmlFor="knowledge-content">{copy('content')}</Label><Textarea id="knowledge-content" ref={textField} value={content} disabled={locked} dir="auto" className="min-h-44 text-base" onChange={e => { setContent(e.target.value); invalidate(); }} aria-invalid={errors.content} aria-describedby="knowledge-content-count knowledge-content-error" /><p id="knowledge-content-count" className="text-sm text-muted-foreground"><bdi>{t('merchantUx.knowledgeIntake.limit', { count: content.length, limit: KNOWLEDGE_PREVIEW_LIMIT })}</bdi></p><p id="knowledge-content-error" role={errors.content ? 'alert' : undefined} className="text-sm text-destructive">{errors.content ? copy('contentError') : ''}</p></div>
      {analysisError && <p role="alert" className="text-sm text-destructive">{copy('analysisError')}</p>}
      {reviewExpired && <p role="alert" className="text-sm leading-7">{t('merchantUx.knowledgeIntake.reviewExpired')}</p>}
      <Button disabled={locked} onClick={runAnalysis} className="w-full sm:w-auto">{analyze.isPending ? copy('analyzing') : copy('analyze')}</Button>
      {analysis && <section aria-label={copy('report')} className="min-w-0 space-y-4 rounded-xl border p-4 [overflow-wrap:anywhere]">
        <KnowledgeAnalysisReport analysis={analysis} />
        <p className="text-sm leading-7 text-muted-foreground">{t('merchantUx.knowledgeIntake.reviewScope')}</p>
        {!result && !uncertain && <><p className="text-sm leading-7">{t('merchantUx.knowledgeIntake.reviewValidity')}</p><label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" className="mt-2 h-4 w-4 shrink-0" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />{copy('reviewed')}</label><Button className="w-full sm:w-auto" disabled={!reviewed || !review || busy} onClick={() => { if (reviewed && review && !busy && !submitting.current) { submitting.current = true; requestId.current = crypto.randomUUID(); ingest.mutate({ requestId: requestId.current, reviewId: review.id, acknowledged: true, content, contentType: type, fileName: name.trim() || undefined }); } }}>{ingest.isPending ? copy('saving') : copy('save')}</Button></>}
      </section>}
      {result && <KnowledgeReceiptView receipt={result} onRefresh={() => void readReceipt()} busy={checking} />}
      {uncertain && <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm leading-7"><p>{rejected ? t('merchantUx.knowledgeIntake.receiptRejected') : copy('uncertain')}</p>{!rejected && <><p>{t('merchantUx.knowledgeIntake.receiptId')}: <bdi className="break-all">{requestId.current}</bdi></p><Button variant="outline" disabled={checking} onClick={() => void readReceipt()}>{t('merchantUx.knowledgeIntake.receiptRefresh')}</Button></>}{rejected && <Button variant="outline" onClick={() => { requestId.current = null; submitting.current = false; setUncertain(false); setRejected(false); }}>{t('merchantUx.knowledgeIntake.receiptEdit')}</Button>}</div>}
      {receiptError && <p role="alert" className="text-sm leading-7">{t('merchantUx.knowledgeIntake.receiptError')}</p>}
      {result && result.state !== 'processing' && (result.state !== 'uncertain' || result.recoveredAt) && <Button variant="outline" disabled={checking} onClick={reset}>{copy('newContent')}</Button>}
    </CardContent></Card>;
}
