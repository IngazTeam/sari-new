import crypto from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {bookingReadId} from '../../shared/booking-read';
import {calendlyResourceUri} from '../../shared/calendly-provider';
import {CALENDLY_ENDPOINT_PATTERN} from '../webhooks/calendly-security';
import {calendlyWorkspaceSchema,calendlyAppointmentsInput,calendlyAppointmentsSchema,calendlyAppointmentStates,calendlyReceiptsInput,calendlyReceiptsSchema,calendlyReceiptStates} from '../../shared/calendly-workspace';

type Executor=Pick<PoolConnection,'execute'>;
export class CalendlyWorkspaceFault extends Error{constructor(){super('Calendly workspace unavailable');}}
export async function calendlyRows(tx:Executor,query:string,args:Array<string|number|null>=[]):Promise<any[]>{const [rows]=await tx.execute(query,args);if(!Array.isArray(rows))throw new CalendlyWorkspaceFault();return rows;}
export function calendlyCount(value:unknown){const n=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;if(!Number.isSafeInteger(n)||n<0)throw new CalendlyWorkspaceFault();return n;}
export function calendlyStamp(value:unknown){if(value==null)return null;const date=value instanceof Date?value:typeof value==='string'?new Date(value.includes('T')?value:value.replace(' ','T')+'Z'):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null;}
const safeSettings="IF(JSON_VALID(settings),settings,'{}')";
/** Credentials are represented by presence and database hashes; display reads never decrypt them. */
export async function calendlyConnectionDefinition(tx:Executor,merchantId:number,lock=false){
 bookingReadId.parse(merchantId);const suffix=lock?' FOR UPDATE':'';
 if((await calendlyRows(tx,'SELECT id FROM merchants WHERE id=?'+suffix,[merchantId])).length!==1)throw new CalendlyWorkspaceFault();
 const found=await calendlyRows(tx,`SELECT id,is_active AS active,store_name AS userName,store_url AS userUri,created_at AS createdAt,last_sync_at AS lastSyncAt,webhook_endpoint_id AS endpoint,webhook_subscription_uri AS subscription,
  (COALESCE(LENGTH(access_token),0)>0) AS credentialsStored,(COALESCE(LENGTH(webhook_signing_secret),0)>0) AS signingStored,
  SHA2(COALESCE(access_token,''),256) AS tokenVersion,SHA2(COALESCE(webhook_signing_secret,''),256) AS signingVersion,SHA2(COALESCE(settings,''),256) AS settingsVersion,
  ((settings IS NULL OR settings='') OR (JSON_VALID(settings) AND JSON_TYPE(${safeSettings})='OBJECT' AND (JSON_EXTRACT(${safeSettings},'$.syncToWhatsApp') IS NULL OR JSON_TYPE(JSON_EXTRACT(${safeSettings},'$.syncToWhatsApp'))='BOOLEAN'))) AS settingsValid,
  CASE WHEN JSON_TYPE(JSON_EXTRACT(${safeSettings},'$.syncToWhatsApp'))='BOOLEAN' THEN JSON_UNQUOTE(JSON_EXTRACT(${safeSettings},'$.syncToWhatsApp'))='true' ELSE 0 END AS syncToWhatsApp
  FROM platform_integrations WHERE merchant_id=? AND platform_type='calendly'`+suffix,[merchantId]);
 if(found.length>1)throw new CalendlyWorkspaceFault();const row=found[0]??null,{lastSyncAt:_progress,...identity}=row??{};if(row)identity.createdAt=calendlyStamp(row.createdAt);
 const revision=crypto.createHash('sha256').update(JSON.stringify({merchantId,row:row?identity:null})).digest('hex');return {row,revision};
}
export async function calendlySnapshot<T>(actorId:number,merchantId:number,work:(tx:PoolConnection,checkedAt:string)=>Promise<T>){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{const pool=await getPool();if(!pool)throw new CalendlyWorkspaceFault();tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.query('START TRANSACTION READ ONLY');const checkedAt=new Date().toISOString(),value=await work(tx,checkedAt);committing=true;await tx.commit();return value;}
 catch{if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}throw new CalendlyWorkspaceFault();}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
