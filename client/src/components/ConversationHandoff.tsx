import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { handoffSnapshot, handoffSourceSnapshot, handoffOwnershipResult } from '@shared/conversation-handoff';

type HandoffScope = { conversationId: number; merchantId: number; actorUserId: number };
export function ConversationHandoff(props: HandoffScope) {
  return <ScopedHandoff key={`${props.actorUserId}:${props.merchantId}:${props.conversationId}`} {...props}/>;
}
function ScopedHandoff({ conversationId, merchantId, actorUserId }: HandoffScope) {
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState(false);
  const query = trpc.conversations.handoffSnapshot.useQuery({ conversationId }, { retry: false, staleTime: 0, refetchOnMount: 'always', refetchInterval: saving ? false : 10000 });
  const parsed = handoffSnapshot.safeParse(query.data);
  const matches = parsed.success && parsed.data.merchantId === merchantId && parsed.data.actorUserId === actorUserId && parsed.data.summary.conversationId === conversationId;
  const valid = matches && query.isFetchedAfterMount && !query.isError;
  const data = valid && parsed.success ? parsed.data.summary : null;
  const canManage = valid && parsed.success && parsed.data.canManage;
  const basis = data ? JSON.stringify({ data, canManage }) : null;
  const [reviewBasis, setReviewBasis] = useState<string | null>(null);
  const reviewed = basis !== null && reviewBasis === basis;
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null), [blocked, setBlocked] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceTrigger = useRef<HTMLAnchorElement | null>(null);
  const live = useRef(true), busy = useRef(false), latestBasis = useRef(basis);
  latestBasis.current = basis;
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const mutation = trpc.conversations.setOwnership.useMutation({ retry: false });
  const utils = trpc.useUtils();
  const refresh = async () => {
    if (busy.current) return;
    setReviewBasis(null); setNotice(null);
    const response = await query.refetch();
    if (!live.current) return;
    const checked = handoffSnapshot.safeParse(response.data);
    if (!response.isError && checked.success && checked.data.merchantId === merchantId && checked.data.actorUserId === actorUserId && checked.data.summary.conversationId === conversationId) setBlocked(false);
  };
  const save = async () => {
    if (busy.current || blocked || !data || !canManage || query.isFetching || (data.humanOwned && !reviewed)) return;
    busy.current = true; setSaving(true); setNotice(null);
    const expectedBasis = basis;
    try {
      const result = handoffOwnershipResult.parse(await mutation.mutateAsync({ conversationId, expectedVersion: data.version,
        expectedLastMessageId: data.lastMessageId, reviewed, action: data.humanOwned ? 'resume' : 'takeover' }));
      if (!live.current || latestBasis.current !== expectedBasis) return;
      if (result.merchantId !== merchantId || result.version !== data.version + (result.changed ? 1 : 0)) throw Error('Ownership result mismatch');
      setReviewBasis(null); setNotice('saved'); setBlocked(true);
      void utils.conversations.getHandoff.invalidate({ conversationId });
      const response = await query.refetch();
      if (!live.current) return;
      const checked = handoffSnapshot.safeParse(response.data);
      if (!response.isError && checked.success && checked.data.merchantId === merchantId && checked.data.actorUserId === actorUserId && checked.data.summary.conversationId === conversationId && checked.data.summary.version >= result.version) setBlocked(false);
    } catch { if (live.current && latestBasis.current === expectedBasis) { setReviewBasis(null); setNotice('failed'); setBlocked(true); } }
    finally { busy.current = false; if (live.current) setSaving(false); }
  };
  const roles: Record<string, string> = { customer: t('merchantUx.handoff.customer'), merchant: t('merchantUx.handoff.employee'),
    assistant: t('merchantUx.handoff.assistant'), unknown: t('merchantUx.handoff.unknown') };
  const fields: Record<string, string> = { budget: t('merchantUx.handoff.budget'), interestTags: t('merchantUx.handoff.needs'),
    painPoints: t('merchantUx.handoff.needs'), lastObjection: t('merchantUx.handoff.objection') };
  const objections: Record<string, string> = { price: t('merchantUx.handoff.objectionPrice'), delivery: t('merchantUx.handoff.objectionDelivery'),
    quality: t('merchantUx.handoff.objectionQuality'), trust: t('merchantUx.handoff.objectionTrust') };
  const valueText = (field: string, value: any) => field === 'budget' && value && typeof value.amountMinor === 'number'
    ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: value.currency }).format(value.amountMinor / 100)
    : field === 'lastObjection' ? objections[String(value)] || t('merchantUx.handoff.noFacts')
    : Array.isArray(value) ? value.join('، ') : String(value ?? '');
  const sourceLink = (id: number) => <a className="inline-flex min-h-11 items-center text-primary underline" href={`#conversation-message-${id}`}
    onClick={event => { event.preventDefault(); sourceTrigger.current = event.currentTarget; setSourceId(id); setSourceOpen(true); }}>{t('merchantUx.handoff.source', { id })}</a>;
  return <section className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4" aria-label={t('merchantUx.handoff.title')}>
    <h3 className="font-semibold">{t('merchantUx.handoff.title')}</h3>
    {query.isLoading || (!query.isFetchedAfterMount && query.isFetching) ? <p role="status">{t('merchantUx.handoff.loading')}</p> : !data ? <div role="alert">
      <p>{t('merchantUx.handoff.loadFailed')}</p><Button data-handoff-refresh className="mt-2 min-h-11" onClick={() => void refresh()}>{t('merchantUx.handoff.refresh')}</Button>
    </div> : data && <>
      <p className="text-sm font-medium" data-handoff-owner={data.humanOwned ? 'human' : 'bot'}>{data.humanOwned ? t('merchantUx.handoff.humanOwner') : t('merchantUx.handoff.botOwner')}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.handoff.scope')}</p>
      <details className="min-w-0 rounded-md border bg-background px-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">{t('merchantUx.handoff.evidence')}</summary>
        <div className="max-h-96 space-y-4 overflow-y-auto pb-3 text-sm" tabIndex={0} aria-label={t('merchantUx.handoff.evidence')}>
          <div><h4 className="font-semibold">{t('merchantUx.handoff.needs')}</h4>
            {data.facts.filter(f => fields[f.field]).length === 0 ? <p>{t('merchantUx.handoff.noFacts')}</p> : data.facts.filter(f => fields[f.field]).map(f =>
              <div key={f.field} className="mt-2 break-words"><p>{fields[f.field]}: {valueText(f.field, f.value)}</p>
                <p className="text-muted-foreground">{f.kind === 'explicit' ? t('merchantUx.handoff.explicit') : t('merchantUx.handoff.inferred')}</p>
                {sourceLink(f.sourceMessageId)}</div>)}</div>
          <div><h4 className="font-semibold">{t('merchantUx.handoff.offers')}</h4>
            {data.offers.length === 0 ? <p>{t('merchantUx.handoff.noOffers')}</p> : data.offers.map(offer => <div key={offer.id} className="mt-2 rounded-md border p-3">
              <p className="break-words">{offer.number}</p><p>{offer.orderId ? t('merchantUx.handoff.order', { id: offer.orderId }) : offer.current ? t('merchantUx.handoff.currentOffer') : t('merchantUx.handoff.reviewOffer')}</p>
              <p className="break-words">{offer.items.map(item => `${item.name} × ${item.quantity}`).join('، ')}</p>
              {sourceLink(offer.sourceMessageId)}
            </div>)}</div>
          <div><h4 className="font-semibold">{t('merchantUx.handoff.recent')}</h4>
            {data.messages.length === 0 ? <p>{t('merchantUx.handoff.noMessages')}</p> : data.messages.map(message => <div key={message.id} className="mt-3 border-s-2 ps-3">
              <p className="font-medium">{roles[message.role ?? 'unknown'] || roles.unknown}</p><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
              {sourceLink(message.id)}
            </div>)}</div>
          <p className="rounded-md bg-muted p-3 leading-relaxed">{t('merchantUx.handoff.nextStep')}</p>
        </div>
      </details>
      {query.isFetching && <p role="status" className="text-sm">{t('merchantUx.handoff.loading')}</p>}
      {canManage ? <div className="space-y-3">
        {data.humanOwned && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input data-handoff-reviewed type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed} disabled={saving || query.isFetching || blocked} onChange={e => setReviewBasis(e.target.checked ? basis : null)} />
          {t('merchantUx.handoff.reviewed')}</label>}
        <Button data-handoff-save className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={saving || blocked || query.isFetching || (data.humanOwned && !reviewed)}
          onClick={() => void save()}>
          {saving ? t('merchantUx.handoff.saving') : data.humanOwned ? t('merchantUx.handoff.resume') : t('merchantUx.handoff.takeover')}
        </Button>
      </div> : <p className="text-sm">{t('merchantUx.handoff.readOnly')}</p>}
      {notice === 'failed' && <p role="alert">{t('merchantUx.handoff.failed')}</p>}
      {notice === 'saved' && <p role="status" className="text-sm">{t('merchantUx.handoff.saved')}</p>}
      <Button data-handoff-refresh type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={saving || query.isFetching} onClick={() => void refresh()}>{t('merchantUx.handoff.refresh')}</Button>
    </>}
    <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
      <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto" dir={i18n.dir()} showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); sourceTrigger.current?.focus(); }}>
        <DialogHeader className="text-start sm:text-start"><DialogTitle>{t('merchantUx.handoff.sourceTitle', { id: sourceId })}</DialogTitle>
          <DialogDescription>{t('merchantUx.handoff.sourceScope')}</DialogDescription></DialogHeader>
        {sourceId !== null && <HandoffSource key={sourceId} conversationId={conversationId} merchantId={merchantId} actorUserId={actorUserId} messageId={sourceId}/>}
        <DialogClose asChild><Button variant="outline" className="min-h-11">{t('common.close')}</Button></DialogClose>
      </DialogContent>
    </Dialog>
  </section>;
}

