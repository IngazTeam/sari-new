import {occasionWorkspaceInput,occasionWorkspaceSchema,occasionStates,type OccasionSelection} from '@shared/occasion-workspace';
import {occasionActionReview,occasionActionResult,type OccasionActionTarget} from '@shared/occasion-actions';
export const occasionSelectionKey=(s:OccasionSelection)=>JSON.stringify([s.query,s.state,s.year,s.page]);
export function occasionNavigation(search:string){
 const p=new URLSearchParams(search),state=p.get('state'),page=p.get('page'),year=p.get('year');
 return occasionWorkspaceInput.parse({query:(p.get('q')??'').trim().slice(0,100),state:occasionStates.includes(state as any)?state:'all',year:year&&/^\d{4}$/.test(year)&&Number(year)>=1900?Number(year):null,page:page&&/^[1-9]\d*$/.test(page)&&Number(page)<=1000000?Number(page):1});
}
export function scopedOccasionWorkspace(raw:unknown,a:number,m:number,s:OccasionSelection){const p=occasionWorkspaceSchema.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&occasionSelectionKey(p.data.selection)===occasionSelectionKey(s)?p.data:null;}
export function scopedOccasionReview(raw:unknown,a:number,m:number,target:OccasionActionTarget,rowRevision?:string){const p=occasionActionReview.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&JSON.stringify(p.data.target)===JSON.stringify(target)&&(target.action==='create'||p.data.row?.id===target.id&&p.data.row?.revision===rowRevision)?p.data:null;}
export function scopedOccasionResult(raw:unknown,a:number,m:number,target:OccasionActionTarget){const p=occasionActionResult.safeParse(raw);return p.success&&p.data.actorId===a&&p.data.merchantId===m&&(target.action==='create'?p.data.effect==='save_disabled'&&!p.data.enabled:p.data.id===target.id&&p.data.enabled===target.enabled&&p.data.effect===(target.enabled?'allow_automatic_admission':'disable_future_admission'))?p.data:null;}
export const occasionStamp=(value:string|null,unknown:string)=>value?value.replace('T',' ').replace(/(?:\.\d{3})?Z$/,' UTC'):unknown;
