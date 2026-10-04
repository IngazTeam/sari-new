import { whatsappDiagnosticWorkspace, type WhatsAppDiagnosticWorkspace } from '../../../shared/whatsapp-diagnostic-workspace';
import { whatsappConnectionTestInput,whatsappImageTestInput,whatsappTextTestInput } from '../../../shared/whatsapp-test-input';
export const whatsappDiagnosticMutations=['whatsapp.testConnection','whatsapp.sendTestMessage','whatsapp.sendTestImage','whatsapp.saveInstance','whatsapp.deleteInstance'] as const;
export class WhatsAppDiagnosticPreviewStore{
 private rows:WhatsAppDiagnosticWorkspace['connections'];private next=3;
 constructor(private actorId:number,private merchantId:number,private now:string,private mode:string){this.rows=mode==='empty'?[]:[{id:1,instanceId:'7103000'+merchantId,provider:'green_api',status:'active',phoneNumber:'99900000'+merchantId,primary:true},{id:2,instanceId:'7104000'+merchantId,provider:'green_api',status:'inactive',phoneNumber:'99910000'+merchantId,primary:false}];}
 read(input:any){if(input?.merchantId!==this.merchantId)throw {data:{code:'FORBIDDEN'}};return whatsappDiagnosticWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,truncated:false,connections:this.rows});}
 mutate(name:string,input:any){
  if(name==='whatsapp.deleteInstance'){const index=this.rows.findIndex(r=>r.id===input.instanceId);if(index<0)throw {data:{code:'NOT_FOUND'}};this.rows.splice(index,1);return {success:true};}
  const parsed=(name==='whatsapp.sendTestMessage'?whatsappTextTestInput:name==='whatsapp.sendTestImage'?whatsappImageTestInput:whatsappConnectionTestInput).parse(name==='whatsapp.saveInstance'?{instanceId:input.instanceId,token:input.token}:input);
  if(parsed.token!=='local-demo-token')throw {data:{code:'FORBIDDEN'}};
  if(name==='whatsapp.testConnection')return {success:true,status:'authorized',phoneNumber:'99900000'+this.merchantId};
  if(name==='whatsapp.saveInstance'){const old=this.rows.find(r=>r.instanceId===input.instanceId),id=old?.id??this.next++;if(old){old.status='active';old.phoneNumber=input.phoneNumber;}else this.rows.push({id,instanceId:input.instanceId,provider:'green_api',status:'active',phoneNumber:input.phoneNumber,primary:false});return {success:true,instanceId:id};}
  if(!this.rows.some(r=>r.instanceId===input.instanceId&&r.status==='active'))throw {data:{code:'FORBIDDEN'}};
  return {accepted:true,idMessage:'local-preview-receipt'};
 }
}
