import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { getSallaConnectionByMerchantId } from '../db';
import { assertCheckoutAgreementSchema,assertCheckoutIdentity,type CheckoutIdentity } from './checkout-agreements';
import { hasCheckoutOfferEvidence } from './checkout-offer-evidence';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';
import { isSalesRefusal,isShortAffirmation,normalizeCustomerText } from './customer-decision';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { sallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { requireMinor } from '../../shared/product-money';
import { cartContext } from '../integrations/salla-checkout-transport';
import { sallaCatalogAuthority,selectSallaOrderProduct,assertSallaOrderSelection,sallaProductSelectionSchema } from '../integrations/salla-catalog';
import { assertSallaOrderAuthority } from '../integrations/salla-order-projection';
import { assertSallaCheckoutCartSchema,runSallaCheckoutCart,readSallaCheckoutCart } from '../integrations/salla-checkout-carts';
import { currentInboundExecution } from '../messaging/inbound-context';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';

export const SALLA_CART_PROVIDER='salla_cart';
export const sallaConversationSelection=z.array(z.object({productId:z.number().int().positive().max(2147483647),quantity:z.number().int().min(1).max(10000)}).strict()).min(1).max(20);
const id=z.number().int().positive().max(2147483647);
const snapshotSchema=z.object({version:z.literal(1),context:cartContext,connectionId:id,ownerUserId:id,ownershipVersion:z.number().int().nonnegative(),
  sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),items:z.array(sallaProductSelectionSchema).min(1).max(20),requestId:z.string().uuid()}).strict();
