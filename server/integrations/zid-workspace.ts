import crypto from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {bookingReadId} from '../../shared/booking-read';
import {safePlatformUrl} from '../../shared/platform-workspace';
import {zidWorkspaceSchema,zidLogsInput,zidLogsWorkspaceSchema,zidLogStates} from '../../shared/zid-workspace';
import {catalogVisibleSql} from './catalog-scope';
type Executor=Pick<PoolConnection,'execute'>;
export class ZidWorkspaceFault extends Error {constructor(){super('Zid workspace unavailable');}}
async function rows(tx:Executor,sql:string,args:Array<string|number|null>=[]):Promise<any[]>{const [r]=await tx.execute(sql,args);if(!Array.isArray(r))throw new ZidWorkspaceFault();return r;}
function count(value:unknown){const n=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;if(!Number.isSafeInteger(n)||n<0)throw new ZidWorkspaceFault();return n;}
function stamp(value:unknown){if(value==null)return null;const date=value instanceof Date?value:typeof value==='string'?new Date(value.includes('T')?value:value.replace(' ','T')+'Z'):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null;}
const settingsJson="IF(JSON_VALID(settings),settings,'{}')",keys=['autoSync','syncProducts','syncOrders','syncCustomers','notifyMerchantOrders'] as const;
const validSettings=`((settings IS NULL OR settings='') OR (JSON_VALID(settings) AND JSON_TYPE(${settingsJson})='OBJECT' AND ${keys.map(key=>`(JSON_TYPE(JSON_EXTRACT(${settingsJson},'$.${key}')) IS NULL OR JSON_TYPE(JSON_EXTRACT(${settingsJson},'$.${key}'))='BOOLEAN')`).join(' AND ')}))`;
const flagSql=keys.map(key=>`CASE WHEN JSON_TYPE(JSON_EXTRACT(${settingsJson},'$.${key}'))='BOOLEAN' THEN JSON_UNQUOTE(JSON_EXTRACT(${settingsJson},'$.${key}'))='true' ELSE ${key==='notifyMerchantOrders'?0:1} END AS ${key}`).join(',');
/** Display reads select credential presence and hashes only. A canonical record,
 * including disabled/malformed records, always shadows legacy credentials. */
export async function zidConnectionDefinition(tx:Executor,merchantId:number,lock=false){
 bookingReadId.parse(merchantId);const suffix=lock?' FOR UPDATE':'',merchant=await rows(tx,'SELECT id FROM merchants WHERE id=?'+suffix,[merchantId]);if(merchant.length!==1)throw new ZidWorkspaceFault();
 const canonical=await rows(tx,`SELECT id,is_active AS active,store_name AS storeName,store_url AS storeUrl,created_at AS createdAt,last_sync_at AS lastSyncAt,webhook_endpoint_id AS endpoint,
  CASE WHEN JSON_TYPE(JSON_EXTRACT(${settingsJson},'$.storeId'))='STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(${settingsJson},'$.storeId')) ELSE NULL END AS storeId,
  (COALESCE(LENGTH(access_token),0)>0 AND JSON_TYPE(JSON_EXTRACT(${settingsJson},'$.managerToken'))='STRING' AND COALESCE(LENGTH(JSON_UNQUOTE(JSON_EXTRACT(${settingsJson},'$.managerToken'))),0)>0) AS credentialsStored,
  ${validSettings} AS settingsValid,${flagSql},SHA2(COALESCE(access_token,''),256) AS tokenVersion,SHA2(COALESCE(refresh_token,''),256) AS refreshVersion,SHA2(COALESCE(settings,''),256) AS settingsVersion,SHA2(COALESCE(webhook_auth_hash,''),256) AS webhookVersion
  FROM platform_integrations WHERE merchant_id=? AND platform_type='zid'`+suffix,[merchantId]);
 if(canonical.length>1)throw new ZidWorkspaceFault();let row=canonical[0]??null,source:'canonical'|'legacy'|null=row?'canonical':null;
 if(!row){const legacy=await rows(tx,`SELECT id,is_active AS active,store_id AS storeId,store_name AS storeName,store_url AS storeUrl,created_at AS createdAt,NULL AS lastSyncAt,NULL AS endpoint,
  (COALESCE(LENGTH(access_token),0)>0 AND COALESCE(LENGTH(manager_token),0)>0) AS credentialsStored,
  (auto_sync_products IN (0,1) AND auto_sync_orders IN (0,1) AND auto_sync_customers IN (0,1)) AS settingsValid,1 AS autoSync,auto_sync_products AS syncProducts,auto_sync_orders AS syncOrders,auto_sync_customers AS syncCustomers,0 AS notifyMerchantOrders,
  SHA2(COALESCE(access_token,''),256) AS tokenVersion,SHA2(CONCAT(COALESCE(manager_token,''),':',COALESCE(refresh_token,'')),256) AS refreshVersion,NULL AS settingsVersion
  FROM zid_settings WHERE merchant_id=?`+suffix,[merchantId]);if(legacy.length>1)throw new ZidWorkspaceFault();row=legacy[0]??null;source=row?'legacy':null;}
 const {lastSyncAt:_progress,...identity}=row??{};
 // mysql2 and Drizzle may decode timestamps differently. Revision identity must
 // be stable across both readers and the transaction that checks a write.
 if(row)identity.createdAt=stamp(row.createdAt);
 const revision=crypto.createHash('sha256').update(JSON.stringify({merchantId,source,row:row?identity:null})).digest('hex');return {row,source,revision};
}
async function snapshot<T>(actorId:number,merchantId:number,work:(tx:PoolConnection)=>Promise<T>){bookingReadId.parse(actorId);bookingReadId.parse(merchantId);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{const pool=await getPool();if(!pool)throw new ZidWorkspaceFault();tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.query('START TRANSACTION READ ONLY');const value=await work(tx);committing=true;await tx.commit();return value;}
 catch{if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}throw new ZidWorkspaceFault();}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
