import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { getMerchantPaymentSettings } from '../db';
import { getPaymentLinkById } from '../db_payments';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { publicPaymentUrls } from '../utils/public-url';
import { requireMinor } from '../../shared/product-money';
import { postTapCharge } from './tap-client';
import { buildTapCheckoutIdempotentReference, halalasToTapAmount, isTapPaymentReady, normalizeSaudiPhone,
  readPaymentLinkId, validateTapCheckoutCharge, type ValidatedTapCheckoutCharge } from './payment-link-policy';

const unavailable = () => new Error('Booking checkout requires review');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Preserve version 1 field order: existing reservations must remain verifiable. */
export function bookingCheckoutRequestFingerprint(input:{merchantId:number;bookingId:number;linkId:number;serviceId:number;amount:number;currency:string;
  customerName:string;customerPhone:string;customerEmail:string|null;description:string;secret:string;testMode:boolean}) {
  return digest({version:1,merchantId:input.merchantId,bookingId:input.bookingId,linkId:input.linkId,serviceId:input.serviceId,
    amount:input.amount,currency:input.currency,customerName:input.customerName,customerPhone:input.customerPhone,
    customerEmail:input.customerEmail,description:input.description,provider:digest(input.secret),testMode:input.testMode});
}
const checkoutSchema = z.object({ linkId:z.string().min(1).max(100),checkoutAttemptId:z.string().uuid().transform(s=>s.toLowerCase()),
  customerName:z.string().trim().min(2).max(120),customerPhone:z.string().min(9).max(20),
  customerEmail:z.string().trim().email().max(255).optional() }).strict();
type CheckoutInput = z.infer<typeof checkoutSchema>;
const issueSchema = z.object({merchantId:z.number().int().positive(),bookingId:z.number().int().positive(),
  amount:z.number().int().min(100).max(100_000_000),title:z.string().trim().min(2).max(255),
  description:z.string().trim().max(1000).optional(),expiresAt:z.string().optional()}).strict();

async function schemaReady() {
  await assertRuntimeSchema('durable booking checkout',[
    {table:'payment_links',columns:['booking_checkout_policy_version']},
    {table:'booking_checkout_attempts',columns:['request_hash','provider_reference','payment_id','amount_minor','currency','failure_code'],
      generatedColumns:[{name:'active_booking_id',expression:"case when state in ('dispatching','unknown','created') then booking_id else null end",storage:'virtual'}],
      uniqueIndexes:[{name:'uq_booking_checkout_request',columns:['payment_link_id','request_id']},
        {name:'uq_booking_checkout_active',columns:['active_booking_id']},'uq_booking_checkout_reference']},
  ]);
}

async function transaction<T>(run:(connection:PoolConnection)=>Promise<T>):Promise<T> {
  const pool=await getPool();if(!pool)throw unavailable();const connection=await pool.getConnection();
  let committing=false,destroyed=false;
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await connection.beginTransaction();
    const result=await run(connection);committing=true;await connection.commit();return result;
  } catch(error) {
    if(committing){connection.destroy();destroyed=true;}
    else {try {await connection.rollback();}catch {connection.destroy();destroyed=true;}}
    throw error;
  } finally {if(!destroyed)connection.release();}
}

