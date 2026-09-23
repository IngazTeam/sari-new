import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { getMerchantPaymentSettings } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { majorToMinor } from '../../shared/product-money';
import { reconcileCheckoutSchema, type ReconcileCheckoutInput } from '../../shared/checkout-reconciliation';
import { checkoutRequestFingerprint } from './order-checkout-attempts';
import { isTapPaymentReady, normalizeSaudiPhone, readPaymentLinkContext, readPaymentLinkId, validateTapCheckoutCharge } from './payment-link-policy';
import { retrieveTapCharge } from './tap-client';
import { applyTapOrderPaymentStateInTransaction, assertTapOrderPaymentStateSchema } from './order-payment-state';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new Error('Checkout reconciliation requires fresh verified evidence');
const statuses = ['INITIATED','AUTHORIZED','CAPTURED','REFUNDED','FAILED','DECLINED','RESTRICTED','CANCELLED','ABANDONED','VOID'] as const;
type Reason = 'provider_unavailable' | 'charge_not_found' | 'identity_mismatch' | 'unsupported_status';

async function transaction<T>(run: (connection: PoolConnection) => Promise<T>) {
  const pool = await getPool(); if (!pool) throw unavailable();
  const connection = await pool.getConnection(); let reusable = true, committing = false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await connection.beginTransaction();
    const result = await run(connection); committing = true; await connection.commit(); return result;
  } catch (error) {
    if (committing) reusable = false;
    else try { await connection.rollback(); } catch { reusable = false; }
    throw error;
  } finally { if (reusable) connection.release(); else connection.destroy(); }
}

async function graph(connection: PoolConnection, merchantId: number, orderId: number, attemptId: string) {
  const [orders] = await connection.execute<any[]>('SELECT id,merchantId,totalAmount,currency,status,payment_status,checkout_review_required,sallaOrderId FROM orders WHERE id=? AND merchantId=? FOR UPDATE',[orderId,merchantId]);
  const [attempts] = await connection.execute<any[]>('SELECT * FROM order_checkout_attempts WHERE id=? AND order_id=? AND merchant_id=? FOR UPDATE',[attemptId,orderId,merchantId]);
  const order=orders[0],attempt=attempts[0]; if (!order || !attempt || order.sallaOrderId) throw unavailable();
  const [links] = await connection.execute<any[]>('SELECT * FROM payment_links WHERE id=? FOR UPDATE',[attempt.payment_link_id]);
  const link=links[0];
  if (!link || link.merchant_id!==merchantId || link.order_id!==orderId || link.booking_id!=null || link.is_fixed_amount!==1
    || order.currency!=='SAR' || link.currency!==order.currency || attempt.currency!==order.currency
    || link.amount!==order.totalAmount || attempt.amount_minor!==order.totalAmount || !Number.isSafeInteger(attempt.review_revision)) throw unavailable();
  let payment:any=null;
  if (attempt.payment_id!=null) {
    const [rows]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE id=? FOR UPDATE',[attempt.payment_id]); payment=rows[0];
    if (!payment || payment.merchant_id!==merchantId || payment.order_id!==orderId || payment.booking_id!=null
      || payment.amount!==attempt.amount_minor || payment.currency!==attempt.currency || readPaymentLinkId(payment.metadata)!==link.id) throw unavailable();
  }
  if (['created','failed'].includes(attempt.state) !== (payment!=null)) throw unavailable();
  const [clock]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const now=databaseTimeEpoch(clock[0].now),createdAt=databaseTimeEpoch(attempt.created_at);
  const canReview=['unknown','created'].includes(attempt.state) || attempt.state==='dispatching' && Number.isFinite(createdAt) && now-createdAt>=120_000;
  // Includes payment state so a webhook during GET invalidates this review instead of being overwritten.
  return {order,attempt,link,payment,now,canReview,evidence:hash({order,attempt,link,payment})};
}

export async function readCheckoutReviewEvidence(merchantId:number,orderId:number,attemptId:string) {
  return transaction(async connection=>{
    const data=await graph(connection,merchantId,orderId,attemptId);
    const [reviews]=await connection.execute<any[]>('SELECT outcome,created_at FROM order_checkout_reviews WHERE attempt_id=? ORDER BY revision DESC LIMIT 1',[attemptId]);
    return {evidence:data.evidence,canReview:data.canReview,reviewRevision:data.attempt.review_revision,
      lastReview:reviews[0]?{outcome:z.enum(['verified','unverified']).parse(reviews[0].outcome),at:new Date(databaseTimeEpoch(reviews[0].created_at)).toISOString()}:null};
  });
}

