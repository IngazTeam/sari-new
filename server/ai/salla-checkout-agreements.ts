import { semanticAction, semanticQuoteMatches, semanticIdentityMatches } from './conversation-understanding-context';
import { withStoredUnderstanding } from './conversation-understanding';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { databaseTimeEpoch } from '../db/time';
import { getSallaConnectionByMerchantId } from '../db';
import { assertCheckoutAgreementSchema,assertCheckoutIdentity,type CheckoutIdentity } from './checkout-agreements';
import { hasCheckoutOfferEvidence,recordedCheckoutOfferEvidence } from './checkout-offer-evidence';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';
import { isExplicitPurchaseInstruction,isSalesRefusal,isShortAffirmation,normalizeCustomerText } from './customer-decision';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { sallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { requireMinor } from '../../shared/product-money';
import { cartContext,readCheckoutCart } from '../integrations/salla-checkout-transport';
import { sallaCatalogAuthority,selectSallaOrderProduct,assertSallaOrderSelection,sallaProductSelectionSchema } from '../integrations/salla-catalog';
import { assertSallaOrderAuthority } from '../integrations/salla-order-projection';
import { assertSallaCheckoutCartSchema,runSallaCheckoutCart,readSallaCheckoutCart,readSallaCartSnapshot } from '../integrations/salla-checkout-carts';
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
export const isSallaCartResumeRequest=(message:string)=>semanticAction(message, ['confirm_offer'], 'salla_cart') ?? (/^(?:ارسل رابط السله|اعد ارسال رابط السله|ارسل رابط السله مره اخر[ىي]|send the cart link|resend the cart link)[.!\s]*$/.test(normalizeCustomerText(message)));
export const isSallaCartConsent=(message:string)=>semanticAction(message, ['confirm_offer'], 'salla_cart') ?? (isShortAffirmation(message)||isSallaCartResumeRequest(message)||/^(?:جهز السلة|جهز السله|prepare the cart)[.!\s]*$/.test(normalizeCustomerText(message)));
export const isSallaCartEdit=(message:string)=>semanticAction(message, ['modify_offer'], 'salla_cart') ?? (!isSalesRefusal(message)&&/^(?:عدل|غير|بدل|خلي|change|replace|make it)(?:\s|$)/.test(normalizeCustomerText(message)));
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
    if(previous?.external_provider===SALLA_CART_PROVIDER&&previous.execution_state==='processing')return SALLA_CART_UNCERTAIN;
    await currentSelection(c,input,snapshot,p);await sourceUnchanged(c,input,current.content);
    let superseded:Awaited<ReturnType<typeof supersessionProof>>|null=null;
    if(previous?.external_provider===SALLA_CART_PROVIDER&&previous.execution_state==='unknown'){
      try{superseded=await supersessionProof(c,input,previous,current,p);}catch{return SALLA_CART_UNCERTAIN;}
    }
    await c.execute(`UPDATE sales_quotations SET status='expired' WHERE merchant_id=? AND conversation_id=? AND status IN ('sent','viewed') AND order_id IS NULL
      AND (checkout_snapshot IS NOT NULL OR external_snapshot IS NOT NULL)`,[input.merchantId,input.conversationId]);
    const subtotal=requireMinor(snapshot.items.reduce((n,p)=>n+p.price*p.quantity,0));
    const [r]=await c.execute<any>(`INSERT INTO sales_quotations (merchant_id,customer_phone,quotation_number,items,subtotal,tax_amount,total,currency,
      conversation_id,source_message_id,external_provider,external_snapshot,execution_state,offer_expires_at)
      VALUES (?,?,?,?,?,0,?,'SAR',?,?,?,?,'ready',TIMESTAMPADD(MINUTE,30,UTC_TIMESTAMP(3)))`,
    [input.merchantId,input.customerPhone,`SCART-${input.merchantId}-${input.incomingMessageId}`,JSON.stringify(snapshot.items),subtotal/100,subtotal/100,
      input.conversationId,input.incomingMessageId,SALLA_CART_PROVIDER,JSON.stringify({value:snapshot,digest:digest(snapshot)})]);
    if(superseded){
      const value=supersessionSchema.parse({...superseded,replacementQuoteId:Number(r.insertId),replacementSnapshotDigest:digest(snapshot),supersededAt:new Date().toISOString()});
      const [changed]=await c.execute<any>(`UPDATE sales_quotations SET status='expired',external_reconciliation=?
        WHERE id=? AND merchant_id=? AND execution_state='unknown' AND external_reconciliation IS NULL`,
      [JSON.stringify({value,digest:digest(value)}),previous.id,input.merchantId]);
      if(changed.affectedRows!==1)throw Error('Superseded agreement changed');
    }
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

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const supersessionSchema=z.object({version:z.literal('salla-cart-supersede.v1'),merchantId:id,conversationId:id,quoteId:id,
  sourceMessageId:id,consentMessageId:id,incomingMessageId:id,requestId:z.string().uuid(),ownerUserId:id,ownershipVersion:z.number().int().nonnegative(),
  snapshotDigest:hash,consentDigest:hash,requestDigest:hash,recipientDigest:hash,offerEvidenceDigest:hash,
  operationId:id,operationState:z.enum(['ready','rejected']),operationDigest:hash,replacementQuoteId:id,replacementSnapshotDigest:hash,
  remoteCancellation:z.literal('not_performed'),supersededAt:z.string().datetime({precision:3})}).strict();

/** Retire only the local agreement. A completed guest cart may still exist at
 * Salla; this neither cancels it nor reuses its consent for the new selection.
 * Missing/active/ambiguous ledger entries must remain under review. */
async function supersessionProof(c:PoolConnection,input:CheckoutIdentity,q:any,current:Awaited<ReturnType<typeof owner>>,p:Awaited<ReturnType<typeof provider>>){
  if(!['viewed','rejected','expired'].includes(q.status)||q.currency!=='SAR'||q.order_id!==null||q.external_order_key!==null
    ||q.projection_pending!==0||q.external_result!==null||q.external_reconciliation!==null||!q.execution_started_at
    ||!id.safeParse(q.consent_message_id).success||q.source_message_id>=q.consent_message_id||q.consent_message_id>=input.incomingMessageId
    ||!(isExplicitPurchaseInstruction(current.content)||isSallaCartEdit(current.content)))throw Error('Replacement unavailable');
  const snapshot=readSnapshot(q),selection=cartInput(snapshot);
  if(snapshot.ownerUserId!==current.userId||snapshot.ownershipVersion!==current.version||q.execution_attempt_id!==snapshot.requestId
    ||snapshot.connectionId!==p.authority.connectionId||digest(snapshot.context)!==digest(p.context))throw Error('Old agreement authority changed');
  const [sources]=await c.execute<any[]>(`SELECT id,content FROM messages WHERE conversationId=? AND direction='incoming'
    AND id IN (?,?) ORDER BY id FOR SHARE`,[input.conversationId,q.source_message_id,q.consent_message_id]);
  if(sources.length!==2||sources[0].id!==q.source_message_id||digest(sources[0].content)!==snapshot.sourceDigest
    ||sources[1].id!==q.consent_message_id||!await withStoredUnderstanding(c,{...input,incomingMessageId:q.consent_message_id},async()=>isSallaCartConsent(sources[1].content)&&!isSalesRefusal(sources[1].content),true))throw Error('Old consent changed');
  const evidence=await recordedCheckoutOfferEvidence(c,{...input,incomingMessageId:q.consent_message_id},q.source_message_id,sallaCartOfferText(q.id,snapshot));
  if(!evidence)throw Error('Old delivery unavailable');
  const [rows]=await c.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=? FOR SHARE',[input.merchantId,snapshot.requestId]);
  const operation=rows[0];
  if(rows.length!==1||!['ready','rejected'].includes(operation.state)||operation.actor_user_id!==snapshot.ownerUserId
    ||operation.request_hash!==digest(selection.items)||!z.string().uuid().safeParse(operation.attempt_token).success)throw Error('Cart is not terminal');
  if(operation.state==='rejected'){
    // Rejection is recorded only before dispatch. A snapshot/result would
    // contradict that boundary, so it cannot authorize another selection.
    if(operation.snapshot!==null||operation.result_json!==null)throw Error('Rejected cart has external evidence');
  }else{
    const saved=readSallaCartSnapshot(operation,selection),result=decode(operation.result_json),v=result?.value;
    if(digest(saved)!==digest({version:1,context:snapshot.context,connectionId:snapshot.connectionId,items:snapshot.items})
      ||!v||result.digest!==digest(v))throw Error('Completed cart changed');
    // Validate historical evidence without requiring old catalog availability
    // or contacting Salla. The new selection has its own current catalog check.
    const normalized=readCheckoutCart({success:true,status:200,data:{id:v.cartId,store_id:saved.context.storeId,
      checkout_url:v.checkoutUrl,currency:{code:v.currency},amounts:{total:{amount:{value:v.observedTotalMinor/100,currency:v.currency}}},
      items:v.items.map((item:any)=>({id:item.cartItemId,product_id:item.productId,sku:item.sku,quantity:item.quantity,options:[]}))}},
    saved.context,saved.items.map(item=>({externalId:item.externalId,sku:item.sku,quantity:item.quantity})),v.cartId);
    if(digest(normalized)!==result.digest)throw Error('Invalid completed cart');
  }
  await sourceUnchanged(c,input,current.content);
  return {version:'salla-cart-supersede.v1',merchantId:input.merchantId,conversationId:input.conversationId,quoteId:q.id,
    sourceMessageId:q.source_message_id,consentMessageId:q.consent_message_id,incomingMessageId:input.incomingMessageId,requestId:snapshot.requestId,
    ownerUserId:current.userId,ownershipVersion:current.version,snapshotDigest:digest(snapshot),consentDigest:digest(sources[1].content),
    requestDigest:digest(current.content),recipientDigest:digest(input.customerPhone),offerEvidenceDigest:evidence,
    operationId:operation.id,operationState:operation.state,operationDigest:digest(operation),remoteCancellation:'not_performed'};
}
const resumeSchema=z.object({version:z.literal('salla-cart-resume.v1'),merchantId:id,conversationId:id,quoteId:id,
  sourceMessageId:id,consentMessageId:id,incomingMessageId:id,requestId:z.string().uuid(),
  snapshotDigest:hash,consentDigest:hash,requestDigest:hash,recipientDigest:hash,offerEvidenceDigest:hash,
  resultDigest:hash,resumedAt:z.string().datetime({precision:3})}).strict();

/** The original agreement stays immutable. Only the latest explicit request may
 * authorize another ordinary reply, using its own inbound/outbox identity. */
async function checkedResume(input:CheckoutIdentity,quoteId:number,save:boolean,expectedText?:string){
  await schema();const p=await provider(input.merchantId);
  const check=async(c:PoolConnection)=>{
    const current=await owner(c,input),q=await latest(c,input);
    if(!q||q.id!==quoteId||q.external_provider!==SALLA_CART_PROVIDER||!q.valid||q.status!=='viewed'||q.currency!=='SAR'
      ||!['unknown','succeeded'].includes(q.execution_state)||q.order_id!==null||q.external_order_key!==null||q.projection_pending!==0
      ||!id.safeParse(q.consent_message_id).success||q.consent_message_id>=input.incomingMessageId||!q.execution_started_at
      ||!isSallaCartResumeRequest(current.content)||isSalesRefusal(current.content))throw Error('Resume unavailable');
    const snapshot=readSnapshot(q);
    if(current.userId!==snapshot.ownerUserId||current.version!==snapshot.ownershipVersion||q.execution_attempt_id!==snapshot.requestId
      ||q.source_message_id>=q.consent_message_id)throw Error('Agreement changed');
    await currentSelection(c,input,snapshot,p);
    const [sources]=await c.execute<any[]>(`SELECT id,content FROM messages WHERE conversationId=? AND direction='incoming'
      AND id IN (?,?) ORDER BY id FOR SHARE`,[input.conversationId,q.source_message_id,q.consent_message_id]);
    if(sources.length!==2||sources[0].id!==q.source_message_id||digest(sources[0].content)!==snapshot.sourceDigest
      ||sources[1].id!==q.consent_message_id||!await withStoredUnderstanding(c,{...input,incomingMessageId:q.consent_message_id},async()=>isSallaCartConsent(sources[1].content)&&!isSalesRefusal(sources[1].content),true))throw Error('Consent unavailable');
    // Any intervening edit, refusal or unrelated response requires a new offer.
    // Limit work even when the customer repeatedly requests the same link.
    const [between]=await c.execute<any[]>(`SELECT id,content FROM messages WHERE conversationId=? AND direction='incoming'
      AND id>? AND id<? ORDER BY id LIMIT 21 FOR SHARE`,[input.conversationId,q.consent_message_id,input.incomingMessageId]);
    if(between.length>20)throw Error('Intervening message');
    for(const message of between)if(!await withStoredUnderstanding(c,{...input,incomingMessageId:message.id},async()=>isSallaCartResumeRequest(message.content),true))throw Error('Intervening message');
    const evidence=await recordedCheckoutOfferEvidence(c,{...input,incomingMessageId:q.consent_message_id},q.source_message_id,sallaCartOfferText(q.id,snapshot));
    if(!evidence)throw Error('Original delivery unavailable');
    const base={merchantId:input.merchantId,conversationId:input.conversationId,quoteId:q.id,sourceMessageId:q.source_message_id,
      consentMessageId:q.consent_message_id,requestId:snapshot.requestId,snapshotDigest:digest(snapshot),consentDigest:digest(sources[1].content),
      recipientDigest:digest(input.customerPhone)};
    let previous:z.infer<typeof resumeSchema>|null=null;
    if(q.external_reconciliation!==null){
      const raw=decode(q.external_reconciliation);previous=resumeSchema.parse(raw?.value);
      if(raw.digest!==digest(previous)||digest(raw.value)!==raw.digest||q.execution_state!=='succeeded'
        ||Object.entries(base).some(([k,v])=>(previous as any)[k]!==v)||previous.incomingMessageId>input.incomingMessageId
        ||previous.incomingMessageId<=q.consent_message_id||previous.resultDigest!==decode(q.external_result)?.digest)throw Error('Resume evidence changed');
      const [requests]=await c.execute<any[]>("SELECT content FROM messages WHERE id=? AND conversationId=? AND direction='incoming' FOR SHARE",[previous.incomingMessageId,input.conversationId]);
      if(requests.length!==1||digest(requests[0].content)!==previous.requestDigest||!isSallaCartResumeRequest(requests[0].content))throw Error('Resume source changed');
    }
    if(!save&&previous?.incomingMessageId!==input.incomingMessageId)throw Error('No current resume authorization');
    if(q.execution_state==='unknown'&&q.external_result!==null)throw Error('Ambiguous result');
    await sourceUnchanged(c,input,current.content);
    return {q,snapshot,base,evidence,previous,request:current.content};
  };
  const first=await tx(check);
  const authorize=async()=>{
    await currentInboundExecution()?.assertOwned();
    await tx(async c=>{const now=await check(c);if(digest(now.q)!==digest(first.q)||now.request!==first.request)throw Error('Resume changed');});
  };
  // This reader cannot reserve, create, add to or recover an unready cart.
  const cart=await readSallaCheckoutCart(cartInput(first.snapshot),input.merchantId,first.snapshot.ownerUserId,authorize);
  const value={cart:(({replayed,...result})=>result)(cart),text:linkText(quoteId,cart)};
  if(expectedText!==undefined&&expectedText!==value.text)throw Error('Resume text changed');
  await currentInboundExecution()?.assertOwned();
  return tx(async c=>{
    const now=await check(c);
    if(now.request!==first.request||digest(now.snapshot)!==digest(first.snapshot))throw Error('Resume changed');
    // Keep the durable cart proof present and unchanged through local save (or
    // the send decision), including deletion/corruption while GET was in flight.
    const [carts]=await c.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=? FOR SHARE',[input.merchantId,now.snapshot.requestId]);
    const savedCart=carts[0],selection=cartInput(now.snapshot);
    if(carts.length!==1||savedCart.state!=='ready'||savedCart.actor_user_id!==now.snapshot.ownerUserId
      ||savedCart.request_hash!==digest(selection.items))throw Error('Saved cart unavailable');
    const cartSnapshot=readSallaCartSnapshot(savedCart,selection),cartResult=decode(savedCart.result_json);
    if(digest(cartSnapshot)!==digest({version:1,context:now.snapshot.context,connectionId:now.snapshot.connectionId,items:now.snapshot.items})
      ||cartResult?.digest!==digest(cartResult?.value)||digest(cartResult?.value)!==digest(value.cart))throw Error('Saved cart changed');
    if(now.q.execution_state==='succeeded'){
      const saved=decode(now.q.external_result);
      if(saved?.digest!==digest(saved.value)||digest(saved.value)!==digest(value))throw Error('Saved result changed');
    }
    if(now.previous?.incomingMessageId===input.incomingMessageId){
      if(now.previous.requestDigest!==digest(now.request))throw Error('Resume request changed');
      return value.text;
    }
    if(!save||digest(now.q)!==digest(first.q))throw Error('Resume claim changed');
    const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const record=resumeSchema.parse({...now.base,version:'salla-cart-resume.v1',incomingMessageId:input.incomingMessageId,
      requestDigest:digest(now.request),offerEvidenceDigest:now.evidence,resultDigest:digest(value),
      resumedAt:new Date(databaseTimeEpoch(clock.now)).toISOString()});
    await c.execute("UPDATE sales_quotations SET execution_state='succeeded',external_result=?,external_reconciliation=? WHERE id=?",[
      JSON.stringify({value,digest:digest(value)}),JSON.stringify({value:record,digest:digest(record)}),quoteId]);
    return value.text;
  });
}

export async function acceptSallaConversationOffer(input:CheckoutIdentity,quoteId:number){
  if(!semanticIdentityMatches(input)||!semanticQuoteMatches(quoteId,'salla_cart'))return SALLA_CART_CLARIFY;
  await schema();
  const intent=await tx(async c=>{
    const current=await owner(c,input),q=await latest(c,input);
    if(!q||q.id!==quoteId||q.external_provider!==SALLA_CART_PROVIDER)throw Error('Offer unavailable');
    if(isSalesRefusal(current.content)){await c.execute("UPDATE sales_quotations SET status='rejected' WHERE id=?",[q.id]);return 'declined';}
    if(!isSallaCartConsent(current.content))return 'clarify';
    if(isSallaCartResumeRequest(current.content)&&['unknown','succeeded'].includes(q.execution_state)
      &&q.consent_message_id!==null&&q.consent_message_id<input.incomingMessageId)return 'resume';
    return 'accept';
  });
  if(intent==='declined')return SALLA_CART_DECLINED;if(intent==='clarify')return SALLA_CART_CLARIFY;
  if(intent==='resume'){try{return await checkedResume(input,quoteId,true);}catch{return SALLA_CART_UNCERTAIN;}}
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
    AND (source_message_id=? OR consent_message_id=? OR JSON_UNQUOTE(JSON_EXTRACT(external_reconciliation,'$.value.incomingMessageId'))=?) ORDER BY id DESC LIMIT 1`,[identity.merchantId,identity.conversationId,SALLA_CART_PROVIDER,identity.incomingMessageId,identity.incomingMessageId,String(identity.incomingMessageId)]);
  const q=rows[0],text=input.text||'',marker=/\[SC-\d+\]/.test(text);
  if(!q)return !marker;
  // A separate greeting and safe failure response are not a checkout link.
  if(!marker&&!/https?:\/\/[^\s]+\/checkout\//i.test(text))return true;
  if(input.kind!=='text'||!normalizeCampaignPhone(input.to)||normalizeCampaignPhone(q.customer_phone)!==normalizeCampaignPhone(input.to))return false;
  identity.customerPhone=q.customer_phone;
  try{
    if(q.external_reconciliation!==null)return await checkedResume(identity,q.id,false,text)===text;
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