const stateSql="CASE WHEN status IN ('pending','in_progress','completed','failed') THEN status ELSE 'unknown' END",kindSql="CASE WHEN sync_type IN ('products','orders','customers','inventory') THEN sync_type ELSE 'unknown' END";
export async function readZidWorkspace(actorId:number,merchantId:number){return snapshot(actorId,merchantId,async tx=>{
 const {row,source,revision}=await zidConnectionDefinition(tx,merchantId),storeId=row&&/^[1-9][0-9]{0,19}$/.test(row.storeId??'')?String(row.storeId):null;
 const totals=await rows(tx,`SELECT (SELECT COUNT(*) FROM products WHERE merchantId=? AND ${catalogVisibleSql()}) AS catalog,
  (SELECT COUNT(*) FROM zid_products z JOIN products p ON p.id=z.sari_product_id AND p.merchantId=z.merchant_id WHERE z.merchant_id=? AND BINARY z.zid_store_id=BINARY ? AND z.is_active=1) AS linkedProducts,
  (SELECT COUNT(*) FROM zid_orders WHERE merchant_id=? AND BINARY zid_store_id=BINARY ?) AS sourceOrders,
  (SELECT COUNT(*) FROM zid_customers WHERE merchant_id=?) AS storedCustomers,(SELECT COUNT(*) FROM zid_customers WHERE merchant_id=? AND is_active=1) AS activeCustomers,
  (SELECT COUNT(*) FROM zid_sync_logs WHERE merchant_id=?) AS syncLogs`,[merchantId,merchantId,storeId,merchantId,storeId,merchantId,merchantId,merchantId]);
 const groups=await rows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM zid_sync_logs WHERE merchant_id=? GROUP BY state`,[merchantId]);
 const hooks=await rows(tx,`SELECT COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY)),0) AS recentTotal,COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) AND status='processed'),0) AS recentProcessed,COALESCE(SUM(status='pending'),0) AS awaiting,COALESCE(SUM(status='failed'),0) AS failed FROM zid_webhooks WHERE merchant_id=?`,[merchantId]);
 const notices=await rows(tx,`SELECT COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY)),0) AS recentTotal,COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) AND status='delivered'),0) AS recentDelivered,COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) AND status='suppressed'),0) AS recentSuppressed,COALESCE(SUM(status IN ('pending','processing','failed')),0) AS awaiting,COALESCE(SUM(status='manual_review'),0) AS needsReview FROM zid_order_notification_outbox WHERE merchant_id=?`,[merchantId]);
 if(totals.length!==1||hooks.length!==1||notices.length!==1||groups.some(g=>!zidLogStates.includes(g.state))||new Set(groups.map(g=>g.state)).size!==groups.length)throw new ZidWorkspaceFault();
 const valid=!!row&&Number(row.settingsValid)===1,settings=Object.fromEntries(keys.map(key=>[key,valid&&Number(row[key])===1]));
 const summary=Object.fromEntries(zidLogStates.map(key=>[key==='in_progress'?'inProgress':key,count(groups.find(g=>g.state===key)?.count??0)]));
 const counts=(value:any)=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,count(v)]));
 return zidWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),revision,present:!!row,source,state:!row?'unlinked':row.active===1?'configured':row.active===0?'disabled':'unknown',storeId,storeName:typeof row?.storeName==='string'?row.storeName.slice(0,255):null,storeUrl:row?safePlatformUrl(row.storeUrl):null,credentialsStored:!!row&&Number(row.credentialsStored)===1,createdAt:stamp(row?.createdAt),lastSyncAt:stamp(row?.lastSyncAt),webhookEndpointPath:source==='canonical'&&/^[a-f0-9]{48}$/.test(row?.endpoint??'')?'/api/webhooks/zid/'+row.endpoint:null,settingsValid:valid,settings,counts:counts(totals[0]),syncSummary:summary,webhooks:counts(hooks[0]),notifications:counts(notices[0])});
 });}
export async function readZidLogsWorkspace(actorId:number,merchantId:number,input:unknown){const selection=zidLogsInput.parse(input);return snapshot(actorId,merchantId,async tx=>{
 const merchant=await rows(tx,'SELECT id FROM merchants WHERE id=?',[merchantId]);if(merchant.length!==1)throw new ZidWorkspaceFault();const totalRows=await rows(tx,'SELECT COUNT(*) AS count FROM zid_sync_logs WHERE merchant_id=?',[merchantId]);if(totalRows.length!==1)throw new ZidWorkspaceFault();
 const args:Array<string|number|null>=[merchantId];let where='merchant_id=?';if(selection.search){where+=" AND CAST(id AS CHAR) LIKE ? ESCAPE '!'";args.push('%'+selection.search.replace(/[!%_]/g,v=>'!'+v)+'%');}if(selection.kind!=='all'){where+=` AND (${kindSql})=?`;args.push(selection.kind);}
 const grouped=await rows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM zid_sync_logs WHERE ${where} GROUP BY state`,args);if(grouped.some(g=>!zidLogStates.includes(g.state))||new Set(grouped.map(g=>g.state)).size!==grouped.length)throw new ZidWorkspaceFault();
 const groups=zidLogStates.map(key=>({key,count:count(grouped.find(g=>g.state===key)?.count??0)})),matched=groups.reduce((n,g)=>n+g.count,0),total=selection.state==='all'?matched:groups.find(g=>g.key===selection.state)!.count;
 if(selection.state!=='all'){where+=` AND (${stateSql})=?`;args.push(selection.state);}const page=await rows(tx,`SELECT id,merchant_id AS merchantId,${kindSql} AS kind,${stateSql} AS state,total_items AS totalItems,processed_items AS processedItems,success_count AS successCount,failed_count AS failedCount,(error_message IS NOT NULL AND error_message<>'') AS hasErrors,created_at AS createdAt,started_at AS startedAt,completed_at AS completedAt FROM zid_sync_logs WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,[...args,25,(selection.page-1)*25]);
 return zidLogsWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),selection,summary:{stored:count(totalRows[0].count),matched,groups},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows:page.map(row=>{
  const numbers=Object.fromEntries(['totalItems','processedItems','successCount','failedCount'].map(key=>{try{return [key,count(row[key])];}catch{return [key,null];}})),createdAt=stamp(row.createdAt),startedAt=stamp(row.startedAt),completedAt=stamp(row.completedAt);
  const invalidData=Object.values(numbers).includes(null)||!createdAt||row.startedAt!=null&&!startedAt||row.completedAt!=null&&!completedAt||!!startedAt&&!!completedAt&&completedAt<startedAt||row.state==='completed'&&!completedAt||row.state==='unknown'||row.kind==='unknown'||Number(numbers.processedItems)>Number(numbers.totalItems)||Number(numbers.successCount)+Number(numbers.failedCount)>Number(numbers.processedItems);
  return {id:count(row.id),merchantId:count(row.merchantId),kind:row.kind,state:row.state,...numbers,hasErrors:count(row.hasErrors)===1,createdAt,startedAt,completedAt,invalidData};
 })});
 });}
