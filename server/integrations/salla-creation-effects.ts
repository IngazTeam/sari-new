import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';

const idSchema = z.number().int().positive().max(2147483647);
const kinds = ['owner_notice','merchant_notice','sheets'] as const;
type Effect = { id:number; merchant_id:number; creation_id:number; local_order_id:number;
  kind:typeof kinds[number]; context_hash:string; claim_token:string; attempts:number };
type Context = { merchantId:number; ownerId:number; businessName:string; merchantName:string;
  connectionId:number; storeId:string; externalOrderId:string; accessToken:string;
  id:number; orderNumber:string; customerPhone:string; customerName:string; totalAmount:number;
  currency:string; items:string; createdAt:string };
export const SALLA_CREATION_EFFECT_REQUIREMENTS = [{ table:'salla_creation_effects',
  columns:['merchant_id','creation_id','local_order_id','kind','context_hash','state','attempts','claim_token',
    'lease_until','available_at','dispatch_started_at','accepted_at','last_error','created_at','updated_at'],
  uniqueIndexes:[{name:'salla_creation_effect_once',columns:['creation_id','kind']}],
  checkConstraints:['chk_salla_creation_effect'],
}];
export const assertSallaCreationEffectsSchema = () => assertRuntimeSchema('Salla creation effects',
  SALLA_CREATION_EFFECT_REQUIREMENTS,{cacheSuccess:false});

