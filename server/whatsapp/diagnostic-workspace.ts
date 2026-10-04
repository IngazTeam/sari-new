import { withMerchantOwnerSettings, MerchantSettingsAuthorityError } from '../accounts/merchant-settings-authority';
import { whatsappDiagnosticWorkspace } from '../../shared/whatsapp-diagnostic-workspace';
export async function readWhatsAppDiagnosticWorkspace(actorId:number,merchantId:number){
 return withMerchantOwnerSettings(actorId,merchantId,false,async(tx,authority)=>{
  if(!authority.canManage)throw new MerchantSettingsAuthorityError('forbidden');
  const [rows]=await tx.execute<any[]>('SELECT id,instance_id AS instanceId,provider,status,phone_number AS phoneNumber,is_primary AS isPrimary FROM whatsapp_instances WHERE merchant_id=? ORDER BY is_primary DESC,id ASC LIMIT 101',[merchantId]);
  const [clock]=await tx.execute<any[]>('SELECT UTC_TIMESTAMP(3) AS checkedAt');
  if(!Array.isArray(rows)||!Array.isArray(clock))throw new MerchantSettingsAuthorityError('unavailable');
  const at=clock[0]?.checkedAt;const date=at instanceof Date?at:new Date(String(at).replace(' ','T')+'Z');
  return whatsappDiagnosticWorkspace.parse({actorId,merchantId,checkedAt:date.toISOString(),truncated:rows.length>100,connections:rows.slice(0,100).map(r=>{if(r.isPrimary!==0&&r.isPrimary!==1)throw new MerchantSettingsAuthorityError('unavailable');return{id:r.id,instanceId:r.instanceId,provider:r.provider,status:r.status,phoneNumber:r.phoneNumber,primary:r.isPrimary===1};})});
 });
}
