import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { getMerchantPaymentSettings } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { majorToMinor } from '../../shared/product-money';
import { reconcileBookingCheckoutSchema, type ReconcileBookingCheckoutInput } from '../../shared/booking-checkout-reconciliation';
import { bookingCheckoutRequestFingerprint } from './booking-checkout';
import { isTapPaymentReady, normalizeSaudiPhone, readPaymentLinkId, validateTapCheckoutCharge } from './payment-link-policy';
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

async function graph(connection: PoolConnection, merchantId: number, bookingId: number, attemptId: string) {
  const [bookings]=await connection.execute<any[]>('SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE',[bookingId,merchantId]);
  const booking=bookings[0];if(!booking)throw unavailable();
  // Settlement locks this service for update too. Avoid two reviews holding shared
  // service locks and deadlocking while both upgrade them for separate bookings.
  const [services]=await connection.execute<any[]>('SELECT id FROM services WHERE id=? AND merchant_id=? FOR UPDATE',[booking.service_id,merchantId]);
  if(services.length!==1)throw unavailable();
  if(!Number.isSafeInteger(booking.base_price)||!Number.isSafeInteger(booking.discount_amount)||!Number.isSafeInteger(booking.final_price)
    ||booking.discount_amount<0||booking.final_price<100||booking.final_price!==booking.base_price-booking.discount_amount)throw unavailable();
  // Follow the same booking -> links -> attempt -> payment lock order as checkout.
  const [links]=await connection.execute<any[]>('SELECT * FROM payment_links WHERE booking_id=? ORDER BY id FOR UPDATE',[bookingId]);
  const [attempts]=await connection.execute<any[]>('SELECT * FROM booking_checkout_attempts WHERE id=? AND booking_id=? AND merchant_id=? FOR UPDATE',[attemptId,bookingId,merchantId]);
  const attempt=attempts[0];if(!attempt)throw unavailable();const link=links.find(row=>row.id===attempt.payment_link_id);
  if(!link||link.merchant_id!==merchantId||link.order_id!=null||link.is_fixed_amount!==1||link.max_usage_count!==1
    ||link.booking_checkout_policy_version!==1||link.currency!=='SAR'||attempt.currency!=='SAR'
    ||link.amount!==booking.final_price||attempt.amount_minor!==booking.final_price||!Number.isSafeInteger(attempt.review_revision)||attempt.review_revision<0)throw unavailable();
  let payment:any=null;
  if(attempt.payment_id!=null){
    const [rows]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE id=? FOR UPDATE',[attempt.payment_id]);payment=rows[0];
    if(!payment||payment.merchant_id!==merchantId||payment.booking_id!==bookingId||payment.order_id!=null
      ||payment.amount!==attempt.amount_minor||payment.currency!==attempt.currency||readPaymentLinkId(payment.metadata)!==link.id)throw unavailable();
  }
  if(!['dispatching','unknown','created','failed'].includes(attempt.state)||(['created','failed'].includes(attempt.state)!==(payment!=null)))throw unavailable();
  const [clock]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const now=databaseTimeEpoch(clock[0].now),createdAt=databaseTimeEpoch(attempt.created_at);
  if(!Number.isFinite(now)||!Number.isFinite(createdAt))throw unavailable();
  const canReview=['unknown','created'].includes(attempt.state)||attempt.state==='dispatching'&&now-createdAt>=120_000;
  return {booking,attempt,link,payment,now,canReview,evidence:hash({booking,attempt,links,payment})};
}

export async function readBookingCheckoutReviewEvidence(merchantId:number,bookingId:number,attemptId:string) {
  return transaction(async connection=>{
    const data=await graph(connection,merchantId,bookingId,attemptId);
    const [reviews]=await connection.execute<any[]>('SELECT outcome,created_at FROM booking_checkout_reviews WHERE attempt_id=? ORDER BY revision DESC LIMIT 1',[attemptId]);
    return {evidence:data.evidence,canReview:data.canReview,reviewRevision:data.attempt.review_revision,
      lastReview:reviews[0]?{outcome:z.enum(['verified','unverified']).parse(reviews[0].outcome),at:new Date(databaseTimeEpoch(reviews[0].created_at)).toISOString()}:null};
  });
}