type Snapshot=z.infer<typeof snapshotSchema>;
type Cart=Awaited<ReturnType<typeof runSallaCheckoutCart>>;
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export const SALLA_CART_CHANGED='تغيّرت تفاصيل الاختيار أو انتهت صلاحيته. أرسل المنتجات والكميات من جديد لأعرض ملخصًا تراجعه قبل تجهيز السلة.';
export const SALLA_CART_UNCERTAIN='تجهيز السلة يحتاج مراجعة من المتجر. لا أستطيع تأكيد الرابط الآن، ولن أنشئ محاولة بديلة تلقائيًا.';
export const SALLA_CART_DECLINED='توقفت عن تجهيز هذا الاختيار أو مشاركة رابطه. هذا لا يلغي طلبًا أو دفعة أتممتها داخل المتجر.';
export const SALLA_CART_CLARIFY='اذكر المنتجات والكميات المطلوبة بوضوح، لأعرض ملخصًا توافق عليه قبل تجهيز رابط مراجعتها داخل المتجر.';
export const isSallaCartConsent=(message:string)=>isShortAffirmation(message)||/^(?:جهز السلة|جهز السله|ارسل رابط السله|prepare the cart)[.!\s]*$/.test(normalizeCustomerText(message));
const label=(v:string)=>v.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\[\]<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,100);
export function sallaCartOfferText(quoteId:number,snapshot:Snapshot){
  return `اختيارك للمراجعة [SC-${quoteId}]\n\n${snapshot.items.map(p=>`• ${label(p.name)} × ${p.quantity}`).join('\n')}\n\n`
    +'السعر النهائي والتوصيل والخصومات تُراجع داخل المتجر قبل إتمام الشراء. تجهيز السلة لا ينشئ طلبًا ولا يثبت الدفع أو يحجز المخزون.\n'
    +'هل أجهز سلة بهذه المنتجات والكميات وأرسل رابط مراجعتها؟ رد بنعم، أو اذكر المنتجات والكميات بعد التعديل.';
}
function linkText(quoteId:number,cart:Cart){return `رابط مراجعة اختيارك [SC-${quoteId}]\n${cart.checkoutUrl}\n\nراجع المنتجات والكميات والسعر النهائي والتوصيل داخل المتجر قبل تأكيد الشراء والدفع. تجهيز هذا الرابط لا يعني اكتمال طلب أو دفع.`;}
async function tx<T>(work:(c:PoolConnection)=>Promise<T>){
  const pool=await getPool();if(!pool)throw Error('Checkout storage unavailable');const c=await pool.getConnection();let reusable=true,committing=false;
  try{await c.beginTransaction();const result=await work(c);committing=true;await c.commit();committing=false;return result;}
  catch(e){if(committing){reusable=false;c.destroy();}else try{await c.rollback();}catch{reusable=false;c.destroy();}throw e;}
  finally{if(reusable)c.release();}
}
async function owner(c:PoolConnection,input:CheckoutIdentity){
  if(!normalizeCampaignPhone(input.customerPhone)||input.customerPhone.startsWith('group_'))throw Error('Private customer required');
  const [rows]=await c.execute<any[]>(`SELECT m.userId FROM merchants m JOIN users u ON u.id=m.userId AND u.account_status='active'
    WHERE m.id=? AND m.status='active' FOR SHARE`,[id.parse(input.merchantId)]);
  if(rows.length!==1)throw Error('Merchant authority unavailable');
  const source=await assertCheckoutIdentity(c,input);
  const [fresh]=await c.execute<any[]>(`SELECT id FROM messages WHERE id=? AND conversationId=?
    AND createdAt>=TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP()) AND createdAt<=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP())`,[input.incomingMessageId,input.conversationId]);
  if(fresh.length!==1)throw Error('Source expired');
  const [versions]=await c.execute<any[]>('SELECT handoff_version FROM conversations WHERE id=? AND merchantId=?',[input.conversationId,input.merchantId]);
  return {userId:Number(rows[0].userId),version:Number(versions[0].handoff_version),content:source.content};
}
async function provider(merchantId:number){
  const connection=await getSallaConnectionByMerchantId(merchantId);
  if(!connection||connection.syncStatus!=='active')throw Error('Salla unavailable');
  const authority=await sallaCatalogAuthority(merchantId,connection.accessToken);
  return {authority,context:cartContext.parse({storeId:authority.storeId,storeUrl:connection.storeUrl})};
}
function readSnapshot(q:any){
  const raw=decode(q.external_snapshot),snapshot=snapshotSchema.parse(raw?.value);
  if(raw.digest!==digest(snapshot)||digest(raw.value)!==digest(snapshot))throw Error('Selection changed');
  sallaCheckoutCartInput.parse({requestId:snapshot.requestId,items:snapshot.items.map(p=>({productId:p.productId,quantity:p.quantity}))});
  return snapshot;
}
async function latest(c:PoolConnection,input:CheckoutIdentity){
  const [rows]=await c.execute<any[]>(`SELECT *,offer_expires_at>UTC_TIMESTAMP(3) AS valid FROM sales_quotations
    WHERE merchant_id=? AND conversation_id=? AND customer_phone=? ORDER BY id DESC LIMIT 1 FOR UPDATE`,[input.merchantId,input.conversationId,input.customerPhone]);
  return rows[0];
}
async function currentSelection(c:PoolConnection,input:CheckoutIdentity,snapshot:Snapshot,p:Awaited<ReturnType<typeof provider>>){
  await assertSallaOrderAuthority(c,p.authority,true);
  if(p.authority.connectionId!==snapshot.connectionId||digest(p.context)!==digest(snapshot.context))throw Error('Salla store changed');
  const [rows]=await c.execute<any[]>('SELECT storeUrl FROM salla_connections WHERE id=? AND merchantId=? FOR SHARE',[snapshot.connectionId,input.merchantId]);
  if(rows.length!==1||rows[0].storeUrl!==snapshot.context.storeUrl)throw Error('Salla store URL changed');
  await assertSallaOrderSelection(c,p.authority,snapshot.items);
}
async function sourceUnchanged(c:PoolConnection,input:CheckoutIdentity,text:string){
  const [rows]=await c.execute<any[]>('SELECT content FROM messages WHERE id=? AND conversationId=? AND direction=\'incoming\' FOR SHARE',[input.incomingMessageId,input.conversationId]);
  if(rows.length!==1||rows[0].content!==text||(await assertCheckoutIdentity(c,input)).content!==text)throw Error('Source changed');
}
async function schema(){await assertCheckoutAgreementSchema();await assertSallaCheckoutCartSchema();}

/** A customer reviews identifiers and quantities first. There is no provider
 * write, final invoice approval or sale recorded by preparing this offer. */
