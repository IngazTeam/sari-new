import webpush from 'web-push';
import { z } from 'zod';
import { getActivePushSubscriptions } from '../db_push';
import { noticeHash,noticePlan,target,type NoticeTarget,type NoticeOutcome,type NoticeHooks } from '../integrations/notice-evidence';

type Prepared={target:NoticeTarget;authorize?:()=>Promise<void>;send?:()=>Promise<NoticeOutcome>};
const unknown=(status:number|null=null):NoticeOutcome=>({state:'unknown',httpStatus:status,referenceHash:null});
const accepted=(status:number,reference:unknown):NoticeOutcome=>({state:'accepted',httpStatus:status,referenceHash:noticeHash(reference)});
const rejected=(status:number,reference:unknown):NoticeOutcome=>({state:'rejected',httpStatus:status,referenceHash:noticeHash(reference)});
async function bounded(response:Response) {
  if(!response.body)return '';const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>64000)throw Error('Response too large');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return Buffer.concat(chunks).toString('utf8');
}
export async function deliverNotices(method:'owner'|'email'|'push'|'both',prepared:Prepared[],hooks:NoticeHooks) {
  const plan=noticePlan.parse({version:1,method,targets:prepared.map(p=>p.target)});await hooks.plan(plan);
  let complete=true;
  for(const p of prepared) {
    if(p.target.initial!=='ready'){complete=false;continue;}
    // No network until both current authority and the target's durable marker
    // succeed. An uncertain marker commit cannot be treated as a safe retry.
    try{await p.authorize?.();}catch{complete=false;await hooks.finish(p.target.key,{state:'blocked',httpStatus:null,referenceHash:null});continue;}
    await hooks.start(p.target.key);
    let outcome:NoticeOutcome;
    try{outcome=await p.send!();}catch{outcome=unknown();}
    // A failed receipt write is not overwritten with an invented failure.
    await hooks.finish(p.target.key,outcome);complete&&=outcome.state==='accepted';
  }
  return complete;
}
export const suppressedNotice=(channel:NoticeTarget['channel'],initial:'disabled'|'unconfigured'|'unavailable'):Prepared=>({target:target(channel,['no-recipient',initial],null,initial)});
export function prepareEmailNotice(input:{userId:number;to:string;subject:string;html:string},authorize:()=>Promise<void>):Prepared {
  const apiKey=process.env.SMTP2GO_API_KEY,sender=process.env.SMTP_FROM||'noreply@sary.live';
  if(!apiKey)return suppressedNotice('email','unconfigured');
  if(!z.string().email().safeParse(input.to).success)return suppressedNotice('email','unavailable');
  const body=JSON.stringify({sender,to:[input.to],subject:input.subject,html_body:input.html,fastaccept:false});
  return {target:target('email',[input.userId,input.to],[sender,noticeHash(apiKey),body]),authorize:async()=>{
    if(process.env.SMTP2GO_API_KEY!==apiKey||(process.env.SMTP_FROM||'noreply@sary.live')!==sender)throw Error('Email configuration changed');await authorize();
  },send:async()=>{
    const r=await fetch('https://api.smtp2go.com/v3/email/send',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-Smtp2go-Api-Key':apiKey},body});
    const raw=JSON.parse(await bounded(r)),request=z.string().uuid().safeParse(raw?.request_id);
    if(!request.success)return unknown(r.status);
    const d=raw.data;
    if(r.status===200&&d?.succeeded===1&&d.failed===0&&Array.isArray(d.failures)&&d.failures.length===0
      &&typeof d.email_id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(d.email_id)&&!d.error&&!d.error_code) return accepted(200,[request.data,d.email_id]);
    if(r.status===200&&d?.succeeded===0&&d.failed===1&&Array.isArray(d.failures)&&d.failures.length===1&&!d.email_id)return rejected(200,request.data);
    if([400,401,403,422].includes(r.status)&&typeof d?.error_code==='string'&&d.error_code&&!d.email_id&&!d.succeeded)return rejected(r.status,request.data);
    return unknown(r.status);
  }};
}
function pushEndpoint(value:string) {
  const u=new URL(value),host=u.hostname.toLowerCase();
  // Browser push services only; no merchant-controlled URL, IP, proxy or redirect.
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'
    ||!(['fcm.googleapis.com','android.googleapis.com','web.push.apple.com'].includes(host)
      ||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host.endsWith('.notify.windows.com')))throw Error('Unsupported push service');
  return u;
}
export async function preparePushNotices(merchantId:number,payload:{title:string;body:string;url?:string},authorize:()=>Promise<void>):Promise<Prepared[]> {
  const publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY;
  if(!publicKey||!privateKey)return [suppressedNotice('push','unconfigured')];
  const subscriptions=await getActivePushSubscriptions(merchantId);
  if(!subscriptions.length||subscriptions.length>63)return [suppressedNotice('push','unavailable')];
  const endpoints=subscriptions.map(s=>{try{return pushEndpoint(s.endpoint).href;}catch{return s.endpoint;}});
  if(new Set(endpoints).size!==endpoints.length)return [suppressedNotice('push','unavailable')];
  const body=JSON.stringify({...payload,icon:'/logo.png',badge:'/badge.png',url:payload.url||'/',tag:'sari-notification',requireInteraction:false,actions:[]});
  return subscriptions.map(s=>{
    const t=target('push',[s.id,s.endpoint,s.p256dh,s.auth],[noticeHash([publicKey,privateKey]),body]);
    let details:ReturnType<typeof webpush.generateRequestDetails>;
    try{pushEndpoint(s.endpoint);details=webpush.generateRequestDetails({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},body,
      {TTL:3600,vapidDetails:{subject:'mailto:support@sari.app',publicKey,privateKey}});
      if(details.endpoint!==s.endpoint||details.method!=='POST'||!Buffer.isBuffer(details.body))throw Error('Invalid push request');
    }catch{return {target:{...t,initial:'unavailable'}};}
    return {target:t,authorize:async()=>{
      const current=(await getActivePushSubscriptions(merchantId)).find(c=>c.id===s.id);
      if(!current||['endpoint','p256dh','auth'].some(k=>(current as any)[k]!==(s as any)[k])
        ||process.env.VAPID_PUBLIC_KEY!==publicKey||process.env.VAPID_PRIVATE_KEY!==privateKey)throw Error('Push subscription changed');await authorize();
    },send:async()=>{
      const r=await fetch(details.endpoint,{method:'POST',headers:Object.fromEntries(Object.entries(details.headers).map(([k,v])=>[k,String(v)])),body:new Uint8Array(details.body!),redirect:'error',signal:AbortSignal.timeout(20000)});
      await bounded(r);
      if(r.status===201){const location=r.headers.get('location');if(!location||location.length>4096)return unknown(201);
        const ref=new URL(location,s.endpoint);if(ref.protocol!=='https:'||ref.username||ref.password)return unknown(201);return accepted(201,ref.href);}
      return [400,401,403,404,410,413].includes(r.status)?rejected(r.status,['web-push',r.status]):unknown(r.status);
    }};
  });
}
export function prepareOwnerNotice(endpoint:string,key:string,payload:{title:string;content:string},authorize:()=>Promise<void>):Prepared {
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid owner endpoint');
  const body=JSON.stringify(payload);
  return {target:target('owner',[endpoint,noticeHash(key)],body),authorize,send:async()=>{
    const r=await fetch(endpoint,{method:'POST',headers:{accept:'application/json',authorization:`Bearer ${key}`,'content-type':'application/json','connect-protocol-version':'1'},body,redirect:'error',signal:AbortSignal.timeout(20000)});
    const response=await bounded(r);
    // This provider exposes HTTP acceptance, not a documented recipient receipt.
    return r.ok?accepted(r.status,['http_ack',response]):[400,401,403,404,422].includes(r.status)?rejected(r.status,['http_rejected',r.status]):unknown(r.status);
  }};
}