async function lockedBooking(connection:PoolConnection,merchantId:number,bookingId:number) {
  // Settlement also locks the booking before payment links and payment rows.
  const [rows]=await connection.execute<any[]>('SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE',[bookingId,merchantId]);
  const booking=rows[0];if(!booking)throw unavailable();
  const [services]=await connection.execute<any[]>('SELECT id FROM services WHERE id=? AND merchant_id=? FOR SHARE',[booking.service_id,merchantId]);
  if(services.length!==1)throw unavailable();
  return booking;
}
function payable(booking:any) {
  return ['pending','confirmed'].includes(booking.status)&&booking.payment_status==='unpaid';
}
function assertPrice(booking:any) {
  requireMinor(booking.base_price);requireMinor(booking.discount_amount);requireMinor(booking.final_price);
  if(booking.discount_amount>booking.base_price||booking.final_price!==booking.base_price-booking.discount_amount)throw unavailable();
  halalasToTapAmount(booking.final_price);
}
function assertLinkIdentity(booking:any,link:any) {
  assertPrice(booking);
  if(link.merchant_id!==booking.merchant_id||link.booking_id!==booking.id||link.order_id!=null
    ||link.currency!=='SAR'||link.amount!==booking.final_price||link.is_fixed_amount!==1||link.max_usage_count!==1
    ||link.booking_checkout_policy_version!==1)throw unavailable();
}
async function now(connection:PoolConnection) {
  const [rows]=await connection.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
  const value=databaseTimeEpoch(rows[0].now);if(!Number.isFinite(value))throw unavailable();return value;
}
async function assertAvailable(connection:PoolConnection,link:any) {
  const time=await now(connection),expiry=link.expires_at==null?null:databaseTimeEpoch(link.expires_at);
  if(link.status!=='active'||link.is_active!==1||link.usage_count!==0
    ||(expiry!==null&&(!Number.isFinite(expiry)||expiry<=time)))throw unavailable();
}
async function lockedTarget(connection:PoolConnection,token:string) {
  const [found]=await connection.execute<any[]>('SELECT id,merchant_id,booking_id FROM payment_links WHERE link_id=?',[token]);
  if(found.length!==1||!found[0].booking_id)throw unavailable();
  const booking=await lockedBooking(connection,found[0].merchant_id,found[0].booking_id);
  // No new link may silently bypass an older, untracked booking checkout.
  const [links]=await connection.execute<any[]>('SELECT * FROM payment_links WHERE booking_id=? ORDER BY id FOR UPDATE',[booking.id]);
  const link=links.find(row=>row.id===found[0].id&&row.link_id===token);
  if(!link||links.some(row=>row.booking_checkout_policy_version!==1))throw unavailable();
  assertLinkIdentity(booking,link);return {booking,link};
}
function verifiedTerminal(payment:any) {
  return !!payment.last_webhook_at&&(payment.status==='failed'&&['FAILED','DECLINED','RESTRICTED'].includes(payment.last_webhook_status)
    ||payment.status==='cancelled'&&['CANCELLED','ABANDONED','VOID'].includes(payment.last_webhook_status));
}

/** Creates a fixed, single-use local link from the booking's stored final price. No provider call. */
export async function issueCanonicalBookingPaymentLink(raw:z.infer<typeof issueSchema>) {
  const input=issueSchema.parse(raw);await schemaReady();
  const settings=await getMerchantPaymentSettings(input.merchantId);
  if(!settings||!isTapPaymentReady(settings))throw unavailable();
  const id=await transaction(async connection=>{
    const booking=await lockedBooking(connection,input.merchantId,input.bookingId);assertPrice(booking);
    if(!payable(booking)||input.amount!==booking.final_price)throw unavailable();
    const [links]=await connection.execute<any[]>('SELECT * FROM payment_links WHERE booking_id=? ORDER BY id FOR UPDATE',[booking.id]);
    if(links.length) {
      if(links.length!==1)throw unavailable();const link=links[0];assertLinkIdentity(booking,link);await assertAvailable(connection,link);return Number(link.id);
    }
    const [payments]=await connection.execute<any[]>('SELECT id FROM order_payments WHERE booking_id=? LIMIT 1 FOR UPDATE',[booking.id]);
    const [attempts]=await connection.execute<any[]>('SELECT id FROM booking_checkout_attempts WHERE booking_id=? LIMIT 1 FOR UPDATE',[booking.id]);
    if(payments.length||attempts.length)throw unavailable();
    const time=await now(connection),expiry=input.expiresAt?Date.parse(input.expiresAt):time+86_400_000;
    if(!Number.isFinite(expiry)||expiry<=time||expiry>time+7*86_400_000)throw unavailable();
    const token=`link_${randomBytes(16).toString('hex')}`;
    const [insert]=await connection.execute<any>(`INSERT INTO payment_links
      (merchant_id,booking_id,link_id,title,description,amount,currency,is_fixed_amount,max_usage_count,tap_payment_url,expires_at,booking_checkout_policy_version)
      VALUES (?,?,?,?,?,?,'SAR',1,1,?,?,1)`,[input.merchantId,booking.id,token,input.title,input.description||null,
      booking.final_price,publicPaymentUrls.link(token),new Date(expiry).toISOString().slice(0,19).replace('T',' ')]);
    return Number(insert.insertId);
  });
  const link=await getPaymentLinkById(id);if(!link||link.merchantId!==input.merchantId||link.bookingId!==input.bookingId)throw unavailable();
  return {linkId:link.linkId,paymentUrl:publicPaymentUrls.link(link.linkId),link};
}

