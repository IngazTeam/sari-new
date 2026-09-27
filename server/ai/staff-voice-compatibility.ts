import type {PoolConnection} from 'mysql2/promise';
import {z} from 'zod';
import {databaseTimeEpoch} from '../db/time';
import {storagePut} from '../storage';
import {getWhatsAppProvider} from '../channels/whatsapp/providers';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import type {SendMerchantWhatsAppInput,WhatsAppProviderConfig} from '../channels/whatsapp/types';
import {checkoutTransaction} from './checkout-agreements';
import {authorizeDashboardStaff} from './staff-dashboard-reply';
import {transitionOwnershipInTransaction} from './conversation-handoff';
import {selectStaffCompatibilityAccount} from './staff-compatibility-authority';
import {staffAccountDigest} from './sales-staff-acceptance-contract';
import {saveLegacyStaffDelivery} from './staff-legacy-delivery';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {validateStaffVoiceUrl} from './staff-dashboard-voice-contract';
import {compatibilityAudioDigest,compatibilityVoiceCustomer,pinnedVoiceCompatibilityIntent,voiceCompatibilityBasis,readVoiceCompatibility,
  compatibilityVoiceKey,compatibilityVoiceStorageKey} from './staff-voice-compatibility-contract';
import {staffVoiceExtension,type StaffVoiceInput} from '../../shared/staff-dashboard-voice';
import type {StaffDashboardReplyResult} from '../../shared/staff-dashboard-reply';
import {reconcileStaffCompatibility} from './staff-compatibility-settlement';

