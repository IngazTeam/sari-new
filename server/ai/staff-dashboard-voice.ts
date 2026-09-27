import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { decryptSecret } from '../security/secrets';
import { decodeValidatedAudio } from '../utils/audio';
import { storagePut } from '../storage';
import { checkoutTransaction } from './checkout-agreements';
import { authorizeDashboardStaff } from './staff-dashboard-reply';
import { transitionOwnershipInTransaction } from './conversation-handoff';
import { destroySession } from './session-context';
import { policyArtifactDigest as hash } from './learning-policy-evaluation-bundle';
import { staffAccountDigest,staffPhoneKey,staffReceiptDigest } from './sales-staff-acceptance-contract';
import {readVoiceCompatibility,matchesCompatibilityRecording} from './staff-voice-compatibility-contract';
import {reserveVoiceCompatibility,sendVoiceCompatibility} from './staff-voice-compatibility';
import {reconcileStaffCompatibility} from './staff-compatibility-settlement';
import { staffAttemptReviewAuthority, type StaffAttemptReviewAuthority } from '../../shared/staff-attempt-review';
import { assertSalesStaffAcceptanceSchema,staffRelayAccountIsCurrent } from './sales-staff-acceptance';
import { staffActorKey } from './staff-dashboard-reply-contract';
import { staffVoiceIntent,staffVoiceBasis,staffVoiceAcceptance,readStaffVoiceIntent,readStaffVoiceBasis,readStaffVoiceAcceptance,staffVoiceTransport,staffVoiceKey,staffVoiceStorageKey,validateStaffVoiceUrl } from './staff-dashboard-voice-contract';
import { staffVoiceInput,staffVoiceExtension,type StaffVoiceInput } from '../../shared/staff-dashboard-voice';
import type { StaffDashboardReplyResult } from '../../shared/staff-dashboard-reply';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import type { SendMerchantWhatsAppInput,WhatsAppProviderConfig } from '../channels/whatsapp/types';