const appointmentStateSql="CASE WHEN status IN ('active','cancelled') THEN status ELSE 'unknown' END";
const receiptStateSql="CASE WHEN status IN ('pending','processing','completed','failed','manual_review') THEN status ELSE 'unknown' END";
const receiptEventSql="CASE WHEN event_type='invitee.created' THEN 'created' WHEN event_type='invitee.canceled' THEN 'cancelled' ELSE 'unknown' END";
const sqlStamp=(value:string)=>value.slice(0,23).replace('T',' ');
export async function readCalendlyWorkspace(actorId:number,merchantId:number){return calendlySnapshot(actorId,merchantId,async(tx,checkedAt)=>{
 const {row,revision}=await calendlyConnectionDefinition(tx,merchantId),now=sqlStamp(checkedAt);
 const [totals]=await calendlyRows(tx,`SELECT COUNT(*) AS appointments,COALESCE(SUM(status='active'),0) AS active,COALESCE(SUM(status='cancelled'),0) AS cancelled,COALESCE(SUM(status NOT IN ('active','cancelled')),0) AS unknownCount,COALESCE(SUM(status='active' AND start_at>=?),0) AS upcoming,COALESCE(SUM(notification_sent_at IS NOT NULL),0) AS confirmationsAccepted FROM calendly_appointments WHERE merchant_id=?`,[now,merchantId]);
 const [hooks]=await calendlyRows(tx,`SELECT COUNT(*) AS storedCount,COALESCE(SUM(created_at>=DATE_SUB(?,INTERVAL 7 DAY)),0) AS recentTotal,COALESCE(SUM(created_at>=DATE_SUB(?,INTERVAL 7 DAY) AND status='completed'),0) AS recentCompleted,COALESCE(SUM(status IN ('pending','processing','failed')),0) AS awaiting,COALESCE(SUM(status='manual_review'),0) AS needsReview,COALESCE(SUM(status NOT IN ('pending','processing','completed','failed','manual_review')),0) AS unknownCount,MIN(CASE WHEN status IN ('pending','processing','failed') THEN created_at END) AS oldestPendingAt FROM calendly_webhook_receipts WHERE merchant_id=?`,[now,now,merchantId]);
 if(!totals||!hooks)throw new CalendlyWorkspaceFault();
 const counts={appointments:calendlyCount(totals.appointments),active:calendlyCount(totals.active),cancelled:calendlyCount(totals.cancelled),unknown:calendlyCount(totals.unknownCount),upcoming:calendlyCount(totals.upcoming),confirmationsAccepted:calendlyCount(totals.confirmationsAccepted)};
 const userUri=calendlyResourceUri(row?.userUri,'user'),registered=!!row&&CALENDLY_ENDPOINT_PATTERN.test(row.endpoint??'')&&Number(row.signingStored)===1&&!!calendlyResourceUri(row.subscription,'subscription');
 return calendlyWorkspaceSchema.parse({actorId,merchantId,checkedAt,revision,present:!!row,state:!row?'unlinked':Number(row.active)===1?'configured':Number(row.active)===0?'disabled':'unknown',userName:typeof row?.userName==='string'?row.userName.slice(0,255):null,userUri,identityValid:!!userUri,credentialsStored:!!row&&Number(row.credentialsStored)===1,settings:{syncToWhatsApp:!!row&&Number(row.syncToWhatsApp)===1},settingsValid:!row||Number(row.settingsValid)===1,createdAt:calendlyStamp(row?.createdAt),lastSyncAt:calendlyStamp(row?.lastSyncAt),counts,
  webhooks:{registered,stored:calendlyCount(hooks.storedCount),recentTotal:calendlyCount(hooks.recentTotal),recentCompleted:calendlyCount(hooks.recentCompleted),awaiting:calendlyCount(hooks.awaiting),needsReview:calendlyCount(hooks.needsReview),unknown:calendlyCount(hooks.unknownCount),oldestPendingAt:calendlyStamp(hooks.oldestPendingAt)}});
 });}
