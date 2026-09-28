import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { databaseTimeEpoch } from '../db/time';
import { parseApiKeyPermissions,type ApiKeyScope } from '../api/api-key-permissions';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { conversionIdentity,conversionHistoryInput,conversionHistoryOutput,conversionObservation } from '../../shared/api-conversion-history';
import { normalizeApiConversion,canAdvanceConversionStatus,type NormalizedApiConversion } from './api-conversion-sync-core';

const authoritySchema=z.object({apiKeyId:conversionIdentity,keyHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type ConversionApiAuthority=z.infer<typeof authoritySchema>;
export class ConversionAccessDenied extends Error {constructor(){super('Conversion access denied');this.name='ConversionAccessDenied';}}
export class ConversionHistoryConflict extends Error {constructor(){super('Conversion history unavailable');this.name='ConversionHistoryConflict';}}
export class ConversionNotFound extends Error {constructor(){super('Conversion not found');this.name='ConversionNotFound';}}
const conflict=():never=>{throw new ConversionHistoryConflict();};
export const CONVERSION_HISTORY_REQUIREMENTS=[
  {table:'sari_conversions',columns:['history_digest','idempotency_key']},
  {table:'api_conversion_observations',columns:['merchant_id','conversion_id','observed_state','source_kind','api_key_id','payload_digest','previous_digest','observation_digest','observed_at'],
    uniqueIndexes:[{name:'api_conversion_observed_state',columns:['conversion_id','observed_state']}],checkConstraints:['chk_api_conversion_observation']}
];
export const assertConversionHistorySchema=()=>assertRuntimeSchema('API conversion history',CONVERSION_HISTORY_REQUIREMENTS,{cacheSuccess:false});

/** No API credential is persisted in history. Current authority is locked until
 * the write/read completes; a middleware decision alone cannot authorize it. */
export async function lockConversionAuthority(c:PoolConnection,merchantId:number,authority:ConversionApiAuthority|undefined,scope:ApiKeyScope){
  if(!conversionIdentity.safeParse(merchantId).success)throw new ConversionAccessDenied();
  const [merchants]=await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR UPDATE',[merchantId]);
  if(merchants.length!==1||merchants[0].status!=='active')throw new ConversionAccessDenied();
  const [owners]=await c.execute<any[]>("SELECT id FROM users WHERE id=? AND account_status='active' FOR SHARE",[merchants[0].userId]);
  if(owners.length!==1)throw new ConversionAccessDenied();
  if(authority===undefined)return {source:'internal_unverified' as const,apiKeyId:null};
  const parsed=authoritySchema.safeParse(authority);if(!parsed.success)throw new ConversionAccessDenied();
  const [keys]=await c.execute<any[]>(`SELECT permissions,key_hash,is_active,(expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) AS valid
    FROM sari_api_keys WHERE id=? AND merchant_id=? FOR SHARE`,[parsed.data.apiKeyId,merchantId]);
  if(keys.length!==1||keys[0].is_active!==1||!keys[0].valid||keys[0].key_hash!==parsed.data.keyHash
    ||!parseApiKeyPermissions(keys[0].permissions)?.includes(scope))throw new ConversionAccessDenied();
  return {source:'api_key_report' as const,apiKeyId:parsed.data.apiKeyId};
}
export function conversionPayloadDigest(merchantId:number,conversion:NormalizedApiConversion){
  const {status,...payload}=conversion;return digest({merchantId,payload});
}
export async function readConversionObservations(c:PoolConnection,merchantId:number,row:any,payloadDigest?:string){
  const [rows]=await c.execute<any[]>(`SELECT * FROM api_conversion_observations WHERE conversion_id=? ORDER BY id LIMIT 4 FOR UPDATE`,[row.id]);
  if(!rows.length){if(row.history_digest!==null)conflict();return [];}
  if(rows.length>3)conflict();
  if(!payloadDigest){
    if(row.source!=='api'||row.external_ref!==row.idempotency_key)conflict();
    payloadDigest=conversionPayloadDigest(merchantId,normalizeApiConversion({customerPhone:row.customer_phone,customerName:row.customer_name,
      actionType:row.action_type,productName:row.product_name,amount:row.amount===null?null:Number(row.amount),externalRef:row.external_ref,status:row.status}));
  }
  let previous:string|null=null,state:any=null;
  const result=rows.map(r=>{
    const observation=conversionObservation.parse({version:1,merchantId:r.merchant_id,conversionId:r.conversion_id,state:r.observed_state,
      source:r.source_kind,apiKeyId:r.api_key_id,payloadDigest:r.payload_digest,previousDigest:r.previous_digest,
      observedAt:new Date(databaseTimeEpoch(r.observed_at)).toISOString()});
    if(observation.merchantId!==merchantId||observation.conversionId!==row.id||observation.payloadDigest!==payloadDigest
      ||observation.previousDigest!==previous||digest(observation)!==r.observation_digest
      ||state&&(state===observation.state||!canAdvanceConversionStatus(state,observation.state)))conflict();
    previous=r.observation_digest;state=observation.state;return {observation,digest:r.observation_digest};
  });
  if(previous!==row.history_digest||state!==row.status)conflict();return result;
}
export async function recordConversionObservation(c:PoolConnection,merchantId:number,row:any,conversion:NormalizedApiConversion,
  source:Awaited<ReturnType<typeof lockConversionAuthority>>){
  const payloadDigest=conversionPayloadDigest(merchantId,conversion),history=await readConversionObservations(c,merchantId,row,payloadDigest);
  if(history.at(-1)?.observation.state===conversion.status)return;
  const observation=conversionObservation.parse({version:1,merchantId,conversionId:row.id,state:conversion.status,...source,
    payloadDigest,previousDigest:row.history_digest,observedAt:new Date().toISOString()}),observationDigest=digest(observation);
  await c.execute(`INSERT INTO api_conversion_observations (merchant_id,conversion_id,observed_state,source_kind,api_key_id,payload_digest,previous_digest,observation_digest,observed_at)
    VALUES (?,?,?,?,?,?,?,?,?)`,[merchantId,row.id,conversion.status,source.source,source.apiKeyId,payloadDigest,row.history_digest,observationDigest,new Date(observation.observedAt)]);
  const [updated]=await c.execute<any>('UPDATE sari_conversions SET status = ?,history_digest=? WHERE id=? AND merchant_id=? AND history_digest <=> ?',
    [conversion.status,observationDigest,row.id,merchantId,row.history_digest]);
  if(updated.affectedRows!==1)conflict();
}

/** Caller-reported transitions, never a verified payment or a learning outcome.
 * Legacy rows remain explicitly unrecorded until a fresh authorized observation. */
export async function getApiConversionHistory(merchantId:number,authority:ConversionApiAuthority,input:unknown){
  const parsed=conversionHistoryInput.parse(input);await assertConversionHistorySchema();
  const pool=await getPool();if(!pool)conflict();const c=await pool!.getConnection();let reusable=true;
  try{
    await c.beginTransaction();if(authority===undefined)throw new ConversionAccessDenied();
    await lockConversionAuthority(c,merchantId,authority,'conversions:read');
    const [rows]=await c.execute<any[]>('SELECT * FROM sari_conversions WHERE id=? AND merchant_id=? FOR UPDATE',[parsed.conversionId,merchantId]);
    if(rows.length!==1)throw new ConversionNotFound();
    const observations=await readConversionObservations(c,merchantId,rows[0]);
    const result=conversionHistoryOutput.parse({conversionId:parsed.conversionId,currentState:rows[0].status,
      history:observations.length?'recorded':'legacy_unrecorded',paymentEvidence:'not_verified',attribution:'not_recorded',observations});
    await c.rollback();return result;
  }catch(error){try{await c.rollback();}catch{reusable=false;c.destroy();}throw error;}
  finally{if(reusable)c.release();}
}
