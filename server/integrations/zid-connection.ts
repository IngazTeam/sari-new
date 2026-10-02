import crypto from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {getPool} from '../db/connection';
import {bookingReadId} from '../../shared/booking-read';
import {zidConnectionRevision,zidSettingsInput,zidSettingsReceipt,zidDisconnectReceipt,zidWebhookReceipt} from '../../shared/zid-connection';
import {hasPermission,type MerchantRole} from '../_core/permissions';
import {zidConnectionDefinition} from './zid-workspace';
import {privacyHashExact} from '../accounts/privacy-hash';
import {createZidBasicAuthorization} from '../webhooks/zid-security';

export class ZidConnectionFault extends Error {
 constructor(readonly reason:'unavailable'|'forbidden'|'changed'|'missing'|'legacy'|'invalid'|'inactive'|'conflict'){super(`zid_connection:${reason}`);}
}
async function rows(tx:Pick<PoolConnection,'execute'>,sql:string,args:Array<string|number|null>):Promise<any[]>{const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new ZidConnectionFault('unavailable');return result;}
/** Check authority again after obtaining the merchant lock, preserving an explicit owner revocation. */
export async function zidConnectionWriter(tx:Pick<PoolConnection,'execute'>,actorId:number,merchantId:number){
 const merchant=(await rows(tx,'SELECT userId,status FROM merchants WHERE id=?',[merchantId]))[0];
 if(!merchant||merchant.status==='suspended')throw new ZidConnectionFault('forbidden');
 const users=await rows(tx,'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE',[actorId,merchant.userId]);
 if(![actorId,merchant.userId].every(id=>users.some(user=>user.id===id&&user.account_status==='active')))throw new ZidConnectionFault('forbidden');
 const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
 const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===actorId?'owner':null;
 if(!role||!hasPermission(role as MerchantRole,'integrations.manage'))throw new ZidConnectionFault('forbidden');
}
export async function zidConnectionTransaction<T>(actorId:number,merchantId:number,work:(tx:PoolConnection)=>Promise<T>){
 bookingReadId.parse(actorId);bookingReadId.parse(merchantId);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{const pool=await getPool();if(!pool)throw new ZidConnectionFault('unavailable');tx=await pool.getConnection();await tx.beginTransaction();const value=await work(tx);committing=true;await tx.commit();return value;}
 catch(error){if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}if(error instanceof ZidConnectionFault)throw error;throw new ZidConnectionFault('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
export async function reviewedZidConnection(tx:PoolConnection,actorId:number,merchantId:number,revision:string){
 const current=await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
 if(current.revision!==revision)throw new ZidConnectionFault('changed');if(!current.row)throw new ZidConnectionFault('missing');return current;
}
/** Serializes admission with the other platform writers that take the merchant lock. */
export async function zidRegistrationAdmission(tx:PoolConnection,actorId:number,merchantId:number,revision?:string){
 const current=await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
 if(revision!==undefined&&current.revision!==revision)throw new ZidConnectionFault('changed');
 if(current.row)throw new ZidConnectionFault('conflict');
 const blockers=await rows(tx,`SELECT EXISTS(SELECT 1 FROM salla_connections WHERE merchantId=?) AS salla,
  EXISTS(SELECT 1 FROM woocommerce_settings WHERE merchant_id=? AND is_active<>0) AS woo,
  EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='shopify' AND is_active<>0) AS shopify,
  EXISTS(SELECT 1 FROM byaan_connections WHERE merchant_id=? AND (is_active<>0 OR verified_at IS NULL)) AS byaan`,Array(4).fill(merchantId));
 if(blockers.length!==1||Object.values(blockers[0]).some(value=>![0,1,'0','1'].includes(value as any)))throw new ZidConnectionFault('unavailable');
 if(Object.values(blockers[0]).some(value=>Number(value)!==0))throw new ZidConnectionFault('conflict');return current;
}
/** Update only resource switches. Credentials and other provider settings stay in SQL. */
export async function saveZidWorkspaceSettings(actorId:number,merchantId:number,raw:unknown){
 const input=zidSettingsInput.parse(raw);
 return zidConnectionTransaction(actorId,merchantId,async tx=>{
  const current=await reviewedZidConnection(tx,actorId,merchantId,input.revision);
  if(current.source!=='canonical')throw new ZidConnectionFault('legacy');if(Number(current.row.settingsValid)!==1)throw new ZidConnectionFault('invalid');
  const keys=['autoSync','syncProducts','syncOrders','syncCustomers','notifyMerchantOrders'] as const;
  const [result]=await tx.execute<any>(`UPDATE platform_integrations SET settings=JSON_SET(IF(settings IS NULL OR settings='',JSON_OBJECT(),settings),${keys.map(key=>`'$.${key}',CAST(? AS JSON)`).join(',')}),updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND platform_type='zid'`,[...keys.map(key=>JSON.stringify(input.settings[key])),current.row.id,merchantId]);
  if(result.affectedRows!==1)throw new ZidConnectionFault('changed');
  const stored=await zidConnectionDefinition(tx,merchantId);return zidSettingsReceipt.parse({actorId,merchantId,saved:true,revision:stored.revision,settings:input.settings});
 });
}
/** Retain catalog, orders, customers and incident evidence; remove both credential sources and pending OAuth states atomically. */
export async function disconnectReviewedZid(actorId:number,merchantId:number,revision:string){
 zidConnectionRevision.parse(revision);
 return zidConnectionTransaction(actorId,merchantId,async tx=>{
  await reviewedZidConnection(tx,actorId,merchantId,revision);
  await tx.execute("DELETE FROM platform_integrations WHERE merchant_id=? AND platform_type='zid'",[merchantId]);
  await tx.execute('DELETE FROM zid_settings WHERE merchant_id=?',[merchantId]);
  await tx.execute('DELETE FROM zid_oauth_states WHERE merchant_id=?',[merchantId]);
  await tx.execute("UPDATE merchants SET integration_source='none' WHERE id=? AND integration_source='zid'",[merchantId]);
  const stored=await zidConnectionDefinition(tx,merchantId);return zidDisconnectReceipt.parse({actorId,merchantId,disconnected:true,revision:stored.revision});
 });
}
/** The response is the only plaintext copy. An uncertain commit is never retried automatically. */
export async function rotateReviewedZidWebhook(actorId:number,merchantId:number,revision:string){
 zidConnectionRevision.parse(revision);
 return zidConnectionTransaction(actorId,merchantId,async tx=>{
  const current=await reviewedZidConnection(tx,actorId,merchantId,revision);
  if(current.source!=='canonical')throw new ZidConnectionFault('legacy');if(current.row.active!==1)throw new ZidConnectionFault('inactive');
  const endpointId=crypto.randomBytes(24).toString('hex'),password=crypto.randomBytes(32).toString('base64url');
  const [result]=await tx.execute<any>("UPDATE platform_integrations SET webhook_endpoint_id=?,webhook_auth_hash=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND platform_type='zid' AND is_active=1",[endpointId,privacyHashExact(createZidBasicAuthorization(password)),current.row.id,merchantId]);
  if(result.affectedRows!==1)throw new ZidConnectionFault('changed');
  const stored=await zidConnectionDefinition(tx,merchantId);return zidWebhookReceipt.parse({actorId,merchantId,rotated:true,revision:stored.revision,endpointPath:'/api/webhooks/zid/'+endpointId,username:'sari',password});
 });
}
