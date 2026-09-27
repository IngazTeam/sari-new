import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { sheetIntentSchema,sheetReceiptSchema,sheetIntentHash,sheetReceiptHash,type SheetIntent,type SheetReceipt } from './salla-sheet-evidence';

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
},{table:'salla_sheet_receipts',columns:['effect_id','merchant_id','creation_id','local_order_id','claim_token','context_hash','intent','intent_hash',
  'receipt','receipt_hash','created_at','accepted_at'],
  uniqueIndexes:[{name:'salla_sheet_effect_once',columns:['effect_id']}],checkConstraints:['chk_salla_sheet_receipt'],
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
/** Read-only inspection. No claim, recovery, acceptance or external request. */
export async function inspectSallaEffectContext(c:PoolConnection,row:{merchant_id:number;creation_id:number;local_order_id:number;context_hash:string}) {
  try {
    const current=await context(c,row.merchant_id,row.creation_id,true);
    return current.id===row.local_order_id&&digest(current)===row.context_hash;
  } catch(error) {
    if(error instanceof Error&&error.message==='Creation context unavailable')return false;
    throw error;
  }
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
async function guard(row:Effect,dispatch=false,sheetIntent?:SheetIntent):Promise<Context> {
  return transaction(async c=>{
    const [rows]=await c.execute<any[]>(`SELECT * FROM salla_creation_effects WHERE id=? AND merchant_id=? AND creation_id=?
      AND local_order_id=? AND kind=? AND context_hash=? AND claim_token=? AND state IN ('processing','dispatching')
      AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE`,
      [row.id,row.merchant_id,row.creation_id,row.local_order_id,row.kind,row.context_hash,row.claim_token]);
    if(rows.length!==1)throw Error('Creation effect lease unavailable');
    const current=await context(c,row.merchant_id,row.creation_id,true);
    if(current.id!==row.local_order_id||digest(current)!==row.context_hash)throw Error('Creation effect context changed');
    if(sheetIntent) {
      if(row.kind!=='sheets'||!dispatch||rows[0].state!=='processing')throw Error('Sheets dispatch already started');
      const intent=sheetIntentSchema.parse(sheetIntent);
      // The intent and marker commit together. An ambiguous commit never sends.
      await c.execute(`INSERT INTO salla_sheet_receipts(effect_id,merchant_id,creation_id,local_order_id,claim_token,context_hash,intent,intent_hash)
        VALUES (?,?,?,?,?,?,?,?)`,[row.id,row.merchant_id,row.creation_id,row.local_order_id,row.claim_token,row.context_hash,JSON.stringify(intent),sheetIntentHash(intent)]);
    }
    if(dispatch&&rows[0].state==='processing')await c.execute(`UPDATE salla_creation_effects SET state='dispatching',
      dispatch_started_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[row.id]);
    return current;
  });
}
const jsonValue=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
function checkedSheetIntent(e:any,r:any) {
  if(e.kind!=='sheets'||r.effect_id!==e.id||r.merchant_id!==e.merchant_id
    ||r.creation_id!==e.creation_id||r.local_order_id!==e.local_order_id
    ||r.claim_token!==e.claim_token||r.context_hash!==e.context_hash||!e.dispatch_started_at)throw Error('Sheet receipt scope mismatch');
  const intent=sheetIntentSchema.parse(jsonValue(r.intent));
  if(sheetIntentHash(intent)!==r.intent_hash)throw Error('Sheet intent hash mismatch');
  return intent;
}
async function captureSheetReceipt(row:Effect,value:SheetReceipt) {
  const receipt=sheetReceiptSchema.parse(value);
  await transaction(async c=>{
    const [effects]=await c.execute<any[]>(`SELECT * FROM salla_creation_effects WHERE id=? AND merchant_id=?
      AND claim_token=? AND context_hash=? AND kind='sheets' AND state IN ('dispatching','review','accepted') FOR UPDATE`,
      [row.id,row.merchant_id,row.claim_token,row.context_hash]);
    const [receipts]=await c.execute<any[]>('SELECT * FROM salla_sheet_receipts WHERE effect_id=? FOR UPDATE',[row.id]);
    if(effects.length!==1||receipts.length!==1)throw Error('Sheet evidence unavailable');
    const saved=receipts[0];checkedSheetIntent(effects[0],saved);
    if(receipt.intentHash!==saved.intent_hash)throw Error('Sheet receipt intent mismatch');
    if(saved.receipt!==null) {
      const existing=sheetReceiptSchema.parse(jsonValue(saved.receipt));
      if(!saved.accepted_at||sheetReceiptHash(existing)!==saved.receipt_hash||saved.receipt_hash!==sheetReceiptHash(receipt))throw Error('Sheet receipt is immutable');
      return;
    }
    await c.execute(`UPDATE salla_sheet_receipts SET receipt=?,receipt_hash=?,accepted_at=UTC_TIMESTAMP(3) WHERE effect_id=?`,
      [JSON.stringify(receipt),sheetReceiptHash(receipt),row.id]);
  });
}
/** SQL-only settlement of recorded acceptance. Missing/invalid evidence never resends. */
async function settleSheetReceipts(merchantId?:number,effectId?:number) {
  await transaction(async c=>{
    const [effects]=await c.execute<any[]>(`SELECT e.* FROM salla_creation_effects e
      WHERE e.kind='sheets' AND e.state IN ('dispatching','review') AND e.dispatch_started_at IS NOT NULL
        AND (e.last_error IS NULL OR e.last_error<>'sheet_evidence_invalid')
        AND EXISTS(SELECT 1 FROM salla_sheet_receipts r WHERE r.effect_id=e.id AND r.accepted_at IS NOT NULL)
        ${merchantId===undefined?'':'AND e.merchant_id=?'} ${effectId===undefined?'':'AND e.id=?'}
      ORDER BY e.id LIMIT 100 FOR UPDATE SKIP LOCKED`,[...(merchantId===undefined?[]:[merchantId]),...(effectId===undefined?[]:[effectId])]);
    for(const effect of effects) {
      const [receipts]=await c.execute<any[]>('SELECT * FROM salla_sheet_receipts WHERE effect_id=? FOR SHARE',[effect.id]);
      const saved=receipts[0];
      try {
        if(!saved||!saved.accepted_at)throw Error('Missing receipt');
        checkedSheetIntent(effect,saved);const receipt=sheetReceiptSchema.parse(jsonValue(saved.receipt));
        if(receipt.intentHash!==saved.intent_hash||sheetReceiptHash(receipt)!==saved.receipt_hash)throw Error('Invalid receipt');
      } catch {
        await c.execute(`UPDATE salla_creation_effects SET state='review',lease_until=NULL,
          last_error='sheet_evidence_invalid',updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[effect.id]);
        continue;
      }
      // This is a historical acknowledgement, even if current ownership, order
      // terms or credentials have since changed. No provider call occurs here.
      await c.execute(`UPDATE salla_creation_effects SET state='accepted',lease_until=NULL,accepted_at=?,
        last_error=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,[saved.accepted_at,effect.id]);
    }
  });
}
async function finish(row:Effect,accepted:boolean) {
  const pool=(await getPool())!;
  if(row.kind==='sheets')await settleSheetReceipts(row.merchant_id,row.id);
  // A late positive acknowledgement may settle our own stale dispatch, but may
  // not acquire a new attempt or revive a row failed before dispatch.
  if(accepted&&row.kind!=='sheets')await pool.execute(`UPDATE salla_creation_effects SET state='accepted',lease_until=NULL,
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
  return (await syncOrderToSheets(current.id,{merchantId:row.merchant_id,beforeSend:async()=>{await guard(row);},
    evidence:{prepare:async intent=>{await guard(row,true,intent);},accept:receipt=>captureSheetReceipt(row,receipt)}})).success;
}
export async function runSallaCreationEffectsBatch(limit=20,merchantId?:number):Promise<number> {
  z.number().int().min(1).max(25).parse(limit);if(merchantId!==undefined)idSchema.parse(merchantId);
  await assertSallaCreationEffectsSchema();await settleSheetReceipts(merchantId);await recover(merchantId);
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
