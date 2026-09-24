import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { checkoutDiscountReleaseSchema,type CheckoutDiscountReleaseInput,type DiscountReleaseBlocker } from '../../shared/checkout-discount-release';
import { validCheckoutDiscountDisplay } from '../../shared/checkout-discount';
import { readPaymentLinkId } from '../payment/payment-link-policy';

const unavailable=()=>new Error('Coupon release requires current verified evidence');
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const positive=(value:unknown)=>z.number().int().positive().safe().parse(value);
async function assertSchema() {
  await assertRuntimeSchema('checkout discount release',[
    {table:'orders',columns:['checkout_discount_released']},
    {table:'checkout_discount_redemptions',columns:['release_policy_version'],uniqueIndexes:[{name:'uq_checkout_discount_order',columns:['order_id']}]},
    {table:'checkout_discount_releases',columns:['actor_user_id','used_before','used_after','evidence_hash'],uniqueIndexes:[
      {name:'uq_checkout_discount_release_order',columns:['order_id']},{name:'uq_checkout_discount_release_redemption',columns:['redemption_id']}]},
    {table:'order_checkout_attempts',columns:['payment_id','amount_minor','currency','state']},
    {table:'order_payments',columns:['last_webhook_status','last_webhook_at']},
  ],{cacheSuccess:false});
}
async function transaction<T>(run:(connection:PoolConnection)=>Promise<T>) {
  const pool=await getPool();if(!pool)throw unavailable();const connection=await pool.getConnection();let reusable=true,committing=false;
  try {await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await connection.beginTransaction();
    const result=await run(connection);committing=true;await connection.commit();return result;
  }catch(error){if(committing)reusable=false;else try{await connection.rollback();}catch{reusable=false;}throw error;
  }finally{if(reusable)connection.release();else connection.destroy();}
}

function terminal(payment:any) {
  return Number.isFinite(databaseTimeEpoch(payment.last_webhook_at)) && payment.last_webhook_at!=null && payment.captured_at==null && payment.refunded_at==null
    && (payment.status==='failed' && ['FAILED','DECLINED','RESTRICTED'].includes(payment.last_webhook_status)
      || payment.status==='cancelled' && ['CANCELLED','ABANDONED','VOID'].includes(payment.last_webhook_status));
}

/** Order-first locking serializes checkout, settlement and release. Never locks another order after the coupon. */
async function graph(connection:PoolConnection,merchantId:number,orderId:number) {
  const [orders]=await connection.execute<any[]>('SELECT * FROM orders WHERE id=? AND merchantId=? FOR UPDATE',[orderId,merchantId]);
  const order=orders[0];if(!order)throw unavailable();
  const [redemptions]=await connection.execute<any[]>('SELECT * FROM checkout_discount_redemptions WHERE order_id=? FOR UPDATE',[orderId]);
  if(!redemptions.length)return null;const redemption=redemptions[0];
  if(redemptions.length!==1||redemption.merchant_id!==merchantId)throw unavailable();
  const [releases]=await connection.execute<any[]>('SELECT * FROM checkout_discount_releases WHERE order_id=? OR redemption_id=? FOR UPDATE',[orderId,redemption.id]);
  const release=releases[0];
  if(release && (releases.length!==1||release.merchant_id!==merchantId||release.order_id!==orderId||release.redemption_id!==redemption.id
    ||release.coupon_id!==redemption.coupon_id||order.checkout_discount_released!==1))throw unavailable();
  const [links]=await connection.execute<any[]>('SELECT * FROM payment_links WHERE order_id=? ORDER BY id FOR UPDATE',[orderId]);
  const [attempts]=await connection.execute<any[]>('SELECT * FROM order_checkout_attempts WHERE order_id=? ORDER BY id FOR UPDATE',[orderId]);
  const [payments]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE order_id=? ORDER BY id FOR UPDATE',[orderId]);
  const [coupons]=await connection.execute<any[]>('SELECT * FROM discount_codes WHERE id=? FOR UPDATE',[redemption.coupon_id]);
  const coupon=coupons[0]??null;
  // The coupon row serializes all use/release changes. This non-locking READ COMMITTED aggregate
  // includes committed other-order releases without acquiring their order/redemption locks in reverse.
  const [counts]=await connection.execute<any[]>(`SELECT COUNT(*) AS outstanding FROM checkout_discount_redemptions r
    LEFT JOIN checkout_discount_releases x ON x.redemption_id=r.id WHERE r.coupon_id=? AND r.merchant_id=? AND x.id IS NULL`,[redemption.coupon_id,merchantId]);
  const outstanding=Number(counts[0].outstanding);
  let blocker:DiscountReleaseBlocker|null=null;
  if(redemption.release_policy_version!==1)blocker='legacy';
  else if(order.status!=='cancelled'||order.payment_status!=='unpaid'||order.sallaOrderId||order.checkout_review_required!==0)blocker='order';
  else if(order.checkout_discount_released!==0 || order.currency!=='SAR' || order.discountCode!==redemption.discount_code
    ||order.checkout_subtotal_minor!==redemption.subtotal_minor||order.checkout_discount_minor!==redemption.discount_minor||order.totalAmount!==redemption.total_minor
    ||!validCheckoutDiscountDisplay({code:redemption.discount_code,subtotalMinor:redemption.subtotal_minor,discountMinor:redemption.discount_minor},redemption.total_minor))blocker='identity';
  else if(links.some(link=>link.merchant_id!==merchantId||link.booking_id!=null||link.amount!==order.totalAmount||link.currency!=='SAR'||link.is_fixed_amount!==1
    ||[link.usage_count,link.successful_payments,link.total_collected].some(n=>!Number.isSafeInteger(n)||n!==0))
    ||attempts.some(attempt=>attempt.merchant_id!==merchantId||attempt.amount_minor!==order.totalAmount||attempt.currency!=='SAR'
      ||!['created','failed'].includes(attempt.state)||!links.some(link=>link.id===attempt.payment_link_id)
      ||!payments.some(payment=>payment.id===attempt.payment_id&&readPaymentLinkId(payment.metadata)===attempt.payment_link_id))
    ||payments.some(payment=>payment.merchant_id!==merchantId||payment.booking_id!=null||payment.amount!==order.totalAmount||payment.currency!=='SAR'
      ||!/^chg_[A-Za-z0-9_-]{6,250}$/.test(payment.tap_charge_id||'')||!terminal(payment)
      ||attempts.filter(attempt=>attempt.payment_id===payment.id).length!==1))blocker='payment';
  else if(!coupon||coupon.merchantId!==merchantId||coupon.code!==redemption.discount_code)blocker='coupon';
  else if(!Number.isSafeInteger(coupon.usedCount)||coupon.usedCount<1||!Number.isSafeInteger(outstanding)||outstanding<1||coupon.usedCount<outstanding)blocker='counter';
  return {order,redemption,release,links,attempts,payments,coupon,outstanding,blocker,
    evidence:hash({order,redemption,release:release??null,links,attempts,payments,coupon,outstanding})};
}

