import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import type { listEscalationRelays } from '../../../server/ai/escalation-reconciliation';
type Item = Awaited<ReturnType<typeof listEscalationRelays>>['items'][number];

function RelayReview({ item, conversationId, canManage, refreshing, onSaved }: {
  item: Item; conversationId: number; canManage: boolean; refreshing: boolean; onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [reviewed,setReviewed] = useState(false), [note,setNote] = useState('');
  const mutation = trpc.conversations.reviewEscalationRelay.useMutation({ onSuccess: () => { setReviewed(false); onSaved(); } });
  useEffect(() => { setReviewed(false); mutation.reset(); }, [item.evidence,item.revision]);
  const states = { missing: t('merchantUx.relay.missing'), invalid: t('merchantUx.relay.invalid'), pending: t('merchantUx.relay.pending'),
    failed: t('merchantUx.relay.deliveryFailed'), accepted: t('merchantUx.relay.accepted'), delivered: t('merchantUx.relay.delivered'), read: t('merchantUx.relay.read') };
  const outcomes = { accepted: t('merchantUx.relay.recorded'), failed: t('merchantUx.relay.failedOutcome'), unresolved: t('merchantUx.relay.unresolved') };
  return <article data-relay-id={item.id} className="min-w-0 space-y-3 rounded-md border bg-background p-3 text-sm">
    <h4 className="font-semibold">{t('merchantUx.relay.attempt', { id: item.id })}</h4>
    <p className="font-medium" data-relay-state={item.state}>{states[item.state]}</p>
    <p className="text-muted-foreground">{t('merchantUx.relay.by', { phone: item.authorPhone.slice(-4) })} · <time dateTime={item.createdAt}>
      {new Intl.DateTimeFormat(i18n.language,{ dateStyle: 'medium',timeStyle: 'short' }).format(new Date(item.createdAt))}</time></p>
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center">{t('merchantUx.relay.evidence')}</summary>
      <div tabIndex={0} className="max-h-64 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3 [overflow-wrap:anywhere]">
        <p className="font-medium">{t('merchantUx.relay.question', { id: item.sourceMessageId })}</p><p className="whitespace-pre-wrap">{item.question}</p>
        <p className="font-medium">{t('merchantUx.relay.reply')}</p><p className="whitespace-pre-wrap">{item.reply}</p>
      </div>
    </details>
    {item.lastReview && <div data-relay-review className="space-y-1 border-s-2 ps-3 [overflow-wrap:anywhere]">
      <p>{t('merchantUx.relay.lastReview',{ id: item.lastReview.actorUserId })} · <time dateTime={item.lastReview.at}>
        {new Intl.DateTimeFormat(i18n.language,{ dateStyle: 'medium',timeStyle: 'short' }).format(new Date(item.lastReview.at))}</time></p>
      <p>{outcomes[item.lastReview.outcome]}</p><p className="whitespace-pre-wrap">{item.lastReview.note}</p>
    </div>}
    {canManage ? <div className="space-y-3">
      <label htmlFor={`relay-note-${item.id}`} className="block space-y-2"><span>{t('merchantUx.relay.note')}</span>
        <textarea id={`relay-note-${item.id}`} value={note} maxLength={1000} rows={3} disabled={mutation.isPending}
          onChange={event => { setNote(event.target.value); setReviewed(false); mutation.reset(); }} className="min-h-24 w-full rounded-md border bg-background p-3" />
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
        <input type="checkbox" checked={reviewed} disabled={mutation.isPending || refreshing} className="mt-1 h-5 w-5 shrink-0"
          onChange={event => setReviewed(event.target.checked)} /><span>{t('merchantUx.relay.attestation')}</span>
      </label>
      <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!reviewed || note.trim().length < 3 || refreshing || mutation.isPending}
        onClick={() => mutation.mutate({ conversationId, relayId: item.id, expectedRevision: item.revision, evidence: item.evidence, reviewed: true, note: note.trim() })}>
        {mutation.isPending ? t('merchantUx.relay.saving') : t('merchantUx.relay.review')}</Button>
      {mutation.isError && <div role="alert"><p>{t('merchantUx.relay.saveFailed')}</p>
        <Button className="mt-2 min-h-11" variant="outline" onClick={() => { setReviewed(false); mutation.reset(); onSaved(); }}>{t('merchantUx.relay.refresh')}</Button></div>}
      {mutation.isSuccess && <p role="status">{outcomes[mutation.data.outcome]}</p>}
    </div> : <p>{t('merchantUx.relay.readOnly')}</p>}
  </article>;
}

export function EscalationReconciliation({ conversationId }: { conversationId: number }) {
  const { t } = useTranslation(); const [beforeId,setBeforeId] = useState<number>();
  useEffect(() => setBeforeId(undefined),[conversationId]);
  const query = trpc.conversations.listEscalationRelays.useQuery({ conversationId,beforeId },{ refetchInterval: 15000 });
  return <section aria-label={t('merchantUx.relay.title')} className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4">
    <h3 className="font-semibold">{t('merchantUx.relay.title')}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.relay.scope')}</p>
    {query.isLoading ? <p role="status">{t('merchantUx.relay.loading')}</p> : query.isError ? <div role="alert">
      <p>{t('merchantUx.relay.loadFailed')}</p><Button className="mt-2 min-h-11" onClick={() => query.refetch()}>{t('merchantUx.relay.refresh')}</Button></div>
      : query.data && <>
        {query.data.items.length === 0 ? <p>{t('merchantUx.relay.empty')}</p> : <div className="max-h-[36rem] space-y-3 overflow-y-auto">
          {query.data.items.map(item => <RelayReview key={`${conversationId}:${item.id}`} item={item} conversationId={conversationId}
            canManage={query.data.canManage} refreshing={query.isFetching} onSaved={() => { void query.refetch(); }} />)}</div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={() => { setBeforeId(undefined); void query.refetch(); }}>{t('merchantUx.relay.refresh')}</Button>
          {query.data.nextCursor && <Button variant="outline" className="min-h-11" onClick={() => setBeforeId(query.data!.nextCursor!)}>{t('merchantUx.relay.older')}</Button>}
        </div>
      </>}
  </section>;
}
