import { useTranslation } from 'react-i18next';
import { validCheckoutDiscountDisplay,type CheckoutDiscountDisplay } from '../../../shared/checkout-discount';

export function CheckoutDiscountBreakdown({discount,totalMinor,approved,historical=false}:{discount:CheckoutDiscountDisplay;totalMinor:number;approved:boolean;historical?:boolean}) {
  const {t,i18n}=useTranslation();
  if(!validCheckoutDiscountDisplay(discount,totalMinor))return <p role="alert">{t('merchantUx.checkoutDiscount.invalid')}</p>;
  const money=(n:number)=>new Intl.NumberFormat(i18n.language,{style:'currency',currency:'SAR'}).format(n/100);
  return <section data-checkout-discount className="space-y-3 rounded-xl border p-4 text-sm">
    <h4 className="font-semibold">{t('merchantUx.checkoutDiscount.title')}</h4>
    <dl className="space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><dt>{t('merchantUx.checkoutDiscount.subtotal')}</dt><dd>{money(discount.subtotalMinor)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt className="min-w-0 break-all">{t('merchantUx.checkoutDiscount.discount',{code:discount.code})}</dt><dd>−{money(discount.discountMinor)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 font-semibold"><dt>{t('merchantUx.checkoutDiscount.total')}</dt><dd>{money(totalMinor)}</dd></div>
    </dl>
    <p data-discount-state={historical?'historical':approved?'applied':'pending'} className="leading-relaxed text-muted-foreground">{historical?t('merchantUx.checkoutDiscount.historical'):approved?t('merchantUx.checkoutDiscount.applied'):t('merchantUx.checkoutDiscount.pending')}</p>
  </section>;
}
