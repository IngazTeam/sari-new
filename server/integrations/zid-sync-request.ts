import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {assertRuntimeSchema} from '../db/schema-readiness';
import {bookingReadId} from '../../shared/booking-read';
import {zidSyncRequest,zidSyncLookup,zidSyncReceipt,zidSyncKinds,type ZidSyncReceipt} from '../../shared/zid-sync-request';
import {zidConnectionDefinition} from './zid-workspace';
import {zidConnectionWriter,ZidConnectionFault} from './zid-connection';
import {readZidSyncAdmission,type ZidSyncLifecycle,type ZidSyncExecutor} from './zid-sync-review';
import {runReviewedZidSync} from './zid-reviewed-sync';
import {ZidApiError} from './zid-api';
export class ZidSyncRequestFault extends Error{constructor(readonly reason:'unavailable'|'missing'|'changed'|'busy'|'rate_limited'){super('zid_sync:'+reason);}}
export {ZID_SYNC_REQUIREMENTS} from './zid-sync-schema';
import {ZID_SYNC_REQUIREMENTS} from './zid-sync-schema';
async function transaction<T>(work:(tx:PoolConnection)=>Promise<T>){let tx:PoolConnection|undefined,committing=false,reusable=true;try{const pool=await getPool();if(!pool)throw new ZidSyncRequestFault('unavailable');tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();const value=await work(tx);committing=true;await tx.commit();return value;}catch(error){if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}if(error instanceof ZidSyncRequestFault||error instanceof ZidConnectionFault)throw error;throw new ZidSyncRequestFault('unavailable');}finally{if(tx){if(reusable)tx.release();else tx.destroy();}}}
const select=`SELECT r.*,r.lease_until>UTC_TIMESTAMP(3) AS live,e.resource AS kind,e.started,e.log_id AS referenceLogId,l.id AS logId,l.status AS logState,l.total_items,l.processed_items,l.success_count,l.failed_count,l.completed_at
 FROM zid_sync_requests r LEFT JOIN zid_sync_request_resources e ON e.request_pk=r.id
 LEFT JOIN zid_sync_logs l ON l.id=e.log_id AND l.merchant_id=r.merchant_id AND l.sync_type=e.resource`;