const unavailable=():never=>{throw Error('Voice compatibility authority unavailable');};
const pending=():StaffDashboardReplyResult=>({success:false,status:'pending',persisted:false});
export async function reserveVoiceCompatibility(c:PoolConnection,merchant:number,actor:number,input:StaffVoiceInput,bytes:Buffer,conv:any){
  if((conv.customerPhone.startsWith('group_')||conv.customerPhone.endsWith('@g.us'))&&!/^(?:group_\d{8,30}|\d{8,30}@g\.us)$/.test(conv.customerPhone))return unavailable();
  const {authority}=await selectStaffCompatibilityAccount(c,merchant);
  const [[time]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now'),now=new Date(databaseTimeEpoch(time.now)).toISOString();
  const [settings]=await c.execute<any[]>('SELECT takeover_timeout_minutes FROM bot_settings WHERE merchant_id=?',[merchant]);
  const ownership=await transitionOwnershipInTransaction(c,input.conversationId,{humanTakeover:1,humanTakeoverAt:new Date(now),humanExpiresAt:new Date(Date.parse(now)+(Number(settings[0]?.takeover_timeout_minutes)||15)*60000)},
    {merchantId:merchant,expectedVersion:conv.handoff_version});
  const [saved]=await c.execute<any>(`INSERT INTO ai_sales_staff_voices (merchant_id,actor_user_id,conversation_id,request_id,instance_id,ownership_version,customer_phone,compatibility,next_reconcile_at)
    VALUES (?,?,?,?,0,?,?,1,NULL)`,[merchant,actor,input.conversationId,input.requestId,ownership.version,conv.customerPhone]);
  const intent=pinnedVoiceCompatibilityIntent.parse({version:'staff-voice-compatibility.v2',sourceId:Number(saved.insertId),merchant,actor,conversationId:input.conversationId,
    requestId:input.requestId,ownershipVersion:ownership.version,authority,reservedAt:now,audioDigest:compatibilityAudioDigest(bytes),byteLength:bytes.length,
    mimeType:input.mimeType,duration:input.duration,customerKey:compatibilityVoiceCustomer(merchant,conv.customerPhone),scope:'unmeasured_compatibility'});
  const [updated]=await c.execute<any>('UPDATE ai_sales_staff_voices SET intent=?,intent_digest=? WHERE id=? AND merchant_id=? AND intent IS NULL',[JSON.stringify(intent),hash(intent),intent.sourceId,merchant]);
  if(updated.affectedRows!==1)return unavailable();return {id:intent.sourceId,compatibility:true as const,fresh:true,intentDigest:hash(intent)};
}
async function inspect(c:PoolConnection,merchant:number,voice:number,intentDigest?:string){
  await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
  const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_voices WHERE id=? AND merchant_id=? FOR UPDATE',[voice,merchant]);
  if(rows.length!==1)return unavailable();const row=rows[0],record=readVoiceCompatibility(row),i=record.intent;
  if(i.version!=='staff-voice-compatibility.v2'||record.result||record.basis?.legacyDelivery||(intentDigest&&hash(i)!==intentDigest))return unavailable();
  await authorizeDashboardStaff(c,merchant,i.actor);
  const [convs]=await c.execute<any[]>(`SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? AND handoff_version=? AND human_takeover=1
    AND (human_expires_at>UTC_TIMESTAMP(3) OR (human_expires_at IS NULL AND human_takeover_at>TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP(3)))) FOR SHARE`,[i.conversationId,merchant,i.ownershipVersion]);
  if(convs.length!==1||compatibilityVoiceCustomer(merchant,convs[0].customerPhone)!==i.customerKey)return unavailable();
  const {authority,config}=await selectStaffCompatibilityAccount(c,merchant);if(hash(authority)!==hash(i.authority))return unavailable();
  return {intent:i,basis:record.basis,config,phone:row.customer_phone as string,mediaUrl:row.media_url as string|null};
}
export async function canDispatchVoiceCompatibility(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig){
  try{const g=z.object({id:z.number().int().positive().safe(),basisDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(input.staffCompatibilityVoiceGuard);
    return await checkoutTransaction(async c=>{const current=await inspect(c,input.merchantId,g.id),i=current.intent,b=current.basis;
      return !!b&&g.basisDigest===hash(b)&&i.authority.source==='registered'&&i.authority.recordId===input.instanceRecordId&&i.authority.accountDigest===staffAccountDigest(config)
        &&input.idempotencyKey===compatibilityVoiceKey(input.merchantId,g.id)&&input.kind==='audio'&&input.to===current.phone&&input.mediaUrl===current.mediaUrl&&input.fileName===b.fileName
        &&input.text===undefined&&!input.template&&!input.replyGuard&&!input.salesReplyGuard&&!input.staffReplyGuard&&!input.staffVoiceGuard&&!input.staffCompatibilityGuard
        &&!input.escalationGuard&&!input.salesOfferGuard&&!input.bookingNoticeGuard&&!input.appointmentReminderGuard&&!input.followUpGuard;
    });
  }catch{return false;}
}
/** Only the fresh reservation may upload and dispatch. All retries are read-only. */
export async function sendVoiceCompatibility(merchant:number,voice:number,intentDigest:string,bytes:Buffer):Promise<StaffDashboardReplyResult>{
  try{
    const start=await checkoutTransaction(c=>inspect(c,merchant,voice,intentDigest));
    if(start.basis||bytes.length!==start.intent.byteLength||compatibilityAudioDigest(bytes)!==start.intent.audioDigest)return pending();
    const storageKey=compatibilityVoiceStorageKey(start.intent),uploaded=await storagePut(storageKey,bytes,start.intent.mimeType);
    if(uploaded.key!==storageKey)return pending();const mediaUrl=validateStaffVoiceUrl(uploaded.url);
    const basis=voiceCompatibilityBasis.parse({version:'staff-voice-compatibility-basis.v2',intentDigest,mediaUrlDigest:hash(mediaUrl),
      fileName:`voice-message.${staffVoiceExtension[start.intent.mimeType]}`,result:null});
    await checkoutTransaction(async c=>{const current=await inspect(c,merchant,voice,intentDigest);if(current.basis)return unavailable();
      const [saved]=await c.execute<any>('UPDATE ai_sales_staff_voices SET media_url=?,basis=?,basis_digest=? WHERE id=? AND merchant_id=? AND basis IS NULL',[mediaUrl,JSON.stringify(basis),hash(basis),voice,merchant]);
      if(saved.affectedRows!==1)return unavailable();});
    const current=await checkoutTransaction(c=>inspect(c,merchant,voice,intentDigest));if(!current.basis||hash(current.basis)!==hash(basis))return unavailable();
    const request={kind:'audio' as const,to:current.phone,mediaUrl,fileName:basis.fileName};
    if(current.intent.authority.source==='registered'){
      await sendMerchantWhatsApp({...request,merchantId:merchant,instanceRecordId:current.intent.authority.recordId,idempotencyKey:compatibilityVoiceKey(merchant,voice),staffCompatibilityVoiceGuard:{id:voice,basisDigest:hash(basis)}}).catch(()=>{});
      return await reconcileStaffCompatibility('voice',merchant,current.intent.actor,voice);
    }
    const sent=await getWhatsAppProvider(current.config.provider).send(current.config,request);
    if(!await saveLegacyStaffDelivery('voice',merchant,voice,hash(basis),sent))return pending();
    return await reconcileStaffCompatibility('voice',merchant,current.intent.actor,voice);
  }catch{return pending();}
}