async function transaction<T>(work:(c:PoolConnection)=>Promise<T>):Promise<T> {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');const c=await pool.getConnection();
  let reusable=true,committing=false;
  try { await c.beginTransaction();const result=await work(c);committing=true;await c.commit();committing=false;return result; }
  catch(error) { if(committing){reusable=false;c.destroy();}else{try{await c.rollback();}catch{reusable=false;c.destroy();}}throw error; }
  finally { if(reusable)c.release(); }
}
async function context(c:Pick<PoolConnection,'execute'>,merchantId:number,creationId:number,lock=false):Promise<Context> {
  const [rows]=await c.execute<any[]>(`SELECT m.id AS merchantId,m.userId AS ownerId,m.businessName,u.name AS merchantName,
    sc.id AS connectionId,sc.salla_store_id AS storeId,p.external_order_id AS externalOrderId,sc.accessToken,
    o.id,o.orderNumber,o.customerPhone,o.customerName,o.totalAmount,o.currency,o.items,o.createdAt
    FROM salla_order_creations a
    JOIN merchants m ON m.id=a.merchant_id AND m.status='active'
    JOIN users u ON u.id=m.userId AND u.account_status='active'
    JOIN orders o ON o.id=a.local_order_id AND o.merchantId=m.id AND o.currency='SAR' AND o.status<>'cancelled'
    JOIN salla_order_projections p ON p.local_order_id=o.id AND p.merchant_id=m.id
      AND p.store_id=a.store_id AND p.connection_id=a.connection_id
    JOIN salla_connections sc ON sc.id=p.connection_id AND sc.merchantId=m.id AND sc.salla_store_id=p.store_id AND sc.syncStatus='active'
    WHERE a.id=? AND a.merchant_id=? AND a.state='completed'
      AND o.sallaOrderId=CONCAT('salla:',p.store_id,':',p.external_order_id)${lock?' FOR SHARE':''}`,[creationId,merchantId]);
  if(rows.length!==1)throw Error('Creation context unavailable');
  return rows[0];
}
function digest(c:Context) {
  // No copied customer data or credentials in the queue. Bind immutable order
  // terms and ownership; ordinary fulfilment status updates do not change them.
  return createHash('sha256').update(JSON.stringify([c.merchantId,c.ownerId,c.connectionId,c.storeId,c.externalOrderId,
    c.accessToken,c.id,c.orderNumber,c.customerPhone,c.customerName,c.totalAmount,c.currency,c.items,c.createdAt])).digest('hex');
}
/** Called only inside the order+projection+creation-completion transaction. */
export async function enqueueSallaCreationEffects(c:PoolConnection,merchantId:number,creationId:number,orderId:number) {
  const current=await context(c,merchantId,creationId,true);
  if(current.id!==orderId)throw Error('Creation effect order mismatch');
  for(const kind of kinds)await c.execute(`INSERT INTO salla_creation_effects
    (merchant_id,creation_id,local_order_id,kind,context_hash,state,available_at,created_at,updated_at)
    VALUES (?,?,?,?,?,'pending',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
    [merchantId,creationId,orderId,kind,digest(current)]);
}
async function recover(merchantId?:number) {
  // A dispatch marker is never made retryable, including a crashed process with
  // no response. Safe preparation leases alone may return to the queue.
  await transaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT id,state,attempts FROM salla_creation_effects
      WHERE state IN ('processing','dispatching') AND lease_until<=UTC_TIMESTAMP(3)${merchantId===undefined?'':' AND merchant_id=?'}
      ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`,merchantId===undefined?[]:[merchantId]);
    for(const row of rows) {
      const review=row.state==='dispatching'||row.attempts>=8;
      await c.execute(`UPDATE salla_creation_effects SET state=?,lease_until=NULL,
        claim_token=IF(?,claim_token,NULL),available_at=UTC_TIMESTAMP(3),last_error=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [review?'review':'pending',review?1:0,row.state==='dispatching'?'transport_unconfirmed':review?'retry_exhausted':'preparation_recovered',row.id]);
    }
  });
}
async function claim(merchantId?:number):Promise<Effect|null> {
  return transaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT * FROM salla_creation_effects WHERE state='pending' AND attempts<8
      AND available_at<=UTC_TIMESTAMP(3)${merchantId===undefined?'':' AND merchant_id=?'}
      ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,merchantId===undefined?[]:[merchantId]);
    if(!rows[0])return null;const row=rows[0],token=randomUUID();
    await c.execute(`UPDATE salla_creation_effects SET state='processing',claim_token=?,attempts=attempts+1,
      lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE),last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[token,row.id]);
    return {...row,claim_token:token,attempts:row.attempts+1};
  });
}
async function guard(row:Effect,dispatch=false):Promise<Context> {
  return transaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT * FROM salla_creation_effects WHERE id=? AND merchant_id=? AND creation_id=?
      AND local_order_id=? AND kind=? AND context_hash=? AND claim_token=? AND state IN ('processing','dispatching')
      AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE`,
      [row.id,row.merchant_id,row.creation_id,row.local_order_id,row.kind,row.context_hash,row.claim_token]);
    if(rows.length!==1)throw Error('Creation effect lease unavailable');
    const current=await context(c,row.merchant_id,row.creation_id,true);
    if(current.id!==row.local_order_id||digest(current)!==row.context_hash)throw Error('Creation effect context changed');
    if(dispatch&&rows[0].state==='processing')await c.execute(`UPDATE salla_creation_effects SET state='dispatching',
      dispatch_started_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[row.id]);
    return current;
  });
}
async function finish(row:Effect,accepted:boolean) {
  const pool=(await getPool())!;
  // A late positive acknowledgement may settle our own stale dispatch, but may
  // not acquire a new attempt or revive a row failed before dispatch.
  if(accepted)await pool.execute(`UPDATE salla_creation_effects SET state='accepted',lease_until=NULL,
    accepted_at=UTC_TIMESTAMP(3),last_error=NULL,updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND claim_token=? AND dispatch_started_at IS NOT NULL
      AND (state='dispatching' OR (state='review' AND last_error='transport_unconfirmed'))`,[row.id,row.merchant_id,row.claim_token]);
  await pool.execute(`UPDATE salla_creation_effects SET state='review',lease_until=NULL,
    last_error='effect_not_confirmed',updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND claim_token=? AND state IN ('processing','dispatching')`,[row.id,row.merchant_id,row.claim_token]);
}
async function failed(row:Effect) {
  const pool=(await getPool())!;
  await pool.execute(`UPDATE salla_creation_effects SET
    state=IF(dispatch_started_at IS NOT NULL OR attempts>=8,'review','pending'),
    last_error=IF(dispatch_started_at IS NOT NULL,'transport_unconfirmed','preparation_failed'),
    lease_until=NULL,claim_token=IF(dispatch_started_at IS NOT NULL OR attempts>=8,claim_token,NULL),
    available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND),updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND claim_token=? AND state IN ('processing','dispatching')`,[row.id,row.merchant_id,row.claim_token]);
}
async function dispatch(row:Effect) {
  const current=await guard(row),beforeSend=async()=>{await guard(row,true);};
  if(row.kind==='owner_notice') {
    const {notifyNewOrder}=await import('../_core/emailNotifications');
    const items=JSON.parse(current.items);if(!Array.isArray(items))throw Error('Invalid order items');
    return notifyNewOrder({merchantName:current.merchantName||current.businessName,businessName:current.businessName,
      orderNumber:current.orderNumber,customerName:current.customerName,customerPhone:current.customerPhone,
      totalAmount:current.totalAmount/100,itemsCount:items.length,orderDate:new Date(current.createdAt)},beforeSend);
  }
  if(row.kind==='merchant_notice') {
    const {notifyNewOrder}=await import('../_core/notificationService');
    return notifyNewOrder(row.merchant_id,current.id,current.totalAmount,beforeSend);
  }
  const {syncOrderToSheets}=await import('../sheetsSync');
  return (await syncOrderToSheets(current.id,{merchantId:row.merchant_id,beforeSend})).success;
}
export async function runSallaCreationEffectsBatch(limit=20,merchantId?:number):Promise<number> {
  z.number().int().min(1).max(25).parse(limit);if(merchantId!==undefined)idSchema.parse(merchantId);
  await assertSallaCreationEffectsSchema();await recover(merchantId);
  let handled=0;
  for(;handled<limit;handled++) {
    const row=await claim(merchantId);if(!row)break;
    try { await finish(row,await dispatch(row)); } catch { await failed(row); }
  }
  return handled;
}
let timer:NodeJS.Timeout|undefined,running=false;
export function startSallaCreationEffectsWorker(intervalMs=30_000) {
  if(timer)return;
  const tick=async()=>{if(running)return;running=true;try{await runSallaCreationEffectsBatch();}
    catch{console.error('[Salla creation effects] worker unavailable');}finally{running=false;}};
  void tick();timer=setInterval(()=>void tick(),Math.max(10_000,intervalMs));timer.unref();
}
