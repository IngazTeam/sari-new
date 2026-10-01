import {z} from 'zod';
import {staffTeamReviewReason} from '@shared/staff-team-review';

const id=z.number().int().positive().safe();
const scopeSchema=z.object({merchantId:id,actorUserId:id,kind:z.enum(['text','voice']),sourceId:id,conversationId:id,authorUserId:id}).strict();
export type StaffTeamAttemptScope=z.infer<typeof scopeSchema>;
const recordSchema=z.object({version:z.literal(1),scope:scopeSchema,requestId:z.string().uuid(),reason:staffTeamReviewReason}).strict();
export type SavedStaffTeamAttempt=z.infer<typeof recordSchema>;
export type StaffTeamAttemptRead={state:'ready';value:SavedStaffTeamAttempt}|{state:'missing'|'invalid'|'unavailable'};
function key(raw:StaffTeamAttemptScope){const s=scopeSchema.parse(raw);return `sary:team-review:v1:${s.actorUserId}:${s.merchantId}:${s.kind}:${s.sourceId}:${s.conversationId}:${s.authorUserId}`;}
export function readStaffTeamAttempt(scope:StaffTeamAttemptScope):StaffTeamAttemptRead{
  let raw:string|null;
  try{raw=sessionStorage.getItem(key(scope));}catch{return {state:'unavailable'};}
  if(raw===null)return {state:'missing'};
  try{
    if(raw.length>2000)return {state:'invalid'};
    const record=recordSchema.parse(JSON.parse(raw));
    if(key(record.scope)!==key(scope))return {state:'invalid'};
    return {state:'ready',value:record};
  }catch{return {state:'invalid'};}
}
/** No expiry: an unknown outcome must keep its request identity after reopening. */
export function prepareStaffTeamAttempt(scope:StaffTeamAttemptScope,reason:z.infer<typeof staffTeamReviewReason>){
  const previous=readStaffTeamAttempt(scope);
  if(previous.state==='ready')return previous.value;
  if(previous.state!=='missing')throw Error('Review identity unavailable');
  const value=recordSchema.parse({version:1,scope,requestId:crypto.randomUUID(),reason}),encoded=JSON.stringify(value),name=key(scope);
  sessionStorage.setItem(name,encoded);
  if(sessionStorage.getItem(name)!==encoded)throw Error('Review identity unavailable');
  return value;
}
export function completeStaffTeamAttempt(scope:StaffTeamAttemptScope,requestId:string){
  const current=readStaffTeamAttempt(scope);
  if(current.state==='missing')return;
  if(current.state!=='ready')throw Error('Review identity unavailable');
  if(current.value.requestId!==requestId)return;
  sessionStorage.removeItem(key(scope));
  if(sessionStorage.getItem(key(scope))!==null)throw Error('Review identity cleanup unavailable');
}
/** Explicitly chosen only after reviewing the administrative audit history. */
export function discardStaffTeamAttempt(scope:StaffTeamAttemptScope){
  sessionStorage.removeItem(key(scope));
  if(sessionStorage.getItem(key(scope))!==null)throw Error('Review identity cleanup unavailable');
}
