import { staffVoiceMime } from '@shared/staff-dashboard-voice';

/** The same recording in the same tab retains its request identity; audio bytes stay in memory only. */
export async function staffVoiceAttempt(merchantId:number,conversationId:number,audio:Blob,duration:number){
  if(!Number.isSafeInteger(merchantId)||merchantId<=0||!Number.isSafeInteger(conversationId)||conversationId<=0||!Number.isFinite(duration)||duration<=0||duration>3600||audio.size<=0||audio.size>16*1024*1024)throw Error('Voice unavailable');
  const mimeType=staffVoiceMime.parse(audio.type.split(';')[0]),bytes=await audio.arrayBuffer();
  const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
  const audioDigest=hex(await crypto.subtle.digest('SHA-256',bytes));
  const fingerprint=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({merchantId,conversationId,mimeType,duration,audioDigest}))));
  const key=`sary:staff-voice:v1:${fingerprint}`,prior=sessionStorage.getItem(key);
  if(prior&&!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(prior))throw Error('Voice identity unavailable');
  const requestId=prior||crypto.randomUUID();sessionStorage.setItem(key,requestId);if(sessionStorage.getItem(key)!==requestId)throw Error('Voice identity unavailable');
  const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Voice unavailable'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(audio);});
  const audioBase64=dataUrl.split(',')[1];if(!audioBase64)throw Error('Voice unavailable');
  return {input:{conversationId,requestId,audioBase64,mimeType,duration},complete:()=>{if(sessionStorage.getItem(key)===requestId)sessionStorage.removeItem(key);}};
}