function verifyCharge(body:any,data:Awaited<ReturnType<typeof graph>>,chargeId:string,secret:string,testMode:boolean) {
  const {attempt,booking,link,payment}=data;
  if (!body || body.object!=='charge' || body.id!==chargeId || payment && payment.tap_charge_id!==chargeId
    || body.currency!=='SAR' || !['string','number'].includes(typeof body.amount) || majorToMinor(body.amount)!==attempt.amount_minor
    || body.live_mode!==!testMode || body.reference?.transaction!==attempt.provider_reference
    || body.reference?.order!==attempt.provider_reference || body.metadata?.udf1!==attempt.provider_reference
    || String(body.customer?.phone?.country_code)!=='966') throw unavailable();
  const name=z.string().min(2).max(120).parse(body.customer?.first_name);
  const phone=normalizeSaudiPhone(z.string().min(9).max(20).parse(body.customer?.phone?.number));
  const email=body.customer?.email==null || body.customer.email==='' ? null : z.string().email().max(255).parse(body.customer.email);
  if (bookingCheckoutRequestFingerprint({merchantId:booking.merchant_id,bookingId:booking.id,serviceId:booking.service_id,linkId:link.id,amount:link.amount,currency:link.currency,
    customerName:name,customerPhone:phone,customerEmail:email,description:link.description||link.title,secret,testMode})!==attempt.request_hash) throw unavailable();
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
export async function reconcileBookingCheckout(merchantId:number,actorUserId:number,raw:ReconcileBookingCheckoutInput) {
  z.number().int().positive().safe().parse(merchantId);z.number().int().positive().safe().parse(actorUserId);
  const input=reconcileBookingCheckoutSchema.parse(raw);
  await assertRuntimeSchema('checkout reconciliation',[
    {table:'booking_checkout_attempts',columns:['review_revision','request_hash','provider_reference']},
    {table:'booking_checkout_reviews',columns:['actor_user_id','proof_hash','outcome'],uniqueIndexes:[{name:'uq_booking_checkout_review_revision',columns:['attempt_id','revision']}]},
    {table:'order_payments',uniqueIndexes:[{name:'order_payments_tap_charge_id_unique',columns:['tap_charge_id']}]},
  ],{cacheSuccess:false});
  await assertTapOrderPaymentStateSchema();
  const initial=await transaction(c=>graph(c,merchantId,input.bookingId,input.attemptId));
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
    const current=await graph(connection,merchantId,input.bookingId,input.attemptId);
    if (!current.canReview || current.evidence!==initial.evidence) throw unavailable();
    const {attempt,link}=current;
    let paymentId=attempt.payment_id,status:string|null=null;
    if (verified && !verified.reason) {
      const proof=verified;
      if (paymentId==null) {
        const metadata={paymentLinkId:link.id};
        const [result]=await connection.execute<any>(`INSERT INTO order_payments
          (merchant_id,booking_id,customer_phone,customer_name,customer_email,amount,currency,tap_charge_id,tap_payment_url,status,description,metadata,expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?)`,[merchantId,input.bookingId,`+966${proof.phone}`,proof.name,proof.email,
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
    const [updated]=await connection.execute<any>(`UPDATE booking_checkout_attempts SET review_revision=?,
      state=CASE WHEN ?='verified' THEN 'created' ELSE state END,payment_id=?,failure_code=CASE WHEN ?='verified' THEN NULL ELSE failure_code END
      WHERE id=? AND review_revision=?`,[revision,outcome,paymentId,outcome,attempt.id,attempt.review_revision]);
    if (updated.affectedRows!==1) throw unavailable();
    const proofHash=hash({evidence:initial.evidence,chargeId:input.chargeId,outcome,reason:reason??null,providerStatus:verified?.status??null,status,paymentId});
    await connection.execute(`INSERT INTO booking_checkout_reviews (attempt_id,revision,actor_user_id,charge_id,outcome,reason,provider_status,proof_hash)
      VALUES (?,?,?,?,?,?,?,?)`,[attempt.id,revision,actorUserId,input.chargeId,outcome,reason??null,verified?.status??null,proofHash]);
    return {outcome,status};
  });
}

/** Merchant operational evidence; never returns payer data, hashes, credentials or checkout URLs. */
export async function getBookingCheckoutAttempts(merchantId:number,bookingId:number) {
  z.number().int().positive().safe().parse(merchantId);z.number().int().positive().safe().parse(bookingId);
  const pool=await getPool();if(!pool)throw unavailable();
  const [bookings]=await pool.execute<any[]>('SELECT id FROM bookings WHERE id=? AND merchant_id=?',[bookingId,merchantId]);
  if(bookings.length!==1)throw unavailable();
  const [rows]=await pool.execute<any[]>('SELECT id,state,provider_reference,amount_minor,currency,payment_id,created_at,updated_at FROM booking_checkout_attempts WHERE booking_id=? AND merchant_id=? ORDER BY created_at DESC,id DESC LIMIT 10',[bookingId,merchantId]);
  return Promise.all(rows.map(async row=>({id:z.string().uuid().parse(row.id),state:z.enum(['dispatching','unknown','created','failed']).parse(row.state),
    reference:z.string().regex(/^sari_pl_[0-9a-f]{64}$/).parse(row.provider_reference),amountMinor:z.number().int().min(100).parse(row.amount_minor),currency:z.literal('SAR').parse(row.currency),
    paymentId:row.payment_id==null?null:Number(row.payment_id),createdAt:new Date(databaseTimeEpoch(row.created_at)).toISOString(),updatedAt:new Date(databaseTimeEpoch(row.updated_at)).toISOString(),
    ...await readBookingCheckoutReviewEvidence(merchantId,bookingId,row.id)})));
}
