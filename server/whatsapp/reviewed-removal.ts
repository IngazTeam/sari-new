import type { PoolConnection } from 'mysql2/promise';
import { TRPCError } from '@trpc/server';
import { getPool } from '../db/connection';
import { lockMerchantSettingsAuthority, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { acquireWhatsAppInstanceLock, ensureWhatsAppActivePrimaryOnConnection, finalizeWhatsAppInstanceLockConnection, whatsAppMerchantLockNamespace } from '../channels/whatsapp/instance-ownership';
import { assertWhatsAppPrimarySchemaReady } from '../channels/whatsapp/schema-readiness';
import { whatsappRemovalInput } from '../../shared/whatsapp-diagnostic-workspace';
import { diagnosticSnapshot } from './diagnostic-workspace';

/** The canonical merchant lock precedes row locks; authorization, snapshot and removal share one transaction. */
export async function removeReviewedWhatsAppInstance(actorId:number,merchantId:number,raw:unknown){
 const parsed=whatsappRemovalInput.safeParse(raw);
 if(!parsed.success)throw new TRPCError({code:'BAD_REQUEST',message:'whatsapp_remove:invalid_input'});
 if(parsed.data.merchantId!==merchantId)throw new TRPCError({code:'FORBIDDEN',message:'whatsapp_remove:access_required'});
 let tx:PoolConnection|undefined,committing=false,reusable=true;const held:string[]=[];
 try{
  await assertWhatsAppPrimarySchemaReady('Reviewed WhatsApp removal');
  const pool=await getPool();if(!pool)throw Error();
  tx=await pool.getConnection();
  held.push(await acquireWhatsAppInstanceLock(tx,whatsAppMerchantLockNamespace(merchantId)));
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  await lockMerchantSettingsAuthority(tx,actorId,merchantId,true);
  const snapshot=await diagnosticSnapshot(tx,actorId,merchantId,true),p=parsed.data;
  if(!snapshot.removalRevision||snapshot.removalRevision!==p.expectedRevision)throw new MerchantSettingsAuthorityError('stale');
  const target=snapshot.connections.find(r=>r.id===p.instanceId);
  if(!target||target.provider!=='green_api')throw new MerchantSettingsAuthorityError('forbidden');
  const [removed]=await tx.execute<any>('DELETE FROM whatsapp_instances WHERE id=? AND merchant_id=? AND provider=?',[p.instanceId,merchantId,'green_api']);
  if(removed?.affectedRows!==1)throw Error();
  const primaryId=await ensureWhatsAppActivePrimaryOnConnection(tx,merchantId);
  const after=await diagnosticSnapshot(tx,actorId,merchantId,true);
  const active=after.connections.filter(r=>r.status==='active'),primary=after.connections.filter(r=>r.primary);
  const expectedIds=snapshot.connections.filter(r=>r.id!==p.instanceId).map(r=>r.id).sort((a,b)=>a-b);
  const remainingIds=after.connections.map(r=>r.id).sort((a,b)=>a-b);
  if(after.truncated||after.connections.some(r=>r.id===p.instanceId)||after.connections.length!==snapshot.connections.length-1||
    JSON.stringify(expectedIds)!==JSON.stringify(remainingIds)||
    (active.length?primary.length!==1||primary[0].id!==primaryId||primary[0].status!=='active':primary.length!==0))throw Error();
  committing=true;await tx.commit();committing=false;
  return {success:true as const,actorId,merchantId,instanceId:p.instanceId,primaryInstanceId:primaryId??null};
 }catch(error){
  if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}
  if(error instanceof MerchantSettingsAuthorityError){
   if(error.reason==='forbidden')throw new TRPCError({code:'FORBIDDEN',message:'whatsapp_remove:access_required'});
   if(error.reason==='stale')throw new TRPCError({code:'CONFLICT',message:'whatsapp_remove:changed'});
  }
  throw new TRPCError({code:'PRECONDITION_FAILED',message:'whatsapp_remove:unconfirmed'});
 }finally{if(tx)await finalizeWhatsAppInstanceLockConnection(tx,held,reusable);}
}
