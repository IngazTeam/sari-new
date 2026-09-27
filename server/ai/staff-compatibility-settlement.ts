import {z} from 'zod';
import {checkoutTransaction} from './checkout-agreements';
import {authorizeDashboardStaff} from './staff-dashboard-reply';
import {databaseTimeEpoch} from '../db/time';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {readStaffTextCompatibility,staffCompatibilityCustomer,staffCompatibilityResult,staffCompatibilitySnapshot} from './staff-dashboard-compatibility';
import {readVoiceCompatibility,compatibilityVoiceCustomer,voiceCompatibilityBasis} from './staff-voice-compatibility-contract';
import {compatibilityDeliveryKey,readCompatibilityDelivery,type CompatibilityDeliveryBasis} from './staff-compatibility-settlement-contract';
import type {StaffDashboardReplyResult} from '../../shared/staff-dashboard-reply';

const pending=():StaffDashboardReplyResult=>({success:false,status:'pending',persisted:false});
const unavailable=():never=>{throw Error('Compatibility settlement unavailable');};
/** SQL-only settlement of a saved transport acknowledgement. Never calls storage or WhatsApp. */
export async function reconcileStaffCompatibility(kind:'text'|'voice',merchant:number,actor:number,source:number,conversation?:number):Promise<StaffDashboardReplyResult>{
  if(conversation!==undefined)z.number().int().positive().safe().parse(conversation);
  z.enum(['text','voice']).parse(kind);for(const value of [merchant,actor,source])z.number().int().positive().safe().parse(value);
  return checkoutTransaction(async c=>{
    await authorizeDashboardStaff(c,merchant,actor);
    const table=kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices';
    const [rows]=await c.execute<any[]>(`SELECT * FROM ${table} WHERE id=? AND merchant_id=? FOR UPDATE`,[source,merchant]);
    if(rows.length!==1)return unavailable();const row=rows[0];
    const text=kind==='text'?readStaffTextCompatibility(row):null,voice=kind==='voice'?readVoiceCompatibility(row):null;
    const owner=text?.actorUserId??voice?.intent.actor;if(owner!==actor)return unavailable();
    if(conversation!==undefined&&(text?.conversationId??voice?.intent.conversationId)!==conversation)return unavailable();
    const result=text?.result??voice?.result;if(result)return result;
    const pinnedText=text?.version==='staff-text-compatibility.v2'?text:null;
    const pinnedVoice=voice?.intent.version==='staff-voice-compatibility.v2'?voice.intent:null;
    const authority=pinnedText?.authority??pinnedVoice?.authority;
    if(!authority||kind==='voice'&&!voice?.basis)return pending();
    const basis:CompatibilityDeliveryBasis={kind,merchantId:merchant,sourceId:source,instanceRecordId:authority.recordId,basisDigest:row.basis_digest,
      phone:row.customer_phone,...(kind==='text'?{text:row.reply_text}:{mediaUrl:row.media_url,fileName:voice!.basis!.fileName})};
    const [[time]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now'),observedAt=new Date(databaseTimeEpoch(time.now)).toISOString();
    let delivery:ReturnType<typeof readCompatibilityDelivery>;
    let legacyReceipt:string|undefined;
    if(authority.source==='registered'){
      const [deliveries]=await c.execute<any[]>('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=? FOR UPDATE',[merchant,compatibilityDeliveryKey(basis)]);
      if(!deliveries.length)return pending();if(deliveries.length!==1)return unavailable();
      delivery=readCompatibilityDelivery(basis,deliveries[0],observedAt);if(!delivery)return pending();
    }else{
      // The readers above bind this saved proof to the original account, request and source.
      legacyReceipt=(pinnedText?.legacyDelivery??voice?.basis?.legacyDelivery)?.providerMessageId;
      if(!legacyReceipt)return pending();delivery=null;
    }
    const receipt=legacyReceipt??delivery!.receipt;
    const conversationId=pinnedText?.conversationId??pinnedVoice!.conversationId,customerKey=pinnedText?.customerKey??pinnedVoice!.customerKey;
    const [convs]=await c.execute<any[]>('SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE',[conversationId,merchant]);
    let persisted=false;
    if(convs.length===1&&(kind==='text'?staffCompatibilityCustomer(merchant,convs[0].customerPhone):compatibilityVoiceCustomer(merchant,convs[0].customerPhone))===customerKey){
      const content=kind==='text'?row.reply_text:`[رسالة صوتية — ${Math.round(pinnedVoice!.duration)} ثانية]`;
      const [messages]=await c.execute<any[]>('SELECT * FROM messages WHERE conversationId=? AND externalId=? FOR UPDATE',[conversationId,receipt]);
      if(messages.length>1||messages.some(m=>m.direction!=='outgoing'||m.messageType!==kind||m.sender_type!=='merchant'||m.content!==content
        ||kind==='voice'&&(m.voiceUrl!==row.media_url||m.mediaUrl!==row.media_url)))return unavailable();
      if(!messages.length){
        if(kind==='text')await c.execute("INSERT INTO messages (conversationId,direction,messageType,content,externalId,isProcessed,sender_type,createdAt) VALUES (?,'outgoing','text',?,?,1,'merchant',?)",[conversationId,content,receipt,observedAt.slice(0,23).replace('T',' ')]);
        else await c.execute("INSERT INTO messages (conversationId,direction,messageType,content,voiceUrl,mediaUrl,externalId,isProcessed,sender_type,createdAt) VALUES (?,'outgoing','voice',?,?,?,?,1,'merchant',?)",[conversationId,content,row.media_url,row.media_url,receipt,observedAt.slice(0,23).replace('T',' ')]);
      }
      await c.execute('UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,UTC_TIMESTAMP()),UTC_TIMESTAMP()) WHERE id=? AND merchantId=?',[conversationId,merchant]);persisted=true;
    }
    const settled=staffCompatibilityResult.parse({success:true,status:'accepted',persisted});
    const proof=delivery?{settlement:delivery.proof}:{};
    const snapshot=kind==='text'?staffCompatibilitySnapshot.parse({...text,result:settled,...proof}):voiceCompatibilityBasis.parse({...voice!.basis,result:settled,...proof});
    const [saved]=kind==='text'
      ?await c.execute<any>("UPDATE ai_sales_staff_replies SET status='accepted',basis=?,basis_digest=? WHERE id=? AND merchant_id=? AND status='reserved'",[JSON.stringify(snapshot),hash(snapshot),source,merchant])
      :await c.execute<any>("UPDATE ai_sales_staff_voices SET status='accepted',basis=?,basis_digest=?,compatibility_result=? WHERE id=? AND merchant_id=? AND status='reserved'",[JSON.stringify(snapshot),hash(snapshot),JSON.stringify(settled),source,merchant]);
    if(saved.affectedRows!==1)return unavailable();return settled;
  });
}