function HandoffSource({ conversationId, merchantId, actorUserId, messageId }: HandoffScope & { messageId: number }) {
  const { t, i18n } = useTranslation();
  const source = trpc.conversations.handoffSourceSnapshot.useQuery({ conversationId, messageId }, { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' });
  const parsed = handoffSourceSnapshot.safeParse(source.data);
  const matches = parsed.success && parsed.data.merchantId === merchantId && parsed.data.actorUserId === actorUserId && parsed.data.conversationId === conversationId && parsed.data.message.id === messageId;
  const data = matches && parsed.success && source.isFetchedAfterMount && !source.isError && !source.isFetching ? parsed.data.message : null;
  if (source.isLoading || source.isFetching) return <p role="status">{t('merchantUx.handoff.sourceLoading')}</p>;
  if (!data) return <div role="alert"><p>{t('merchantUx.handoff.sourceUnavailable')}</p><Button data-handoff-source-retry className="mt-2 min-h-11" onClick={() => void source.refetch()}>{t('merchantUx.handoff.sourceRetry')}</Button></div>;
  const roles: Record<string, string> = { customer: t('merchantUx.handoff.customer'), merchant: t('merchantUx.handoff.employee'), assistant: t('merchantUx.handoff.assistant'), unknown: t('merchantUx.handoff.unknown') };
  return <div data-handoff-source={data.id} className="min-w-0 space-y-3">
    <p className="font-medium">{roles[data.role ?? 'unknown'] || roles.unknown}</p>
    <time className="text-sm text-muted-foreground" dateTime={data.at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(data.at))}</time>
    <p tabIndex={0} className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{data.text}</p>
  </div>;
}
