import { z } from 'zod';
import { sallaCheckoutReference } from '../../shared/salla-checkout-evidence';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';

const id=z.number().int().positive().max(2147483647),hash=z.string().regex(/^[a-f0-9]{64}$/);
const checkpoint=z.object({version:z.literal(1),operationId:id,merchantId:id,actorUserId:id,
  requestId:z.string().uuid(),requestHash:hash,attemptToken:z.string().uuid(),snapshotDigest:hash,cartId:sallaCheckoutReference}).strict();
export const sallaCartRecoveryRecord=z.object({version:z.literal(1),checkpointDigest:hash,reviewerUserId:id,
  observedAt:z.string().datetime({precision:3}),resultDigest:hash}).strict();
const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
export function makeSallaCartCheckpoint(row:any,cartId:string){
  const value=checkpoint.parse({version:1,operationId:row.id,merchantId:row.merchant_id,actorUserId:row.actor_user_id,
    requestId:row.request_id,requestHash:row.request_hash,attemptToken:row.attempt_token,snapshotDigest:decode(row.snapshot).digest,cartId});
  return {value,digest:digest(value)};
}
/** Optional for legacy rows. A present but invalid checkpoint is never treated
 * as a missing one, and its remote ID can never be supplied by an API client. */
export function readSallaCartCheckpoint(row:any){
  const snapshot=decode(row.snapshot);
  if(snapshot?.checkpoint===undefined){if(snapshot?.recovery!==undefined)throw Error('Missing checkpoint');return null;}
  const raw=snapshot.checkpoint,value=checkpoint.parse(raw?.value),expected=makeSallaCartCheckpoint(row,value.cartId);
  if(!['dispatching','review','ready'].includes(row.state)||raw.digest!==digest(value)||digest(raw.value)!==raw.digest||digest(expected)!==digest(raw)
    ||snapshot.digest!==digest(snapshot.value))throw Error('Invalid cart checkpoint');
  if(row.state==='ready'){
    const result=decode(row.result_json);
    if(result?.digest!==digest(result?.value)||result?.value?.cartId!==value.cartId)throw Error('Checkpoint result mismatch');
  }
  let recovery:z.infer<typeof sallaCartRecoveryRecord>|null=null;
  if(snapshot.recovery!==undefined){
    const rawRecovery=snapshot.recovery;recovery=sallaCartRecoveryRecord.parse(rawRecovery?.value);
    if(rawRecovery.digest!==digest(recovery)||digest(rawRecovery.value)!==rawRecovery.digest||row.state!=='ready'
      ||recovery.checkpointDigest!==raw.digest||recovery.resultDigest!==decode(row.result_json)?.digest)throw Error('Invalid cart recovery');
  }
  return {cartId:value.cartId,checkpointDigest:raw.digest,recovery};
}