/** The committed reservation fences every request UUID and every link for this booking. */
export async function createDurableBookingCheckout(raw:CheckoutInput):Promise<{paymentUrl:string}> {
  const input=checkoutSchema.parse(raw),phone=normalizeSaudiPhone(input.customerPhone);await schemaReady();
  const pool=await getPool();if(!pool)throw unavailable();
  const [scope]=await pool.execute<any[]>('SELECT merchant_id FROM payment_links WHERE link_id=?',[input.linkId]);
  if(scope.length!==1)throw unavailable();
  const settings=await getMerchantPaymentSettings(scope[0].merchant_id);
  if(!settings?.tapSecretKey||!isTapPaymentReady(settings))throw unavailable();
  const secret=settings.tapSecretKey,testMode=!!settings.tapTestMode;
  const reservation=await transaction(async connection=>{
    const {booking,link}=await lockedTarget(connection,input.linkId);
    if(booking.merchant_id!==scope[0].merchant_id||!payable(booking))throw unavailable();await assertAvailable(connection,link);
    const fingerprint=bookingCheckoutRequestFingerprint({merchantId:booking.merchant_id,bookingId:booking.id,linkId:link.id,
      serviceId:booking.service_id,amount:link.amount,currency:link.currency,customerName:input.customerName,
      customerPhone:phone,customerEmail:input.customerEmail||null,description:link.description||link.title,
      secret,testMode});
    const [attempts]=await connection.execute<any[]>(`SELECT * FROM booking_checkout_attempts WHERE booking_id=?
      AND (state IN ('dispatching','unknown','created') OR (payment_link_id=? AND request_id=?)) ORDER BY created_at,id FOR UPDATE`,
      [booking.id,link.id,input.checkoutAttemptId]);
    for(const attempt of attempts) {
      if(attempt.state!=='created'||attempt.merchant_id!==booking.merchant_id)throw unavailable();
      const [payments]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE id=? FOR UPDATE',[attempt.payment_id]);
      const payment=payments[0];
      if(!payment||payment.merchant_id!==booking.merchant_id||payment.booking_id!==booking.id||payment.order_id!=null
        ||payment.amount!==attempt.amount_minor||payment.currency!==attempt.currency
        ||readPaymentLinkId(payment.metadata)!==attempt.payment_link_id||!/^chg_[A-Za-z0-9_-]{3,250}$/.test(payment.tap_charge_id||''))throw unavailable();
      if(verifiedTerminal(payment)&&attempt.request_id!==input.checkoutAttemptId) {
        await connection.execute("UPDATE booking_checkout_attempts SET state='failed' WHERE id=? AND state='created'",[attempt.id]);continue;
      }
      if(attempt.request_hash!==fingerprint||!['pending','authorized'].includes(payment.status))throw unavailable();
      if(payment.expires_at&&(!Number.isFinite(databaseTimeEpoch(payment.expires_at))||databaseTimeEpoch(payment.expires_at)<=await now(connection)))throw unavailable();
      const charge=validateTapCheckoutCharge({id:payment.tap_charge_id,status:'INITIATED',amount:payment.amount/100,currency:payment.currency,
        live_mode:!testMode,transaction:{url:payment.tap_payment_url}},{amountInHalalas:link.amount,currency:'SAR',testMode});
      if(!charge)throw unavailable();return {kind:'reuse' as const,paymentUrl:charge.paymentUrl};
    }
    const [payments]=await connection.execute<any[]>('SELECT * FROM order_payments WHERE booking_id=? FOR UPDATE',[booking.id]);
    if(payments.some(payment=>payment.merchant_id!==booking.merchant_id||payment.order_id!=null||!verifiedTerminal(payment)))throw unavailable();
    const id=randomUUID(),reference=buildTapCheckoutIdempotentReference(link.id,input.checkoutAttemptId);
    await connection.execute(`INSERT INTO booking_checkout_attempts
      (id,merchant_id,booking_id,payment_link_id,request_id,request_hash,provider_reference,amount_minor,currency)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,booking.merchant_id,booking.id,link.id,input.checkoutAttemptId,fingerprint,reference,link.amount,link.currency]);
    return {kind:'dispatch' as const,id,reference,link};
  });
  if(reservation.kind==='reuse')return {paymentUrl:reservation.paymentUrl};
  const {link}=reservation;
  try {
    const response=await postTapCharge(secret,{amount:halalasToTapAmount(link.amount),currency:link.currency,
      customer:{first_name:input.customerName,email:input.customerEmail,phone:{country_code:'966',number:phone}},
      source:{id:'src_all'},redirect:{url:publicPaymentUrls.linkStatus(link.link_id)},post:{url:publicPaymentUrls.webhook()},
      description:link.description||link.title,metadata:{udf1:reservation.reference},
      reference:{transaction:reservation.reference,order:reservation.reference,idempotent:reservation.reference}});
    const charge=response.ok?validateTapCheckoutCharge(response.body,{amountInHalalas:link.amount,currency:'SAR',testMode}):null;
    if(!charge)throw unavailable();
    const available=await persistCharge(reservation.id,input,charge,phone);
    if(!available)throw unavailable();return {paymentUrl:charge.paymentUrl};
  } catch {
    await pool.execute("UPDATE booking_checkout_attempts SET state='unknown',failure_code='outcome_unverified' WHERE id=? AND state='dispatching'",[reservation.id]).catch(()=>undefined);
    throw unavailable();
  }
}

async function persistCharge(id:string,input:CheckoutInput,charge:ValidatedTapCheckoutCharge,phone:string) {
  return transaction(async connection=>{
    const {booking,link}=await lockedTarget(connection,input.linkId);
    const [attempts]=await connection.execute<any[]>('SELECT * FROM booking_checkout_attempts WHERE id=? FOR UPDATE',[id]);
    const attempt=attempts[0];
    if(!attempt||attempt.state!=='dispatching'||attempt.merchant_id!==booking.merchant_id||attempt.booking_id!==booking.id
      ||attempt.payment_link_id!==link.id||attempt.amount_minor!==link.amount||attempt.currency!==link.currency)throw unavailable();
    const [insert]=await connection.execute<any>(`INSERT INTO order_payments
      (merchant_id,booking_id,customer_phone,customer_name,customer_email,amount,currency,tap_charge_id,tap_payment_url,status,description,metadata,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,CASE WHEN ? IS NULL THEN NULL ELSE TIMESTAMPADD(MICROSECOND,? * 1000,UTC_TIMESTAMP(3)) END)`,
      [booking.merchant_id,booking.id,`+966${phone}`,input.customerName,input.customerEmail||null,link.amount,link.currency,
      charge.id,charge.paymentUrl,link.description||link.title,JSON.stringify({paymentLinkId:link.id}),charge.expiresInMs,charge.expiresInMs]);
    const [updated]=await connection.execute<any>("UPDATE booking_checkout_attempts SET state='created',payment_id=? WHERE id=? AND state='dispatching'",[insert.insertId,id]);
    if(updated.affectedRows!==1)throw unavailable();
    // Preserve the provider effect after cancellation, but withhold an unusable checkout URL.
    let available=payable(booking);try{await assertAvailable(connection,link);}catch{available=false;}
    return available;
  });
}
