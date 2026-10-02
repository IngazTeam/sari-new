import crypto from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {bookingReadId} from '../../shared/booking-read';
import {safePlatformUrl} from '../../shared/platform-workspace';
import {wooWorkspaceSchema,wooLogsInput,wooLogsWorkspaceSchema,wooLogStates} from '../../shared/woocommerce-workspace';
import {WOOCOMMERCE_WEBHOOK_TOPICS} from '../webhooks/woocommerce-security';
type Executor=Pick<PoolConnection,'execute'>;
export class WooWorkspaceFault extends Error {constructor(){super('WooCommerce workspace unavailable');}}
export async function wooRows(tx:Executor,sql:string,args:Array<string|number|null>=[]):Promise<any[]>{const [r]=await tx.execute(sql,args);if(!Array.isArray(r))throw new WooWorkspaceFault();return r;}
export function wooCount(value:unknown){const n=typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value)?Number(value):NaN;if(!Number.isSafeInteger(n)||n<0)throw new WooWorkspaceFault();return n;}
export function wooStamp(value:unknown){if(value==null)return null;const date=value instanceof Date?value:typeof value==='string'?new Date(value.includes('T')?value:value.replace(' ','T')+'Z'):null;return date&&Number.isFinite(date.getTime())?date.toISOString():null;}
/** One local snapshot; this never probes provider availability or decrypts credentials. */
export async function wooConnectionDefinition(tx:Executor,merchantId:number,lock=false){
 bookingReadId.parse(merchantId);const suffix=lock?' FOR UPDATE':'',merchant=await wooRows(tx,'SELECT id FROM merchants WHERE id=?'+suffix,[merchantId]);if(merchant.length!==1)throw new WooWorkspaceFault();
 const settings=await wooRows(tx,`SELECT id,is_active AS active,connectionStatus,store_url AS storeUrl,store_name AS storeName,store_version AS storeVersion,store_currency AS storeCurrency,
  created_at AS createdAt,last_sync_at AS lastSyncAt,last_test_at AS lastTestAt,webhook_endpoint_id AS endpoint,
  (COALESCE(LENGTH(consumer_key),0)>0) AS hasConsumerKey,(COALESCE(LENGTH(consumer_secret),0)>0) AS hasConsumerSecret,(COALESCE(LENGTH(webhook_signing_secret),0)>0) AS hasWebhookSecret,
  SHA2(COALESCE(consumer_key,''),256) AS keyVersion,SHA2(COALESCE(consumer_secret,''),256) AS secretVersion,SHA2(COALESCE(webhook_signing_secret,''),256) AS webhookVersion,
  auto_sync_products AS autoProducts,auto_sync_orders AS autoOrders,auto_sync_customers AS autoCustomers,sync_interval AS syncInterval
  FROM woocommerce_settings WHERE merchant_id=?`+suffix,[merchantId]);
 if(settings.length>1)throw new WooWorkspaceFault();const row=settings[0]??null;
 const registrations=await wooRows(tx,'SELECT topic,webhook_id AS webhookId FROM woocommerce_webhook_registrations WHERE merchant_id=? ORDER BY topic'+suffix,[merchantId]);
 const {lastSyncAt:_sync,lastTestAt:_test,...identity}=row??{};if(row)identity.createdAt=wooStamp(row.createdAt);
 const revision=crypto.createHash('sha256').update(JSON.stringify({merchantId,row:row?identity:null,registrations})).digest('hex');
 return {row,registrations,revision};
}
export async function wooSnapshot<T>(actorId:number,merchantId:number,work:(tx:PoolConnection)=>Promise<T>){bookingReadId.parse(actorId);bookingReadId.parse(merchantId);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{const pool=await getPool();if(!pool)throw new WooWorkspaceFault();tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.query('START TRANSACTION READ ONLY');const value=await work(tx);committing=true;await tx.commit();return value;}
 catch{if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}throw new WooWorkspaceFault();}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
