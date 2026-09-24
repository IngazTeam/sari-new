import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { bookingPaymentLinkRenewalSchema } from '../../../shared/booking-payment-link-renewal';

function RenewalForm({ bookingId, evidence, busy, onBusy, onRenewed }: {
  bookingId: number; evidence: string; busy: boolean; onBusy: (busy: boolean) => void; onRenewed: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false), [outcome, setOutcome] = useState<'saved' | 'error' | null>(null);
  const [submitted, setSubmitted] = useState(false); const submittedRef = useRef(false);
  const mutation = trpc.bookings.renewPaymentLink.useMutation();
  const valid = bookingPaymentLinkRenewalSchema.safeParse({ bookingId, evidence, reason, reviewed });
  const disabled = busy || submitted || mutation.isPending;
  return <div data-booking-link-renewal-form className="space-y-3 border-t pt-3">
    <label className="block space-y-2" htmlFor={`booking-renewal-reason-${bookingId}`}>
      <span>{t('merchantUx.bookingRenewal.reason')}</span>
      <textarea id={`booking-renewal-reason-${bookingId}`} rows={3} maxLength={500} className="min-h-24 w-full min-w-0 rounded-md border bg-background p-3"
        value={reason} disabled={disabled} onChange={event => { setReason(event.target.value); setReviewed(false); }} />
    </label>
    <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2">
      <input type="checkbox" className="mt-1 size-5 shrink-0" checked={reviewed} disabled={disabled} onChange={event => setReviewed(event.target.checked)} />
      <span className="leading-relaxed">{t('merchantUx.bookingRenewal.attest')}</span>
    </label>
    <Button type="button" data-booking-link-renew className="min-h-11 max-w-full whitespace-normal" disabled={disabled || !valid.success}
      onClick={async () => {
        if (disabled || submittedRef.current || !valid.success) return;
        submittedRef.current = true; setSubmitted(true); setOutcome(null); onBusy(true);
        try { await mutation.mutateAsync(valid.data); setOutcome('saved'); }
        catch { setOutcome('error'); }
        finally { setReviewed(false); try { await onRenewed(); } catch { setOutcome('error'); } onBusy(false); }
      }}>{t(mutation.isPending ? 'merchantUx.bookingRenewal.saving' : 'merchantUx.bookingRenewal.renew')}</Button>
    {outcome && <p role={outcome === 'saved' ? 'status' : 'alert'} className="leading-relaxed">{t(outcome === 'saved' ? 'merchantUx.bookingRenewal.saved' : 'merchantUx.bookingRenewal.failed')}</p>}
  </div>;
}

export function BookingPaymentLinkRenewal({ bookingId, onRenewed }: { bookingId: number; onRenewed?: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false), [refreshError, setRefreshError] = useState(false), [version, setVersion] = useState(0);
  const query = trpc.bookings.getPaymentLinkRenewal.useQuery({ bookingId }, { refetchOnWindowFocus: false });
  const refresh = async () => {
    setRefreshError(false);
    try { const result = await query.refetch(); if (result.isError) throw Error('Evidence refresh failed'); await onRenewed?.(); }
    catch (error) { setRefreshError(true); throw error; }
  };
  if (query.isLoading) return <p role="status">{t('merchantUx.bookingRenewal.loading')}</p>;
  if (query.isError) return <div role="alert"><p>{t('merchantUx.bookingRenewal.failed')}</p><Button type="button" className="min-h-11" onClick={() => query.refetch()}>{t('merchantUx.bookingRenewal.refresh')}</Button></div>;
  const data = query.data; if (!data) return null;
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const blockers = { booking: t('merchantUx.bookingRenewal.booking'), legacy: t('merchantUx.bookingRenewal.legacy'),
    identity: t('merchantUx.bookingRenewal.identity'), link: t('merchantUx.bookingRenewal.link'), payment: t('merchantUx.bookingRenewal.payment') };
  return <section data-booking-link-renewal className="min-w-0 space-y-3 rounded-xl border p-4 text-sm" aria-labelledby={`booking-renewal-${bookingId}`}>
    <h3 id={`booking-renewal-${bookingId}`} className="font-semibold">{t('merchantUx.bookingRenewal.title')}</h3>
    <p className="leading-relaxed text-muted-foreground">{t('merchantUx.bookingRenewal.scope')}</p>
    {data.expiresAt && <p>{t('merchantUx.bookingRenewal.expiry')} <time dateTime={data.expiresAt}>{date(data.expiresAt)}</time></p>}
    {refreshError && <p role="alert">{t('merchantUx.bookingRenewal.failed')}</p>}
    {data.blocker && <p className="leading-relaxed">{blockers[data.blocker]}</p>}
    {data.audit && <div data-booking-link-renewal-audit className="space-y-2 rounded-lg border p-3" role="status">
      <p className="font-semibold">{t('merchantUx.bookingRenewal.audit')}</p>
      <p>{t('merchantUx.bookingRenewal.actor', { id: data.audit.actorUserId })}</p>
      <time dateTime={data.audit.at}>{date(data.audit.at)}</time>
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{data.audit.reason}</p>
      <p>{t('merchantUx.bookingRenewal.before')} {date(data.audit.priorExpiresAt)}</p>
      <p>{t('merchantUx.bookingRenewal.after')} {date(data.audit.renewedExpiresAt)}</p>
    </div>}
    {data.state === 'eligible' && !refreshError && <RenewalForm key={`${bookingId}-${data.evidence}-${version}`} bookingId={bookingId} evidence={data.evidence}
      busy={busy || query.isFetching} onBusy={setBusy} onRenewed={refresh} />}
    <Button type="button" data-booking-link-renewal-refresh className="min-h-11" disabled={busy || query.isFetching} onClick={async () => {
      try { await refresh(); setVersion(value => value + 1); } catch { /* The alert keeps renewal unavailable until a fresh read succeeds. */ }
    }}>{t('merchantUx.bookingRenewal.refresh')}</Button>
  </section>;
}
