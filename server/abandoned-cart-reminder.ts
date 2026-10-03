import {createHash} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {cartReminderHistoryInput,cartReminderHistorySchema,cartReminderReviewInput,cartReminderSendInput,cartReminderReceiptInput,cartReminderReviewSchema,cartReminderReceiptSchema,type CartReminderReview} from '../shared/abandoned-cart-reminder';
import {cartWorkspaceInput,type CartWorkspaceRow} from '../shared/abandoned-cart-workspace';
import type {DiscountWorkspaceRow} from '../shared/discount-workspace';
import {withCartAuthority,CartWorkspaceError} from './abandoned-cart-workspace-store';
import {projectCartWorkspace,CART_WORKSPACE_COLUMNS} from './abandoned-cart-workspace-source';
import {discountRow} from './discount-workspace-source';
import {campaignCapacitySql,campaignCapacityFromRows} from './campaign-capacity';
import {CAMPAIGN_CONSENT_VERSION,normalizeCampaignPhone} from './automation/campaign-guard';
import {databaseTimeEpoch} from './db/time';
import {privacyHashExact} from './accounts/privacy-hash';
import {assertRuntimeSchema} from './db/schema-readiness';

export async function cartReminderRows(tx:PoolConnection,sql:string,args:any[]=[]){const [value]=await tx.execute(sql,args);if(!Array.isArray(value))throw new CartWorkspaceError('unavailable');return value as any[];}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=(value:any)=>new Date(databaseTimeEpoch(value)).toISOString();
export function cartReminderReceipt(row:any){return cartReminderReceiptSchema.parse({id:row.id,operationKey:row.operation_key,merchantId:row.merchant_id,actorId:row.actor_id,cartId:row.cart_id,state:row.state,createdAt:stamp(row.created_at),updatedAt:stamp(row.updated_at),quotaReserved:Number(row.quota_reserved)===1,providerAccepted:row.state==='accepted',salesVerified:false});}
async function schema(){await assertRuntimeSchema('reviewed cart reminder admission',[{table:'abandoned_cart_reminders',columns:['operation_key','review_revision','quota_period_start'],uniqueIndexes:[{name:'uq_cart_reminder_operation',columns:['merchant_id','operation_key']}],checkConstraints:['chk_cart_reminder_quota','chk_cart_reminder_discount']}]);}
export function cartReminderQuietAt(now:Date,timezone:string){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',hourCycle:'h23'}).format(now));if(!Number.isInteger(hour))throw new CartWorkspaceError('unavailable');return hour>=22||hour<8;}
export function cartReminderChannelRevision(row:any){return privacyHashExact(JSON.stringify(['cart-channel-v1',row.id,row.merchant_id,row.provider,row.instance_id,row.token,row.api_url,row.phone_number_id,row.provider_account_id,row.status,row.is_primary,row.expires_at]));}
const clean=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
/** Stored amounts have no currency/unit evidence. Never invent a price or final total. */
export function cartReminderMessage(row:CartWorkspaceRow,discount:DiscountWorkspaceRow|null,locale:'ar'|'en'){
 const ar=locale==='ar',name=clean(row.customerName??'',80),items=row.items??[];
 const lines=[ar?`مرحباً${name?' '+name:''}،`:`Hello${name?' '+name:''},`,ar?'هل ما زلت مهتمًا بهذه المنتجات؟':'Are you still interested in these items?',...items.slice(0,10).map(i=>`• ${clean(i.productName,180)} × ${i.quantity}`)];
 if(items.length>10)lines.push(ar?`و${items.length-10} منتجات أخرى في سلتك.`:`Plus ${items.length-10} more items in your cart.`);
 if(discount){lines.push(ar?`يمكنك استخدام الكود ${discount.code} لخصم ${discount.value}٪ وفق شروطه وتوفّره عند إتمام الطلب.`:`You can use code ${discount.code} for ${discount.value}% off, subject to its terms and availability at checkout.`);if(discount.expiresAt)lines.push((ar?'ينتهي في: ':'Expires: ')+discount.expiresAt.replace('T',' ').replace('Z',' UTC'));}
 lines.push(ar?'أرسل ردًا إذا أردت المساعدة في إكمال طلبك.':'Reply if you would like help completing your order.',ar?'لإيقاف الرسائل التسويقية أرسل «إلغاء الاشتراك».':'To stop marketing messages, reply "unsubscribe".');
 const text=lines.join('\n');return text.length<=4096?text:null;
}
/** Caller holds merchant authority before these current reads. No effects during review. */
export async function cartReminderSnapshot(tx:PoolConnection,actorId:number,merchantId:number,input:ReturnType<typeof cartReminderReviewInput.parse>,options:{ignoreOperationId?:number;reservedCapacity?:{subscriptionId:number;periodStart:string}}={}){
 const [clock]=await cartReminderRows(tx,'SELECT UTC_TIMESTAMP(3) AS now'),now=new Date(databaseTimeEpoch(clock?.now));if(!Number.isFinite(now.getTime()))throw new CartWorkspaceError('unavailable');
 const [merchant]=await cartReminderRows(tx,'SELECT userId,status,timezone FROM merchants WHERE id=? FOR SHARE',[merchantId]);
 const [owner]=await cartReminderRows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[merchant.userId]);
 const raw=await cartReminderRows(tx,`SELECT ${CART_WORKSPACE_COLUMNS} FROM abandoned_carts WHERE merchantId=? AND id=? FOR UPDATE`,[merchantId,input.cartId]);if(raw.length!==1)throw new CartWorkspaceError('missing');
 const row=projectCartWorkspace(actorId,merchantId,true,cartWorkspaceInput.parse({}),raw,now).rows[0],blockers:CartReminderReview['blockers']=[];
 if(merchant.status!=='active'||owner?.account_status!=='active')blockers.push('merchant');
 if(row.state!=='waiting')blockers.push('cart_state');
 // Require the stored international number; never guess a country or rewrite the recipient.
 const recipient=row.customerPhone&&/^\+[1-9]\d{7,14}$/.test(row.customerPhone)?row.customerPhone:null;if(!recipient)blockers.push('phone');
 const instances=await cartReminderRows(tx,'SELECT * FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 FOR SHARE',[merchantId]);
 const candidate=instances.length===1?instances[0]:null;
 const instance=candidate&&candidate.status==='active'&&['green_api','meta_cloud','mock'].includes(candidate.provider)&&candidate.instance_id&&candidate.token&&(candidate.expires_at===null||databaseTimeEpoch(candidate.expires_at)>now.getTime())&&(candidate.provider!=='meta_cloud'||candidate.phone_number_id)?candidate:null;
 if(!instance)blockers.push('channel');
 const phone=recipient?.slice(1)??'',forms=[phone,'+'+phone,'00'+phone,...(/^9665\d{8}$/.test(phone)?['0'+phone.slice(3),phone.slice(3)]:[])];
 const consent=recipient?await cartReminderRows(tx,`SELECT s.*,r.merchant_id AS receiptMerchant,r.customer_phone AS receiptPhone,r.decision AS receiptDecision,r.consent_version AS receiptVersion,r.evidence_digest AS receiptEvidence,r.decided_at AS receiptTime FROM campaign_consent_state s LEFT JOIN campaign_consent_receipts r ON r.id=s.last_receipt_id WHERE s.merchant_id=? AND s.customer_phone IN (${forms.map(()=>'?').join(',')}) FOR SHARE`,[merchantId,...forms]):[];
 const consentAllowed=consent.length>0&&consent.every(s=>s.status==='granted'&&s.consent_version===CAMPAIGN_CONSENT_VERSION&&s.receiptMerchant===merchantId&&normalizeCampaignPhone(s.receiptPhone)===phone&&s.receiptDecision==='granted'&&s.receiptVersion===CAMPAIGN_CONSENT_VERSION&&s.receiptEvidence===s.evidence_digest&&databaseTimeEpoch(s.receiptTime)===databaseTimeEpoch(s.last_decided_at)&&databaseTimeEpoch(s.last_decided_at)<=now.getTime());
 if(!consentAllowed)blockers.push('consent');if(cartReminderQuietAt(now,merchant.timezone||'Asia/Riyadh'))blockers.push('quiet_hours');
 const capacities=await cartReminderRows(tx,`${campaignCapacitySql} FOR UPDATE`,[merchantId]),capacity=capacities.length?campaignCapacityFromRows(capacities):null;
 if(!capacity)blockers.push('subscription');else if(options.reservedCapacity){if(capacity.subscriptionId!==options.reservedCapacity.subscriptionId||capacity.periodStart!==options.reservedCapacity.periodStart||capacity.used<1)blockers.push('subscription');}else if(capacity.remaining<1)blockers.push('quota');
 const discounts=input.discountId?await cartReminderRows(tx,'SELECT *,is_auto_generated AS isAutoGenerated,customer_phone AS customerPhone FROM discount_codes WHERE merchantId=? AND id=? FOR SHARE',[merchantId,input.discountId]):[];
 const discount=discounts.length===1?discountRow(discounts[0],now):null;
 if(input.discountId&&(!discount||discount.state!=='available'||discount.type!=='percentage'||(discount.minOrderAmount??0)>0||discount.customerPhone!==null&&normalizeCampaignPhone(discount.customerPhone)!==phone))blockers.push('discount');
 const [latest]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND cart_id=?'+(options.ignoreOperationId?' AND id<>?':'')+' ORDER BY id DESC LIMIT 1 FOR UPDATE',[merchantId,input.cartId,...(options.ignoreOperationId?[options.ignoreOperationId]:[])]);
 if(latest&&!['rejected','suppressed'].includes(latest.state))blockers.push('prior_reminder');
 const text=cartReminderMessage(row,discount, input.locale);if(!text)blockers.push('message');
 const channelRevision=instance?cartReminderChannelRevision(instance):null;
 const expectedRevision=digest(['cart-review-v1',actorId,merchantId,input,row.revision,channelRevision,discount?.revision??null,consent.map(s=>[s.customer_phone,s.status,s.last_receipt_id,s.evidence_digest,stamp(s.last_decided_at)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),capacity?[capacity.subscriptionId,capacity.periodStart,capacity.limit]:null,latest?[latest.id,latest.state]:null,text]);
 const review=cartReminderReviewSchema.parse({actorId,merchantId,selection:input,row,expectedRevision,checkedAt:now.toISOString(),eligible:blockers.length===0,blockers,recipient,text,channel:instance?{id:instance.id,provider:instance.provider}:null,discount,latest:latest?cartReminderReceipt(latest):null,quotaRemaining:capacity?.remaining??null,quotaUnlimited:capacity?.unlimited??null,currency:null,salesVerified:false});
 return {review,instance,channelRevision,capacity,now};
}
export async function reviewCartReminder(actorId:number,merchantId:number,input:unknown){const value=cartReminderReviewInput.parse(input);await schema();return withCartAuthority(actorId,merchantId,true,async tx=>(await cartReminderSnapshot(tx,actorId,merchantId,value)).review);}
export async function readCartReminderHistory(actorId:number,merchantId:number,input:unknown){const {page}=cartReminderHistoryInput.parse(input);await schema();return withCartAuthority(actorId,merchantId,false,async tx=>{const [count]=await cartReminderRows(tx,'SELECT COUNT(*) AS total FROM abandoned_cart_reminders WHERE merchant_id=?',[merchantId]),total=Number(count.total);const rows=await cartReminderRows(tx,`SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? ORDER BY id DESC LIMIT 25 OFFSET ${(page-1)*25}`,[merchantId]);return cartReminderHistorySchema.parse({actorId,merchantId,page,total,pages:Math.ceil(total/25),rows:rows.map(cartReminderReceipt)});});}
export async function readCartReminderReceipt(actorId:number,merchantId:number,input:unknown){const value=cartReminderReceiptInput.parse(input);await schema();return withCartAuthority(actorId,merchantId,false,async tx=>{const [row]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND operation_key=? FOR SHARE',[merchantId,value.operationKey]);if(!row)throw new CartWorkspaceError('missing');return cartReminderReceipt(row);});}
/** Internal admission only until the guarded transport is connected. No provider calls. */
export async function reserveCartReminder(actorId:number,merchantId:number,input:unknown){const value=cartReminderSendInput.parse(input),selection=cartReminderReviewInput.parse({cartId:value.cartId,discountId:value.discountId,locale:value.locale}),requestDigest=digest([actorId,merchantId,value]);await schema();return withCartAuthority(actorId,merchantId,true,async tx=>{
 const [existing]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND operation_key=? FOR UPDATE',[merchantId,value.operationKey]);
 if(existing){if(existing.actor_id!==actorId||existing.request_digest!==requestDigest)throw new CartWorkspaceError('stale');return {created:false,receipt:cartReminderReceipt(existing)};}
 const s=await cartReminderSnapshot(tx,actorId,merchantId,selection);
 if(s.review.expectedRevision!==value.expectedRevision)throw new CartWorkspaceError('stale');if(!s.review.eligible||!s.capacity||!s.instance||!s.channelRevision||!s.review.recipient||!s.review.text)throw new CartWorkspaceError('invalid');
 const period=s.capacity.periodStart.slice(0,23).replace('T',' ');
 const [usage]=await tx.execute<any>('UPDATE merchant_subscriptions SET messages_used=messages_used+1 WHERE id=? AND merchant_id=? AND last_reset_at=? AND messages_used=?',[s.capacity.subscriptionId,merchantId,period,s.capacity.used]);if(usage.affectedRows!==1)throw new CartWorkspaceError('stale');
 const [saved]=await tx.execute<any>(`INSERT INTO abandoned_cart_reminders (operation_key,merchant_id,actor_id,cart_id,request_digest,review_revision,cart_revision,channel_id,channel_revision,discount_id,discount_revision,locale,to_phone,message_text,quota_subscription_id,quota_period_start,quota_reserved,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))`,[value.operationKey,merchantId,actorId,value.cartId,requestDigest,value.expectedRevision,s.review.row.revision,s.instance.id,s.channelRevision,value.discountId,s.review.discount?.revision??null,value.locale,s.review.recipient,s.review.text,s.capacity.subscriptionId,period]);
 if(saved.affectedRows!==1)throw new CartWorkspaceError('unavailable');const [row]=await cartReminderRows(tx,'SELECT * FROM abandoned_cart_reminders WHERE merchant_id=? AND id=? FOR SHARE',[merchantId,saved.insertId]);return {created:true,receipt:cartReminderReceipt(row)};
 });}
