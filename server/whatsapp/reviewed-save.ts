import type { PoolConnection } from 'mysql2/promise';
import { TRPCError } from '@trpc/server';
import { getPool } from '../db/connection';
import { lockMerchantSettingsAuthority, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { acquireWhatsAppInstanceLock, activeWhatsAppPhoneIdentityHash, assertWhatsAppPhoneAvailable, ensureWhatsAppActivePrimaryOnConnection, finalizeWhatsAppInstanceLockConnection, whatsAppMerchantLockNamespace, whatsAppPhoneLockNamespace } from '../channels/whatsapp/instance-ownership';
import { assertWhatsAppPrimarySchemaReady } from '../channels/whatsapp/schema-readiness';
import { encryptSecret, decryptSecret } from '../security/secrets';
import { whatsappSaveReviewedInput } from '../../shared/whatsapp-diagnostic-workspace';
import { diagnosticSnapshot, readWhatsAppDiagnosticWorkspace } from './diagnostic-workspace';
import { runWhatsAppDiagnostic } from './diagnostic-tests';

function reject(code:'FORBIDDEN'|'CONFLICT'|'PRECONDITION_FAILED',reason:string):never{throw new TRPCError({code,message:'whatsapp_save:'+reason});}
async function capacity(tx:PoolConnection,merchantId:number){
 const [subscriptions]=await tx.execute<any[]>(`SELECT s.id,s.plan_id,
 (s.start_date<=UTC_TIMESTAMP(3) AND s.end_date>UTC_TIMESTAMP(3) AND (s.status<>'trial' OR s.trial_ends_at>UTC_TIMESTAMP(3))) AS valid,
 (m.current_subscription_id=s.id) AS selected FROM merchant_subscriptions s JOIN merchants m ON m.id=s.merchant_id
 WHERE s.merchant_id=? AND s.status IN ('active','trial') ORDER BY s.id LIMIT 2 FOR SHARE`,[merchantId]);
 if(!Array.isArray(subscriptions)||subscriptions.length!==1||Number(subscriptions[0].valid)!==1||Number(subscriptions[0].selected)!==1||!Number.isSafeInteger(subscriptions[0].plan_id))reject('FORBIDDEN','subscription_required');
 const [plans]=await tx.execute<any[]>('SELECT max_whatsapp_numbers FROM subscription_plans WHERE id=? FOR SHARE',[subscriptions[0].plan_id]);
 const max=plans?.[0]?.max_whatsapp_numbers;
 if(!Array.isArray(plans)||plans.length!==1||!Number.isSafeInteger(max)||max < -1)reject('PRECONDITION_FAILED','capacity_unavailable');
 return max as number;
}

/** Verify the provider again, then atomically recheck authority, reviewed state, quota and phone ownership. */
export async function saveReviewedWhatsAppInstance(actorId:number,merchantId:number,raw:unknown){
 const parsed=whatsappSaveReviewedInput.safeParse(raw);
 if(!parsed.success)throw new TRPCError({code:'BAD_REQUEST',message:'whatsapp_save:invalid_input'});
 const p=parsed.data;if(p.merchantId!==merchantId)reject('FORBIDDEN','access_required');
 let tx:PoolConnection|undefined,committing=false,reusable=true;const held:string[]=[];
 try{
  const before=await readWhatsAppDiagnosticWorkspace(actorId,merchantId);
  if(before.removalRevision!==p.expectedRevision||before.truncated)reject('CONFLICT','changed');
  const checked=await runWhatsAppDiagnostic(actorId,merchantId,'connection',{instanceId:p.instanceId,token:p.token});
  if(!('success' in checked)||!checked.success||!('phoneNumber' in checked)||checked.phoneNumber!==p.expectedPhone)reject('CONFLICT','phone_not_verified');
  await assertWhatsAppPrimarySchemaReady('Reviewed WhatsApp save');
  const pool=await getPool();if(!pool)throw Error();tx=await pool.getConnection();
  // Match all canonical instance writers: named merchant and phone locks, then row locks.
  held.push(await acquireWhatsAppInstanceLock(tx,whatsAppMerchantLockNamespace(merchantId)));
  held.push(await acquireWhatsAppInstanceLock(tx,whatsAppPhoneLockNamespace(checked.phoneNumber)));
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  await lockMerchantSettingsAuthority(tx,actorId,merchantId,true);
  const max=await capacity(tx,merchantId),snapshot=await diagnosticSnapshot(tx,actorId,merchantId,true);
  if(snapshot.removalRevision!==p.expectedRevision||snapshot.truncated)reject('CONFLICT','changed');
  const existing=snapshot.connections.find(r=>r.instanceId===p.instanceId),total=snapshot.connections.length+(existing?0:1);
  if(total>100||(max!==-1&&max!==999999&&total>max))reject('FORBIDDEN','capacity_exceeded');
  if(existing&&existing.provider!=='green_api')reject('FORBIDDEN','access_required');
  await assertWhatsAppPhoneAvailable(tx,checked.phoneNumber,existing?.id);
  const encoded=encryptSecret(p.token),hash=activeWhatsAppPhoneIdentityHash(checked.phoneNumber);let instanceId:number;
  if(existing){
   const [changed]=await tx.execute<any>(`UPDATE whatsapp_instances SET token=?,phone_number=?,active_phone_identity_hash=?,status='active',connected_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP()
    WHERE id=? AND merchant_id=? AND provider='green_api' AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())`,[encoded,checked.phoneNumber,hash,existing.id,merchantId]);
   if(changed?.affectedRows!==1)reject('CONFLICT','changed');instanceId=existing.id;
  }else{
   const [created]=await tx.execute<any>(`INSERT INTO whatsapp_instances(merchant_id,provider,instance_id,token,api_url,phone_number,active_phone_identity_hash,status,is_primary,connected_at)
    VALUES (?,'green_api',?,?,?,?,?,'active',0,UTC_TIMESTAMP())`,[merchantId,p.instanceId,encoded,`https://${p.instanceId.slice(0,4)}.api.greenapi.com`,checked.phoneNumber,hash]);
   instanceId=Number(created?.insertId);if(created?.affectedRows!==1||!Number.isSafeInteger(instanceId)||instanceId<1)throw Error();
  }
  const primaryId=await ensureWhatsAppActivePrimaryOnConnection(tx,merchantId);
  const after=await diagnosticSnapshot(tx,actorId,merchantId,true),saved=after.connections.find(r=>r.id===instanceId),primary=after.connections.filter(r=>r.primary);
  const expectedIds=[...snapshot.connections.map(r=>r.id),...existing?[]:[instanceId]].sort((a,b)=>a-b);
  if(after.truncated||JSON.stringify(after.connections.map(r=>r.id).sort((a,b)=>a-b))!==JSON.stringify(expectedIds)||saved?.instanceId!==p.instanceId||saved.provider!=='green_api'||saved.status!=='active'||saved.phoneNumber!==checked.phoneNumber||primary.length!==1||primary[0].id!==primaryId||primary[0].status!=='active')throw Error();
  const [stored]=await tx.execute<any[]>('SELECT token,active_phone_identity_hash FROM whatsapp_instances WHERE id=? AND merchant_id=? FOR SHARE',[instanceId,merchantId]);
  if(!Array.isArray(stored)||stored.length!==1||decryptSecret(stored[0].token)!==p.token||stored[0].active_phone_identity_hash!==hash)throw Error();
  committing=true;await tx.commit();committing=false;
  return {success:true as const,actorId,merchantId,instanceId,phoneNumber:checked.phoneNumber};
 }catch(error){
  if(tx){if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}}
  if(error instanceof MerchantSettingsAuthorityError){if(error.reason==='forbidden')reject('FORBIDDEN','access_required');if(error.reason==='stale')reject('CONFLICT','changed');}
  if(!committing&&error instanceof TRPCError&&['FORBIDDEN','CONFLICT','TOO_MANY_REQUESTS'].includes(error.code))throw new TRPCError({code:error.code,message:'whatsapp_save:review_required'});
  reject('PRECONDITION_FAILED','unconfirmed');
 }finally{if(tx)await finalizeWhatsAppInstanceLockConnection(tx,held,reusable);}
}