const searchValue=(value:string)=>'%'+value.replace(/[!%_]/g,c=>'!'+c)+'%';
const nullableCount=(value:unknown)=>{try{return calendlyCount(value);}catch{return null;}};
const flag=(value:unknown)=>value===1||value==='1'?true:value===0||value==='0'?false:null;
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):null;
export async function readCalendlyAppointments(actorId:number,merchantId:number,input:unknown){const selection=calendlyAppointmentsInput.parse(input);return calendlySnapshot(actorId,merchantId,async(tx,checkedAt)=>{
 await calendlyConnectionDefinition(tx,merchantId);const [stored]=await calendlyRows(tx,'SELECT COUNT(*) AS count FROM calendly_appointments WHERE merchant_id=?',[merchantId]);
 const args:Array<string|number|null>=[merchantId];let where='merchant_id=?';
 if(selection.search){where+=" AND (event_name LIKE ? ESCAPE '!' OR customer_name LIKE ? ESCAPE '!' OR customer_email LIKE ? ESCAPE '!' OR customer_phone LIKE ? ESCAPE '!')";for(let i=0;i<4;i++)args.push(searchValue(selection.search));}
 if(selection.period!=='all'){where+=' AND start_at'+(selection.period==='upcoming'?'>=':'<')+'?';args.push(sqlStamp(checkedAt));}
 if(selection.startDate&&selection.endDate){where+=' AND start_at>=? AND start_at<DATE_ADD(?,INTERVAL 1 DAY)';args.push(selection.startDate,selection.endDate);}
 const grouped=await calendlyRows(tx,`SELECT ${appointmentStateSql} AS state,COUNT(*) AS count FROM calendly_appointments WHERE ${where} GROUP BY state`,args);
 const groups=calendlyAppointmentStates.map(key=>({key,count:calendlyCount(grouped.find(g=>g.state===key)?.count??0)})),matched=groups.reduce((n,g)=>n+g.count,0),total=selection.state==='all'?matched:groups.find(g=>g.key===selection.state)!.count;
 if(selection.state!=='all'){where+=` AND (${appointmentStateSql})=?`;args.push(selection.state);}
 const found=await calendlyRows(tx,`SELECT id,merchant_id AS merchantId,event_name AS eventName,customer_name AS customerName,customer_email AS customerEmail,customer_phone AS customerPhone,location,${appointmentStateSql} AS state,start_at AS startAt,end_at AS endAt,cancelled_at AS cancelledAt,notification_sent_at AS confirmationAcceptedAt,provider_updated_at AS providerUpdatedAt FROM calendly_appointments WHERE ${where} ORDER BY id DESC LIMIT 25 OFFSET ${(selection.page-1)*25}`,args);
 const rows=found.map(row=>{const r={id:row.id,merchantId:row.merchantId,eventName:text(row.eventName,255),customerName:text(row.customerName,255),customerEmail:text(row.customerEmail,320),customerPhone:text(row.customerPhone,50),location:text(row.location,500),state:row.state,startAt:calendlyStamp(row.startAt),endAt:calendlyStamp(row.endAt),cancelledAt:calendlyStamp(row.cancelledAt),confirmationAcceptedAt:calendlyStamp(row.confirmationAcceptedAt),providerUpdatedAt:calendlyStamp(row.providerUpdatedAt)};return {...r,invalidData:!r.eventName||!r.customerName||r.state==='unknown'||!r.startAt||!r.endAt||r.endAt<=r.startAt||!r.providerUpdatedAt||r.state==='cancelled'&&!r.cancelledAt};});
 return calendlyAppointmentsSchema.parse({actorId,merchantId,checkedAt,timezone:'UTC',selection,summary:{stored:calendlyCount(stored?.count),matched,groups},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows});
 });}
export async function readCalendlyReceipts(actorId:number,merchantId:number,input:unknown){const selection=calendlyReceiptsInput.parse(input);return calendlySnapshot(actorId,merchantId,async(tx,checkedAt)=>{
 await calendlyConnectionDefinition(tx,merchantId);const [stored]=await calendlyRows(tx,'SELECT COUNT(*) AS count FROM calendly_webhook_receipts WHERE merchant_id=?',[merchantId]);
 const args:Array<string|number|null>=[merchantId];let where='merchant_id=?';if(selection.search){where+=" AND CAST(id AS CHAR) LIKE ? ESCAPE '!'";args.push(searchValue(selection.search));}if(selection.event!=='all'){where+=` AND (${receiptEventSql})=?`;args.push(selection.event);}
 const grouped=await calendlyRows(tx,`SELECT ${receiptStateSql} AS state,COUNT(*) AS count FROM calendly_webhook_receipts WHERE ${where} GROUP BY state`,args);
 const groups=calendlyReceiptStates.map(key=>({key,count:calendlyCount(grouped.find(g=>g.state===key)?.count??0)})),matched=groups.reduce((n,g)=>n+g.count,0),total=selection.state==='all'?matched:groups.find(g=>g.key===selection.state)!.count;if(selection.state!=='all'){where+=` AND (${receiptStateSql})=?`;args.push(selection.state);}
 const found=await calendlyRows(tx,`SELECT id,merchant_id AS merchantId,${receiptStateSql} AS state,${receiptEventSql} AS event,attempt_count AS attempts,effect_applied AS effectApplied,notification_required AS notificationRequired,(last_error IS NOT NULL AND last_error<>'') AS hasError,created_at AS createdAt,available_at AS availableAt,claimed_at AS claimedAt,processed_at AS processedAt FROM calendly_webhook_receipts WHERE ${where} ORDER BY id DESC LIMIT 25 OFFSET ${(selection.page-1)*25}`,args);
 const rows=found.map(row=>{const r={id:row.id,merchantId:row.merchantId,state:row.state,event:row.event,attempts:nullableCount(row.attempts),effectApplied:flag(row.effectApplied),notificationRequired:flag(row.notificationRequired),hasError:Number(row.hasError)===1,createdAt:calendlyStamp(row.createdAt),availableAt:calendlyStamp(row.availableAt),claimedAt:calendlyStamp(row.claimedAt),processedAt:calendlyStamp(row.processedAt)};return {...r,invalidData:r.state==='unknown'||r.event==='unknown'||r.attempts===null||r.effectApplied===null||r.notificationRequired===null||!r.createdAt||!r.availableAt};});
 return calendlyReceiptsSchema.parse({actorId,merchantId,checkedAt,selection,summary:{stored:calendlyCount(stored?.count),matched,groups},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows});
 });}