function verifyCharge(body:any,data:Awaited<ReturnType<typeof graph>>,chargeId:string,secret:string,testMode:boolean) {
  const {attempt,order,link,payment}=data;
  if (!body || body.object!=='charge' || body.id!==chargeId || payment && payment.tap_charge_id!==chargeId
    || body.currency!=='SAR' || !['string','number'].includes(typeof body.amount) || majorToMinor(body.amount)!==attempt.amount_minor
    || body.live_mode!==!testMode || body.reference?.transaction!==attempt.provider_reference
    || body.reference?.order!==attempt.provider_reference || body.metadata?.udf1!==attempt.provider_reference
    || String(body.customer?.phone?.country_code)!=='966') throw unavailable();
  const name=z.string().min(2).max(120).parse(body.customer?.first_name);
  const phone=normalizeSaudiPhone(z.string().min(9).max(20).parse(body.customer?.phone?.number));
  const email=body.customer?.email==null || body.customer.email==='' ? null : z.string().email().max(255).parse(body.customer.email);
  if (checkoutRequestFingerprint({merchantId:order.merchantId,orderId:order.id,linkId:link.id,amount:link.amount,currency:link.currency,
    customerName:name,customerPhone:phone,customerEmail:email,description:link.description||link.title,metadata:link.metadata,secret,testMode})!==attempt.request_hash) throw unavailable();
  const status=z.enum(statuses).safeParse(body.status);
  if (!status.success || status.data==='REFUNDED' && !['captured','refunded'].includes(payment?.status)) return {reason:'unsupported_status' as const};
  // A fetched session's lifetime starts at provider creation, never at reconciliation time.
  const checkout=validateTapCheckoutCharge(body,{amountInHalalas:attempt.amount_minor,currency:'SAR',testMode});
  const created=Number(body.transaction?.created);
  const expires=checkout?.expiresInMs && Number.isSafeInteger(created) && created>0 && created<=data.now+60_000
    ? created+checkout.expiresInMs : null;
  const url=expires && expires>data.now ? checkout?.paymentUrl ?? null : null;
  return {status:status.data,name,phone,email,url,expires:url?new Date(Math.floor(expires!/1000)*1000):null};
}

/** Explicit operator review, a single bounded GET, then an atomic local settlement. Never creates charges or sends messages. */
export async function reconcileOrderCheckout(merchantId:number,actorUserId:number,raw:ReconcileCheckoutInput) {
  z.number().int().positive().safe().parse(merchantId);z.number().int().positive().safe().parse(actorUserId);
  const input=reconcileCheckoutSchema.parse(raw);
  await assertRuntimeSchema('checkout reconciliation',[
    {table:'order_checkout_attempts',columns:['review_revision','request_hash','provider_reference']},
    {table:'order_checkout_reviews',columns:['actor_user_id','proof_hash','outcome'],uniqueIndexes:[{name:'uq_checkout_review_revision',columns:['attempt_id','revision']}]},
    {table:'order_payments',uniqueIndexes:[{name:'order_payments_tap_charge_id_unique',columns:['tap_charge_id']}]},
  ],{cacheSuccess:false});
  await assertTapOrderPaymentStateSchema();
  const initial=await transaction(c=>graph(c,merchantId,input.orderId,input.attemptId));
  if (!initial.canReview || initial.evidence!==input.evidence || initial.payment && initial.payment.tap_charge_id!==input.chargeId) throw unavailable();
  const settings=await getMerchantPaymentSettings(merchantId);
  if (!settings?.tapSecretKey || !isTapPaymentReady(settings)) throw unavailable();
  let verified:ReturnType<typeof verifyCharge>|undefined, reason:Reason|undefined;
  try {
    const response=await retrieveTapCharge(settings.tapSecretKey,input.chargeId);
    if (!response.ok) reason=response.status===404?'charge_not_found':'provider_unavailable';
    else try { verified=verifyCharge(response.body,initial,input.chargeId,settings.tapSecretKey,!!settings.tapTestMode);reason=verified.reason; }
      catch {reason='identity_mismatch';}
  } catch {reason='provider_unavailable';}
  return transaction(async connection=>{
    const current=await graph(connection,merchantId,input.orderId,input.attemptId);
    if (!current.canReview || current.evidence!==initial.evidence) throw unavailable();
    const {attempt,link}=current;
    let paymentId=attempt.payment_id,status:string|null=null;
    if (verified && !verified.reason) {
      const proof=verified;
      if (paymentId==null) {
        const context=readPaymentLinkContext(link.metadata);
        const metadata={paymentLinkId:link.id,...(context.conversationId?{conversationId:context.conversationId}:{})};
        const [result]=await connection.execute<any>(`INSERT INTO order_payments
          (merchant_id,order_id,customer_phone,customer_name,customer_email,amount,currency,tap_charge_id,tap_payment_url,status,description,metadata,expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?)`,[merchantId,input.orderId,`+966${proof.phone}`,proof.name,proof.email,
          attempt.amount_minor,attempt.currency,input.chargeId,proof.url,link.description||link.title,JSON.stringify(metadata),proof.expires]);
        paymentId=result.insertId;
      }
      const applied=await applyTapOrderPaymentStateInTransaction(connection,{paymentId,tapChargeId:input.chargeId,providerStatus:proof.status,
        expectedMerchantId:merchantId,expectedAmount:attempt.amount_minor,expectedCurrency:attempt.currency});
      if (applied.kind==='invalid') throw unavailable();
      status=applied.status;
    }
    const outcome=reason?'unverified' as const:'verified' as const;
    if (!reason && !verified) throw unavailable();
    const revision=attempt.review_revision+1;
    const [updated]=await connection.execute<any>(`UPDATE order_checkout_attempts SET review_revision=?,
      state=CASE WHEN ?='verified' THEN 'created' ELSE state END,payment_id=?,failure_code=CASE WHEN ?='verified' THEN NULL ELSE failure_code END
      WHERE id=? AND review_revision=?`,[revision,outcome,paymentId,outcome,attempt.id,attempt.review_revision]);
    if (updated.affectedRows!==1) throw unavailable();
    const proofHash=hash({evidence:initial.evidence,chargeId:input.chargeId,outcome,reason:reason??null,providerStatus:verified?.status??null,status,paymentId});
    await connection.execute(`INSERT INTO order_checkout_reviews (attempt_id,revision,actor_user_id,charge_id,outcome,reason,provider_status,proof_hash)
      VALUES (?,?,?,?,?,?,?,?)`,[attempt.id,revision,actorUserId,input.chargeId,outcome,reason??null,verified?.status??null,proofHash]);
    return {outcome,status};
  });
}
