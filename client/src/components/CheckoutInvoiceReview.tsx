import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

export function CheckoutInvoiceReview({ orderId, totalAmount, onApproved }: {
  orderId: number; totalAmount: number; onApproved: () => void;
}) {
  const { t } = useTranslation();
  const [attested, setAttested] = useState(false);
  const approve = trpc.orders.approveCheckoutInvoice.useMutation({ onSuccess: onApproved });
  return <section className="space-y-3 rounded-xl border border-amber-300 p-4" aria-labelledby={`invoice-review-${orderId}`}>
    <h3 id={`invoice-review-${orderId}`} className="font-semibold">{t('merchantUx.checkoutInvoice.title')}</h3>
    <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.checkoutInvoice.description')}</p>
    {!approve.isSuccess && <>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={attested}
          onChange={event => setAttested(event.target.checked)} disabled={approve.isPending} />
        <span>{t('merchantUx.checkoutInvoice.attestation')}</span>
      </label>
      <Button className="h-auto min-h-11 w-full whitespace-normal" disabled={!attested || approve.isPending}
        onClick={() => approve.mutate({ orderId, expectedAmountMinor: totalAmount, totalIsFinal: true })}>
        {approve.isPending ? t('merchantUx.checkoutInvoice.saving') : t('merchantUx.checkoutInvoice.approve')}
      </Button>
    </>}
    {approve.isError && <p role="alert" className="text-sm text-destructive">{t('merchantUx.checkoutInvoice.failed')}</p>}
    {approve.isSuccess && <div role="status" className="space-y-2 text-sm">
      <p>{t('merchantUx.checkoutInvoice.approved')}</p>
      {approve.data.paymentUrl ? <a className="inline-flex min-h-11 items-center underline" href={approve.data.paymentUrl} target="_blank" rel="noopener noreferrer">
        {t('merchantUx.checkoutInvoice.link')}</a> : <p>{t('merchantUx.checkoutInvoice.noLink')}</p>}
    </div>}
  </section>;
}
