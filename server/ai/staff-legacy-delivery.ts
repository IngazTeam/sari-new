import {checkoutTransaction} from './checkout-agreements';
import {databaseTimeEpoch} from '../db/time';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';
import {readStaffTextCompatibility,staffCompatibilitySnapshot} from './staff-dashboard-compatibility';
import {readVoiceCompatibility,voiceCompatibilityBasis} from './staff-voice-compatibility-contract';
import {acceptedLegacyReceipt,createLegacyStaffDelivery} from './staff-legacy-delivery-contract';

/** Commit transport evidence independently of message projection. No transport, upload, or authority renewal here. */
export async function saveLegacyStaffDelivery(kind:'text'|'voice',merchant:number,source:number,basisDigest:string,sent:unknown){
  const receipt=acceptedLegacyReceipt(sent);if(!receipt)return false;
  return checkoutTransaction(async c=>{
    await c.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchant]);
    const table=kind==='text'?'ai_sales_staff_replies':'ai_sales_staff_voices';
    const [rows]=await c.execute<any[]>(`SELECT * FROM ${table} WHERE id=? AND merchant_id=? FOR UPDATE`,[source,merchant]);
    if(rows.length!==1)throw Error('Legacy delivery source unavailable');const row=rows[0];
    const text=kind==='text'?readStaffTextCompatibility(row):null,voice=kind==='voice'?readVoiceCompatibility(row):null;
    const authority=text?.version==='staff-text-compatibility.v2'?text.authority:voice?.intent.version==='staff-voice-compatibility.v2'?voice.intent.authority:null;
    const basis=text?.version==='staff-text-compatibility.v2'?text:voice?.basis;
    if(!basis||basis.result||basis.legacyDelivery||authority?.source!=='legacy'||row.basis_digest!==basisDigest)throw Error('Legacy delivery basis changed');
    const [[time]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
    const legacyDelivery=createLegacyStaffDelivery({kind,merchantId:merchant,sourceId:source,connectionId:authority.recordId,
      accountDigest:authority.accountDigest,basisDigest,phone:row.customer_phone,
      ...(kind==='text'?{text:row.reply_text}:{mediaUrl:row.media_url,fileName:voice!.basis!.fileName})},receipt,new Date(databaseTimeEpoch(time.now)).toISOString());
    const snapshot=kind==='text'?staffCompatibilitySnapshot.parse({...basis,legacyDelivery}):voiceCompatibilityBasis.parse({...basis,legacyDelivery});
    // Keep status reserved until the separate SQL-only settlement transaction completes.
    const [saved]=await c.execute<any>(`UPDATE ${table} SET basis=?,basis_digest=? WHERE id=? AND merchant_id=? AND status='reserved' AND basis_digest=?`,
      [JSON.stringify(snapshot),hash(snapshot),source,merchant,basisDigest]);
    if(saved.affectedRows!==1)throw Error('Legacy delivery save failed');return true;
  });
}
