import { whatsappDiagnosticWorkspace, whatsappRemovalInput, type WhatsAppDiagnosticWorkspace } from '../../../shared/whatsapp-diagnostic-workspace';
import { whatsappConnectionTestInput,whatsappImageTestInput,whatsappTextTestInput } from '../../../shared/whatsapp-test-input';
export const whatsappDiagnosticMutations=['whatsapp.testConnection','whatsapp.sendTestMessage','whatsapp.sendTestImage','whatsapp.saveInstance','whatsapp.deleteReviewedInstance'] as const;
export class WhatsAppDiagnosticPreviewStore{
 private rows:WhatsAppDiagnosticWorkspace['connections'];private next=3;private revision=1;
 constructor(private actorId:number,private merchantId:number,private now:string,private mode:string){this.rows=mode==='empty'?[]:[{id:1,instanceId:'7103000'+merchantId,provider:'green_api',status:'active',phoneNumber:'99900000'+merchantId,primary:true},{id:2,instanceId:'7104000'+merchantId,provider:'green_api',status:'inactive',phoneNumber:'99910000'+merchantId,primary:false}];}
 removalRevision(){return (this.actorId.toString(16).padStart(16,'0')+this.merchantId.toString(16).padStart(16,'0')+this.revision.toString(16).padStart(32,'0'));}
 read(input:any){if(input?.merchantId!==this.merchantId)throw {data:{code:'FORBIDDEN'}};return whatsappDiagnosticWorkspace.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,truncated:false,removalRevision:this.removalRevision(),connections:this.rows});}
 mutate(name:string,input:any){
  if(name==='whatsapp.deleteReviewedInstance'){input=whatsappRemovalInput.parse(input);if(input.merchantId!==this.merchantId)throw {data:{code:'FORBIDDEN'}};if(input.expectedRevision!==this.removalRevision())throw {data:{code:'CONFLICT'}};const index=this.rows.findIndex(r=>r.id===input.instanceId);if(index<0)throw {data:{code:'NOT_FOUND'}};this.rows.splice(index,1);this.revision++;const active=this.rows.filter(r=>r.status==='active');const primary=active.find(r=>r.primary)||active[0];for(const row of this.rows)row.primary=row.id===primary?.id;return {success:true,actorId:this.actorId,merchantId:this.merchantId,instanceId:input.instanceId,primaryInstanceId:primary?.id??null};}
  const parsed=(name==='whatsapp.sendTestMessage'?whatsappTextTestInput:name==='whatsapp.sendTestImage'?whatsappImageTestInput:whatsappConnectionTestInput).parse(name==='whatsapp.saveInstance'?{instanceId:input.instanceId,token:input.token}:input);
  if(parsed.token!=='local-demo-token')throw {data:{code:'FORBIDDEN'}};
  if(name==='whatsapp.testConnection')return {success:true,status:'authorized',phoneNumber:'99900000'+this.merchantId};
  if(name==='whatsapp.saveInstance'){this.revision++;const old=this.rows.find(r=>r.instanceId===input.instanceId),id=old?.id??this.next++;if(old){old.status='active';old.phoneNumber=input.phoneNumber;}else this.rows.push({id,instanceId:input.instanceId,provider:'green_api',status:'active',phoneNumber:input.phoneNumber,primary:false});return {success:true,instanceId:id};}
  if(!this.rows.some(r=>r.instanceId===input.instanceId&&r.status==='active'))throw {data:{code:'FORBIDDEN'}};
  return {accepted:true,idMessage:'local-preview-receipt'};
 }
}
