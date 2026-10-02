import crypto from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { bookingReadId } from '../../shared/booking-read';
import { safePlatformUrl } from '../../shared/platform-workspace';
import { sallaWorkspaceSchema,sallaLogsInput,sallaLogsWorkspaceSchema,sallaLogStates,sallaLogKinds } from '../../shared/salla-workspace';
import { catalogVisibleSql } from './catalog-scope';
type Executor = Pick<PoolConnection,'execute'>;
export class SallaWorkspaceFault extends Error { constructor() { super('Salla workspace unavailable'); } }
async function rows(tx:Executor,sql:string,args:unknown[]=[]):Promise<any[]> { const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new SallaWorkspaceFault();return result; }
function count(value:unknown) { const n=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;if(!Number.isSafeInteger(n)||n<0)throw new SallaWorkspaceFault();return n; }
function stamp(value:unknown) { if(value==null)return null;const date=value instanceof Date?value:typeof value==='string'?new Date(value.includes('T')?value:value.replace(' ','T')+'Z'):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null; }
/** Stable identity for a later reviewed mutation. Sync counters and progress do not change this version. */
export async function sallaConnectionDefinition(tx:Executor,merchantId:number,lock=false) {
  bookingReadId.parse(merchantId);const merchant=await rows(tx,'SELECT id FROM merchants WHERE id=?'+(lock?' FOR UPDATE':''),[merchantId]);if(merchant.length!==1)throw new SallaWorkspaceFault();
  const found=await rows(tx,`SELECT id,salla_store_id AS storeId,storeUrl,syncStatus,createdAt,lastSyncAt,(syncErrors IS NOT NULL AND syncErrors <> '') AS hasErrors,
    (LENGTH(accessToken)>0) AS credentialsStored,SHA2(accessToken,256) AS securityVersion FROM salla_connections WHERE merchantId=?`+(lock?' FOR UPDATE':''),[merchantId]);
  if(found.length>1)throw new SallaWorkspaceFault();const row=found[0]??null;
  const revision=crypto.createHash('sha256').update(JSON.stringify({merchantId,row:row?{id:row.id,storeId:row.storeId,url:row.storeUrl,createdAt:stamp(row.createdAt),securityVersion:row.securityVersion}:null})).digest('hex');return {row,revision};
}
async function snapshot<T>(actorId:number,merchantId:number,work:(tx:PoolConnection)=>Promise<T>) {
  bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const pool=await getPool();if(!pool)throw new SallaWorkspaceFault();const tx=await pool.getConnection();let committing=false,reusable=true;
  try { await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.query('START TRANSACTION READ ONLY');const result=await work(tx);committing=true;await tx.commit();return result; }
  catch { if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}throw new SallaWorkspaceFault(); }
  finally { if(reusable)tx.release();else tx.destroy(); }
}
/** Connection, counts and webhook progress share one snapshot; credentials and raw errors never leave SQL. */
export async function readSallaWorkspace(actorId:number,merchantId:number) {
  return snapshot(actorId,merchantId,async tx=>{
    const {row,revision}=await sallaConnectionDefinition(tx,merchantId),storeId=row&&/^[1-9][0-9]{0,19}$/.test(row.storeId??'')?String(row.storeId):null;
    const totals=await rows(tx,`SELECT (SELECT COUNT(*) FROM products WHERE merchantId=? AND ${catalogVisibleSql()}) AS catalog,
      (SELECT COUNT(*) FROM salla_product_projections p JOIN products o ON o.id=p.local_product_id AND o.merchantId=p.merchant_id AND o.sallaProductId=CONCAT('salla:',p.store_id,':',p.external_product_id)
       WHERE p.merchant_id=? AND p.store_id=? AND p.connection_id=? AND p.archived=0) AS linkedProducts,
      (SELECT COUNT(*) FROM sync_logs WHERE merchantId=?) AS syncLogs`,[merchantId,merchantId,storeId,row?.id??0,merchantId]);
    const health=await rows(tx,`SELECT COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY)),0) AS recentTotal,
      COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) AND status='completed'),0) AS recentCompleted,
      COALESCE(SUM(status IN ('pending','processing','failed')),0) AS awaiting,COALESCE(SUM(status='manual_review'),0) AS manualReview,
      TIMESTAMPDIFF(SECOND,MIN(CASE WHEN status IN ('pending','processing','failed') THEN created_at END),UTC_TIMESTAMP(3)) AS oldestPendingSeconds
      FROM salla_webhook_receipts WHERE merchant_id=?`,[merchantId]);
    if(totals.length!==1||health.length!==1)throw new SallaWorkspaceFault();const h=health[0];
    return sallaWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),revision,present:!!row,state:!row?'unlinked':row.syncStatus==='active'?'configured':['syncing','paused','error'].includes(row.syncStatus)?row.syncStatus:'unknown',storeId,storeUrl:row?safePlatformUrl(row.storeUrl):null,credentialsStored:row?count(row.credentialsStored)===1:false,createdAt:stamp(row?.createdAt),lastSyncAt:stamp(row?.lastSyncAt),hasSyncErrors:row?count(row.hasErrors)===1:false,
      counts:Object.fromEntries(Object.entries(totals[0]).map(([key,value])=>[key,count(value)])),webhooks:{recentTotal:count(h.recentTotal),recentCompleted:count(h.recentCompleted),awaiting:count(h.awaiting),manualReview:count(h.manualReview),oldestPendingSeconds:h.oldestPendingSeconds==null?null:count(Math.max(0,Number(h.oldestPendingSeconds)))}});
  });
}
const stateSql="CASE WHEN status IN ('success','failed','in_progress') THEN status ELSE 'unknown' END",kindSql="CASE WHEN syncType IN ('full_sync','stock_sync','single_product') THEN syncType ELSE 'unknown' END";
export async function readSallaLogsWorkspace(actorId:number,merchantId:number,input:unknown) {
  const selection=sallaLogsInput.parse(input);return snapshot(actorId,merchantId,async tx=>{
    const merchant=await rows(tx,'SELECT id FROM merchants WHERE id=?',[merchantId]);if(merchant.length!==1)throw new SallaWorkspaceFault();
    const storedRows=await rows(tx,'SELECT COUNT(*) AS count FROM sync_logs WHERE merchantId=?',[merchantId]);if(storedRows.length!==1)throw new SallaWorkspaceFault();
    const args:unknown[]=[merchantId];let where='merchantId=?';
    if(selection.search){where+=" AND CAST(id AS CHAR) LIKE ? ESCAPE '!'";args.push('%'+selection.search.replace(/[!%_]/g,v=>'!'+v)+'%');}
    if(selection.kind!=='all'){where+=` AND (${kindSql})=?`;args.push(selection.kind);}
    const grouped=await rows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM sync_logs WHERE ${where} GROUP BY state`,args);
    if(grouped.some(row=>!sallaLogStates.includes(row.state))||new Set(grouped.map(row=>row.state)).size!==grouped.length)throw new SallaWorkspaceFault();
    const groups=sallaLogStates.map(key=>({key,count:count(grouped.find(row=>row.state===key)?.count??0)})),matched=groups.reduce((n,row)=>n+row.count,0),total=selection.state==='all'?matched:groups.find(row=>row.key===selection.state)!.count;
    if(selection.state!=='all'){where+=` AND (${stateSql})=?`;args.push(selection.state);}
    const page=await rows(tx,`SELECT id,merchantId,${kindSql} AS kind,${stateSql} AS state,itemsSynced,startedAt,completedAt,(errors IS NOT NULL AND errors <> '') AS hasErrors FROM sync_logs WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,[...args,25,(selection.page-1)*25]);
    return sallaLogsWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),selection,summary:{stored:count(storedRows[0].count),matched,groups},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows:page.map(row=>{
      let itemsSynced:number|null=null;try{itemsSynced=count(row.itemsSynced);}catch{}const startedAt=stamp(row.startedAt),completedAt=stamp(row.completedAt);
      return {id:count(row.id),merchantId:count(row.merchantId),kind:row.kind,state:row.state,itemsSynced,hasErrors:count(row.hasErrors)===1,startedAt,completedAt,invalidData:itemsSynced===null||!startedAt||row.completedAt!=null&&!completedAt||!!startedAt&&!!completedAt&&completedAt<startedAt||row.state==='unknown'||!sallaLogKinds.includes(row.kind)||row.kind==='unknown'};
    })});
  });
}