function receipt(rows:any[],replayed:boolean):ZidSyncReceipt{
 if(!rows.length)throw new ZidSyncRequestFault('missing');const row=rows[0],mask=Number(row.resource_mask);
 if(!Number.isInteger(mask)||mask<1||mask>7||!['pending','success','failed','interrupted'].includes(row.state))throw new ZidSyncRequestFault('unavailable');
 const kinds=zidSyncKinds.filter((_,i)=>mask&(1<<i));if(rows.length!==kinds.length||rows.some(r=>r.id!==row.id||!kinds.includes(r.kind))||new Set(rows.map(r=>r.kind)).size!==rows.length)throw new ZidSyncRequestFault('unavailable');
 let outcome=row.state==='pending'&&!Number(row.live)?'interrupted':row.state;
 const resources=kinds.map(kind=>{const r=rows.find(r=>r.kind===kind)!,logId=r.logId==null?null:bookingReadId.parse(r.logId),started=Number(r.started);if(![0,1].includes(started))throw new ZidSyncRequestFault('unavailable');
  const n=Number(r.success_count),valid=[r.total_items,r.processed_items,r.success_count,r.failed_count].every(v=>v!=null&&Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=2147483647)&&Number(r.total_items)===n&&Number(r.processed_items)===n&&Number(r.failed_count)===0&&r.completed_at!=null;
  const state:ZidSyncReceipt['resources'][number]['state']=!started?(r.referenceLogId==null?'not_started':'unknown'):!logId?'unknown':r.logState==='completed'&&valid?'completed':r.logState==='failed'?'failed':r.logState==='in_progress'&&outcome==='pending'?'pending':'unknown';return {kind,logId,state,itemsSynced:state==='completed'?n:null};
 });
 if(outcome==='success'&&resources.some(r=>r.state!=='completed'))outcome='interrupted';
 const date=row.created_at instanceof Date?row.created_at:new Date(String(row.created_at).replace(' ','T')+'Z');
 return zidSyncReceipt.parse({actorId:row.actor_id,merchantId:row.merchant_id,requestId:row.request_id,revision:row.connection_revision,resource:row.resource,outcome,resources,createdAt:date.toISOString(),checkedAt:new Date().toISOString(),replayed});
}
async function read(actorId:number,merchantId:number,requestId?:string){bookingReadId.parse(actorId);bookingReadId.parse(merchantId);try{const pool=await getPool();if(!pool)throw new ZidSyncRequestFault('unavailable');const [rows]=await pool.execute<any[]>(select+(requestId?' WHERE r.merchant_id=? AND r.actor_id=? AND r.request_id=?':' WHERE r.id=(SELECT MAX(id) FROM zid_sync_requests WHERE merchant_id=? AND actor_id=?)'),requestId?[merchantId,actorId,requestId]:[merchantId,actorId]);return rows.length?receipt(rows,true):null;}catch(error){if(error instanceof ZidSyncRequestFault)throw error;throw new ZidSyncRequestFault('unavailable');}}
export async function readZidSyncRequest(actorId:number,merchantId:number,raw:unknown){const {requestId}=zidSyncLookup.parse(raw),value=await read(actorId,merchantId,requestId);if(!value)throw new ZidSyncRequestFault('missing');return value;}
export async function readLatestZidSyncRequest(actorId:number,merchantId:number){return read(actorId,merchantId);}
async function stopLogs(tx:ZidSyncExecutor,merchantId:number,id?:number){await tx.execute(`UPDATE zid_sync_logs l JOIN zid_sync_request_resources e ON e.log_id=l.id JOIN zid_sync_requests r ON r.id=e.request_pk SET l.status='failed',l.error_message='ZID_SYNC_REQUEST_INTERRUPTED',l.completed_at=UTC_TIMESTAMP() WHERE r.merchant_id=? AND l.merchant_id=r.merchant_id AND l.sync_type=e.resource AND l.status='in_progress' AND r.state='pending' AND ${id===undefined?'r.lease_until<=UTC_TIMESTAMP(3)':'r.id=?'}`,id===undefined?[merchantId]:[merchantId,id]);}
export async function requestReviewedZidSync(actorId:number,merchantId:number,raw:unknown,launch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[Zid] Sync request outcome unavailable'));},fetchImpl?:typeof fetch){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const input=zidSyncRequest.parse(raw);await assertRuntimeSchema('Zid reviewed sync',ZID_SYNC_REQUIREMENTS,{cacheSuccess:false});
 const reserved=await transaction(async tx=>{
  await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
  const [old]=await tx.execute<any[]>(select+' WHERE r.merchant_id=? AND r.request_id=? FOR UPDATE',[merchantId,input.requestId]);
  if(old.length){if(old[0].actor_id!==actorId||old[0].connection_revision!==input.revision||old[0].resource!==input.resource)throw new ZidSyncRequestFault('changed');return {receipt:receipt(old,true)};}
  const current=await readZidSyncAdmission(tx,actorId,merchantId,input.resource,input.revision);
  await stopLogs(tx,merchantId);await tx.execute("UPDATE zid_sync_requests SET state='interrupted',updated_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND state='pending' AND lease_until<=UTC_TIMESTAMP(3)",[merchantId]);
  const [counts]=await tx.execute<any[]>("SELECT COALESCE(SUM(state='pending'),0) AS active,COALESCE(SUM(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)),0) AS recent FROM zid_sync_requests WHERE merchant_id=?",[merchantId]);
  if(Number(counts[0].active)>0)throw new ZidSyncRequestFault('busy');if(Number(counts[0].recent)>=3)throw new ZidSyncRequestFault('rate_limited');
  const mask=current.enabled.reduce((n,kind)=>n|(1<<zidSyncKinds.indexOf(kind)),0);
  const [saved]=await tx.execute<any>("INSERT INTO zid_sync_requests(merchant_id,actor_id,request_id,connection_revision,execution_revision,resource,resource_mask,state,lease_until) VALUES (?,?,?,?,?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND))",[merchantId,actorId,input.requestId,input.revision,input.revision,input.resource,mask]);
  const id=bookingReadId.parse(Number(saved.insertId));for(const kind of current.enabled)await tx.execute('INSERT INTO zid_sync_request_resources(request_pk,resource) VALUES (?,?)',[id,kind]);
  const [rows]=await tx.execute<any[]>(select+' WHERE r.id=?',[id]);return {id,receipt:receipt(rows,false)};
 });
 if(reserved.id){const id=reserved.id;
  const check=async(tx:ZidSyncExecutor,revision:string)=>{const [result]=await tx.execute<any>("UPDATE zid_sync_requests SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND merchant_id=? AND actor_id=? AND execution_revision=? AND state='pending' AND lease_until>UTC_TIMESTAMP(3)",[id,merchantId,actorId,revision]);if(result.affectedRows!==1)throw new ZidSyncRequestFault('changed');};
  const lifecycle:ZidSyncLifecycle={check,refreshed:async(tx,previous,next)=>{await check(tx,previous);await tx.execute('UPDATE zid_sync_requests SET execution_revision=? WHERE id=?',[next,id]);},started:async(tx,kind,logId)=>{const [result]=await tx.execute<any>('UPDATE zid_sync_request_resources SET log_id=?,started=1 WHERE request_pk=? AND resource=? AND started=0 AND log_id IS NULL',[logId,id,kind]);if(result.affectedRows!==1)throw new ZidSyncRequestFault('changed');},completed:async tx=>{const [rows]=await tx.execute<any[]>(select+' WHERE r.id=? FOR UPDATE',[id]);const evidence=receipt(rows,false);if(evidence.outcome!=='pending'||evidence.resources.some(r=>r.state!=='completed'))throw new ZidSyncRequestFault('changed');await tx.execute("UPDATE zid_sync_requests SET state='success',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND state='pending'",[id]);}};
  launch(async()=>{let failed:unknown;try{await runReviewedZidSync(actorId,merchantId,{resource:input.resource,revision:input.revision},fetchImpl,lifecycle);}catch(error){failed=error;}
   try{await transaction(async tx=>{await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);const [rows]=await tx.execute<any[]>("SELECT state,lease_until>UTC_TIMESTAMP(3) AS live FROM zid_sync_requests WHERE id=? AND merchant_id=? AND actor_id=? FOR UPDATE",[id,merchantId,actorId]);if(rows.length!==1||rows[0].state!=='pending')return;await stopLogs(tx,merchantId,id);const state=Number(rows[0].live)&&failed instanceof ZidApiError?'failed':'interrupted';await tx.execute('UPDATE zid_sync_requests SET state=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?',[state,id]);});}catch{/* Expiry exposes interrupted work. Never redispatch an uncertain result. */}
  });
 }
 return reserved.receipt;
}
