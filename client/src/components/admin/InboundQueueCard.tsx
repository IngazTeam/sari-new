import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export function InboundQueueCard() {
  const { t } = useTranslation();
  const health = trpc.inboundOperations.health.useQuery(undefined, { refetchInterval: 30_000 });
  const reviews = trpc.inboundOperations.reviews.useQuery(undefined, { refetchInterval: 30_000 });
  const [selected, setSelected] = useState<{ id: number; merchantId: number } | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'dismissed'>('completed');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const resolve = trpc.inboundOperations.resolve.useMutation({
    onSuccess: () => { setSelected(null); setNote(''); setConfirmed(false); void reviews.refetch(); void health.refetch(); toast.success(t('inboundQueue.saved')); },
    onError: error => toast.error(error.message),
  });
  return <Card>
    <CardHeader><CardTitle>{t('inboundQueue.title')}</CardTitle><CardDescription>{t('inboundQueue.description')}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {(health.error || reviews.error) && <p role="alert">{t('inboundQueue.loadError')}</p>}
      <div className="flex flex-wrap gap-4">
        <p>{t('inboundQueue.pending')}: {health.data ? health.data.find(item => item.status === 'pending')?.count ?? 0 : '—'}</p>
        <p>{t('inboundQueue.running')}: {health.data ? health.data.find(item => item.status === 'running')?.count ?? 0 : '—'}</p>
        <p>{t('inboundQueue.review')}: {health.data ? health.data.find(item => item.status === 'review')?.count ?? 0 : '—'}</p>
      </div>
      {reviews.data?.length === 0 && <p>{t('inboundQueue.empty')}</p>}
      <ul className="space-y-2">
        {reviews.data?.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
          <span>{t('inboundQueue.job', { id: job.id, merchant: job.merchantId })} · {job.errorCode}</span>
          <Button variant="outline" onClick={() => { setSelected({ id: job.id, merchantId: job.merchantId }); setNote(''); setConfirmed(false); }}>{t('inboundQueue.reviewAction')}</Button>
        </li>)}
      </ul>
      {selected && <form className="space-y-3 border rounded p-4" onSubmit={event => {
        event.preventDefault(); if (confirmed) resolve.mutate({ ...selected, outcome, note, confirmed: true });
      }}>
        <p>{t('inboundQueue.job', { id: selected.id, merchant: selected.merchantId })}</p>
        <Label htmlFor="inbound-outcome">{t('inboundQueue.outcome')}</Label>
        <select id="inbound-outcome" className="block rounded border p-2" value={outcome} onChange={event => { setOutcome(event.target.value as typeof outcome); setConfirmed(false); }}>
          <option value="completed">{t('inboundQueue.completed')}</option>
          <option value="dismissed">{t('inboundQueue.dismissed')}</option>
        </select>
        <Label htmlFor="inbound-note">{t('inboundQueue.note')}</Label>
        <Textarea id="inbound-note" value={note} minLength={20} maxLength={1000} required onChange={event => { setNote(event.target.value); setConfirmed(false); }} />
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t('inboundQueue.confirm')}</label>
        <Button type="submit" disabled={!confirmed || note.trim().length < 20 || resolve.isPending}>{t('inboundQueue.save')}</Button>
      </form>}
    </CardContent>
  </Card>;
}