const stateSql="CASE WHEN status IN ('running','success','partial','failed') THEN status ELSE 'unknown' END",kindSql="CASE WHEN sync_type IN ('products','orders','customers','manual') THEN sync_type ELSE 'unknown' END",directionSql="CASE WHEN direction IN ('import','export','bidirectional') THEN direction ELSE 'unknown' END";
export async function readWooWorkspace(actorId:number,merchantId:number){return wooSnapshot(actorId,merchantId,async tx=>{
 const {row,registrations,revision}=await wooConnectionDefinition(tx,merchantId);
 const totals=await wooRows(tx,`SELECT (SELECT COUNT(*) FROM woocommerce_products WHERE merchant_id=?) AS storedProducts,(SELECT COUNT(*) FROM woocommerce_orders WHERE merchant_id=?) AS storedOrders,(SELECT COUNT(*) FROM woocommerce_sync_logs WHERE merchant_id=?) AS syncLogs`,[merchantId,merchantId,merchantId]);
 const grouped=await wooRows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM woocommerce_sync_logs WHERE merchant_id=? GROUP BY state`,[merchantId]);
 const hooks=await wooRows(tx,`SELECT COUNT(*) AS storedCount,COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY)),0) AS recentTotal,COALESCE(SUM(created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 DAY) AND status='completed'),0) AS recentCompleted,
  COALESCE(SUM(status IN ('pending','processing','failed')),0) AS awaiting,COALESCE(SUM(status='manual_review'),0) AS needsReview,COALESCE(SUM(status='suppressed'),0) AS suppressed,COALESCE(SUM(status NOT IN ('pending','processing','failed','manual_review','completed','suppressed')),0) AS unknownCount,
  MIN(CASE WHEN status IN ('pending','processing','failed') THEN created_at END) AS oldestPendingAt FROM woocommerce_webhook_receipts WHERE merchant_id=?`,[merchantId]);
 if(totals.length!==1||hooks.length!==1||grouped.some(g=>!wooLogStates.includes(g.state))||new Set(grouped.map(g=>g.state)).size!==grouped.length)throw new WooWorkspaceFault();
 const identityStored=!!row&&/^[a-f0-9]{48}$/.test(row.endpoint??'')&&Number(row.hasWebhookSecret)===1;
 const registrationsValid=registrations.every(r=>WOOCOMMERCE_WEBHOOK_TOPICS.includes(r.topic)&&/^[1-9][0-9]{0,31}$/.test(r.webhookId))&&new Set(registrations.map(r=>r.topic)).size===registrations.length&&new Set(registrations.map(r=>r.webhookId)).size===registrations.length;
 const registeredTopics=new Set(registrations.filter(r=>WOOCOMMERCE_WEBHOOK_TOPICS.includes(r.topic)).map(r=>r.topic)).size;
 const connectionStatus=!row?null:['connected','disconnected','error'].includes(row.connectionStatus)?row.connectionStatus:'unknown';
 const counts=(value:any)=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wooCount(v)]));const {oldestPendingAt,unknownCount,storedCount,...health}=hooks[0];health.unknown=unknownCount;health.stored=storedCount;
 return wooWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),revision,present:!!row,state:!row?'unlinked':Number(row.active)===0?'disabled':Number(row.active)!==1?'unknown':connectionStatus==='connected'?'configured':connectionStatus,
  connectionStatus,storeUrl:row?safePlatformUrl(row.storeUrl):null,storeName:typeof row?.storeName==='string'?row.storeName.slice(0,255):null,storeVersion:typeof row?.storeVersion==='string'?row.storeVersion.slice(0,50):null,storeCurrency:/^[A-Z]{3}$/.test(row?.storeCurrency??'')?row.storeCurrency:null,
  hasConsumerKey:!!row&&Number(row.hasConsumerKey)===1,hasConsumerSecret:!!row&&Number(row.hasConsumerSecret)===1,createdAt:wooStamp(row?.createdAt),lastTestAt:wooStamp(row?.lastTestAt),lastSyncAt:wooStamp(row?.lastSyncAt),
  counts:counts(totals[0]),syncSummary:Object.fromEntries(wooLogStates.map(key=>[key,wooCount(grouped.find(g=>g.state===key)?.count??0)])),webhooks:{ready:identityStored&&registrationsValid&&registeredTopics===6,identityStored,registeredTopics,registrationsValid,...counts(health),oldestPendingAt:wooStamp(oldestPendingAt)}});
 });}
export async function readWooLogsWorkspace(actorId:number,merchantId:number,input:unknown){const selection=wooLogsInput.parse(input);return wooSnapshot(actorId,merchantId,async tx=>{
 const merchant=await wooRows(tx,'SELECT id FROM merchants WHERE id=?',[merchantId]);if(merchant.length!==1)throw new WooWorkspaceFault();const totalRows=await wooRows(tx,'SELECT COUNT(*) AS count FROM woocommerce_sync_logs WHERE merchant_id=?',[merchantId]);if(totalRows.length!==1)throw new WooWorkspaceFault();
 const args:Array<string|number|null>=[merchantId];let where='merchant_id=?';if(selection.search){where+=" AND CAST(id AS CHAR) LIKE ? ESCAPE '!'";args.push('%'+selection.search.replace(/[!%_]/g,v=>'!'+v)+'%');}
 if(selection.kind!=='all'){where+=` AND (${kindSql})=?`;args.push(selection.kind);}if(selection.direction!=='all'){where+=` AND (${directionSql})=?`;args.push(selection.direction);}
 const grouped=await wooRows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM woocommerce_sync_logs WHERE ${where} GROUP BY state`,args);if(grouped.some(g=>!wooLogStates.includes(g.state))||new Set(grouped.map(g=>g.state)).size!==grouped.length)throw new WooWorkspaceFault();
 const groups=wooLogStates.map(key=>({key,count:wooCount(grouped.find(g=>g.state===key)?.count??0)})),matched=groups.reduce((n,g)=>n+g.count,0),total=selection.state==='all'?matched:groups.find(g=>g.key===selection.state)!.count;
 if(selection.state!=='all'){where+=` AND (${stateSql})=?`;args.push(selection.state);}const page=await wooRows(tx,`SELECT id,merchant_id AS merchantId,${kindSql} AS kind,${stateSql} AS state,${directionSql} AS direction,items_processed AS processed,items_success AS succeeded,items_failed AS failed,duration AS durationSeconds,(error_message IS NOT NULL AND error_message<>'') AS hasErrors,created_at AS createdAt,started_at AS startedAt,completed_at AS completedAt FROM woocommerce_sync_logs WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,[...args,25,(selection.page-1)*25]);
 return wooLogsWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),selection,summary:{stored:wooCount(totalRows[0].count),matched,groups},pagination:{page:selection.page,pageSize:25,total,pages:Math.ceil(total/25)},rows:page.map(row=>{
  const numbers=Object.fromEntries(['processed','succeeded','failed','durationSeconds'].map(key=>{try{return [key,wooCount(row[key])];}catch{return [key,null];}})),createdAt=wooStamp(row.createdAt),startedAt=wooStamp(row.startedAt),completedAt=wooStamp(row.completedAt);
  const invalidData=['processed','succeeded','failed'].some(key=>numbers[key]===null)||row.durationSeconds!=null&&numbers.durationSeconds===null||!createdAt||!startedAt||row.completedAt!=null&&!completedAt||!!startedAt&&!!completedAt&&completedAt<startedAt||row.state!=='running'&&!completedAt||row.state==='running'&&completedAt!==null||row.state==='unknown'||row.kind==='unknown'||row.direction==='unknown'||Number(numbers.succeeded)+Number(numbers.failed)>Number(numbers.processed);
  return {id:wooCount(row.id),merchantId:wooCount(row.merchantId),kind:row.kind,state:row.state,direction:row.direction,...numbers,hasErrors:wooCount(row.hasErrors)===1,createdAt,startedAt,completedAt,invalidData};
 })});
 });}
