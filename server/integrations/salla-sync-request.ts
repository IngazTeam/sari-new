import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {assertRuntimeSchema} from '../db/schema-readiness';
import {decryptSecret} from '../security/secrets';
import {bookingReadId} from '../../shared/booking-read';
import {sallaSyncRequest,sallaSyncLookup,sallaSyncReceipt} from '../../shared/salla-sync-request';
import {sallaConnectionDefinition} from './salla-workspace';
import {sallaConnectionWriter,SallaConnectionFault} from './salla-connection';
import {sallaSyncReview} from './salla-sync-review';
import {SallaIntegration} from './salla';
import type {SallaCatalogGuard} from './salla-catalog';

export class SallaSyncRequestFault extends Error {
 constructor(readonly reason:'unavailable'|'missing'|'changed'|'busy'|'rate_limited'){super('salla_sync:'+reason);}
}
export const SALLA_SYNC_REQUIREMENTS=[{table:'salla_sync_requests',columns:['merchant_id','actor_id','request_id','connection_revision','sync_type','sync_log_id','state','lease_until','created_at','updated_at'],uniqueIndexes:[{name:'uq_salla_sync_request',columns:['merchant_id','request_id']},{name:'uq_salla_sync_log',columns:['sync_log_id']}],checkConstraints:['chk_salla_sync_state','chk_salla_sync_type']}];
async function transaction<T>(work:(tx:PoolConnection)=>Promise<T>) {
 const pool=await getPool();if(!pool)throw new SallaSyncRequestFault('unavailable');const tx=await pool.getConnection();let committing=false,reusable=true;
 try{await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await tx.beginTransaction();const result=await work(tx);committing=true;await tx.commit();return result;}
 catch(error){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}if(error instanceof SallaSyncRequestFault||error instanceof SallaConnectionFault)throw error;throw new SallaSyncRequestFault('unavailable');}
 finally{if(reusable)tx.release();else tx.destroy();}
}
const select=`SELECT r.*,r.lease_until>UTC_TIMESTAMP(3) AS live,l.status AS log_state,l.itemsSynced FROM salla_sync_requests r LEFT JOIN sync_logs l ON l.id=r.sync_log_id AND l.merchantId=r.merchant_id`;
function receipt(row:any,replayed:boolean){
 if(!['pending','success','failed','interrupted'].includes(row.state))throw new SallaSyncRequestFault('unavailable');
 let outcome=row.state==='pending'&&!row.live?'interrupted':row.state;
 const n=Number(row.itemsSynced),validCount=row.itemsSynced!=null&&Number.isSafeInteger(n)&&n>=0&&n<=2147483647;
 if(['success','failed'].includes(outcome)&&(row.log_state!==outcome||!validCount))outcome='interrupted';
 const date=row.created_at instanceof Date?row.created_at:new Date(String(row.created_at).replace(' ','T')+'Z');
 return sallaSyncReceipt.parse({actorId:row.actor_id,merchantId:row.merchant_id,requestId:row.request_id,revision:row.connection_revision,syncType:row.sync_type,outcome,logId:row.sync_log_id??null,itemsSynced:['success','failed'].includes(outcome)?n:null,createdAt:date.toISOString(),checkedAt:new Date().toISOString(),replayed});
}
export async function readSallaSyncRequest(actorId:number,merchantId:number,input:unknown){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const {requestId}=sallaSyncLookup.parse(input),pool=await getPool();if(!pool)throw new SallaSyncRequestFault('unavailable');
 const [rows]=await pool.execute<any[]>(select+' WHERE r.merchant_id=? AND r.actor_id=? AND r.request_id=?',[merchantId,actorId,requestId]);if(rows.length!==1)throw new SallaSyncRequestFault('missing');return receipt(rows[0],true);
}
export async function readLatestSallaSyncRequest(actorId:number,merchantId:number){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const pool=await getPool();if(!pool)throw new SallaSyncRequestFault('unavailable');
 const [rows]=await pool.execute<any[]>(select+' WHERE r.merchant_id=? AND r.actor_id=? ORDER BY r.id DESC LIMIT 1',[merchantId,actorId]);return rows.length?receipt(rows[0],true):null;
}
/** Idempotent admission, one live dashboard sync per merchant. Expired work is
 * fenced before a new request can start. A replay only returns stored evidence. */
