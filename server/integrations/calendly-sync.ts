import {eventSchema,inviteeSchema} from './calendly-canonical';
import {z} from 'zod';
import type {PoolConnection} from 'mysql2/promise';
import {calendlySyncCommand,type calendlySyncPeriod} from '../../shared/calendly-sync';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {privacyHashExact} from '../accounts/privacy-hash';
import {decryptSecret} from '../security/secrets';
import {calendlyConnectionDefinition,calendlyRows} from './calendly-workspace';
import {CalendlyOperationFault,reserveCalendlyOperation,startCalendlyOperation,guardCalendlyOperation,completeCalendlyOperation,stopCalendlyOperation,calendlyOperationTransaction} from './calendly-operation';
import {withCalendlyDashboardAuthority} from './calendly-dashboard-authority';
import {withCalendlyProviderCheckpoint} from './calendly-provider-checkpoint';
import {withCalendlyConnectionLock} from './calendly-lock';
import {listCalendlyCollection,CalendlyApiError} from './calendly-api';
const sqlDate=(value:string)=>new Date(value).toISOString().slice(0,19).replace('T',' ');
const phone=(value:string|null|undefined)=>{if(!value)return null;const compact=value.trim().replace(/[\s().-]/g,''),normalized=compact.startsWith('+')?compact:'+'+compact;return /^\+[1-9]\d{7,14}$/.test(normalized)?normalized:null;};
type Appointment={eventUri:string;inviteeUri:string;eventName:string;customerName:string;email:string|null;phone:string|null;startAt:string;endAt:string;state:'active'|'cancelled';location:string|null;updatedAt:string;cancelledAt:string|null};
/** The bounded provider range is validated fully before any projection writes. */
export async function collectCalendlySync(token:string,userUri:string,period:z.infer<typeof calendlySyncPeriod>):Promise<Appointment[]>{
 if(!calendlyResourceUri(userUri,'user'))throw new CalendlyOperationFault('changed');
 const from=Date.parse(period.startDate+'T00:00:00Z'),until=Date.parse(period.endDate+'T00:00:00Z')+86400000;
 // Include a one millisecond lower margin for APIs whose lower bound is exclusive.
 const query=new URLSearchParams({user:userUri,min_start_time:new Date(from-1).toISOString(),max_start_time:new Date(until).toISOString(),count:'100',sort:'start_time:asc'});
 const events=await listCalendlyCollection<unknown>(token,'/scheduled_events?'+query,500),result:Appointment[]=[],seenEvents=new Set<string>(),seenInvitees=new Set<string>();
 for(const raw of events){
  const event=eventSchema.parse(raw),starts=Date.parse(event.start_time);
  if(seenEvents.has(event.uri)||!event.event_memberships.some(m=>m.user===userUri)||starts<from||starts>=until)throw new CalendlyOperationFault('changed');seenEvents.add(event.uri);
  const invitees=await listCalendlyCollection<unknown>(token,event.uri+'/invitees?count=100',Math.max(1,1000-result.length));
  for(const rawInvitee of invitees){
   const invitee=inviteeSchema.parse(rawInvitee);if(result.length>=1000)throw new CalendlyApiError(502,'collection_limit_exceeded');
   if(invitee.event!==event.uri||!invitee.uri.startsWith(event.uri+'/invitees/')||seenInvitees.has(invitee.uri))throw new CalendlyOperationFault('changed');seenInvitees.add(invitee.uri);
   const state=event.status==='canceled'||invitee.status==='canceled'?'cancelled':'active',updatedAt=new Date(Math.max(Date.parse(event.updated_at),Date.parse(invitee.updated_at))).toISOString();
   result.push({eventUri:event.uri,inviteeUri:invitee.uri,eventName:event.name,customerName:invitee.name,email:invitee.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitee.email)?invitee.email.toLowerCase():null,phone:phone(invitee.text_reminder_number),startAt:sqlDate(event.start_time),endAt:sqlDate(event.end_time),state,location:event.location?.location??null,updatedAt:sqlDate(updatedAt),cancelledAt:state==='cancelled'?invitee.cancellation?.created_at||invitee.cancellation?.canceled_at?sqlDate(invitee.cancellation.created_at??invitee.cancellation.canceled_at!):null:null});
  }
 }
 return result;
}
const defaultLaunch=(work:()=>Promise<void>)=>{void work().catch(()=>console.error('[Calendly] reviewed sync outcome unavailable'));};
export async function requestReviewedCalendlySync(actorId:number,merchantId:number,raw:unknown,launch=defaultLaunch){
 const input=calendlySyncCommand.parse(raw);
 const review=async(tx:PoolConnection)=>{const current=await calendlyConnectionDefinition(tx,merchantId,true);if(current.revision!==input.revision||!current.row||Number(current.row.active)!==1||Number(current.row.credentialsStored)!==1||!calendlyResourceUri(current.row.userUri,'user'))throw new CalendlyOperationFault('changed');return current;};
 const admitted=await reserveCalendlyOperation(actorId,merchantId,{requestId:input.requestId,revision:input.revision,kind:'sync',payloadDigest:privacyHashExact(JSON.stringify(input.period))},tx=>review(tx).then(()=>{}));if(!admitted.lease)return admitted.receipt;const lease=admitted.lease;
 let deadline=Infinity;
 const check=async(tx:PoolConnection)=>{if(Date.now()>deadline)throw new CalendlyOperationFault('changed');await guardCalendlyOperation(tx,lease);return review(tx);};
 const checkpoint=()=>calendlyOperationTransaction(async tx=>{await check(tx);});
 const work=async()=>{
  try{await withCalendlyDashboardAuthority({actorId,merchantId},()=>withCalendlyProviderCheckpoint(checkpoint,()=>withCalendlyConnectionLock(merchantId,async()=>{
   await startCalendlyOperation(lease,tx=>review(tx).then(()=>{}));deadline=Date.now()+90_000;
   const saved=await calendlyOperationTransaction(async tx=>{const current=await check(tx);const [credentials]=await calendlyRows(tx,"SELECT access_token AS token FROM platform_integrations WHERE id=? AND merchant_id=? AND platform_type='calendly' FOR UPDATE",[current.row.id,merchantId]);return {current,token:decryptSecret(credentials?.token) as string};});
   const appointments=await collectCalendlySync(saved.token,saved.current.row.userUri,input.period);
   await calendlyOperationTransaction(async tx=>{
    const current=await check(tx);
    for(const a of appointments){
     await tx.execute(`INSERT INTO calendly_appointments(merchant_id,integration_id,event_uri,invitee_uri,event_name,customer_name,customer_email,customer_phone,start_at,end_at,status,location,provider_updated_at,cancelled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE
      ${['integration_id','event_uri','event_name','customer_name','customer_email','customer_phone','start_at','end_at','status','location','cancelled_at'].map(key=>`${key}=IF(VALUES(provider_updated_at)>=provider_updated_at,VALUES(${key}),${key})`).join(',')},provider_updated_at=GREATEST(provider_updated_at,VALUES(provider_updated_at))`,[merchantId,current.row.id,a.eventUri,a.inviteeUri,a.eventName,a.customerName,a.email,a.phone,a.startAt,a.endAt,a.state,a.location,a.updatedAt,a.cancelledAt]);
    }
    await tx.execute("UPDATE platform_integrations SET last_sync_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND platform_type='calendly'",[current.row.id,merchantId]);
    await completeCalendlyOperation(tx,lease,{type:'sync',period:input.period,appointments:appointments.length,active:appointments.filter(a=>a.state==='active').length,cancelled:appointments.filter(a=>a.state==='cancelled').length});
   });
  })));}catch{await stopCalendlyOperation(lease);}
 };
 try{launch(work);}catch{await stopCalendlyOperation(lease);throw new CalendlyOperationFault('unavailable');}return admitted.receipt;
}
