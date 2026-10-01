import { staffAttemptIdentity } from './staff-attempt-identity';
/** Persist only a payload fingerprint and UUID, never the message or phone. Fail before sending if unavailable. */
export async function staffDashboardAttempt(actorId:number,merchantId:number,conversationId:number,message:string){
  if(!Number.isSafeInteger(merchantId)||merchantId<=0||!Number.isSafeInteger(conversationId)||conversationId<=0||!message.trim())throw Error('Reply context unavailable');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({merchantId,conversationId,message:message.trim()})));
  const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  return staffAttemptIdentity('reply',actorId,digest);
}
