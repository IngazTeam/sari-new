import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { hasPermission,type MerchantRole } from '../_core/permissions';
import { encryptSecret } from '../security/secrets';
import { sallaConnectionDefinition } from './salla-workspace';
import { bookingReadId } from '../../shared/booking-read';
import { sallaRegisterInput,sallaDisconnectInput,sallaRegisterReceipt,sallaDisconnectReceipt } from '../../shared/salla-connection';
import { SallaIntegration,normalizeSallaStoreIdentity } from './salla';

export class SallaConnectionFault extends Error {
  constructor(readonly reason:'unavailable'|'forbidden'|'changed'|'conflict'|'missing'|'credentials') { super(`salla_connection:${reason}`); }
}
async function rows(tx:PoolConnection,sql:string,args:Array<string|number|null>):Promise<any[]> { const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new SallaConnectionFault('unavailable');return result; }
/** Called after the merchant lock. An explicitly revoked legacy owner never falls back to owner access. */
export async function sallaConnectionWriter(tx:PoolConnection,actorId:number,merchantId:number) {
  const merchant=(await rows(tx,'SELECT userId,status FROM merchants WHERE id=?',[merchantId]))[0];if(!merchant||merchant.status==='suspended')throw new SallaConnectionFault('forbidden');
  const users=await rows(tx,'SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE',[actorId,merchant.userId]);
  if(![actorId,merchant.userId].every(id=>users.some(user=>user.id===id&&user.account_status==='active')))throw new SallaConnectionFault('forbidden');
  const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===actorId?'owner':null;
  if(!role||!hasPermission(role as MerchantRole,'integrations.manage'))throw new SallaConnectionFault('forbidden');
}
async function blocked(tx:PoolConnection,merchantId:number) {
  const result=await rows(tx,`SELECT
    (EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='zid' AND is_active<>0)
      OR (NOT EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='zid') AND EXISTS(SELECT 1 FROM zid_settings WHERE merchant_id=? AND is_active<>0))) AS zid,
    EXISTS(SELECT 1 FROM woocommerce_settings WHERE merchant_id=? AND is_active<>0) AS woo,
    EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='shopify' AND is_active<>0) AS shopify,
    EXISTS(SELECT 1 FROM byaan_connections WHERE merchant_id=? AND (is_active<>0 OR verified_at IS NULL)) AS byaan`,Array(6).fill(merchantId));
  if(result.length!==1||Object.values(result[0]).some(value=>![0,1,'0','1'].includes(value as any)))throw new SallaConnectionFault('unavailable');return Object.values(result[0]).some(value=>Number(value)!==0);
}
async function transaction<T>(actorId:number,merchantId:number,work:(tx:PoolConnection)=>Promise<T>) {
  bookingReadId.parse(actorId);bookingReadId.parse(merchantId);const pool=await getPool();if(!pool)throw new SallaConnectionFault('unavailable');const tx=await pool.getConnection();let committing=false,reusable=true;
  try { await tx.beginTransaction();const result=await work(tx);committing=true;await tx.commit();return result; }
  catch(error) { if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}if(error instanceof SallaConnectionFault)throw error;if((error as any)?.code==='ER_DUP_ENTRY')throw new SallaConnectionFault('conflict');throw new SallaConnectionFault('unavailable'); }
  finally { if(reusable)tx.release();else tx.destroy(); }
}
async function admission(tx:PoolConnection,actorId:number,merchantId:number,revision:string) {
  const current=await sallaConnectionDefinition(tx,merchantId,true);await sallaConnectionWriter(tx,actorId,merchantId);
  if(current.revision!==revision)throw new SallaConnectionFault('changed');if(current.row||await blocked(tx,merchantId))throw new SallaConnectionFault('conflict');
}
/** No token replacement, retry, provider mutation or automatic sync. Re-read the saved connection after an uncertain result. */
export async function registerSallaConnection(actorId:number,merchantId:number,raw:unknown,verify=(token:string)=>new SallaIntegration(merchantId,token).testConnection()) {
  const input=sallaRegisterInput.parse(raw);
  await transaction(actorId,merchantId,tx=>admission(tx,actorId,merchantId,input.revision));
  let identity;try { const result=await verify(input.accessToken);identity=result.success?normalizeSallaStoreIdentity(result.storeInfo):null; }catch{throw new SallaConnectionFault('credentials');}
  if(!identity)throw new SallaConnectionFault('credentials');
  const verified=identity;
  return transaction(actorId,merchantId,async tx=>{
    await admission(tx,actorId,merchantId,input.revision);
    await tx.execute("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,?,?,'active')",[merchantId,verified.id,verified.domain,encryptSecret(input.accessToken)]);
    await tx.execute("UPDATE merchants SET integration_source='salla' WHERE id=?",[merchantId]);
    const stored=await sallaConnectionDefinition(tx,merchantId);
    return sallaRegisterReceipt.parse({actorId,merchantId,registered:true,revision:stored.revision,storeId:verified.id,storeUrl:verified.domain});
  });
}
/** Locks the reviewed definition and authority, retaining products, orders, webhook work and audit history. */
export async function disconnectSallaConnection(actorId:number,merchantId:number,raw:unknown) {
  const input=sallaDisconnectInput.parse(raw);
  return transaction(actorId,merchantId,async tx=>{
    const current=await sallaConnectionDefinition(tx,merchantId,true);await sallaConnectionWriter(tx,actorId,merchantId);
    if(current.revision!==input.revision)throw new SallaConnectionFault('changed');if(!current.row)throw new SallaConnectionFault('missing');
    const [result]=await tx.execute<any>('DELETE FROM salla_connections WHERE id=? AND merchantId=?',[current.row.id,merchantId]);if(result.affectedRows!==1)throw new SallaConnectionFault('changed');
    await tx.execute("UPDATE merchants SET integration_source='none' WHERE id=? AND integration_source='salla'",[merchantId]);
    return sallaDisconnectReceipt.parse({actorId,merchantId,disconnected:true});
  });
}
