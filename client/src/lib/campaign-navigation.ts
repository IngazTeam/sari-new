import { campaignListInput,campaignStatuses,type CampaignListSelection } from '@shared/campaign-workspace';
export function campaignNavigation(search:string) {
  const params=new URLSearchParams(search),status=params.get('status'),page=params.get('page');
  return {selection:campaignListInput.parse({search:(params.get('q')??'').trim().slice(0,200),
    status:campaignStatuses.includes(status as any)?status:'all',
    needsReview:params.get('review')==='1',
    page:page&&/^[1-9]\d*$/.test(page)&&Number(page)<=1_000_000?Number(page):1}),
    tab:params.get('tab')==='performance'?'performance' as const:'list' as const};
}
export function campaignHref(path:string,search:string,patch:Record<string,string|number|null>) {
  const params=new URLSearchParams(search);
  for(const [key,value] of Object.entries(patch)){
    if(value===null||value===''||(key==='page'&&value===1)||(key==='status'&&value==='all')||(key==='tab'&&value==='list'))params.delete(key);
    else params.set(key,String(value));
  }
  const suffix=params.toString();return path+(suffix?'?'+suffix:'');
}
export const campaignSelectionKey=(selection:CampaignListSelection)=>JSON.stringify([selection.search,selection.status,selection.page,selection.needsReview]);