export async function getCheckoutDiscountRelease(merchantId:number,orderId:number) {
  positive(merchantId);positive(orderId);await assertSchema();
  return transaction(async connection=>{
    const data=await graph(connection,merchantId,orderId);if(!data)return null;
    const {redemption,release}=data;
    return {code:redemption.discount_code as string,discountMinor:Number(redemption.discount_minor),
      state:release?'released' as const:data.blocker?'blocked' as const:'eligible' as const,blocker:release?null:data.blocker,evidence:data.evidence,
      audit:release?{actorUserId:Number(release.actor_user_id),reason:String(release.reason),usedBefore:Number(release.used_before),usedAfter:Number(release.used_after),
        at:new Date(databaseTimeEpoch(release.created_at)).toISOString()}:null};
  });
}

/** Releases one local coupon use, not money or a provider session. Refunds and legacy uncertainty are excluded. */
export async function releaseCheckoutDiscount(merchantId:number,actorUserId:number,raw:CheckoutDiscountReleaseInput) {
  positive(merchantId);positive(actorUserId);const input=checkoutDiscountReleaseSchema.parse(raw);await assertSchema();
  return transaction(async connection=>{
    const data=await graph(connection,merchantId,input.orderId);if(!data)throw unavailable();
    if(data.release)return {released:true as const,alreadyReleased:true};
    if(data.blocker||data.evidence!==input.evidence)throw unavailable();
    const {coupon,redemption,order}=data;
    const [updated]=await connection.execute<any>('UPDATE discount_codes SET usedCount=usedCount-1 WHERE id=? AND merchantId=? AND usedCount=? AND usedCount>0',
      [coupon.id,merchantId,coupon.usedCount]);if(updated.affectedRows!==1)throw unavailable();
    // Keep history and the discounted invoice intact. Close local payment entry points permanently.
    await connection.execute("UPDATE payment_links SET is_active=0,status='disabled' WHERE order_id=? AND merchant_id=?",[order.id,merchantId]);
    const [fenced]=await connection.execute<any>(`UPDATE orders SET checkout_discount_released=1,paymentUrl=NULL
      WHERE id=? AND merchantId=? AND status='cancelled' AND payment_status='unpaid' AND checkout_discount_released=0`,[order.id,merchantId]);
    if(fenced.affectedRows!==1)throw unavailable();
    await connection.execute(`INSERT INTO checkout_discount_releases (merchant_id,order_id,redemption_id,coupon_id,actor_user_id,reason,policy_version,used_before,used_after,evidence_hash)
      VALUES (?,?,?,?,?,?,1,?,?,?)`,[merchantId,order.id,redemption.id,coupon.id,actorUserId,input.reason,coupon.usedCount,coupon.usedCount-1,input.evidence]);
    return {released:true as const,alreadyReleased:false};
  });
}
