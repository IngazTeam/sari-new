import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Eye, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { campaignEditorSchema, campaignAudiencePreviewSchema, type CampaignEditorSnapshot } from '@shared/campaign-editor';
import { campaignMessageIssue, withCampaignOptOutNotice } from '@shared/campaign-message';
import { campaignScheduleField, resolveCampaignSchedule } from '@shared/campaign-schedule';
import { campaignEditorLabels } from '@/lib/campaign-editor-labels';
import { campaignAudienceFields, campaignAudienceSelectionKey, emptyCampaignAudience, parseCampaignAudienceFields } from '@/lib/campaign-editor-form';
import { conversationMediaUrl } from '@/lib/conversation-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import '@/styles/campaign-workspace.css';
import '@/styles/campaign-details-workspace.css';
import '@/styles/campaign-editor-workspace.css';

export function CampaignEditorWorkspace({ actorId, merchantId, campaignId }: { actorId: number; merchantId: number; campaignId?: number }) {
  const query = trpc.campaigns.editorWorkspace.useQuery(campaignId ? { id: campaignId } : {}, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const parsed = campaignEditorSchema.safeParse(query.data);
  const data = !query.error && parsed.success && parsed.data.actorId === actorId && parsed.data.merchantId === merchantId
    && (campaignId === undefined ? parsed.data.campaign === null : parsed.data.campaign?.id === campaignId) ? parsed.data : null;
  const [seed, setSeed] = useState<CampaignEditorSnapshot | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => { if (data && !seed && !query.isFetching) setSeed(data); }, [data, seed, query.isFetching]);
  const refresh = () => { void query.refetch(); };
  if (!seed) {
    if (query.error) return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={refresh} />;
    return <WorkspaceState kind={query.isLoading || query.isFetching || data ? 'loading' : 'error'} onRetry={refresh} />;
  }
  return <CampaignEditorForm key={revision} seed={seed} current={data} sourcePending={query.isFetching} refresh={refresh} reload={() => { if (data && !query.isFetching) { setSeed(data); setRevision(value => value + 1); } }} />;
}

