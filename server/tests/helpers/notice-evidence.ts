import { target,noticeHash,type NoticeHooks } from '../../integrations/notice-evidence';
export const syntheticNoticeTarget=(channel:'owner'|'email'|'push'='owner',id=1)=>target(channel,['synthetic-recipient',id],['synthetic-payload']);
export const syntheticNoticeAcceptance=(channel:'owner'|'email'|'push'='owner')=>({state:'accepted' as const,httpStatus:channel==='push'?201:200,referenceHash:noticeHash(['synthetic-receipt',channel])});
// Existing orchestration fault cases inject a callable adapter. Bridge its
// synthetic transport guard to the new plan/receipt contract, never a real API.
export async function simulateNoticeAdapter(fn:(...args:any[])=>any,args:any[],authorize:()=>Promise<void>,hooks:NoticeHooks,channel:'owner'|'push') {
  const t=syntheticNoticeTarget(channel);let started=false;
  const result=await fn(...args,async()=>{await hooks.plan({version:1,method:channel,targets:[t]});await authorize();await hooks.start(t.key);started=true;},hooks);
  if(started&&result===true)await hooks.finish(t.key,syntheticNoticeAcceptance(channel));return result;
}
