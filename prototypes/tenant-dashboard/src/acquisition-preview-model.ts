import {acquisitionInput,acquisitionWorkspaceSchema,type AcquisitionWorkspace} from '../../../shared/acquisition-workspace';
import type {ServiceMode} from './service-preview-model';
export function acquisitionPreview(actorId:number,merchantId:number,checkedAt:string,mode:ServiceMode,input:unknown):AcquisitionWorkspace {
 const {period}=acquisitionInput.parse(input),factor=period==='30d'?1:period==='90d'?2:3;
 const groups=mode==='empty'?[]:mode==='legacy'?[{source:'unattributed' as const,count:7},{source:'other' as const,count:2}]:[
  {source:'instagram' as const,count:(merchantId===269?8:4)*factor},{source:'unattributed' as const,count:5*factor},
  {source:'referral' as const,count:3*factor},{source:'direct' as const,count:2*factor},{source:'other' as const,count:factor},
 ];
 groups.sort((a,b)=>b.count-a.count);
 const totalProfiles=groups.reduce((sum,r)=>sum+r.count,0),otherProfiles=groups.find(r=>r.source==='other')?.count??0,unattributedProfiles=groups.find(r=>r.source==='unattributed')?.count??0;
 return acquisitionWorkspaceSchema.parse({actorId,merchantId,checkedAt,timezone:'UTC',basis:'stored_profile_preference',period,since:period==='all'?null:new Date(Date.parse(checkedAt)-(period==='30d'?30:90)*86400000).toISOString(),totalProfiles,classifiedProfiles:totalProfiles-otherProfiles-unattributedProfiles,otherProfiles,unattributedProfiles,sources:groups.map(r=>({...r,sharePermille:Math.round(r.count/totalProfiles*1000)}))});
}