export async function prepareSallaConversationOffer(input:CheckoutIdentity,raw:unknown){
  await schema();const selection=sallaCheckoutCartInput.parse({requestId:randomUUID(),items:raw}).items;
  const original=await tx(c=>owner(c,input));if(isSalesRefusal(original.content))return SALLA_CART_DECLINED;
  const p=await provider(input.merchantId),items=[];
  for(const item of selection)items.push(await selectSallaOrderProduct(p.authority,item.productId,item.quantity));
  const snapshot=snapshotSchema.parse({version:1,context:p.context,connectionId:p.authority.connectionId,ownerUserId:original.userId,
    ownershipVersion:original.version,sourceDigest:digest(original.content),items,requestId:randomUUID()});
  return tx(async c=>{
    const current=await owner(c,input),previous=await latest(c,input);
    if(current.userId!==original.userId||current.version!==original.version||current.content!==original.content)throw Error('Source changed');
    if(previous?.source_message_id===input.incomingMessageId){
      if(previous.external_provider!==SALLA_CART_PROVIDER||!previous.valid||!['sent','viewed'].includes(previous.status)||previous.execution_state!=='ready')throw Error('Conflicting offer');
      const saved=readSnapshot(previous);
      if(saved.sourceDigest!==digest(current.content)||digest(saved.items)!==digest(snapshot.items)||saved.ownershipVersion!==current.version||saved.ownerUserId!==current.userId)throw Error('Selection conflict');
      await currentSelection(c,input,saved,p);await sourceUnchanged(c,input,current.content);return sallaCartOfferText(previous.id,saved);
    }
    if(previous?.external_provider===SALLA_CART_PROVIDER&&['processing','unknown'].includes(previous.execution_state))return SALLA_CART_UNCERTAIN;
    await currentSelection(c,input,snapshot,p);await sourceUnchanged(c,input,current.content);
    await c.execute(`UPDATE sales_quotations SET status='expired' WHERE merchant_id=? AND conversation_id=? AND status IN ('sent','viewed') AND order_id IS NULL
      AND (checkout_snapshot IS NOT NULL OR external_snapshot IS NOT NULL)`,[input.merchantId,input.conversationId]);
    const subtotal=requireMinor(snapshot.items.reduce((n,p)=>n+p.price*p.quantity,0));
    const [r]=await c.execute<any>(`INSERT INTO sales_quotations (merchant_id,customer_phone,quotation_number,items,subtotal,tax_amount,total,currency,
      conversation_id,source_message_id,external_provider,external_snapshot,execution_state,offer_expires_at)
      VALUES (?,?,?,?,?,0,?,'SAR',?,?,?,?,'ready',TIMESTAMPADD(MINUTE,30,UTC_TIMESTAMP(3)))`,
    [input.merchantId,input.customerPhone,`SCART-${input.merchantId}-${input.incomingMessageId}`,JSON.stringify(snapshot.items),subtotal/100,subtotal/100,
      input.conversationId,input.incomingMessageId,SALLA_CART_PROVIDER,JSON.stringify({value:snapshot,digest:digest(snapshot)})]);
    return sallaCartOfferText(Number(r.insertId),snapshot);
  });
}
async function verifiedClaim(c:PoolConnection,input:CheckoutIdentity,quoteId:number,p:Awaited<ReturnType<typeof provider>>,claim?:{snapshot:Snapshot;consent:string}){
  const current=await owner(c,input),q=await latest(c,input);
  if(!q||q.id!==quoteId||q.external_provider!==SALLA_CART_PROVIDER||!q.valid||!['sent','viewed'].includes(q.status)||q.currency!=='SAR'
    ||q.order_id!==null||q.external_order_key!==null||q.external_reconciliation!==null||q.projection_pending!==0)throw Error('Offer unavailable');
  const snapshot=readSnapshot(q);
  if(current.userId!==snapshot.ownerUserId||current.version!==snapshot.ownershipVersion||!isSallaCartConsent(current.content)||isSalesRefusal(current.content)
    ||q.source_message_id>=input.incomingMessageId||claim&&(digest(snapshot)!==digest(claim.snapshot)||current.content!==claim.consent))throw Error('Consent changed');
  const [sources]=await c.execute<any[]>(`SELECT content FROM messages WHERE id=? AND conversationId=? AND direction='incoming'`,[q.source_message_id,input.conversationId]);
  if(sources.length!==1||digest(sources[0].content)!==snapshot.sourceDigest)throw Error('Selection source changed');
  if(!await hasCheckoutOfferEvidence(c,input,q.source_message_id,sallaCartOfferText(q.id,snapshot)))throw Error('Offer delivery unavailable');
  await currentSelection(c,input,snapshot,p);await sourceUnchanged(c,input,current.content);
  const [lockedSources]=await c.execute<any[]>(`SELECT content FROM messages WHERE id=? AND conversationId=? AND direction='incoming' FOR SHARE`,[q.source_message_id,input.conversationId]);
  if(lockedSources.length!==1||digest(lockedSources[0].content)!==snapshot.sourceDigest)throw Error('Selection source changed');
  if(!await hasCheckoutOfferEvidence(c,input,q.source_message_id,sallaCartOfferText(q.id,snapshot)))throw Error('Offer delivery changed');
  if(claim&&(q.consent_message_id!==input.incomingMessageId||q.execution_attempt_id!==snapshot.requestId||!['processing','succeeded'].includes(q.execution_state)))throw Error('Claim changed');
  return {q,snapshot,consent:current.content};
}
function cartInput(snapshot:Snapshot){return {requestId:snapshot.requestId,items:snapshot.items.map(p=>({productId:p.productId,quantity:p.quantity}))};}
export async function acceptSallaConversationOffer(input:CheckoutIdentity,quoteId:number){
  await schema();
  const intent=await tx(async c=>{
    const current=await owner(c,input),q=await latest(c,input);
    if(!q||q.id!==quoteId||q.external_provider!==SALLA_CART_PROVIDER)throw Error('Offer unavailable');
    if(isSalesRefusal(current.content)){await c.execute("UPDATE sales_quotations SET status='rejected' WHERE id=?",[q.id]);return 'declined';}
    if(!isSallaCartConsent(current.content))return 'clarify';
    return 'accept';
  });
  if(intent==='declined')return SALLA_CART_DECLINED;if(intent==='clarify')return SALLA_CART_CLARIFY;
  let claimed=false,attemptingClaim=false;
  try{
    const p=await provider(input.merchantId);
    const claim=await tx(async c=>{
      const result=await verifiedClaim(c,input,quoteId,p),q=result.q;
      if(q.execution_state==='succeeded'){
        if(q.consent_message_id!==input.incomingMessageId||q.execution_attempt_id!==result.snapshot.requestId)throw Error('Replay mismatch');return result;
      }
      if(q.execution_state!=='ready'||q.consent_message_id!==null||q.external_result!==null||q.execution_attempt_id!==null||q.execution_started_at!==null)throw Error('Claim unavailable');
      await currentInboundExecution()?.assertOwned();
      attemptingClaim=true;
      await c.execute(`UPDATE sales_quotations SET status='viewed',consent_message_id=?,execution_state='processing',execution_attempt_id=?,execution_started_at=UTC_TIMESTAMP(3)
        WHERE id=?`,[input.incomingMessageId,result.snapshot.requestId,q.id]);return result;
    });
    claimed=true;
    const authorize=async()=>{const current=await provider(input.merchantId);await tx(c=>verifiedClaim(c,input,quoteId,current,claim));};
    const reader=claim.q.execution_state==='succeeded'?readSallaCheckoutCart:runSallaCheckoutCart;
    const result=await reader(cartInput(claim.snapshot),input.merchantId,claim.snapshot.ownerUserId,authorize);
    const value={cart:(({replayed,...cart})=>cart)(result),text:linkText(quoteId,result)};
    await tx(async c=>{
      const {q}=await verifiedClaim(c,input,quoteId,p,claim);
      if(q.execution_state==='succeeded'){
        const saved=decode(q.external_result);if(saved?.digest!==digest(saved.value)||digest(saved.value)!==digest(value))throw Error('Result changed');return;
      }
      await c.execute("UPDATE sales_quotations SET execution_state='succeeded',external_result=? WHERE id=? AND execution_state='processing'",[JSON.stringify({value,digest:digest(value)}),quoteId]);
    });
    return value.text;
  }catch{
    // A saved claim or lost commit acknowledgement is never a permit to POST again.
    const pool=(await getPool())!;
    if(attemptingClaim||claimed)await pool.execute(`UPDATE sales_quotations SET execution_state='unknown' WHERE id=? AND merchant_id=? AND conversation_id=?
      AND external_provider=? AND execution_state='processing'`,[quoteId,input.merchantId,input.conversationId,SALLA_CART_PROVIDER]);
    const [rows]=await pool.execute<any[]>('SELECT execution_state FROM sales_quotations WHERE id=? AND merchant_id=?',[quoteId,input.merchantId]);
    return claimed||['processing','succeeded','unknown'].includes(rows[0]?.execution_state)?SALLA_CART_UNCERTAIN:SALLA_CART_CHANGED;
  }
}

