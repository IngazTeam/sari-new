import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { decryptSecret } from '../security/secrets';
import { hasPermission } from '../_core/permissions';
import { checkoutTransaction } from './checkout-agreements';
import { transitionOwnershipInTransaction } from './conversation-handoff';
import { destroySession } from './session-context';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { staffAccountDigest,staffPhoneKey,staffReceiptDigest } from './sales-staff-acceptance-contract';
import { assertSalesStaffAcceptanceSchema,staffRelayAccountIsCurrent } from './sales-staff-acceptance';
import { dashboardStaffBasis,dashboardStaffAcceptance,readDashboardStaffBasis,readDashboardStaffAcceptance,dashboardStaffTransport,staffActorKey,staffDashboardKey } from './staff-dashboard-reply-contract';
import { staffDashboardReplyInput,type StaffDashboardReplyInput,type StaffDashboardReplyResult } from '../../shared/staff-dashboard-reply';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import type { SendMerchantWhatsAppInput,WhatsAppProviderConfig } from '../channels/whatsapp/types';

const id=z.number().int().positive().safe();
const unavailable=():never=>{throw Error('Staff reply unavailable');};
export async function assertDashboardStaffSchema(){
  await assertSalesStaffAcceptanceSchema();
  await assertRuntimeSchema('dashboard staff replies',[{table:'ai_sales_staff_replies',
    columns:['actor_user_id','request_id','basis','basis_digest','ownership_version','provider_message_id','projected_message_id','next_reconcile_at'],
    uniqueIndexes:[{name:'uq_staff_reply_request',columns:['merchant_id','request_id']}]},
    {table:'ai_sales_staff_acceptances',checkConstraints:[{name:'ck_staff_acceptance_source',expression:"source_kind IN ('escalation_relay','dashboard_text','dashboard_voice')",enforced:true}]}],{cacheSuccess:false});
}
async function clock(c:PoolConnection){const [[r]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');return new Date(databaseTimeEpoch(r.now)).toISOString();}
/** Locks the current persisted authority; never trusts a role supplied by the caller. */
export async function authorizeDashboardStaff(c:PoolConnection,merchant:number,actor:number){
  const [m]=await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[merchant]);
  const [u]=await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE',[actor]);
  if(m.length!==1||m[0].status==='suspended'||u.length!==1||u[0].account_status!=='active')return unavailable();
  const [members]=await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchant,actor]);
  if(members.length>1)return unavailable();
  if(members.length?(!members[0].is_active||!hasPermission(members[0].role,'conversations.reply')):m[0].userId!==actor)return unavailable();
}
async function reserve(merchant:number,actor:number,input:StaffDashboardReplyInput){
  return checkoutTransaction(async c=>{
    await authorizeDashboardStaff(c,merchant,actor);
    const [prior]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=? AND request_id=?',[merchant,input.requestId]);
    if(prior.length){const b=readDashboardStaffBasis(prior[0]);
      if(b.actorUserId!==actor||b.conversationId!==input.conversationId||b.replyDigest!==hash(input.message))return unavailable();
      return {...prior[0],fresh:false};
    }
    const [convs]=await c.execute<any[]>('SELECT * FROM conversations WHERE id=? AND merchantId=? FOR UPDATE',[input.conversationId,merchant]);
    const conv=convs[0];if(convs.length!==1)return unavailable();
    // Group and legacy-connection sends retain their existing unmeasured compatibility path.
    if(typeof conv.customerPhone==='string'&&(conv.customerPhone.startsWith('group_')||conv.customerPhone.endsWith('@g.us')))return null;
    const customerKey=staffPhoneKey(merchant,conv.customerPhone);
    const [accounts]=await c.execute<any[]>("SELECT * FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 AND status='active' FOR SHARE",[merchant]);
    if(!accounts.length){
      const [registered]=await c.execute<any[]>('SELECT id FROM whatsapp_instances WHERE merchant_id=? LIMIT 1 FOR SHARE',[merchant]);
      if(registered.length)return unavailable();return null;
    }
    if(accounts.length!==1)return unavailable();const a=accounts[0];
    const config:WhatsAppProviderConfig={provider:a.provider||'green_api',instanceId:String(a.instance_id),token:decryptSecret(a.token),apiUrl:a.api_url,phoneNumberId:a.phone_number_id,providerAccountId:a.provider_account_id};
    if(config.provider==='mock'&&process.env.NODE_ENV!=='test')return unavailable();const accountDigest=staffAccountDigest(config);
    const [settings]=await c.execute<any[]>('SELECT takeover_timeout_minutes FROM bot_settings WHERE merchant_id=?',[merchant]);
    const minutes=Number(settings[0]?.takeover_timeout_minutes)||15,now=await clock(c);
    const ownership=await transitionOwnershipInTransaction(c,input.conversationId,{humanTakeover:1,humanTakeoverAt:new Date(now),
      humanExpiresAt:new Date(Date.parse(now)+minutes*60000)},{merchantId:merchant,expectedVersion:conv.handoff_version});
    const [saved]=await c.execute<any>(`INSERT INTO ai_sales_staff_replies
      (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,reply_text) VALUES (?,?,?,?,?,?,?,?)`,
      [merchant,actor,input.conversationId,input.requestId,a.id,ownership.version,conv.customerPhone,input.message]);
    const b=dashboardStaffBasis.parse({version:'sales-staff-dashboard-basis.v1',source:'dashboard_text',sourceId:Number(saved.insertId),merchantId:merchant,
      conversationId:input.conversationId,actorUserId:actor,requestId:input.requestId,ownershipVersion:ownership.version,instanceRecordId:a.id,
      provider:config.provider,accountDigest,customerKey,authorKey:staffActorKey(merchant,actor),authorBasis:'authenticated_submitter',compositionBasis:'unmeasured',replyDigest:hash(input.message),reservedAt:now,scope:'staff_reply_attempt_only'});
    const [updated]=await c.execute<any>('UPDATE ai_sales_staff_replies SET basis=?,basis_digest=? WHERE id=? AND merchant_id=? AND basis IS NULL',[JSON.stringify(b),hash(b),b.sourceId,merchant]);
    if(updated.affectedRows!==1)return unavailable();
    return {id:b.sourceId,instance_id:a.id,customer_phone:conv.customerPhone,basis_digest:hash(b),fresh:true};
  });
}
export async function canDispatchDashboardStaff(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig){
  try{
    const guard=z.object({id,basisDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input.staffReplyGuard);
    return await checkoutTransaction(async c=>{
      await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[input.merchantId]);
      const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_replies WHERE id=? AND merchant_id=? FOR SHARE',[guard.id,input.merchantId]);
      if(rows.length!==1)return false;const r=rows[0],b=readDashboardStaffBasis(r);
      if(r.status!=='reserved'||input.idempotencyKey!==staffDashboardKey(b.merchantId,b.sourceId)||input.instanceRecordId!==b.instanceRecordId
        ||guard.basisDigest!==hash(b)||input.kind!=='text'||hash(input.text)!==b.replyDigest||staffPhoneKey(b.merchantId,input.to)!==b.customerKey
        ||input.replyGuard||input.salesReplyGuard||input.escalationGuard||input.salesOfferGuard||input.bookingNoticeGuard||input.appointmentReminderGuard
        ||input.followUpGuard||input.staffVoiceGuard||input.mediaUrl||input.fileName||input.template)return false;
      await authorizeDashboardStaff(c,b.merchantId,b.actorUserId);
      const [convs]=await c.execute<any[]>(`SELECT * FROM conversations WHERE id=? AND merchantId=? AND human_takeover=1 AND handoff_version=?
        AND (human_expires_at IS NULL OR human_expires_at>UTC_TIMESTAMP()) FOR SHARE`,[b.conversationId,b.merchantId,b.ownershipVersion]);
      return convs.length===1&&staffPhoneKey(b.merchantId,convs[0].customerPhone)===b.customerKey&&await staffRelayAccountIsCurrent(c as any,b,config);
    });
  }catch{return false;}
}
/** SQL-only recovery: it cannot send, renew authority, or replace a verified acceptance. */
export async function reconcileDashboardStaff(merchant:number,replyId:number):Promise<StaffDashboardReplyResult>{
  id.parse(merchant);id.parse(replyId);await assertDashboardStaffSchema();
  return checkoutTransaction(async c=>{
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
    const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_replies WHERE id=? AND merchant_id=? FOR UPDATE',[replyId,merchant]);
    if(rows.length!==1)return unavailable();const r=rows[0],b=readDashboardStaffBasis(r);
    const [facts]=await c.execute<any[]>("SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind='dashboard_text' AND source_id=?",[merchant,replyId]);
    const [deliveries]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[merchant,staffDashboardKey(merchant,replyId)]);
    const d=deliveries[0];let s=facts.length?readDashboardStaffAcceptance(facts[0]):null;
    if(facts.length>1||s&&s.basisDigest!==hash(b))return unavailable();
    if(!s&&r.status==='accepted')return unavailable();
    if(d&&s&&d.request_json==null){
      if(Number(d.id)!==s.outboxId||Number(d.merchant_id)!==merchant||Number(d.instance_id)!==b.instanceRecordId||d.direction!=='outgoing'
        ||d.provider!==b.provider||d.idempotency_key!==staffDashboardKey(merchant,replyId)
        ||staffReceiptDigest(merchant,b.instanceRecordId,b.provider,d.provider_message_id)!==s.providerMessageDigest)return unavailable();
    }else if(d){
      // Validate all request bindings even when an outbox has no accepted receipt yet.
      const proof=dashboardStaffTransport(b,{...d,provider_message_id:d.provider_message_id||'pending-receipt'});
      if(s&&(proof.outboxId!==s.outboxId||proof.requestDigest!==s.requestDigest||proof.providerMessageDigest!==s.providerMessageDigest))return unavailable();
      if(!s&&['sent','delivered','read'].includes(d.status)&&d.provider_message_id){
        const observed=await clock(c);s=dashboardStaffAcceptance.parse({version:'sales-staff-dashboard-acceptance.v1',basis:b,basisDigest:hash(b),...proof,
          acceptanceObservedAt:observed,observationTiming:observed<b.reservedAt?'clock_regression':'ordered',timeBasis:'local_receipt_verification',scope:'provider_acceptance_only'});
        await c.execute(`INSERT INTO ai_sales_staff_acceptances (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at)
          VALUES (?,'dashboard_text',?,?,?,?,?,?,?)`,[merchant,replyId,b.customerKey,s.outboxId,s.providerMessageDigest,hash(s),JSON.stringify(s),observed.slice(0,23).replace('T',' ')]);
      }
    }
    if(!s){
      const status=d?.status==='failed'?(d.error_code==='staff_reply_suppressed'?'suppressed':'failed'):'pending';
      await c.execute(`UPDATE ai_sales_staff_replies SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=? AND merchant_id=?`,[replyId,merchant]);
      return {success:false,status,persisted:false};
    }
    const receipt=d?.provider_message_id||r.provider_message_id;
    if(s.providerMessageDigest!==staffReceiptDigest(merchant,b.instanceRecordId,b.provider,receipt))return unavailable();
    let projected=r.projected_message_id;
    if(!projected){
      const [convs]=await c.execute<any[]>('SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE',[b.conversationId,merchant]);
      if(convs.length&&staffPhoneKey(merchant,convs[0].customerPhone)===b.customerKey){
        const [messages]=await c.execute<any[]>('SELECT id,direction,content,sender_type FROM messages WHERE conversationId=? AND externalId=? FOR UPDATE',[b.conversationId,receipt]);
        if(messages.length>1||messages.some(m=>m.direction!=='outgoing'||m.content!==r.reply_text||m.sender_type!=='merchant'))return unavailable();
        if(messages.length)projected=messages[0].id;
        else {const [saved]=await c.execute<any>(`INSERT INTO messages (conversationId,direction,messageType,content,externalId,isProcessed,sender_type,createdAt)
          VALUES (?,'outgoing','text',?,?,1,'merchant',?)`,[b.conversationId,r.reply_text,receipt,s.acceptanceObservedAt.slice(0,19).replace('T',' ')]);projected=saved.insertId;}
        await c.execute('UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?',
          [s.acceptanceObservedAt.slice(0,19).replace('T',' '),s.acceptanceObservedAt.slice(0,19).replace('T',' '),b.conversationId,merchant]);
      }
    }
    await c.execute("UPDATE ai_sales_staff_replies SET status='accepted',provider_message_id=?,projected_message_id=?,next_reconcile_at=NULL WHERE id=? AND merchant_id=?",[receipt,projected||null,replyId,merchant]);
    return {success:true,status:'accepted',persisted:Boolean(projected)};
  });
}
/** Null is explicit compatibility coverage: legacy accounts or groups, never a failure fallback. */
export async function trySendDashboardStaff(merchant:number,actor:number,raw:StaffDashboardReplyInput){
  id.parse(merchant);id.parse(actor);const input=staffDashboardReplyInput.parse(raw);await assertDashboardStaffSchema();
  const r=await reserve(merchant,actor,input);if(!r)return null;
  if(r.fresh){
    destroySession(merchant,input.conversationId);
    await sendMerchantWhatsApp({merchantId:merchant,instanceRecordId:r.instance_id,idempotencyKey:staffDashboardKey(merchant,r.id),
      kind:'text',to:r.customer_phone,text:input.message,staffReplyGuard:{id:r.id,basisDigest:r.basis_digest}}).catch(()=>{});
  }
  // A failed/lost acknowledgement never causes a second transport call for this request ID.
  return reconcileDashboardStaff(merchant,r.id).catch(()=>({success:false,status:'pending' as const,persisted:false}));
}
export async function runDashboardStaffRecoveryBatch(){
  const jobs=await checkoutTransaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT id,merchant_id FROM ai_sales_staff_replies WHERE next_reconcile_at<=UTC_TIMESTAMP(3)
      AND created_at<TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP(3)) ORDER BY next_reconcile_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for(const r of rows)await c.execute('UPDATE ai_sales_staff_replies SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?',[r.id]);return rows;
  });
  for(const r of jobs)await reconcileDashboardStaff(r.merchant_id,r.id).catch(()=>{});return jobs.length;
}
export async function startDashboardStaffRecoveryWorker(){
  await assertDashboardStaffSchema();let active:Promise<unknown>|undefined,stopped=false;
  const tick=()=>{if(stopped||active)return;active=runDashboardStaffRecoveryBatch().catch(()=>{}).finally(()=>{active=undefined;});};
  const timer=setInterval(tick,60_000);timer.unref();tick();return async()=>{stopped=true;clearInterval(timer);await active;};
}
