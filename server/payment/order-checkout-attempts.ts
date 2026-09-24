import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { getMerchantPaymentSettings } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { publicPaymentUrls } from '../utils/public-url';
import { requireMinor } from '../../shared/product-money';
import { postTapCharge } from './tap-client';
import { buildTapCheckoutIdempotentReference, halalasToTapAmount, isTapPaymentReady, normalizeSaudiPhone,
  readPaymentLinkContext, readPaymentLinkId, validateTapCheckoutCharge, type ValidatedTapCheckoutCharge } from './payment-link-policy';

const inputSchema = z.object({ linkId:z.string().min(1).max(100), checkoutAttemptId:z.string().uuid().transform(s=>s.toLowerCase()),
  customerName:z.string().trim().min(2).max(120), customerPhone:z.string().min(9).max(20),
  customerEmail:z.string().trim().email().max(255).optional() }).strict();
type CheckoutInput = z.infer<typeof inputSchema>;
const digest = (value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function checkoutRequestFingerprint(input:{merchantId:number;orderId:number;linkId:number;amount:number;currency:string;
  customerName:string;customerPhone:string;customerEmail:string|null;description:string;metadata:unknown;secret:string;testMode:boolean}) {
  const {secret,testMode,...identity}=input;
  return digest({...identity,provider:digest(secret),testMode});
}
const unavailable = ()=>new Error('Order checkout requires review');

async function transaction<T>(run:(connection:PoolConnection)=>Promise<T>):Promise<T> {
  const pool=await getPool();if(!pool)throw unavailable();const connection=await pool.getConnection();
  try {await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await connection.beginTransaction();
    const result=await run(connection);await connection.commit();return result;
  } catch(error){await connection.rollback();throw error;} finally {connection.release();}
}

async function lockedTarget(connection:PoolConnection,linkId:string) {
  const [discovery]=await connection.execute<any[]>('SELECT id,merchant_id,order_id FROM payment_links WHERE link_id=?',[linkId]);
  const found=discovery[0];if(!found?.order_id)throw unavailable();
  // Same order-first serialization as payment settlement and merchant cancellation.
  const [orders]=await connection.execute<any[]>('SELECT * FROM orders WHERE id=? AND merchantId=? FOR UPDATE',[found.order_id,found.merchant_id]);
  const [links]=await connection.execute<any[]>('SELECT * FROM payment_links WHERE id=? FOR UPDATE',[found.id]);
  const order=orders[0],link=links[0];
  if(!order||!link||link.order_id!==order.id||link.merchant_id!==order.merchantId||link.link_id!==linkId||link.booking_id!=null
    ||order.sallaOrderId||order.currency!=='SAR'||link.currency!=='SAR'||order.totalAmount!==link.amount||link.is_fixed_amount!==1)throw unavailable();
  halalasToTapAmount(link.amount);
  return {order,link};
}

function payable(order:any) {
  return ['pending','processing'].includes(order.status)&&order.payment_status==='unpaid'&&!order.checkout_review_required&&!order.checkout_discount_released;
}
async function assertLinkAvailable(connection:PoolConnection,link:any) {
  // Read time after waiting for the order and link locks.
  const [clock]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const now=databaseTimeEpoch(clock[0].now),expiry=link.expires_at==null?null:databaseTimeEpoch(link.expires_at);
  if(!Number.isFinite(now)||link.status!=='active'||link.is_active!==1||(expiry!==null&&(!Number.isFinite(expiry)||expiry<=now))
    ||!Number.isInteger(link.usage_count)||link.usage_count<0
    ||(link.max_usage_count!=null&&(!Number.isInteger(link.max_usage_count)||link.max_usage_count<=link.usage_count)))throw unavailable();
}

async function matchingPayment(connection:PoolConnection,attempt:any) {
  const [payments]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE id=? FOR UPDATE',[attempt.payment_id]);
  const payment=payments[0];
  if(!payment||payment.merchant_id!==attempt.merchant_id||payment.order_id!==attempt.order_id||payment.booking_id!=null
    ||payment.amount!==attempt.amount_minor||payment.currency!==attempt.currency||readPaymentLinkId(payment.metadata)!==attempt.payment_link_id
    ||!/^chg_[A-Za-z0-9_-]{3,250}$/.test(payment.tap_charge_id||''))throw unavailable();
  return payment;
}

/** A reservation is durable before any POST. Unknown outcomes never expire into a retry. */
export async function createDurableOrderCheckout(raw:CheckoutInput):Promise<{paymentUrl:string}> {
  const input=inputSchema.parse(raw),phoneNumber=normalizeSaudiPhone(input.customerPhone);
  await assertRuntimeSchema('durable order checkout', [{table:'orders',columns:['checkout_discount_released']},{table:'order_checkout_attempts',
    columns:['request_hash','provider_reference','payment_id','failure_code','amount_minor','currency'],
    generatedColumns:[{name:'active_order_id',expression:"case when state in ('dispatching','unknown','created') then order_id else null end",storage:'virtual'}],
    uniqueIndexes:[{name:'uq_checkout_request',columns:['payment_link_id','request_id']},{name:'uq_checkout_active_order',columns:['active_order_id']},'uq_checkout_provider_reference']}]);
  const pool=await getPool();if(!pool)throw unavailable();
  const [scope]=await pool.execute<any[]>('SELECT merchant_id FROM payment_links WHERE link_id=?',[input.linkId]);
  if(scope.length!==1)throw unavailable();
  // Load decrypted settings before holding a pooled connection/row locks; concurrent checkouts must not exhaust the pool waiting for settings.
  const settings=await getMerchantPaymentSettings(scope[0].merchant_id);
  if(!settings?.tapSecretKey||!isTapPaymentReady(settings))throw unavailable();
  const secret=settings.tapSecretKey;
  const reservation=await transaction(async connection=>{
    const {order,link}=await lockedTarget(connection,input.linkId);
    if(order.merchantId!==scope[0].merchant_id)throw unavailable();
    if(!payable(order))throw unavailable();await assertLinkAvailable(connection,link);
    const fingerprint=checkoutRequestFingerprint({merchantId:order.merchantId,orderId:order.id,linkId:link.id,amount:link.amount,currency:link.currency,
      customerName:input.customerName,customerPhone:phoneNumber,customerEmail:input.customerEmail||null,
      description:link.description||link.title,metadata:link.metadata,secret,testMode:!!settings.tapTestMode});
    const [attempts]=await connection.execute<any[]>(`SELECT * FROM order_checkout_attempts WHERE order_id=?
      AND (state IN ('dispatching','unknown','created') OR (payment_link_id=? AND request_id=?)) ORDER BY created_at,id FOR UPDATE`,
      [order.id,link.id,input.checkoutAttemptId]);
    for(const attempt of attempts) {
      if(attempt.state!=='created')throw unavailable();
      const payment=await matchingPayment(connection,attempt);
      const terminal=payment.status==='failed'&&['FAILED','DECLINED','RESTRICTED'].includes(payment.last_webhook_status)
        ||payment.status==='cancelled'&&['CANCELLED','ABANDONED','VOID'].includes(payment.last_webhook_status);
      if(terminal&&payment.last_webhook_at&&attempt.request_id!==input.checkoutAttemptId) {
        await connection.execute("UPDATE order_checkout_attempts SET state='failed' WHERE id=? AND state='created'",[attempt.id]);
        continue;
      }
      if(attempt.request_hash!==fingerprint||!['pending','authorized'].includes(payment.status))throw unavailable();
      const [clock]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
      if(payment.expires_at&&(!Number.isFinite(databaseTimeEpoch(payment.expires_at))||databaseTimeEpoch(payment.expires_at)<=databaseTimeEpoch(clock[0].now)))throw unavailable();
      const validated=validateTapCheckoutCharge({id:payment.tap_charge_id,status:'INITIATED',currency:payment.currency,amount:payment.amount/100,
        live_mode:!settings.tapTestMode,transaction:{url:payment.tap_payment_url}}, {amountInHalalas:link.amount,currency:'SAR',testMode:!!settings.tapTestMode});
      if(!validated)throw unavailable();
      return {kind:'reuse' as const,paymentUrl:validated.paymentUrl};
    }
    // Older payments without a reservation must not become permission for another charge.
    const [pending]=await connection.execute<any[]>(`SELECT id,status,last_webhook_status,last_webhook_at FROM order_payments
      WHERE order_id=? FOR UPDATE`,[order.id]);
    if(pending.some(p=>!p.last_webhook_at||!(p.status==='failed'&&['FAILED','DECLINED','RESTRICTED'].includes(p.last_webhook_status)
      ||p.status==='cancelled'&&['CANCELLED','ABANDONED','VOID'].includes(p.last_webhook_status))))throw unavailable();
    const id=randomUUID(),reference=buildTapCheckoutIdempotentReference(link.id,input.checkoutAttemptId);
    await connection.execute(`INSERT INTO order_checkout_attempts (id,merchant_id,order_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,order.merchantId,order.id,link.id,input.checkoutAttemptId,fingerprint,reference,link.amount,link.currency]);
    return {kind:'dispatch' as const,id,reference,link,secret,testMode:!!settings.tapTestMode};
  });
  if(reservation.kind==='reuse')return {paymentUrl:reservation.paymentUrl};
  const {link}=reservation,context=readPaymentLinkContext(link.metadata);
  const metadata={paymentLinkId:link.id,...(context.conversationId?{conversationId:context.conversationId}:{})};
  try {
    const response=await postTapCharge(reservation.secret,{
      amount:halalasToTapAmount(link.amount),currency:link.currency,
      customer:{first_name:input.customerName,email:input.customerEmail,phone:{country_code:'966',number:phoneNumber}},
      source:{id:'src_all'},redirect:{url:publicPaymentUrls.linkStatus(link.link_id)},post:{url:publicPaymentUrls.webhook()},
      description:link.description||link.title,metadata:{udf1:reservation.reference},
      reference:{transaction:reservation.reference,order:reservation.reference,idempotent:reservation.reference},
    });
    const charge=response.ok?validateTapCheckoutCharge(response.body,{amountInHalalas:link.amount,currency:'SAR',testMode:reservation.testMode}):null;
    if(!charge)throw unavailable();
    const result=await persistCharge(reservation.id,input,charge,phoneNumber,metadata);
    if(!result.available)throw unavailable();
    return {paymentUrl:charge.paymentUrl};
  } catch {
    // If persistence committed but its acknowledgement was lost, this conditional update leaves 'created' intact.
    const pool=await getPool();
    await pool?.execute("UPDATE order_checkout_attempts SET state='unknown',failure_code='outcome_unverified' WHERE id=? AND state='dispatching'",[reservation.id]).catch(()=>undefined);
    throw unavailable();
  }
}

async function persistCharge(id:string,input:CheckoutInput,charge:ValidatedTapCheckoutCharge,phoneNumber:string,metadata:object) {
  return transaction(async connection=>{
    const {order,link}=await lockedTarget(connection,input.linkId);
    const [attempts]=await connection.execute<any[]>('SELECT * FROM order_checkout_attempts WHERE id=? FOR UPDATE',[id]);
    const attempt=attempts[0];
    if(!attempt||attempt.state!=='dispatching'||attempt.order_id!==order.id||attempt.merchant_id!==order.merchantId
      ||attempt.payment_link_id!==link.id||attempt.amount_minor!==link.amount||attempt.currency!==link.currency)throw unavailable();
    const [insert]=await connection.execute<any>(`INSERT INTO order_payments
      (merchant_id,order_id,customer_phone,customer_name,customer_email,amount,currency,tap_charge_id,tap_payment_url,status,description,metadata,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,CASE WHEN ? IS NULL THEN NULL ELSE TIMESTAMPADD(MICROSECOND,? * 1000,UTC_TIMESTAMP(3)) END)`,[order.merchantId,order.id,`+966${phoneNumber}`,input.customerName,input.customerEmail||null,
      link.amount,link.currency,charge.id,charge.paymentUrl,link.description||link.title,JSON.stringify(metadata),
      charge.expiresInMs,charge.expiresInMs]);
    const [updated]=await connection.execute<any>("UPDATE order_checkout_attempts SET state='created',payment_id=? WHERE id=? AND state='dispatching'",[insert.insertId,id]);
    if(updated.affectedRows!==1)throw unavailable();
    // Record a provider effect even if the order was cancelled during POST; do not hand out its URL.
    let available=payable(order);try{await assertLinkAvailable(connection,link);}catch{available=false;}
    return {available};
  });
}

/** Merchant-only operational evidence. No payer data, credentials, request hashes or checkout URLs. */
export async function getOrderCheckoutAttempts(merchantId:number,orderId:number) {
  z.number().int().positive().parse(merchantId);z.number().int().positive().parse(orderId);
  const pool=await getPool();if(!pool)throw unavailable();
  const [orders]=await pool.execute<any[]>('SELECT id FROM orders WHERE id=? AND merchantId=?',[orderId,merchantId]);
  if(orders.length!==1)throw unavailable();
  const [rows]=await pool.execute<any[]>(`SELECT id,state,provider_reference,amount_minor,currency,payment_id,created_at,updated_at
    FROM order_checkout_attempts WHERE order_id=? AND merchant_id=? ORDER BY created_at DESC,id DESC LIMIT 10`,[orderId,merchantId]);
  const {readCheckoutReviewEvidence}=await import('./checkout-reconciliation');
  return Promise.all(rows.map(async row=>({id:String(row.id),state:z.enum(['dispatching','unknown','created','failed']).parse(row.state),
    reference:z.string().regex(/^sari_pl_[0-9a-f]{64}$/).parse(row.provider_reference),amountMinor:requireMinor(row.amount_minor),currency:z.literal('SAR').parse(row.currency),
    paymentId:row.payment_id==null?null:Number(row.payment_id),
    createdAt:new Date(databaseTimeEpoch(row.created_at)).toISOString(),updatedAt:new Date(databaseTimeEpoch(row.updated_at)).toISOString(),
    ...await readCheckoutReviewEvidence(merchantId,orderId,row.id)})));
}