/** Called immediately before the ordinary channel authority check. A saved cart
 * link is re-read through GET only; this gate can never create a missing cart. */
export async function canDispatchSallaCheckoutReply(input:SendMerchantWhatsAppInput){
  if(!input.replyGuard?.incomingMessageId)return !/\[SC-\d+\]/.test(input.text||'');
  const pool=await getPool();if(!pool)return false;
  const identity={merchantId:input.merchantId,conversationId:input.replyGuard.conversationId,incomingMessageId:input.replyGuard.incomingMessageId,customerPhone:input.to};
  const [rows]=await pool.execute<any[]>(`SELECT * FROM sales_quotations WHERE merchant_id=? AND conversation_id=? AND external_provider=?
    AND (source_message_id=? OR consent_message_id=?) ORDER BY id DESC LIMIT 1`,[identity.merchantId,identity.conversationId,SALLA_CART_PROVIDER,identity.incomingMessageId,identity.incomingMessageId]);
  const q=rows[0],text=input.text||'',marker=/\[SC-\d+\]/.test(text);
  if(!q)return !marker;
  // A separate greeting and safe failure response are not a checkout link.
  if(!marker&&!/https?:\/\/[^\s]+\/checkout\//i.test(text))return true;
  if(input.kind!=='text'||!normalizeCampaignPhone(input.to)||normalizeCampaignPhone(q.customer_phone)!==normalizeCampaignPhone(input.to))return false;
  identity.customerPhone=q.customer_phone;
  try{
    const p=await provider(identity.merchantId),snapshot=readSnapshot(q);
    if(q.source_message_id===identity.incomingMessageId){
      if(text!==sallaCartOfferText(q.id,snapshot))return false;
      return await tx(async c=>{
        const current=await owner(c,identity),row=await latest(c,identity);
        if(!row||row.id!==q.id||!row.valid||row.execution_state!=='ready'||!['sent','viewed'].includes(row.status)||row.consent_message_id!==null
          ||digest(readSnapshot(row))!==digest(snapshot)||current.version!==snapshot.ownershipVersion||current.userId!==snapshot.ownerUserId||digest(current.content)!==snapshot.sourceDigest)return false;
        await currentSelection(c,identity,snapshot,p);await sourceUnchanged(c,identity,current.content);return true;
      });
    }
    if(q.execution_state!=='succeeded')return false;
    const saved=decode(q.external_result);if(!saved?.value||saved.digest!==digest(saved.value)||saved.value.text!==text)return false;
    const claim=await tx(c=>verifiedClaim(c,identity,q.id,p));
    if(claim.q.execution_state!=='succeeded'||claim.q.consent_message_id!==identity.incomingMessageId||claim.q.execution_attempt_id!==snapshot.requestId)return false;
    const authorize=async()=>{
      const current=await provider(identity.merchantId);await tx(async c=>{const r=await verifiedClaim(c,identity,q.id,current,claim);
        if(r.q.execution_state!=='succeeded'||digest(decode(r.q.external_result))!==digest(saved))throw Error('Link changed');});
    };
    const result=await readSallaCheckoutCart(cartInput(snapshot),identity.merchantId,snapshot.ownerUserId,authorize);
    return result.replayed&&digest((({replayed,...cart})=>cart)(result))===digest(saved.value.cart)&&linkText(q.id,result)===text;
  }catch{return false;}
}
