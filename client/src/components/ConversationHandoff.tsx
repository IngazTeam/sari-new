import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ConversationHandoff({ conversationId }: { conversationId: number }) {
  const { t, i18n } = useTranslation();
  const query = trpc.conversations.getHandoff.useQuery({ conversationId }, { refetchInterval: 10000 });
  const [reviewed, setReviewed] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const sourceTrigger = useRef<HTMLAnchorElement | null>(null);
  const source = trpc.conversations.getHandoffSource.useQuery({ conversationId, messageId: sourceId ?? 1 },
    { enabled: sourceId !== null, staleTime: 0, gcTime: 0 });
  const lastMessageId = query.data?.lastMessageId;
  useEffect(() => setReviewed(false), [conversationId, query.data?.version, lastMessageId]);
  const mutation = trpc.conversations.setOwnership.useMutation({ onSuccess: async () => { setReviewed(false); await query.refetch(); } });
  const data = query.data;
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
    onClick={event => { event.preventDefault(); sourceTrigger.current = event.currentTarget; setSourceId(id); }}>{t('merchantUx.handoff.source', { id })}</a>;
  return <section className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4" aria-label={t('merchantUx.handoff.title')}>
    <h3 className="font-semibold">{t('merchantUx.handoff.title')}</h3>
    {query.isLoading ? <p role="status">{t('merchantUx.handoff.loading')}</p> : query.isError ? <div role="alert">
      <p>{t('merchantUx.handoff.loadFailed')}</p><Button className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.handoff.refresh')}</Button>
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
              <p className="font-medium">{roles[message.role] || roles.unknown}</p><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
              {sourceLink(message.id)}
            </div>)}</div>
          <p className="rounded-md bg-muted p-3 leading-relaxed">{t('merchantUx.handoff.nextStep')}</p>
        </div>
      </details>
      {data.canManage ? <div className="space-y-3">
        {data.humanOwned && <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={reviewed} disabled={mutation.isPending} onChange={e => setReviewed(e.target.checked)} />
          {t('merchantUx.handoff.reviewed')}</label>}
        <Button className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={mutation.isPending || (data.humanOwned && !reviewed)}
          onClick={() => mutation.mutate({ conversationId, expectedVersion: data.version, expectedLastMessageId: data.lastMessageId,
            reviewed, action: data.humanOwned ? 'resume' : 'takeover' })}>
          {mutation.isPending ? t('merchantUx.handoff.saving') : data.humanOwned ? t('merchantUx.handoff.resume') : t('merchantUx.handoff.takeover')}
        </Button>
      </div> : <p className="text-sm">{t('merchantUx.handoff.readOnly')}</p>}
      {mutation.isError && <div role="alert"><p>{t('merchantUx.handoff.failed')}</p><Button className="mt-2 min-h-11" variant="outline" onClick={() => { mutation.reset(); void query.refetch(); }}>{t('merchantUx.handoff.refresh')}</Button></div>}
      {mutation.isSuccess && <p role="status" className="text-sm">{t('merchantUx.handoff.saved')}</p>}
    </>}
    <Dialog open={sourceId !== null} onOpenChange={open => { if (!open) setSourceId(null); }}>
      <DialogContent className="max-h-[90vh] min-w-0 overflow-y-auto" dir={i18n.dir()} showCloseButton={false}
        onCloseAutoFocus={event => { event.preventDefault(); sourceTrigger.current?.focus(); }}>
        <DialogHeader className="text-start sm:text-start"><DialogTitle>{t('merchantUx.handoff.sourceTitle', { id: sourceId })}</DialogTitle>
          <DialogDescription>{t('merchantUx.handoff.sourceScope')}</DialogDescription></DialogHeader>
        {source.isFetching ? <p role="status">{t('merchantUx.handoff.sourceLoading')}</p> : source.isError ? <div role="alert">
          <p>{t('merchantUx.handoff.sourceUnavailable')}</p><Button className="mt-2 min-h-11" onClick={() => source.refetch()}>{t('merchantUx.handoff.sourceRetry')}</Button>
        </div> : source.data && <div data-handoff-source={source.data.id} className="min-w-0 space-y-3">
          <p className="font-medium">{roles[source.data.role] || roles.unknown}</p>
          <time className="text-sm text-muted-foreground" dateTime={source.data.at}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(source.data.at))}</time>
          <p tabIndex={0} className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{source.data.text}</p>
        </div>}
        <DialogClose asChild><Button variant="outline" className="min-h-11">{t('common.close')}</Button></DialogClose>
      </DialogContent>
    </Dialog>
  </section>;
}
