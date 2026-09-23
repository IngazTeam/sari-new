import { z } from 'zod';
import { majorToMinor, requireMinor } from './product-money';

export const checkoutCouponCodeSchema = z.string().regex(new RegExp('^[\\p{L}\\p{N}_-]{1,50}$','u')).transform(s=>s.toUpperCase()).pipe(z.string().max(50));
export type CouponCommand = {kind:'apply';code:string}|{kind:'remove'}|{kind:'none'};
/** A bounded command, never a model-inferred coupon or an incentive for a price objection. */
export function checkoutCouponCommand(message:string):CouponCommand {
  const text=message.normalize('NFKC').trim().replace(/[.!]+$/,'').trim();
  if (/^(?:أزل|ازل|احذف|بدون)\s+(?:الخصم|خصم|الكود|الكوبون)$|^remove\s+(?:the\s+)?(?:coupon|discount)$/i.test(text))return {kind:'remove'};
  const match=text.match(new RegExp('^(?:طبق|طبّق|استخدم|apply|use)\\s+(?:كود|الكود|كوبون|الكوبون|coupon|code|promo code)\\s+([\\p{L}\\p{N}_-]{1,50})$','iu'));
  if(!match)return {kind:'none'};
  const code=checkoutCouponCodeSchema.safeParse(match[1]);return code.success?{kind:'apply',code:code.data}:{kind:'none'};
}

/** Existing coupon amounts/minima are whole major SAR units; percentages are integers. */
export function calculateCheckoutDiscount(subtotalMinor:number,terms:{type:'percentage'|'fixed';value:number;minOrderAmount:number}) {
  requireMinor(subtotalMinor);
  z.object({type:z.enum(['percentage','fixed']),value:z.number().int().positive(),minOrderAmount:z.number().int().nonnegative()}).strict().parse(terms);
  if(terms.type==='percentage'&&terms.value>100)throw Error('Unsupported coupon percentage');
  const minimumMinor=majorToMinor(terms.minOrderAmount);
  if(subtotalMinor<minimumMinor)throw Error('Coupon minimum not met');
  // Round only the percentage discount down to a halala; never round the payable amount down.
  const amountMinor=requireMinor(terms.type==='fixed'?majorToMinor(terms.value):Math.floor(subtotalMinor*terms.value/100));
  const totalMinor=subtotalMinor-amountMinor;
  if(amountMinor<=0||totalMinor<100)throw Error('Discounted payment below supported minimum');
  return {amountMinor,totalMinor,minimumMinor};
}

export type CheckoutDiscount = {couponId:number;code:string;type:'percentage'|'fixed';value:number;minOrderAmount:number;
  amountMinor:number;minimumMinor:number;termsHash:string};

export type CheckoutDiscountDisplay={code:string|null;subtotalMinor:number;discountMinor:number};
export function validCheckoutDiscountDisplay(discount:CheckoutDiscountDisplay,totalMinor:number):boolean {
  try {requireMinor(discount.subtotalMinor);requireMinor(discount.discountMinor);requireMinor(totalMinor);
    return checkoutCouponCodeSchema.safeParse(discount.code).success&&discount.discountMinor>0&&totalMinor>=100&&discount.subtotalMinor-discount.discountMinor===totalMinor;
  } catch{return false;}
}