const id=z.number().int().positive().safe(),unavailable=():never=>{throw Error('Staff voice unavailable');};
const bytesDigest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function clock(c:PoolConnection){const [[r]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');return new Date(databaseTimeEpoch(r.now)).toISOString();}
export async function assertDashboardVoiceSchema(){
  await assertSalesStaffAcceptanceSchema();
  await assertRuntimeSchema('dashboard staff voice',[{table:'ai_sales_staff_voices',columns:['actor_user_id','request_id','compatibility','compatibility_result','intent','intent_digest','basis','basis_digest','media_url','projected_message_id','next_reconcile_at'],
    uniqueIndexes:[{name:'uq_staff_voice_request',columns:['merchant_id','request_id']}]},
    {table:'ai_sales_staff_acceptances',checkConstraints:[{name:'ck_staff_acceptance_source',expression:"source_kind IN ('escalation_relay','dashboard_text','dashboard_voice')",enforced:true}]}],{cacheSuccess:false});
}
async function reserve(merchant:number,actor:number,input:StaffVoiceInput,bytes:Buffer){
  return checkoutTransaction(async c=>{
    await authorizeDashboardStaff(c,merchant,actor);
    const [prior]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_voices WHERE merchant_id=? AND request_id=?',[merchant,input.requestId]);
    if(prior.length){
      if(prior[0].compatibility){const r=prior[0],record=readVoiceCompatibility(r);
        if(!matchesCompatibilityRecording(record.intent,actor,input,bytes))return unavailable();
        return {id:r.id,compatibility:true as const,fresh:false,intentDigest:r.intent_digest,result:record.result};}
      const i=readStaffVoiceIntent(prior[0]);
      if(i.actorUserId!==actor||i.conversationId!==input.conversationId||i.audioDigest!==bytesDigest(bytes)||i.byteLength!==bytes.length||i.mimeType!==input.mimeType||i.duration!==input.duration)return unavailable();
      return {...prior[0],intent:i,fresh:false};
    }
    const [convs]=await c.execute<any[]>('SELECT * FROM conversations WHERE id=? AND merchantId=? FOR UPDATE',[input.conversationId,merchant]);
    const conv=convs[0];if(convs.length!==1)return unavailable();
    if(typeof conv.customerPhone==='string'&&(conv.customerPhone.startsWith('group_')||conv.customerPhone.endsWith('@g.us')))return reserveVoiceCompatibility(c,merchant,actor,input,bytes,conv);
    const customerKey=staffPhoneKey(merchant,conv.customerPhone);
    const [accounts]=await c.execute<any[]>("SELECT * FROM whatsapp_instances WHERE merchant_id=? AND is_primary=1 AND status='active' FOR SHARE",[merchant]);
    if(!accounts.length){const [registered]=await c.execute<any[]>('SELECT id FROM whatsapp_instances WHERE merchant_id=? LIMIT 1 FOR SHARE',[merchant]);if(registered.length)return unavailable();return reserveVoiceCompatibility(c,merchant,actor,input,bytes,conv);}
    if(accounts.length!==1)return unavailable();const a=accounts[0];
    const config:WhatsAppProviderConfig={provider:a.provider||'green_api',instanceId:String(a.instance_id),token:decryptSecret(a.token),apiUrl:a.api_url,phoneNumberId:a.phone_number_id,providerAccountId:a.provider_account_id};
    if(config.provider==='mock'&&process.env.NODE_ENV!=='test')return unavailable();const accountDigest=staffAccountDigest(config);
    const [settings]=await c.execute<any[]>('SELECT takeover_timeout_minutes FROM bot_settings WHERE merchant_id=?',[merchant]);
    const now=await clock(c),minutes=Number(settings[0]?.takeover_timeout_minutes)||15;
    const ownership=await transitionOwnershipInTransaction(c,input.conversationId,{humanTakeover:1,humanTakeoverAt:new Date(now),humanExpiresAt:new Date(Date.parse(now)+minutes*60000)},
      {merchantId:merchant,expectedVersion:conv.handoff_version});
    const [saved]=await c.execute<any>('INSERT INTO ai_sales_staff_voices (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone) VALUES (?,?,?,?,?,?,?)',
      [merchant,actor,input.conversationId,input.requestId,a.id,ownership.version,conv.customerPhone]);
    const intent=staffVoiceIntent.parse({version:'sales-staff-voice-intent.v1',source:'dashboard_voice',sourceId:Number(saved.insertId),merchantId:merchant,conversationId:input.conversationId,
      actorUserId:actor,requestId:input.requestId,ownershipVersion:ownership.version,instanceRecordId:a.id,provider:config.provider,accountDigest,customerKey,
      authorKey:staffActorKey(merchant,actor),authorBasis:'authenticated_submitter',compositionBasis:'unmeasured',reservedAt:now,scope:'staff_reply_attempt_only',
      audioDigest:bytesDigest(bytes),byteLength:bytes.length,mimeType:input.mimeType,duration:input.duration,durationBasis:'client_reported',contentBasis:'uploaded_bytes_signature_checked'});
    const [updated]=await c.execute<any>('UPDATE ai_sales_staff_voices SET intent=?,intent_digest=? WHERE id=? AND merchant_id=? AND intent IS NULL',[JSON.stringify(intent),hash(intent),intent.sourceId,merchant]);
    if(updated.affectedRows!==1)return unavailable();return {id:intent.sourceId,customer_phone:conv.customerPhone,intent,fresh:true};
  });
}
export async function canDispatchDashboardVoice(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig){
  try{const guard=z.object({id,basisDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input.staffVoiceGuard);
    return await checkoutTransaction(async c=>{
      await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[input.merchantId]);
      const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_voices WHERE id=? AND merchant_id=? FOR SHARE',[guard.id,input.merchantId]);
      if(rows.length!==1||rows[0].compatibility)return false;const r=rows[0],b=readStaffVoiceBasis(r),i=b.intent;
      if(r.status!=='reserved'||input.idempotencyKey!==staffVoiceKey(i.merchantId,i.sourceId)||input.instanceRecordId!==i.instanceRecordId||guard.basisDigest!==hash(b)
        ||input.kind!=='audio'||hash(input.mediaUrl)!==b.mediaUrlDigest||input.fileName!==b.fileName||staffPhoneKey(i.merchantId,input.to)!==i.customerKey
        ||input.text!==undefined||input.template||input.replyGuard||input.salesReplyGuard||input.staffReplyGuard||input.escalationGuard||input.salesOfferGuard||input.bookingNoticeGuard||input.appointmentReminderGuard||input.followUpGuard)return false;
      await authorizeDashboardStaff(c,i.merchantId,i.actorUserId);
      const [convs]=await c.execute<any[]>(`SELECT * FROM conversations WHERE id=? AND merchantId=? AND human_takeover=1 AND handoff_version=?
        AND (human_expires_at IS NULL OR human_expires_at>UTC_TIMESTAMP()) FOR SHARE`,[i.conversationId,i.merchantId,i.ownershipVersion]);
      return convs.length===1&&staffPhoneKey(i.merchantId,convs[0].customerPhone)===i.customerKey&&await staffRelayAccountIsCurrent(c as any,i,config);
    });
  }catch{return false;}
}
export async function reconcileDashboardVoice(merchant:number,voiceId:number,review?:StaffAttemptReviewAuthority):Promise<StaffDashboardReplyResult>{
  if(review)staffAttemptReviewAuthority.parse(review);
  id.parse(merchant);id.parse(voiceId);await assertDashboardVoiceSchema();
  return checkoutTransaction(async c=>{
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
    const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_voices WHERE id=? AND merchant_id=? FOR UPDATE',[voiceId,merchant]);
    if(review)await authorizeDashboardStaff(c,merchant,review.actorUserId);
    if(rows.length!==1||rows[0].compatibility)return unavailable();const r=rows[0],i=readStaffVoiceIntent(r);
    if(review&&(i.actorUserId!==review.actorUserId||i.conversationId!==review.conversationId))return unavailable();
    const [facts]=await c.execute<any[]>("SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=? AND source_kind='dashboard_voice' AND source_id=?",[merchant,voiceId]);
    const [deliveries]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[merchant,staffVoiceKey(merchant,voiceId)]);
    if(facts.length>1||deliveries.length>1)return unavailable();
    if(!r.basis){if(facts.length||deliveries.length||r.status==='accepted')return unavailable();
      await c.execute('UPDATE ai_sales_staff_voices SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?',[voiceId]);return {success:false,status:'pending',persisted:false};}
    const b=readStaffVoiceBasis(r),d=deliveries[0];let s=facts.length?readStaffVoiceAcceptance(facts[0]):null;
    if(s&&s.basisDigest!==hash(b)||!s&&r.status==='accepted')return unavailable();
    if(d&&s&&d.request_json==null){
      if(Number(d.id)!==s.outboxId||Number(d.merchant_id)!==merchant||Number(d.instance_id)!==i.instanceRecordId||d.direction!=='outgoing'||d.provider!==i.provider
        ||d.idempotency_key!==staffVoiceKey(merchant,voiceId)||staffReceiptDigest(merchant,i.instanceRecordId,i.provider,d.provider_message_id)!==s.providerMessageDigest)return unavailable();
    }else if(d){const proof=staffVoiceTransport(b,{...d,provider_message_id:d.provider_message_id||'pending-receipt'});
      if(s&&(proof.outboxId!==s.outboxId||proof.requestDigest!==s.requestDigest||proof.providerMessageDigest!==s.providerMessageDigest))return unavailable();
      if(!s&&['sent','delivered','read'].includes(d.status)&&d.provider_message_id){
        const observed=await clock(c);s=staffVoiceAcceptance.parse({version:'sales-staff-voice-acceptance.v1',basis:b,basisDigest:hash(b),...proof,acceptanceObservedAt:observed,
          observationTiming:observed<i.reservedAt?'clock_regression':'ordered',timeBasis:'local_receipt_verification',scope:'provider_acceptance_only'});
        await c.execute(`INSERT INTO ai_sales_staff_acceptances (merchant_id,source_kind,source_id,customer_key,outbox_id,provider_message_digest,acceptance_digest,snapshot,acceptance_observed_at)
          VALUES (?,'dashboard_voice',?,?,?,?,?,?,?)`,[merchant,voiceId,i.customerKey,s.outboxId,s.providerMessageDigest,hash(s),JSON.stringify(s),observed.slice(0,23).replace('T',' ')]);
      }
    }
    if(!s){await c.execute('UPDATE ai_sales_staff_voices SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?',[voiceId]);
      return {success:false,status:d?.status==='failed'?(d.error_code==='staff_voice_suppressed'?'suppressed':'failed'):'pending',persisted:false};}
    const receipt=d?.provider_message_id||r.provider_message_id;
    if(s.providerMessageDigest!==staffReceiptDigest(merchant,i.instanceRecordId,i.provider,receipt))return unavailable();let projected=r.projected_message_id;
    if(!projected){const [convs]=await c.execute<any[]>('SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE',[i.conversationId,merchant]);
      if(convs.length&&staffPhoneKey(merchant,convs[0].customerPhone)===i.customerKey){
        const content=`[رسالة صوتية — ${Math.round(i.duration)} ثانية]`;
        const [messages]=await c.execute<any[]>('SELECT * FROM messages WHERE conversationId=? AND externalId=? FOR UPDATE',[i.conversationId,receipt]);
        if(messages.length>1||messages.some(m=>m.direction!=='outgoing'||m.messageType!=='voice'||m.voiceUrl!==r.media_url||m.mediaUrl!==r.media_url||m.content!==content||m.sender_type!=='merchant'))return unavailable();
        if(messages.length)projected=messages[0].id;
        else {const [saved]=await c.execute<any>(`INSERT INTO messages (conversationId,direction,messageType,content,voiceUrl,mediaUrl,externalId,isProcessed,sender_type,createdAt)
          VALUES (?,'outgoing','voice',?,?,?,?,1,'merchant',?)`,[i.conversationId,content,r.media_url,r.media_url,receipt,s.acceptanceObservedAt.slice(0,19).replace('T',' ')]);projected=saved.insertId;}
        await c.execute('UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?',
          [s.acceptanceObservedAt.slice(0,19).replace('T',' '),s.acceptanceObservedAt.slice(0,19).replace('T',' '),i.conversationId,merchant]);
      }
    }
    await c.execute("UPDATE ai_sales_staff_voices SET status='accepted',provider_message_id=?,projected_message_id=?,next_reconcile_at=NULL WHERE id=? AND merchant_id=?",[receipt,projected||null,voiceId,merchant]);
    return {success:true,status:'accepted',persisted:Boolean(projected)};
  });
}
/** One reservation owns at most one upload and one transport call; recovery never repeats either effect. */
export async function trySendDashboardVoice(merchant:number,actor:number,raw:StaffVoiceInput):Promise<StaffDashboardReplyResult>{
  id.parse(merchant);id.parse(actor);const input=staffVoiceInput.parse(raw),bytes=decodeValidatedAudio(input.audioBase64,input.mimeType);await assertDashboardVoiceSchema();
  const r=await reserve(merchant,actor,input,bytes);
  if('compatibility' in r&&r.compatibility){
    if('result' in r&&r.result)return r.result;
    if(r.fresh){destroySession(merchant,input.conversationId);return sendVoiceCompatibility(merchant,r.id,r.intentDigest,bytes);}
    return reconcileStaffCompatibility('voice',merchant,actor,r.id).catch(()=>({success:false,status:'pending' as const,persisted:false}));
  }
  if(!('intent' in r))return unavailable();
  if(r.fresh){destroySession(merchant,input.conversationId);
    try{
      const storageKey=staffVoiceStorageKey(r.intent),uploaded=await storagePut(storageKey,bytes,input.mimeType);
      if(uploaded.key!==storageKey)return unavailable();const mediaUrl=validateStaffVoiceUrl(uploaded.url);
      const basis=staffVoiceBasis.parse({version:'sales-staff-voice-basis.v1',intent:r.intent,intentDigest:hash(r.intent),mediaUrlDigest:hash(mediaUrl),fileName:`voice-message.${staffVoiceExtension[input.mimeType]}`});
      await checkoutTransaction(async c=>{
        await authorizeDashboardStaff(c,merchant,actor);
        const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_voices WHERE id=? AND merchant_id=? FOR UPDATE',[r.id,merchant]);
        if(rows.length!==1||hash(readStaffVoiceIntent(rows[0]))!==hash(r.intent)||rows[0].basis)return unavailable();
        const [saved]=await c.execute<any>('UPDATE ai_sales_staff_voices SET media_url=?,basis=?,basis_digest=? WHERE id=? AND merchant_id=? AND basis IS NULL',[mediaUrl,JSON.stringify(basis),hash(basis),r.id,merchant]);
        if(saved.affectedRows!==1)return unavailable();
      });
      await sendMerchantWhatsApp({merchantId:merchant,instanceRecordId:r.intent.instanceRecordId,idempotencyKey:staffVoiceKey(merchant,r.id),kind:'audio',to:r.customer_phone,
        mediaUrl,fileName:basis.fileName,staffVoiceGuard:{id:r.id,basisDigest:hash(basis)}});
    }catch{ /* Preserve unknown upload/commit/transport effects; never recreate an object or resend automatically. */ }
  }
  return reconcileDashboardVoice(merchant,r.id).catch(()=>({success:false,status:'pending' as const,persisted:false}));
}
export async function runDashboardVoiceRecoveryBatch(){
  const jobs=await checkoutTransaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT id,merchant_id FROM ai_sales_staff_voices WHERE compatibility=0 AND next_reconcile_at<=UTC_TIMESTAMP(3)
      AND created_at<TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP(3)) ORDER BY next_reconcile_at,id LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for(const r of rows)await c.execute('UPDATE ai_sales_staff_voices SET next_reconcile_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?',[r.id]);return rows;
  });for(const r of jobs)await reconcileDashboardVoice(r.merchant_id,r.id).catch(()=>{});return jobs.length;
}
export async function startDashboardVoiceRecoveryWorker(){
  await assertDashboardVoiceSchema();let active:Promise<unknown>|undefined,stopped=false;
  const tick=()=>{if(stopped||active)return;active=runDashboardVoiceRecoveryBatch().catch(()=>{}).finally(()=>{active=undefined;});};
  const timer=setInterval(tick,60_000);timer.unref();tick();return async()=>{stopped=true;clearInterval(timer);await active;};
}