function CampaignEditorForm({ seed, current, sourcePending, refresh, reload }: {
  seed: CampaignEditorSnapshot; current: CampaignEditorSnapshot | null; sourcePending: boolean; refresh: () => void; reload: () => void;
}) {
  const { t, i18n } = useTranslation(), label = campaignEditorLabels(t), [path, navigate] = useLocation(), search = useSearch();
  const campaign = seed.campaign, id = campaign?.id, rtl = i18n.language.startsWith('ar'), locale = rtl ? 'ar-SA' : 'en-US';
  const number = (value: number) => value.toLocaleString(locale);
  const [form, setForm] = useState({ name: campaign?.name ?? '', message: campaign?.message ?? '', imageUrl: campaign?.imageUrl ?? '', scheduledAt: campaignScheduleField(campaign?.scheduledAt ?? null, seed.timezone) ?? '' });
  const [audienceFields, setAudienceFields] = useState(campaign?.audience.status === 'valid' ? campaignAudienceFields(campaign.audience.filters) : emptyCampaignAudience);
  const [audienceInvalid, setAudienceInvalid] = useState(campaign?.audience.status === 'invalid'), [scheduled, setScheduled] = useState(!!campaign?.scheduledAt);
  const [attempted, setAttempted] = useState(false), [touched, setTouched] = useState<string[]>([]), [dialog, setDialog] = useState<'review' | 'reload' | null>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [failedImage, setFailedImage] = useState<string | null>(null);
  const mounted = useRef(true), lock = useRef(false), scope = useRef(''), opener = useRef<HTMLElement | null>(null), heading = useRef<HTMLHeadingElement | null>(null);
  scope.current = `${seed.actorId}:${seed.merchantId}:${id ?? 'new'}:${path}:${search}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setDialog(null); }, [path, search]);
  const created = trpc.campaigns.create.useMutation(), updated = trpc.campaigns.update.useMutation(), utils = trpc.useUtils();
  const filters = audienceInvalid ? null : parseCampaignAudienceFields(audienceFields), filterKey = filters ? campaignAudienceSelectionKey(filters) : null;
  const [debounced, setDebounced] = useState(filters);
  useEffect(() => { const timer = setTimeout(() => setDebounced(filters), 250); return () => clearTimeout(timer); }, [filterKey]);
  const stale = conflict || !!current && (current.campaign?.definitionKey !== campaign?.definitionKey || current.timezone !== seed.timezone || current.merchantStatus !== seed.merchantStatus);
  const canManage = !!current?.canManage && seed.canManage, editable = !campaign || ['draft', 'scheduled'].includes(campaign.status);
  const audienceQuery = trpc.campaigns.audiencePreview.useQuery(debounced ?? {}, { enabled: canManage && editable && !!filters && !!debounced && filterKey === campaignAudienceSelectionKey(debounced), retry: false, staleTime: 0, refetchOnMount: 'always' });
  const previewParsed = campaignAudiencePreviewSchema.safeParse(audienceQuery.data);
  const audience = !audienceQuery.error && !audienceQuery.isFetching && previewParsed.success && previewParsed.data.actorId === seed.actorId && previewParsed.data.merchantId === seed.merchantId
    && filterKey === campaignAudienceSelectionKey(previewParsed.data.filters) ? previewParsed.data : null;
  const imageUrl = form.imageUrl.trim() || null, image = conversationMediaUrl(imageUrl), outgoing = form.message.trim() ? withCampaignOptOutNotice(form.message) : '', messageIssue = campaignMessageIssue(form.message, imageUrl);
  const schedule = resolveCampaignSchedule(scheduled ? form.scheduledAt : '', seed.timezone);
  const scheduleErrors = { invalid_timezone: label('zoneUnavailable'), invalid_schedule: label('scheduleInvalid'), past: label('schedulePast'), out_of_range: label('scheduleRange'), nonexistent: label('scheduleGap'), ambiguous: label('scheduleFold') };
  const errors = {
    name: !form.name.trim() || form.name.trim().length > 255 ? label('nameError') : '',
    message: !form.message.trim() || form.message.trim().length > 3800 ? label('messageError') : messageIssue === 'caption_too_long' ? label('captionError') : messageIssue === 'text_too_long' ? label('textError') : '',
    imageUrl: campaignMessageIssue('Image validation', imageUrl) === 'invalid_image' || (imageUrl?.length ?? 0) > 500 ? label('imageError') : '',
    audience: audienceInvalid ? label('savedAudienceInvalid') : !filters ? label('audienceError') : '',
    scheduledAt: scheduled ? schedule.status === 'invalid' ? scheduleErrors[schedule.issue] : schedule.status === 'empty' ? label('scheduleInvalid') : '' : '',
  };
  const scheduleBlocked = scheduled && (!audience || audience.exceedsLimit || audience.recipientCount === 0 || !!image && failedImage === image);
  const canSave = canManage && editable && !!current && !sourcePending && !stale && !uncertain && !Object.values(errors).some(Boolean) && !scheduleBlocked;
  const fieldError = (key: keyof typeof errors) => (attempted || touched.includes(key)) && errors[key];
  const blur = (key: string) => setTouched(keys => keys.includes(key) ? keys : [...keys, key]);
  const patch = (key: keyof typeof form, value: string) => { setForm(previous => ({ ...previous, [key]: value })); setFailure(''); };
  const open = (mode: 'review' | 'reload') => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDialog(mode); };
  const review = () => {
    setAttempted(true); setFailure('');
    if (!canSave) { const key = Object.keys(errors).find(key => errors[key as keyof typeof errors]); if (key) document.getElementById(`ce-${key}`)?.focus(); return; }
    open('review');
  };
  const save = async () => {
    if (!canSave || busy || lock.current || !filters || dialog !== 'review') return;
    const resolved = resolveCampaignSchedule(scheduled ? form.scheduledAt : '', seed.timezone);
    if (scheduled && resolved.status !== 'valid') { setDialog(null); setAttempted(true); return; }
    const submitted = scope.current; lock.current = true; setBusy(true); setFailure('');
    const common = { name: form.name.trim(), message: form.message.trim(), targetAudience: JSON.stringify(filters) };
    try {
      const result = id
        ? await updated.mutateAsync({ ...common, id, expectedDefinition: campaign!.definitionKey, imageUrl, scheduledAt: resolved.status === 'valid' ? new Date(resolved.iso) : null })
        : await created.mutateAsync({ ...common, imageUrl: imageUrl ?? undefined, scheduledAt: resolved.status === 'valid' ? new Date(resolved.iso) : undefined });
      if (!mounted.current || scope.current !== submitted) return;
      const savedId = id ?? (result as { id?: number } | undefined)?.id;
      if (!Number.isSafeInteger(savedId) || !savedId || savedId <= 0 || (id ? (result as { success?: boolean })?.success !== true : (result as { merchantId?: number })?.merchantId !== seed.merchantId)) throw Error('Unverified save result');
      setDialog(null);
      void utils.campaigns.workspace.invalidate().catch(() => {}); void utils.campaigns.performanceSnapshot.invalidate().catch(() => {});
      void utils.campaigns.detailsWorkspace.invalidate({ id: savedId }).catch(() => {}); void utils.campaigns.editorWorkspace.invalidate().catch(() => {});
      navigate(`/merchant/campaigns/${savedId}`);
    } catch (error) {
      if (!mounted.current || scope.current !== submitted) return;
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === 'CONFLICT') { setConflict(true); setFailure(label('stale')); refresh(); }
      else if (code === 'FORBIDDEN') { setFailure(label('forbidden')); refresh(); }
      else if (code === 'BAD_REQUEST') { setFailure(label('validationRejected')); setDialog(null); setAttempted(true); refresh(); }
      else { setUncertain(true); setFailure(label('saveFailed')); }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  if (!seed.canManage) return <section className="campaign-workspace cd-panel"><h1>{label(id ? 'editTitle' : 'title')}</h1><p>{label('readOnly')}</p><Link href="/merchant/campaigns">{label('back')}</Link></section>;
  if (!editable) return <section className="campaign-workspace cd-panel"><h1>{label('editTitle')}</h1><p>{label('locked')}</p><Link href={`/merchant/campaigns/${id}`}>{label('details')}</Link></section>;
  const messagePreview = <><p className="cd-message" dir="auto">{outgoing || label('previewEmpty')}</p>{image && failedImage !== image && <img className="ce-image" src={image} alt={label('imageAlt')} referrerPolicy="no-referrer" decoding="async" onError={() => setFailedImage(image)} />}{image && failedImage === image && <p className="cw-error" role="alert">{label('imageFailed')}</p>}</>;
  const audienceDescription = <>{audience ? <><strong>{label('unique', { count: number(audience.recipientCount) })}</strong><p>{label('matched', { count: number(audience.count) })}</p><p className="cw-muted">{label('excluded', { invalid: number(audience.invalidPhoneCount), duplicates: number(audience.duplicateCount) })}</p></> : <p role="status">{label(audienceQuery.isFetching || filterKey !== (debounced ? campaignAudienceSelectionKey(debounced) : null) ? 'previewLoading' : 'previewUnavailable')}</p>}<p className="cw-muted">{label('beforeConsent')}</p>{audience?.exceedsLimit && <p className="cw-error">{label('overLimit')}</p>}{audience?.recipientCount === 0 && <p className="cw-notice">{label('emptyAudience')}</p>}</>;
  return <div className="campaign-workspace campaign-editor-workspace" dir={rtl ? 'rtl' : 'ltr'}>
    <Link className="cd-back" href="/merchant/campaigns">{label('back')}</Link>
    <header className="cw-header"><div><h1>{label(id ? 'editTitle' : 'title')}</h1><p>{label('description')}</p></div><Button variant="outline" disabled={sourcePending || busy} onClick={refresh}><RefreshCw aria-hidden="true" />{label('refresh')}</Button></header>
    {!current && <p className="cw-error" role="alert">{label('sourceUnavailable')}</p>}{current && !canManage && <p className="cw-error" role="alert">{label('readOnly')}</p>}
    {stale && <aside className="cw-review"><p>{label('stale')}</p><Button variant="outline" disabled={!current || sourcePending || busy} onClick={() => open('reload')}>{label('reload')}</Button></aside>}
    {failure && <p className="cw-error" role="alert">{failure}{uncertain && <> <Link href="/merchant/campaigns">{label('back')}</Link></>}</p>}
    <form noValidate onSubmit={event => { event.preventDefault(); review(); }}>
      <div className="ce-layout"><div className="ce-sections">
        <section className="cd-panel" aria-labelledby="ce-message-title"><h2 id="ce-message-title">{label('messageSection')}</h2><fieldset disabled={busy} className="ce-fields">
          <div><Label htmlFor="ce-name">{label('name')}</Label><Input id="ce-name" value={form.name} maxLength={255} onChange={event => patch('name', event.target.value)} onBlur={() => blur('name')} aria-invalid={!!fieldError('name')} aria-describedby={fieldError('name') ? 'ce-name-error' : 'ce-name-hint'} /><p id="ce-name-hint" className="cw-muted">{label('nameHint')}</p>{fieldError('name') && <p id="ce-name-error" className="ce-field-error" role="alert">{errors.name}</p>}</div>
          <div><Label htmlFor="ce-message">{label('message')}</Label><Textarea id="ce-message" rows={6} value={form.message} maxLength={3800} onChange={event => patch('message', event.target.value)} onBlur={() => blur('message')} aria-invalid={!!fieldError('message')} aria-describedby="ce-message-count ce-message-error" /><p id="ce-message-count" className="cw-muted">{label('count', { count: number(outgoing.length), limit: number(imageUrl ? 1024 : 4096) })}</p><p id="ce-message-error" className="ce-field-error" role={fieldError('message') ? 'alert' : undefined}>{fieldError('message')}</p></div>
          <div><Label htmlFor="ce-imageUrl">{label('image')}</Label><Input id="ce-imageUrl" type="url" dir="ltr" value={form.imageUrl} maxLength={500} onChange={event => patch('imageUrl', event.target.value)} onBlur={() => blur('imageUrl')} aria-invalid={!!fieldError('imageUrl')} aria-describedby="ce-image-hint ce-image-error" /><p id="ce-image-hint" className="cw-muted">{label('imageHint')}</p><p id="ce-image-error" className="ce-field-error" role={fieldError('imageUrl') ? 'alert' : undefined}>{fieldError('imageUrl')}</p></div>
        </fieldset></section>
        <section className="cd-panel" aria-labelledby="ce-audience-title"><h2 id="ce-audience-title">{label('audience')}</h2><p className="cw-muted">{label('audienceHint')}</p>
          {audienceInvalid && <div className="cw-error" role="alert"><p>{label('savedAudienceInvalid')}</p><Button type="button" variant="outline" disabled={busy} onClick={() => { setAudienceInvalid(false); setAudienceFields(emptyCampaignAudience); }}>{label('resetAudience')}</Button></div>}
          <fieldset disabled={busy || audienceInvalid} className="ce-fields"><div className="ce-presets">{([{ key: 'all', values: {} }, { key: 'firstPurchase', values: { purchaseCountMin: 0, purchaseCountMax: 0 } }, { key: 'repeat', values: { purchaseCountMin: 1, purchaseCountMax: 5 } }, { key: 'loyal', values: { purchaseCountMin: 6 } }] as const).map(preset => <Button type="button" variant="outline" key={preset.key} aria-pressed={filterKey === campaignAudienceSelectionKey({ ...preset.values, ...(preset.key !== 'all' && filters?.lastActivityDays !== undefined ? { lastActivityDays: filters.lastActivityDays } : {}) })} onClick={() => setAudienceFields({ ...campaignAudienceFields(preset.values), lastActivityDays: preset.key === 'all' ? '' : audienceFields.lastActivityDays })}>{label(preset.key)}</Button>)}</div>
            <div className="ce-filter-grid">{(['lastActivityDays', 'purchaseCountMin', 'purchaseCountMax'] as const).map((key, index) => <div key={key}><Label htmlFor={index === 0 ? 'ce-audience' : `ce-${key}`}>{label(index === 0 ? 'activity' : index === 1 ? 'minimum' : 'maximum')}</Label><Input id={index === 0 ? 'ce-audience' : `ce-${key}`} type="text" inputMode="numeric" pattern="[0-9]*" value={audienceFields[key]} onChange={event => setAudienceFields(values => ({ ...values, [key]: event.target.value }))} onBlur={() => blur('audience')} aria-invalid={!!fieldError('audience')} aria-describedby="ce-audience-error" /></div>)}</div><p id="ce-audience-error" className="ce-field-error" role={fieldError('audience') ? 'alert' : undefined}>{fieldError('audience')}</p>
          </fieldset><div className="ce-audience-estimate"><h3>{label('previewAudience')}</h3>{audienceDescription}<Button type="button" variant="ghost" disabled={audienceQuery.isFetching || !filters} onClick={() => { void audienceQuery.refetch(); }}>{label('refresh')}</Button></div>
        </section>
        <section className="cd-panel" aria-labelledby="ce-schedule-title"><h2 id="ce-schedule-title">{label('schedule')}</h2><fieldset disabled={busy} className="ce-fields"><div className="ce-mode">{[false, true].map(value => <label key={String(value)}><input type="radio" name="campaign-mode" checked={scheduled === value} onChange={() => setScheduled(value)} />{label(value ? 'scheduleMode' : 'draftMode')}</label>)}</div>
          {scheduled && <div><Label htmlFor="ce-scheduledAt">{label('scheduleTime')}</Label><Input id="ce-scheduledAt" type="datetime-local" step="1" dir="ltr" value={form.scheduledAt} onChange={event => patch('scheduledAt', event.target.value)} onBlur={() => blur('scheduledAt')} aria-invalid={!!fieldError('scheduledAt')} aria-describedby="ce-zone ce-schedule-error" /><p id="ce-zone" className="cw-muted">{seed.timezone ? label('zone', { zone: seed.timezone }) : label('zoneUnavailable')}</p><p id="ce-schedule-error" className="ce-field-error" role={fieldError('scheduledAt') ? 'alert' : undefined}>{fieldError('scheduledAt')}</p></div>}
          <p className={scheduled ? 'cw-notice' : 'cw-muted'}>{label(scheduled ? 'scheduleWarning' : 'draftHint')}</p>
        </fieldset></section>
      </div><aside className="cd-panel ce-preview" aria-labelledby="ce-preview-title"><h2 id="ce-preview-title"><Eye aria-hidden="true" />{label('preview')}</h2><p className="cw-muted">{label('previewHint')}</p>{messagePreview}</aside></div>
      <footer className="ce-footer"><p className="cw-muted">{label(scheduled ? 'scheduleWarning' : 'draftHint')}</p><Button type="submit" disabled={busy || sourcePending || !current || !canManage || stale || uncertain}>{label('review')}</Button></footer>
    </form>
    <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) setDialog(null); }}><DialogContent closeLabel={label('cancel')} className="cw-dialog cd-dialog ce-dialog" dir={rtl ? 'rtl' : 'ltr'} onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus({ preventScroll: true }); }} onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}><DialogHeader><DialogTitle ref={heading} tabIndex={-1}>{label(dialog === 'reload' ? 'reloadTitle' : 'reviewTitle')}</DialogTitle><DialogDescription>{label(dialog === 'reload' ? 'reloadHint' : scheduled ? 'scheduleWarning' : 'draftHint')}</DialogDescription></DialogHeader>
      {dialog === 'review' && <><h3>{form.name}</h3>{messagePreview}<div className="ce-review-summary">{audienceDescription}<p>{label(scheduled ? 'scheduleMode' : 'draftMode')}{scheduled && <>: <bdi>{form.scheduledAt.replace('T', ' ')} · {seed.timezone}</bdi></>}</p><dl>{(['lastActivityDays', 'purchaseCountMin', 'purchaseCountMax'] as const).map((key, index) => audienceFields[key] !== '' && <div key={key}><dt>{label(index === 0 ? 'activity' : index === 1 ? 'minimum' : 'maximum')}</dt><dd>{audienceFields[key]}</dd></div>)}</dl></div>{stale && <p className="cw-error" role="alert">{label('stale')}</p>}{failure && <p className="cw-error" role="alert">{failure}</p>}</>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDialog(null)}>{label('cancel')}</Button><Button disabled={busy || (dialog === 'reload' ? !current || sourcePending : !canSave)} onClick={() => { if (dialog === 'reload') reload(); else void save(); }}>{label(busy ? 'busy' : dialog === 'reload' ? 'reloadConfirm' : scheduled ? 'confirmSchedule' : 'confirmDraft')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
