import type {PoolConnection} from 'mysql2/promise';
import {decryptSecret} from '../security/secrets';
import {staffAccountDigest} from './sales-staff-acceptance-contract';
import {staffCompatibilityAuthority,staffCompatibilityCustomer,readStaffTextCompatibility} from './staff-dashboard-compatibility';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {checkoutTransaction} from './checkout-agreements';
import {authorizeDashboardStaff} from './staff-dashboard-reply';
import type {WhatsAppProviderConfig,SendMerchantWhatsAppInput} from '../channels/whatsapp/types';

const unavailable=():never=>{throw Error('Staff compatibility authority unavailable');};
export const staffCompatibilityKey=(merchant:number,reply:number)=>`staff_compat_text:${merchant}:${reply}`;
/** Local support contract: compatibility sends use the existing Green API adapter only. */
function configFor(row:any,legacy:boolean):WhatsAppProviderConfig{
  const config:WhatsAppProviderConfig={provider:legacy?'green_api':row.provider,instanceId:legacy?row.instanceId:row.instance_id,
    token:decryptSecret(legacy?row.apiToken:row.token),apiUrl:legacy?(row.apiUrl||'https://api.green-api.com'):row.api_url,
    phoneNumberId:legacy?null:row.phone_number_id,providerAccountId:legacy?null:row.provider_account_id};
  const url=new URL(config.apiUrl!);
  if(config.provider!=='green_api'||!/^\d+$/.test(config.instanceId)||!/^[a-zA-Z0-9_-]+$/.test(config.token)
    ||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||!['','/'].includes(url.pathname)
    ||!['api.green-api.com','api.greenapi.com'].some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))return unavailable();
  return config;
}
export async function selectStaffCompatibilityAccount(c:PoolConnection,merchant:number){
  const [registered]=await c.execute<any[]>('SELECT * FROM whatsapp_instances WHERE merchant_id=? FOR SHARE',[merchant]);
  if(registered.length){const selected=registered.filter(r=>r.is_primary===1&&r.status==='active');if(selected.length!==1)return unavailable();
    const row=selected[0],config=configFor(row,false);return {config,authority:staffCompatibilityAuthority.parse({source:'registered',recordId:row.id,accountDigest:staffAccountDigest(config)})};}
  const [legacy]=await c.execute<any[]>('SELECT * FROM whatsapp_connection_requests WHERE merchantId=? ORDER BY createdAt DESC,id DESC LIMIT 1 FOR SHARE',[merchant]);
  if(legacy.length!==1||!['approved','connected'].includes(legacy[0].status))return unavailable();
  const config=configFor(legacy[0],true);return {config,authority:staffCompatibilityAuthority.parse({source:'legacy',recordId:legacy[0].id,accountDigest:staffAccountDigest(config)})};
}
/** Re-read current authority immediately before handing the frozen request to transport. */
export async function inspectStaffCompatibilityDispatch(merchant:number,reply:number,basisDigest:string){
  return checkoutTransaction(async c=>{
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
    const [rows]=await c.execute<any[]>('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=? AND id=? FOR SHARE',[merchant,reply]);
    if(rows.length!==1)return unavailable();const row=rows[0],basis=readStaffTextCompatibility(row);
    if(basis.version!=='staff-text-compatibility.v2'||basis.result||hash(basis)!==basisDigest)return unavailable();
    await authorizeDashboardStaff(c,merchant,basis.actorUserId);
    const [conversations]=await c.execute<any[]>(`SELECT customerPhone FROM conversations WHERE merchantId=? AND id=? AND handoff_version=? AND human_takeover=1
      AND (human_expires_at>UTC_TIMESTAMP(3) OR (human_expires_at IS NULL AND human_takeover_at>TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP(3)))) FOR SHARE`,[merchant,basis.conversationId,basis.ownershipVersion]);
    if(conversations.length!==1||staffCompatibilityCustomer(merchant,conversations[0].customerPhone)!==basis.customerKey)return unavailable();
    const current=await selectStaffCompatibilityAccount(c,merchant);
    if(hash(current.authority)!==hash(basis.authority))return unavailable();return {basis,config:current.config,phone:row.customer_phone,text:row.reply_text};
  });
}
export async function canDispatchStaffCompatibility(input:SendMerchantWhatsAppInput,config:WhatsAppProviderConfig){
  try{
    const g=input.staffCompatibilityGuard;if(!g||!Number.isSafeInteger(g.id)||g.id<=0||!/^[a-f0-9]{64}$/.test(g.basisDigest)||Object.keys(g).length!==2)return false;
    const current=await inspectStaffCompatibilityDispatch(input.merchantId,g.id,g.basisDigest),b=current.basis;
    return b.authority.source==='registered'&&b.authority.recordId===input.instanceRecordId&&b.authority.accountDigest===staffAccountDigest(config)
      &&input.idempotencyKey===staffCompatibilityKey(input.merchantId,g.id)&&input.kind==='text'&&input.to===current.phone&&input.text===current.text
      &&!input.mediaUrl&&!input.fileName&&!input.template&&!input.replyGuard&&!input.salesReplyGuard&&!input.staffReplyGuard&&!input.staffVoiceGuard&&!input.staffCompatibilityVoiceGuard
      &&!input.escalationGuard&&!input.salesOfferGuard&&!input.bookingNoticeGuard&&!input.appointmentReminderGuard&&!input.followUpGuard;
  }catch{return false;}
}
