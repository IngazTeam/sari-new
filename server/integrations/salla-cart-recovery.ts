import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { authorizeCheckoutReviewer,checkoutEvidenceTransaction } from './salla-checkout-evidence';
import { assertSallaCheckoutCartSchema,assertSallaCartSnapshot,currentSallaCartContext,readSallaCartSnapshot } from './salla-checkout-carts';
import { readSallaCartCheckpoint,sallaCartRecoveryRecord } from './salla-cart-checkpoint';
import { readCurrentCheckoutCart } from './salla-checkout-transport';
import { assertSallaOrderAuthority } from './salla-order-projection';
import { sallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { sallaCartProblemListInput,sallaCartProblemPage,sallaCartRecoveryInput,sallaCartRecoveryOutput } from '../../shared/salla-cart-recovery';
const id=z.number().int().positive().max(2147483647);
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
const unavailable=():never=>{throw Error('Salla cart recovery unavailable');};
function details(row:any){
  const raw=decode(row.snapshot),input=sallaCheckoutCartInput.parse({requestId:row.request_id,items:raw?.value?.items?.map((p:any)=>({productId:p.productId,quantity:p.quantity}))});
  if(row.request_hash!==digest(input.items))return unavailable();
  return {snapshot:readSallaCartSnapshot(row,input),checkpoint:readSallaCartCheckpoint(row)};
}
export async function listSallaCartProblems(merchant:number,reviewer:number,raw:z.infer<typeof sallaCartProblemListInput>){
  try{
    id.parse(merchant);id.parse(reviewer);const input=sallaCartProblemListInput.parse(raw);await assertSallaCheckoutCartSchema();
    return await checkoutEvidenceTransaction(async c=>{
      await authorizeCheckoutReviewer(c,merchant,reviewer);
      const [rows]=await c.execute<any[]>(`SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND state=?${input.beforeId?' AND id<?':''} ORDER BY id DESC LIMIT 21 FOR SHARE`,[merchant,input.state,...(input.beforeId?[input.beforeId]:[])]);
      const items=rows.slice(0,20).map(row=>{
        let diagnostic:'verifiable'|'missing_reference'|'invalid_evidence'|'in_progress'|'rejected_before_send',cartId:string|null=null;
        try{
          const info=row.snapshot?details(row):null;cartId=info?.checkpoint?.cartId??null;
          diagnostic=row.state==='review'?cartId?'verifiable':'missing_reference':row.state==='rejected'?'rejected_before_send':'in_progress';
        }catch{diagnostic='invalid_evidence';}
        return {id:row.id,requestId:row.request_id,state:row.state,createdAt:new Date(databaseTimeEpoch(row.created_at)).toISOString(),diagnostic,cartId};
      });
      return sallaCartProblemPage.parse({merchantId:merchant,items,nextCursor:rows.length>20?items.at(-1)!.id:null});
    });
  }catch{return unavailable();}
}
function output(merchant:number,row:any,replayed:boolean){
  const proof=details(row).checkpoint;if(!proof?.recovery)return unavailable();
  return sallaCartRecoveryOutput.parse({merchantId:merchant,requestId:row.request_id,cartId:proof.cartId,
    recovery:{reviewerUserId:proof.recovery.reviewerUserId,observedAt:proof.recovery.observedAt},replayed,outcome:'contents_verified',
    paymentFact:'not_recorded',attribution:'not_recorded',customerMessage:'not_sent'});
}
/** GET-only reconciliation of an already parked attempt. Never adopts an ID
 * from a person, retries a POST, fences an in-flight worker, or resumes a quote. */
export async function recoverSallaCart(merchant:number,reviewer:number,raw:z.infer<typeof sallaCartRecoveryInput>){
  try{
    id.parse(merchant);id.parse(reviewer);const input=sallaCartRecoveryInput.parse(raw);await assertSallaCheckoutCartSchema();
    const context=await currentSallaCartContext(merchant);
    const load=async(c:PoolConnection)=>{
      await authorizeCheckoutReviewer(c,merchant,reviewer);
      await assertSallaOrderAuthority(c,context.authority,true);
      const [rows]=await c.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=? FOR UPDATE',[merchant,input.requestId]);
      if(rows.length!==1)return unavailable();const row=rows[0],info=details(row);
      if(!info.checkpoint||!['review','ready'].includes(row.state))return unavailable();
      await assertSallaCartSnapshot(c,merchant,info.snapshot,context.authority);
      return {row,...info};
    };
    const initial=await checkoutEvidenceTransaction(load);
    if(initial.row.state==='ready')return output(merchant,initial.row,true);
    const result=await readCurrentCheckoutCart(initial.snapshot.context,initial.snapshot.items.map(p=>({externalId:p.externalId,sku:p.sku,quantity:p.quantity})),initial.checkpoint!.cartId);
    return await checkoutEvidenceTransaction(async c=>{
      const current=await load(c);
      if(current.row.state==='ready'){
        if(current.checkpoint?.checkpointDigest!==initial.checkpoint?.checkpointDigest)return unavailable();
        return output(merchant,current.row,true);
      }
      if(digest(current.row)!==digest(initial.row))return unavailable();
      const [[clock]]=await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
      const saved=decode(current.row.snapshot),value=sallaCartRecoveryRecord.parse({version:1,checkpointDigest:current.checkpoint!.checkpointDigest,
        reviewerUserId:reviewer,observedAt:new Date(databaseTimeEpoch(clock.now)).toISOString(),resultDigest:digest(result)});
      saved.recovery={value,digest:digest(value)};
      const encoded=JSON.stringify({value:result,digest:digest(result)});
      await c.execute("UPDATE salla_checkout_carts SET state='ready',snapshot=?,result_json=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND state='review'",[JSON.stringify(saved),encoded,current.row.id]);
      return output(merchant,{...current.row,state:'ready',snapshot:saved,result_json:encoded},false);
    },true);
  }catch{return unavailable();}
}
