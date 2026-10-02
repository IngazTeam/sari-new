import {referralWorkspaceInput,referralWorkspaceSchema,type ReferralSelection} from '@shared/referral-workspace';
import {referralInvitationReview} from '@shared/referral-program';
export const referralStates={codes:['active','inactive','invalid'],referrals:['pending','completed','invalid'],rewards:['pending','claimed','expired','invalid']} as const;
export const referralSelectionKey=(s:ReferralSelection)=>JSON.stringify([s.tab,s.query,s.state,s.page]);
export function referralNavigation(search:string){
 const p=new URLSearchParams(search),tab=p.get('tab'),state=p.get('state'),page=p.get('page');
 const section=tab==='codes'||tab==='rewards'?tab:'referrals';
 return referralWorkspaceInput.parse({tab:section,query:(p.get('q')??'').trim().slice(0,100),state:(referralStates[section] as readonly string[]).includes(state??'')?state:'all',page:page&&/^[1-9]\d*$/.test(page)&&Number(page)<=1000000?Number(page):1});
}
export function scopedReferralWorkspace(raw:unknown,actorId:number,merchantId:number,selection:ReferralSelection){
 const p=referralWorkspaceSchema.safeParse(raw);return p.success&&p.data.actorId===actorId&&p.data.merchantId===merchantId&&referralSelectionKey(p.data.selection)===referralSelectionKey(selection)?p.data:null;
}
export function scopedInvitationReview(raw:unknown,actorId:number,merchantId:number,code:string){const p=referralInvitationReview.safeParse(raw);return p.success&&p.data.actorId===actorId&&p.data.merchantId===merchantId&&p.data.code===code?p.data:null;}
