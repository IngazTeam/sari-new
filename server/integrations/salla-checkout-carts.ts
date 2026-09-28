import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { sallaCheckoutCartInput, type SallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { getPool } from '../db/connection';
import { getSallaConnectionByMerchantId } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { currentInboundExecution } from '../messaging/inbound-context';
import { sallaCatalogAuthority,assertSallaCatalogSchema,selectSallaOrderProduct,assertSallaOrderSelection,sallaProductSelectionSchema } from './salla-catalog';
import { assertSallaOrderAuthority,type SallaOrderAuthority } from './salla-order-projection';
import { cartContext,prepareCheckoutCart,readCurrentCheckoutCart } from './salla-checkout-transport';

const id=z.number().int().positive().max(2147483647);
const snapshotSchema=z.object({version:z.literal(1),context:cartContext,connectionId:id,
  items:z.array(sallaProductSelectionSchema).min(1).max(20)}).strict();
type Snapshot=z.infer<typeof snapshotSchema>;
const decode=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
export class SallaCheckoutCartError extends Error {
  constructor(readonly code:'request_conflict'|'cart_pending'|'cart_review'|'cart_rejected'|'cart_unavailable'){super(code);}
}
export async function assertSallaCheckoutCartSchema(){
  await assertSallaCatalogSchema();
  await assertRuntimeSchema('Salla checkout carts',[{table:'salla_checkout_carts',
    columns:['merchant_id','actor_user_id','request_id','request_hash','attempt_token','state','snapshot','result_json','created_at','updated_at'],
    uniqueIndexes:[{name:'salla_cart_request',columns:['merchant_id','request_id']}],checkConstraints:['chk_salla_cart_state']}],{cacheSuccess:false});
}
async function tx<T>(run:(c:PoolConnection)=>Promise<T>){
  const pool=await getPool();if(!pool)throw Error('Database unavailable');const c=await pool.getConnection();let reusable=true,committing=false;
  try{await c.beginTransaction();const value=await run(c);committing=true;await c.commit();committing=false;return value;}
  catch(e){if(committing){reusable=false;c.destroy();}else{try{await c.rollback();}catch{reusable=false;c.destroy();}}throw e;}
  finally{if(reusable)c.release();}
}
async function currentContext(merchantId:number){
  const connection=await getSallaConnectionByMerchantId(merchantId);
  if(!connection||connection.syncStatus!=='active')throw new SallaCheckoutCartError('cart_unavailable');
  const authority=await sallaCatalogAuthority(merchantId,connection.accessToken);
  const context=cartContext.parse({storeId:authority.storeId,storeUrl:connection.storeUrl});
  return {authority,context};
}
async function assertSnapshot(c:PoolConnection,merchantId:number,snapshot:Snapshot,authority:SallaOrderAuthority){
  const [owners]=await c.execute<any[]>("SELECT id FROM merchants WHERE id=? AND status='active' FOR SHARE",[merchantId]);
  if(owners.length!==1)throw Error('Merchant unavailable');
  await assertSallaOrderAuthority(c,authority,true);
  const [rows]=await c.execute<any[]>('SELECT storeUrl FROM salla_connections WHERE id=? AND merchantId=?',[snapshot.connectionId,merchantId]);
  if(rows.length!==1||rows[0].storeUrl!==snapshot.context.storeUrl||authority.connectionId!==snapshot.connectionId||authority.storeId!==snapshot.context.storeId)throw Error('Cart store changed');
  await assertSallaOrderSelection(c,authority,snapshot.items);
}
function pending(state:string):never{throw new SallaCheckoutCartError(state==='rejected'?'cart_rejected':state==='review'?'cart_review':'cart_pending');}
async function operation(merchantId:number,actor:number,input:SallaCheckoutCartInput){
  const pool=(await getPool())!;
  const [rows]=await pool.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=?',[merchantId,input.requestId]);
  if(rows.length!==1||rows[0].actor_user_id!==actor||rows[0].request_hash!==digest(input.items))throw new SallaCheckoutCartError('request_conflict');
  return rows[0];
}
function snapshotFrom(row:any,input:SallaCheckoutCartInput){
  const saved=decode(row.snapshot),snapshot=snapshotSchema.parse(saved?.value);
  if(saved?.digest!==digest(snapshot)||digest(snapshot)!==digest(saved.value)
    ||digest(snapshot.items.map(p=>({productId:p.productId,quantity:p.quantity})))!==digest(input.items))throw Error('Cart snapshot changed');
  return snapshot;
}
async function readyResult(row:any,merchantId:number,input:SallaCheckoutCartInput){
  try{
    const snapshot=snapshotFrom(row,input),saved=decode(row.result_json);
    if(!saved?.value||saved.digest!==digest(saved.value))throw Error('Cart result changed');
    const {authority}=await currentContext(merchantId);
    await tx(c=>assertSnapshot(c,merchantId,snapshot,authority));
    const result=await readCurrentCheckoutCart(snapshot.context,snapshot.items.map(p=>({externalId:p.externalId,sku:p.sku,quantity:p.quantity})),saved.value.cartId);
    if(digest(result)!==saved.digest)throw Error('Cart changed since preparation');
    await tx(c=>assertSnapshot(c,merchantId,snapshot,authority));
    return {...result,replayed:true};
  }catch{throw new SallaCheckoutCartError('cart_unavailable');}
}

/** Prepare a guest cart for hosted checkout. Does not create an order, assign a
 * customer, submit a payment or send a message. One request owns one attempt. */
export async function runSallaCheckoutCart(raw:SallaCheckoutCartInput,merchant:number,actor:number){
  const input=sallaCheckoutCartInput.parse(raw),merchantId=id.parse(merchant),actorId=id.parse(actor),token=randomUUID();
  await assertSallaCheckoutCartSchema();
  let operationId:number;
  try{operationId=await tx(async c=>{
    const [m]=await c.execute<any[]>("SELECT id FROM merchants WHERE id=? AND status='active' FOR SHARE",[merchantId]);
    if(m.length!==1)throw new SallaCheckoutCartError('cart_unavailable');
    const [r]=await c.execute<any>(`INSERT INTO salla_checkout_carts
      (merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,created_at,updated_at)
      VALUES (?,?,?,?,?,'preparing',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[merchantId,actorId,input.requestId,digest(input.items),token]);
    return Number(r.insertId);
  });}catch(e){
    if((e as {code?:string}).code!=='ER_DUP_ENTRY')throw e;
    const row=await operation(merchantId,actorId,input);if(row.state!=='ready')pending(row.state);
    return readyResult(row,merchantId,input);
  }
  try{
    const {authority,context}=await currentContext(merchantId);
    const items=[];for(const p of input.items)items.push(await selectSallaOrderProduct(authority,p.productId,p.quantity));
    const snapshot=snapshotSchema.parse({version:1,context,connectionId:authority.connectionId,items});
    await tx(async c=>{
      await assertSnapshot(c,merchantId,snapshot,authority);
      const [r]=await c.execute<any>(`UPDATE salla_checkout_carts SET state='dispatching',snapshot=?,updated_at=UTC_TIMESTAMP(3)
        WHERE id=? AND merchant_id=? AND attempt_token=? AND state='preparing'`,[JSON.stringify({value:snapshot,digest:digest(snapshot)}),operationId,merchantId,token]);
      if(r.affectedRows!==1)throw Error('Cart attempt unavailable');
    });
    const guard=async()=>{
      await tx(async c=>{
        await assertSnapshot(c,merchantId,snapshot,authority);
        const [rows]=await c.execute<any[]>("SELECT snapshot FROM salla_checkout_carts WHERE id=? AND merchant_id=? AND attempt_token=? AND state='dispatching' FOR UPDATE",[operationId,merchantId,token]);
        if(rows.length!==1||digest(snapshotFrom({...rows[0]},input))!==digest(snapshot))throw Error('Cart attempt changed');
      });
      await currentInboundExecution()?.assertOwned();
    };
    const result=await prepareCheckoutCart(context,items.map(p=>({externalId:p.externalId,sku:p.sku,quantity:p.quantity})),guard);
    await currentInboundExecution()?.assertOwned();
    await tx(async c=>{
      await assertSnapshot(c,merchantId,snapshot,authority);
      const [rows]=await c.execute<any[]>("SELECT snapshot FROM salla_checkout_carts WHERE id=? AND merchant_id=? AND attempt_token=? AND state='dispatching' FOR UPDATE",[operationId,merchantId,token]);
      if(rows.length!==1||digest(snapshotFrom(rows[0],input))!==digest(snapshot))throw Error('Cart attempt changed');
      const [r]=await c.execute<any>(`UPDATE salla_checkout_carts SET state='ready',result_json=?,updated_at=UTC_TIMESTAMP(3)
        WHERE id=? AND merchant_id=? AND attempt_token=? AND state='dispatching'`,
      [JSON.stringify({value:result,digest:digest(result)}),operationId,merchantId,token]);
      if(r.affectedRows!==1)throw Error('Cart result unavailable');
    });
    return {...result,replayed:false};
  }catch{
    const row=await operation(merchantId,actorId,input);
    if(row.state==='ready')return readyResult(row,merchantId,input);
    const pool=(await getPool())!;
    await pool.execute(`UPDATE salla_checkout_carts SET state=IF(state='preparing','rejected','review'),updated_at=UTC_TIMESTAMP(3)
      WHERE id=? AND merchant_id=? AND attempt_token=? AND state IN ('preparing','dispatching')`,[operationId,merchantId,token]);
    pending(row.state==='preparing'?'rejected':'review');
  }
}
