/** Persist only a payload fingerprint and UUID, never the message or phone. Fail before sending if unavailable. */
export async function staffDashboardAttempt(merchantId:number,conversationId:number,message:string){
  if(!Number.isSafeInteger(merchantId)||merchantId<=0||!Number.isSafeInteger(conversationId)||conversationId<=0||!message.trim())throw Error('Reply context unavailable');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({merchantId,conversationId,message:message.trim()})));
  const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`sary:staff-reply:v1:${digest}`,prior=sessionStorage.getItem(key);
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(prior&&!uuid.test(prior))throw Error('Reply attempt storage unavailable');
  const requestId=prior||crypto.randomUUID();sessionStorage.setItem(key,requestId);
  if(sessionStorage.getItem(key)!==requestId)throw Error('Reply attempt storage unavailable');
  return {requestId,complete:()=>{if(sessionStorage.getItem(key)===requestId)sessionStorage.removeItem(key);}};
}
