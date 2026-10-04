import type { PoolConnection } from 'mysql2/promise';
import { withMerchantOwnerSettings, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { privacyHashExact } from '../accounts/privacy-hash';
import { whatsappDiagnosticWorkspace } from '../../shared/whatsapp-diagnostic-workspace';

/** Database-only fingerprint: credentials and provider metadata never leave SQL as plaintext. */
export async function diagnosticSnapshot(tx:PoolConnection,actorId:number,merchantId:number,lock=false){
 const [rows]=await tx.execute<any[]>(`SELECT id,instance_id AS instanceId,provider,status,phone_number AS phoneNumber,is_primary AS isPrimary,
 SHA2(JSON_ARRAY(id,merchant_id,provider,instance_id,token,api_url,provider_account_id,phone_number_id,webhook_token_hash,
 phone_number,active_phone_identity_hash,webhook_url,status,is_primary,connected_at,expires_at,metadata,created_at,updated_at),256) AS deletionVersion
 FROM whatsapp_instances WHERE merchant_id=? ORDER BY is_primary DESC,id ASC LIMIT 101${lock?' FOR UPDATE':''}`,[merchantId]);
 const [clock]=await tx.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS checkedAt');
 if(!Array.isArray(rows)||!Array.isArray(clock)||rows.some(r=>! /^[a-f0-9]{64}$/.test(r.deletionVersion)))throw new MerchantSettingsAuthorityError('unavailable');
 const at=clock[0]?.checkedAt,date=at instanceof Date?at:new Date(String(at).replace(' ','T')+'Z'),truncated=rows.length>100;
 return whatsappDiagnosticWorkspace.parse({actorId,merchantId,checkedAt:date.toISOString(),truncated,
  removalRevision:truncated?null:privacyHashExact(JSON.stringify(['whatsapp-removal-v1',actorId,merchantId,rows.map(r=>[r.id,r.deletionVersion])])),
  connections:rows.slice(0,100).map(r=>{if(r.isPrimary!==0&&r.isPrimary!==1)throw new MerchantSettingsAuthorityError('unavailable');return{id:r.id,instanceId:r.instanceId,provider:r.provider,status:r.status,phoneNumber:r.phoneNumber,primary:r.isPrimary===1};})});
}
export async function readWhatsAppDiagnosticWorkspace(actorId:number,merchantId:number){
 return withMerchantOwnerSettings(actorId,merchantId,false,async(tx,authority)=>{
  if(!authority.canManage)throw new MerchantSettingsAuthorityError('forbidden');
  return diagnosticSnapshot(tx,actorId,merchantId);
 });
}
