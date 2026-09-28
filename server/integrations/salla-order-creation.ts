import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { sallaOrderCreateSchema, sallaOrderIntentSchema, type SallaOrderIntent, type SallaCreationResult } from '../../shared/salla-order-create';
import { assertSallaOrderAuthority, sallaAuthoritySchema, type SallaOrderAuthority } from './salla-order-projection';
import { assertSallaOrderSelection, sallaProductSelectionSchema, type SallaProductSelection } from './salla-catalog';
import { assertSallaCreationEffectsSchema, enqueueSallaCreationEffects } from './salla-creation-effects';

const internalId = z.number().int().positive().max(2147483647);
export const sallaCreationAttemptSchema = z.object({ id:internalId, merchantId:internalId, token:z.string().uuid() }).strict();
const attemptSchema = sallaCreationAttemptSchema;
export type SallaCreationAttempt = z.infer<typeof attemptSchema>;
export class SallaCreationError extends Error {
  constructor(readonly code: 'request_conflict'|'operation_pending'|'operation_review'|'operation_rejected'|'result_unavailable') { super(code); }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export const sallaIntentHash = (input: SallaOrderIntent) => createHash('sha256').update(canonical(input)).digest('hex');
export async function assertSallaCreationSchema() {
  await assertSallaCreationEffectsSchema();
  await assertRuntimeSchema('Salla durable order creation',[{table:'salla_order_creations',
    columns:['merchant_id','actor_user_id','request_id','request_hash','attempt_token','state','store_id','connection_id','local_order_id','result_json','error_code','created_at','updated_at'],
    uniqueIndexes:[{name:'salla_creation_request',columns:['merchant_id','request_id']},{name:'salla_creation_order',columns:['local_order_id']}],
    checkConstraints:['chk_salla_creation_state']}],{cacheSuccess:false});
}
async function transaction<T>(work:(c:PoolConnection)=>Promise<T>):Promise<T> {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');const c=await pool.getConnection();let reusable=true,committing=false;
  try{await c.beginTransaction();const value=await work(c);committing=true;await c.commit();committing=false;return value;}
  catch(e){if(committing){reusable=false;c.destroy();}else{try{await c.rollback();}catch{reusable=false;c.destroy();}}throw e;}
  finally{if(reusable)c.release();}
}
async function readOperation(merchantId:number,actorUserId:number,requestId:string,hash:string) {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');
  const [rows]=await pool.execute<any[]>('SELECT * FROM salla_order_creations WHERE merchant_id=? AND request_id=?',[merchantId,requestId]);
  const row=rows[0];if(!row||row.actor_user_id!==actorUserId||row.request_hash!==hash)throw new SallaCreationError('request_conflict');
  return row;
}
async function completedResult(row:any):Promise<SallaCreationResult> {
  const pool=await getPool();if(!pool)throw Error('Database unavailable');
  const [orders]=await pool.execute<any[]>(`SELECT o.id,o.orderNumber,o.paymentUrl FROM orders o
    JOIN merchants m ON m.id=o.merchantId AND m.status='active'
    JOIN salla_order_projections p ON p.local_order_id=o.id AND p.merchant_id=o.merchantId
    JOIN salla_connections c ON c.id=p.connection_id AND c.merchantId=p.merchant_id AND c.salla_store_id=p.store_id AND c.syncStatus='active'
    WHERE o.id=? AND o.merchantId=? AND p.store_id=? AND p.connection_id=?
      AND o.sallaOrderId=CONCAT('salla:',p.store_id,':',p.external_order_id)`,[row.local_order_id,row.merchant_id,row.store_id,row.connection_id]);
  const saved=typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json,o=orders[0];
  if(orders.length!==1||!saved||saved.orderId!==o.id||saved.orderNumber!==o.orderNumber||saved.paymentUrl!==o.paymentUrl)throw new SallaCreationError('result_unavailable');
  return {orderId:o.id,orderNumber:o.orderNumber,paymentUrl:o.paymentUrl};
}
function pendingError(state:string):never {
  throw new SallaCreationError(state==='rejected'?'operation_rejected':state==='review'?'operation_review':'operation_pending');
}
/** The request ID identifies one explicit operation, not a cart or a customer.
 * No timeout, process restart or second caller may acquire a second POST attempt. */
export async function runSallaOrderCreation(input:{merchantId:number;actorUserId:number;requestId:string;intent:SallaOrderIntent},
  work:(attempt:SallaCreationAttempt)=>Promise<{orderId:number;orderNumber:string|null;paymentUrl:string|null}|null>) {
  const merchantId=internalId.parse(input.merchantId),actorUserId=internalId.parse(input.actorUserId);
  const {requestId,...intent}=sallaOrderCreateSchema.parse({...input.intent,requestId:input.requestId});
  const hash=sallaIntentHash(intent);await assertSallaCreationSchema();
  let attempt:SallaCreationAttempt;
  try {
    attempt=await transaction(async c=>{
      const [owner]=await c.execute<any[]>("SELECT id FROM merchants WHERE id=? AND status='active' FOR SHARE",[merchantId]);
      if(owner.length!==1)throw new SallaCreationError('result_unavailable');
      const token=randomUUID();const [r]=await c.execute<any>(`INSERT INTO salla_order_creations
        (merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,created_at,updated_at) VALUES (?,?,?,?,?,'preparing',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[merchantId,actorUserId,requestId,hash,token]);
      return {id:Number(r.insertId),merchantId,token};
    });
  } catch(e) {
    if((e as {code?:string}).code!=='ER_DUP_ENTRY')throw e;
    const row=await readOperation(merchantId,actorUserId,requestId,hash);
    if(row.state==='completed')return {...await completedResult(row),replayed:true};
    pendingError(row.state);
  }
  try {
    // Keep the cleanup identity private even if preparation mutates its input.
    const result=await work({...attempt});
    const row=await readOperation(merchantId,actorUserId,requestId,hash);
    if(!result||row.state!=='completed')throw Error('Order result not committed');
    const saved=await completedResult(row);
    if(canonical(saved)!==canonical(result))throw Error('Order result mismatch');
    return {...saved,replayed:false};
  } catch {
    // A lost commit acknowledgement can be settled from our own atomic write.
    // A missing provider response cannot: it remains blocked for review.
    const row=await readOperation(merchantId,actorUserId,requestId,hash);
    if(row.state==='completed')return {...await completedResult(row),replayed:true};
    const pool=(await getPool())!;
    await pool.execute(`UPDATE salla_order_creations SET error_code=IF(state='preparing','preparation_failed','provider_result_unconfirmed'),
      state=IF(state='preparing','rejected','review'),updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=? AND attempt_token=? AND state IN ('preparing','dispatching')`,[attempt.id,merchantId,attempt.token]);
    pendingError(row.state==='preparing'?'rejected':'review');
  }
}
/** Persist authority before the only permitted provider POST; no DB lock spans HTTP. */
export async function dispatchSallaCreation(raw:SallaCreationAttempt,rawAuthority:SallaOrderAuthority,rawSelection:SallaProductSelection[],rawIntent:SallaOrderIntent) {
  // Clone and validate before the first await. A caller retaining these objects
  // cannot change the claimed identity or cart while schema/SQL checks wait.
  const a=attemptSchema.parse(raw),authority=sallaAuthoritySchema.parse(rawAuthority);
  const selection=z.array(sallaProductSelectionSchema).min(1).max(100).parse(rawSelection);
  const hash=sallaIntentHash(sallaOrderIntentSchema.parse(rawIntent));
  if(a.merchantId!==authority.merchantId)throw Error('Creation merchant mismatch');
  await assertSallaCreationSchema();
  await transaction(async c=>{
    // Reservation happened before extraction/model latency. Suspension during
    // that time must stop the provider effect, not just future reservations.
    const [owner]=await c.execute<any[]>("SELECT id FROM merchants WHERE id=? AND status='active' FOR SHARE",[a.merchantId]);
    if(owner.length!==1)throw Error('Merchant unavailable');
    await assertSallaOrderAuthority(c,authority,true);
    await assertSallaOrderSelection(c,authority,selection);
    const [r]=await c.execute<any>(`UPDATE salla_order_creations SET state='dispatching',store_id=?,connection_id=?,updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=? AND attempt_token=? AND request_hash=? AND state='preparing'`,[authority.storeId,authority.connectionId,a.id,a.merchantId,a.token,hash]);
    if(r.affectedRows!==1)throw Error('Creation attempt unavailable');
  });
}
export async function lockSallaCreation(c:PoolConnection,raw:SallaCreationAttempt,authority:SallaOrderAuthority) {
  const a=attemptSchema.parse(raw);if(a.merchantId!==authority.merchantId)throw Error('Creation merchant mismatch');
  const [rows]=await c.execute<any[]>(`SELECT id FROM salla_order_creations WHERE id=? AND merchant_id=? AND attempt_token=?
    AND state='dispatching' AND store_id=? AND connection_id=? FOR UPDATE`,[a.id,a.merchantId,a.token,authority.storeId,authority.connectionId]);
  if(rows.length!==1)throw Error('Creation attempt unavailable');
}
export async function completeSallaCreation(c:PoolConnection,a:SallaCreationAttempt,result:SallaCreationResult) {
  const [r]=await c.execute<any>(`UPDATE salla_order_creations SET state='completed',local_order_id=?,result_json=?,updated_at=UTC_TIMESTAMP(3)
    WHERE id=? AND merchant_id=? AND attempt_token=? AND state='dispatching'`,[result.orderId,JSON.stringify(result),a.id,a.merchantId,a.token]);
  if(r.affectedRows!==1)throw Error('Creation completion unavailable');
  await enqueueSallaCreationEffects(c,a.merchantId,a.id,result.orderId);
}