export async function requestReviewedSallaSync(actorId:number,merchantId:number,raw:unknown,launch=(run:()=>Promise<void>)=>{void run().catch(()=>console.error('[Salla] Sync request outcome unavailable'));}){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const input=sallaSyncRequest.parse(raw);
 await assertRuntimeSchema('Salla reviewed sync',SALLA_SYNC_REQUIREMENTS,{cacheSuccess:false});
 const reserved=await transaction(async tx=>{
  const current=await sallaConnectionDefinition(tx,merchantId,true);await sallaConnectionWriter(tx,actorId,merchantId);
  const [old]=await tx.execute<any[]>(select+' WHERE r.merchant_id=? AND r.request_id=? FOR UPDATE',[merchantId,input.requestId]);
  if(old.length){const row=old[0];if(row.actor_id!==actorId||row.connection_revision!==input.revision||row.sync_type!==input.syncType)throw new SallaSyncRequestFault('changed');return {receipt:receipt(row,true)};}
  if(current.revision!==input.revision||current.row?.syncStatus!=='active')throw new SallaSyncRequestFault('changed');
  // Do not assume an expired worker did nothing. Keep its partial history and fence it.
  await tx.execute("UPDATE sync_logs l JOIN salla_sync_requests r ON r.sync_log_id=l.id AND r.merchant_id=l.merchantId SET l.status='failed',l.errors='catalog_sync_interrupted',l.completedAt=UTC_TIMESTAMP() WHERE r.merchant_id=? AND r.state='pending' AND r.lease_until<=UTC_TIMESTAMP(3) AND l.status='in_progress'",[merchantId]);
  await tx.execute("UPDATE salla_sync_requests SET state='interrupted',updated_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND state='pending' AND lease_until<=UTC_TIMESTAMP(3)",[merchantId]);
  const [counts]=await tx.execute<any[]>("SELECT SUM(state='pending') AS active,SUM(created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) AS recent FROM salla_sync_requests WHERE merchant_id=?",[merchantId]);
  if(Number(counts[0].active)>0)throw new SallaSyncRequestFault('busy');if(Number(counts[0].recent)>=3)throw new SallaSyncRequestFault('rate_limited');
  const [secret]=await tx.execute<any[]>('SELECT accessToken FROM salla_connections WHERE id=? AND merchantId=?',[current.row.id,merchantId]),token=decryptSecret(secret[0]?.accessToken);if(!token)throw new SallaSyncRequestFault('unavailable');
  const [log]=await tx.execute<any>("INSERT INTO sync_logs(merchantId,syncType,status,itemsSynced,startedAt) VALUES (?,?,'in_progress',0,UTC_TIMESTAMP())",[merchantId,input.syncType==='full'?'full_sync':'stock_sync']);
  const [result]=await tx.execute<any>("INSERT INTO salla_sync_requests(merchant_id,actor_id,request_id,connection_revision,sync_type,sync_log_id,state,lease_until) VALUES (?,?,?,?,?,?,'pending',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND))",[merchantId,actorId,input.requestId,input.revision,input.syncType,log.insertId]);
  const [saved]=await tx.execute<any[]>(select+' WHERE r.id=?',[result.insertId]);return {receipt:receipt(saved[0],false),id:Number(result.insertId),logId:Number(log.insertId),token};
 });
 if(reserved.id){
  const id=reserved.id,logId=reserved.logId!,review=sallaSyncReview(actorId,merchantId,input.revision);
  const check=async(tx:PoolConnection)=>{
   await review(tx);
   const [updated]=await tx.execute<any>("UPDATE salla_sync_requests SET lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND merchant_id=? AND actor_id=? AND sync_log_id=? AND state='pending' AND lease_until>UTC_TIMESTAMP(3)",[id,merchantId,actorId,logId]);
   if(updated.affectedRows!==1)throw new SallaSyncRequestFault('changed');
  };
  const guard:SallaCatalogGuard=async tx=>{if(tx)return check(tx);await transaction(check);};
  const execute=async()=>{
   try{const salla=new SallaIntegration(merchantId,reserved.token!,guard);if(input.syncType==='full')await salla.fullSync(logId);else await salla.syncStock(logId);}catch{/* Read durable evidence below; never retry the provider operation. */}
   try{await transaction(async tx=>{
    // Use the same lock order as admission and product writes, even for audit completion.
    await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);
    const [rows]=await tx.execute<any[]>(select+' WHERE r.id=? AND r.merchant_id=? FOR UPDATE',[id,merchantId]);if(rows.length!==1||rows[0].state!=='pending')return;
    const row=rows[0],state=row.live&&['success','failed'].includes(row.log_state)?row.log_state:'interrupted';
    if(row.log_state==='in_progress')await tx.execute("UPDATE sync_logs SET status='failed',errors='catalog_sync_interrupted',completedAt=UTC_TIMESTAMP() WHERE id=? AND merchantId=? AND status='in_progress'",[logId,merchantId]);
    await tx.execute('UPDATE salla_sync_requests SET state=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?',[state,id]);
   });}catch{/* An interrupted process or uncertain commit is recovered by reading, not dispatching again. */}
  };
  launch(execute);
 }
 return reserved.receipt;
}
