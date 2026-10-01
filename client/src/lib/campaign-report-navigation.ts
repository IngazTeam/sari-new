import {campaignReportInput,type CampaignReportSelection} from '@shared/campaign-report';
export function campaignReportId(raw:string|undefined):number|null{
  if(!raw||!/^[1-9]\d*$/.test(raw))return null;const id=Number(raw);return Number.isSafeInteger(id)&&id>0?id:null;
}
export function campaignReportNavigation(id:number,search:string):CampaignReportSelection{
  const params=new URLSearchParams(search),view=params.get('view')==='results'?'results':'recipients';
  const allowed=view==='results'?['all','success','failed','pending']:['all','pending','processing','sent','failed','suppressed','manual_review'];
  const rawStatus=params.get('status'),rawPage=params.get('page');
  return campaignReportInput.parse({id,view,status:rawStatus&&allowed.includes(rawStatus)?rawStatus:'all',search:(params.get('q')??'').trim().slice(0,200),page:rawPage&&/^[1-9]\d*$/.test(rawPage)&&Number(rawPage)<=1_000_000?Number(rawPage):1});
}
export const campaignReportSelectionKey=(selection:CampaignReportSelection)=>JSON.stringify([selection.id,selection.view,selection.status,selection.search,selection.page]);
