import {referralWorkspaceInput,referralWorkspaceSchema,type ReferralWorkspaceRow} from '../../../shared/referral-workspace';
import {referralApplyInput,referralClaimInput,referralCreateInput,referralInvitationInput,referralInvitationReview} from '../../../shared/referral-program';
import type {ServiceMode} from './service-preview-model';
export const referralPreviewQueries=['referrals.workspace'] as const;
export const referralPreviewMutations=['referrals.createInvitation','referrals.reviewInvitation','referrals.applyReferralCode','referrals.claimReward'] as const;
const fault=(code:string)=>({message:'Local referral simulation',data:{code}});
export class ReferralPreviewStore{
 writes=0;private codeId:number|null=null;private applied:string|null=null;private rows:ReferralWorkspaceRow[]=[];
 constructor(readonly actorId:number,readonly merchantId:number,readonly now:string,private mode:()=>ServiceMode){
  if(mode()==='empty')return;this.codeId=1;
  for(let id=1;id<=31;id++){
   const common={id,revision:this.version(id,0),createdAt:now,updatedAt:now,issues:[]};
   this.rows.push({...common,kind:'code',code:id===1?`SARY-DEMO-${merchantId}`:`CUSTOMER-${merchantId}-${id}`,referrerName:`Example ${id}`,referrerPhone:'+966500000000',isActive:id%5!==0,recordedCount:id===1?31:0,rewardGiven:false,state:id%5===0?'inactive':'active'});
   this.rows.push({...common,kind:'referral',codeId:1,code:`SARY-DEMO-${merchantId}`,referredName:`Store ${merchantId}-${id}`,referredPhone:'+966500000000',orderCompleted:id%2===0,state:id%2===0?'completed':'pending'});
  }
  for(let id=1;id<=4;id++)this.rows.push({id,revision:this.version(id,0),createdAt:now,updatedAt:now,issues:[],kind:'reward',referralId:id,type:id===4?'free_month':'discount_10',storedState:id===3?'claimed':'pending',state:id===2?'expired':id===3?'claimed':'pending',description:`Sample reward ${id}`,expiresAt:new Date(Date.parse(now)+(id===2?-1:90)*86400000).toISOString(),claimedAt:id===3?now:null,referralAvailable:true});
 }
 // Local version markers only; these are not evidence of a database or server hash.
 private version(id:number,version:number){return [this.actorId,this.merchantId,id,version,0,0,0,0].map(n=>n.toString(16).padStart(8,'0')).join('');}
 private snapshot(){return this.rows.map(value=>{const row=structuredClone(value);if(this.mode()==='legacy'&&row.id%3===0){row.state='invalid';row.issues=['legacy'];if(row.kind==='code')row.recordedCount=null;if(row.kind==='reward')row.referralAvailable=false;}return row;});}
 read(name:string,input:unknown={}){
  if(name!=='referrals.workspace')throw fault('NOT_FOUND');const selection=referralWorkspaceInput.parse(input),rows=this.snapshot();
  const totals={codes:rows.filter(r=>r.kind==='code').length,referrals:rows.filter(r=>r.kind==='referral').length,rewards:rows.filter(r=>r.kind==='reward').length},kind=selection.tab==='codes'?'code':selection.tab==='referrals'?'referral':'reward',all=rows.filter(r=>r.kind===kind).sort((a,b)=>b.id-a.id);
  const counts={active:0,inactive:0,pending:0,completed:0,claimed:0,expired:0,invalid:0};for(const row of all)counts[row.state]++;
  const q=selection.query.toLowerCase(),matches=all.filter(row=>(selection.state==='all'||row.state===selection.state)&&(!q||String(row.id)===q||(row.kind==='code'?[row.code,row.referrerName,row.referrerPhone]:row.kind==='referral'?[row.code,row.referredName,row.referredPhone]:[row.description,String(row.referralId)]).some(s=>s.toLowerCase().includes(q))));
  const code=this.rows.find(r=>r.kind==='code'&&r.id===this.codeId);
  return referralWorkspaceSchema.parse({actorId:this.actorId,merchantId:this.merchantId,checkedAt:this.now,canManage:this.mode()!=='readonly',selection,totals,counts,invitation:{state:code?'ready':'not_created',codeId:this.codeId,code:code?.kind==='code'?code.code:null,applied:!!this.applied},rewardFulfillment:'not_verified',pageSize:25,matched:matches.length,pages:Math.ceil(matches.length/25),rows:matches.slice((selection.page-1)*25,selection.page*25)});
 }
 mutate(name:string,input:unknown){
  if(this.mode()==='readonly')throw fault('FORBIDDEN');
  if(name==='referrals.createInvitation'){
   referralCreateInput.parse(input);if(this.codeId){const row=this.rows.find(r=>r.kind==='code'&&r.id===this.codeId)!;return {code:{...row,merchantId:this.merchantId},created:false};}
   const id=1;this.codeId=id;const row:ReferralWorkspaceRow={id,revision:this.version(id,0),createdAt:this.now,updatedAt:this.now,issues:[],kind:'code',code:`SARY-DEMO-${this.merchantId}`,referrerName:'Example store',referrerPhone:'+966500000000',isActive:true,recordedCount:0,rewardGiven:false,state:'active'};this.rows.push(row);this.writes++;return {code:{...row,merchantId:this.merchantId},created:true};
  }
  if(name==='referrals.reviewInvitation'||name==='referrals.applyReferralCode'){
   const value=name.endsWith('reviewInvitation')?referralInvitationInput.parse(input):referralApplyInput.parse(input),other=this.merchantId===269?270:269,code=`SARY-DEMO-${other}`,revision=this.version(other,0);if(value.code!==code)throw fault('PRECONDITION_FAILED');
   if(name.endsWith('reviewInvitation'))return referralInvitationReview.parse({actorId:this.actorId,merchantId:this.merchantId,code,referrerName:`Example store ${other}`,expectedRevision:revision,alreadyApplied:this.applied===code,effect:'pending_reward_record',benefitGranted:false});
   if(!('expectedRevision' in value)||value.expectedRevision!==revision)throw fault('CONFLICT');const replayed=this.applied===code;if(!replayed){this.applied=code;this.writes++;}return {success:true,replayed,codeId:1,referralId:32,rewardId:5,referrerMerchantId:other,benefitGranted:false};
  }
  if(name==='referrals.claimReward'){
   const value=referralClaimInput.parse(input),row=this.rows.find(r=>r.kind==='reward'&&r.id===value.rewardId);if(!row||row.kind!=='reward')throw fault('NOT_FOUND');if(row.revision!==value.expectedRevision)throw fault('CONFLICT');if(this.snapshot().find(r=>r.kind==='reward'&&r.id===row.id)?.state!=='pending')throw fault('PRECONDITION_FAILED');row.state='claimed';row.storedState='claimed';row.claimedAt=this.now;row.revision=this.version(row.id,1);this.writes++;return {success:true,rewardId:row.id,effect:'record_only',benefitGranted:false};
  }
  throw fault('NOT_FOUND');
 }
}
