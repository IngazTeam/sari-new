import {platformPreviewRead,type PlatformSample} from './platform-preview-model';
import {platformWorkspaceSchema,type PlatformWorkspace} from '../../../shared/platform-workspace';
import {byaanConnectionWorkspaceSchema,byaanRegisterInput,byaanDisconnectInput,byaanDisconnectResultSchema} from '../../../shared/byaan-connection-workspace';
export const byaanConnectionQueries=['integrations.byaanConnectionWorkspace'] as const;
export const byaanConnectionMutations=['integrations.connectByaan','integrations.disconnectByaan'] as const;
const fault=(code='CONFLICT')=>({message:'Local Byaan connection example',data:{code}});
/** Local connection identity and retained counts shared by both actual pages. No network or storage writes. */
export class ByaanConnectionPreviewStore {
  writes=0;private version=0;private platform:PlatformWorkspace;
  private counts:{catalog:number;activeTrainees:number;activeFaqs:number;sitePages:number};
  constructor(private actorId:number,private merchantId:number,private now:string,mode:string,sample:PlatformSample) {
    this.platform=platformWorkspaceSchema.parse(platformPreviewRead('integrations.workspace',actorId,merchantId,now,mode,sample));
    this.counts={catalog:this.platform.stats.products,activeTrainees:this.platform.source==='byaan'?this.platform.stats.customers:0,activeFaqs:this.platform.source==='byaan'?35:0,sitePages:this.platform.source==='byaan'?5:0};
  }
  updateDataCounts(value:Partial<typeof this.counts>){Object.assign(this.counts,value);}
  updateSalla(value:Partial<PlatformWorkspace['platforms'][number]>,source?:PlatformWorkspace['source']){
    Object.assign(this.platform.platforms.find(p=>p.platform==='salla')!,value);
    if(source!==undefined)this.platform.source=source;
    this.platform.occupied=this.platform.platforms.filter(p=>p.occupiesSlot).length;this.platform.conflict=this.platform.occupied>1;
    this.platform=platformWorkspaceSchema.parse(this.platform);
  }
  private revision(){return [this.merchantId,19,this.version,0,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
  read(name:string) {
    if(name==='integrations.workspace')return platformWorkspaceSchema.parse(this.platform);
    if(name!=='integrations.byaanConnectionWorkspace')throw Error('Unmapped Byaan connection read');
    const row=this.platform.platforms.find(p=>p.platform==='byaan')!;
    return byaanConnectionWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,source:this.platform.source,present:row.present,state:row.state,
      tenantDomain:row.storeUrl?new URL(row.storeUrl).hostname:null,revision:this.revision(),verifiedAt:row.present&&row.state!=='pending_verification'?this.now:null,lastSyncAt:row.lastSyncAt,
      hasSyncErrors:row.hasSyncErrors,managedContent:this.platform.source==='byaan',blockingPlatforms:this.platform.platforms.filter(p=>p.platform!=='byaan'&&p.occupiesSlot).map(p=>p.platform),counts:this.counts});
  }
  private changed(){this.writes++;this.version++;this.platform.occupied=this.platform.platforms.filter(p=>p.occupiesSlot).length;this.platform.conflict=this.platform.occupied>1;}
  mutate(name:string,input:unknown) {
    const row=this.platform.platforms.find(p=>p.platform==='byaan')!;
    if(name==='integrations.testByaanConnection')return !row.present||row.state==='disabled'?{success:false,status:'not_connected',message:'Local example'}:row.state==='pending_verification'||row.state==='unknown'?{success:false,status:'pending_verification',message:'Local example'}:{success:true,status:'active',message:'Local example; no provider request'};
    if(name==='integrations.connectByaan') {
      const parsed=byaanRegisterInput.safeParse(input);if(!parsed.success)throw fault('BAD_REQUEST');
      if(this.platform.platforms.some(p=>p.platform!=='byaan'&&p.occupiesSlot)||row.present&&new URL(row.storeUrl!).hostname!==parsed.data.tenantDomain)throw fault();
      if(!row.present){Object.assign(row,{present:true,occupiesSlot:true,state:'pending_verification',storeUrl:'https://'+parsed.data.tenantDomain+'/',createdAt:this.now,lastSyncAt:null,hasSyncErrors:false});this.changed();}
      const verified=row.state!=='pending_verification'&&row.state!=='disabled';return {success:verified,pendingVerification:!verified,tenantDomain:parsed.data.tenantDomain};
    }
    if(name==='integrations.disconnectByaan') {
      const parsed=byaanDisconnectInput.safeParse(input);if(!parsed.success)throw fault('BAD_REQUEST');
      if(parsed.data.revision!==this.revision()||!row.present)throw fault();
      const notification=row.state==='pending_verification'||row.state==='disabled'?'not_required':'queued';
      Object.assign(row,{present:false,occupiesSlot:false,state:'unlinked',storeUrl:null,createdAt:null,lastSyncAt:null,hasSyncErrors:false});
      if(this.platform.source==='byaan'){this.platform.source='none';this.platform.stats.audience='customers';this.platform.stats.customers=this.merchantId===269?401:412;}
      this.changed();return byaanDisconnectResultSchema.parse({actorId:this.actorId,merchantId:this.merchantId,disconnected:true,notification});
    }
    throw Error('Unmapped Byaan connection action');
  }
}
