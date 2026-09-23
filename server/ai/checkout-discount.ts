import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { databaseTimeEpoch } from '../db/time';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { calculateCheckoutDiscount, checkoutCouponCodeSchema, type CheckoutDiscount } from '../../shared/checkout-discount';

const phone=(s:unknown)=>typeof s==='string'&&/^[+\d][\d ()-]*(?:@c\.us)?$/.test(s)?normalizeCampaignPhone(s)||null:null;
/** Products/quotation/order are locked first. Read the clock after obtaining the coupon lock. */
export async function readCheckoutDiscount(connection:PoolConnection,input:{merchantId:number;customerPhone:string;code:string;subtotalMinor:number}):Promise<CheckoutDiscount> {
  const code=checkoutCouponCodeSchema.parse(input.code),customer=phone(input.customerPhone);
  if(!customer)throw Error('Coupon customer unavailable');
  const [rows]=await connection.execute<any[]>('SELECT * FROM discount_codes WHERE merchantId=? AND code=? FOR UPDATE',[input.merchantId,code]);
  if(rows.length!==1)throw Error('Coupon unavailable');const row=rows[0];
  if(checkoutCouponCodeSchema.parse(row.code)!==code)throw Error('Coupon code mismatch');
  const [clock]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const now=databaseTimeEpoch(clock[0].now),expiresAt=row.expiresAt==null?null:databaseTimeEpoch(row.expiresAt);
  const assigned=row.customer_phone!=null&&row.customer_phone!==''?phone(row.customer_phone):null;
  if(row.isActive!==1||!Number.isFinite(now)||(expiresAt!==null&&(!Number.isFinite(expiresAt)||expiresAt<=now))
    ||(row.customer_phone!=null&&row.customer_phone!==''&&assigned!==customer))throw Error('Coupon unavailable');
  z.number().int().nonnegative().max(2147483646).parse(row.usedCount);
  if(row.maxUses!=null&&(!z.number().int().positive().safeParse(row.maxUses).success||row.usedCount>=row.maxUses))throw Error('Coupon exhausted');
  const terms={type:row.type,value:row.value,minOrderAmount:row.minOrderAmount??0};
  const calculated=calculateCheckoutDiscount(input.subtotalMinor,terms);
  const canonical={couponId:row.id,merchantId:input.merchantId,code:checkoutCouponCodeSchema.parse(row.code),...terms,
    customerPhone:assigned,maxUses:row.maxUses,expiresAt:expiresAt===null?null:new Date(expiresAt).toISOString()};
  return {couponId:row.id,code:canonical.code,...terms,amountMinor:calculated.amountMinor,minimumMinor:calculated.minimumMinor,
    termsHash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};
}

export function sameCheckoutDiscount(a:CheckoutDiscount,b:CheckoutDiscount) {
  return a.couponId===b.couponId&&a.code===b.code&&a.type===b.type&&a.value===b.value&&a.minOrderAmount===b.minOrderAmount
    &&a.amountMinor===b.amountMinor&&a.minimumMinor===b.minimumMinor&&a.termsHash===b.termsHash;
}

export async function consumeCheckoutDiscount(connection:PoolConnection,input:{merchantId:number;orderId:number;quotationId:number;actorUserId:number;
  customerPhone:string;subtotalMinor:number;totalMinor:number;discount:CheckoutDiscount}) {
  const fresh=await readCheckoutDiscount(connection,{...input,code:input.discount.code});
  if(!sameCheckoutDiscount(fresh,input.discount)||input.subtotalMinor-fresh.amountMinor!==input.totalMinor)throw Error('Coupon terms changed');
  const [updated]=await connection.execute<any>(`UPDATE discount_codes SET usedCount=usedCount+1 WHERE id=? AND merchantId=? AND isActive=1
    AND usedCount<2147483647 AND (maxUses IS NULL OR usedCount<maxUses) AND (expiresAt IS NULL OR expiresAt>UTC_TIMESTAMP(3))`,[fresh.couponId,input.merchantId]);
  if(updated.affectedRows!==1)throw Error('Coupon no longer available');
  await connection.execute(`INSERT INTO checkout_discount_redemptions (merchant_id,order_id,quotation_id,coupon_id,actor_user_id,discount_code,subtotal_minor,discount_minor,total_minor,terms)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,[input.merchantId,input.orderId,input.quotationId,fresh.couponId,input.actorUserId,fresh.code,input.subtotalMinor,fresh.amountMinor,input.totalMinor,JSON.stringify(fresh)]);
  return fresh;
}
