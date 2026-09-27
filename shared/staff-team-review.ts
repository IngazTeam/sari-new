import {z} from 'zod';
import {staffAttemptKind,staffAttemptItem,staffAttemptCheckResult} from './staff-attempt-review';

const id=z.number().int().positive().safe();
export const staffTeamReviewReason=z.enum(['delivery_check','departed_employee','incident_review']);
export const staffTeamListInput=z.object({kind:staffAttemptKind,conversationId:id.optional(),authorUserId:id.optional(),beforeId:id.optional()}).strict();
export const staffTeamCheckInput=z.object({kind:staffAttemptKind,sourceId:id,conversationId:id,authorUserId:id,
  requestId:z.string().uuid(),reason:staffTeamReviewReason}).strict();
export const staffTeamOutcome=z.union([staffAttemptCheckResult,z.object({success:z.literal(false),status:z.literal('unavailable'),persisted:z.literal(false)}).strict()]);
export const staffTeamCheckResult=z.object({reviewId:id,result:staffTeamOutcome}).strict();
export const staffTeamItem=z.object({attempt:staffAttemptItem,conversationId:id,authorUserId:id}).strict();
export const staffTeamAuditItem=z.object({id,kind:staffAttemptKind,sourceId:id,conversationId:id,authorUserId:id,reviewerUserId:id,
  reason:staffTeamReviewReason,createdAt:z.string().datetime({precision:3}),result:staffTeamOutcome}).strict();
function ordered(page:{items:Array<{id:number}>;nextCursor:number|null}){
  return !page.items.some((v,i)=>i>0&&v.id>=page.items[i-1].id)
    &&(page.nextCursor===null||page.items.length===20&&page.nextCursor===page.items.at(-1)?.id);
}
export const staffTeamPage=z.object({items:z.array(staffTeamItem).max(20),nextCursor:id.nullable()}).strict()
  .refine(p=>ordered({items:p.items.map(i=>i.attempt),nextCursor:p.nextCursor}),'Invalid page');
export const staffTeamAuditPage=z.object({items:z.array(staffTeamAuditItem).max(20),nextCursor:id.nullable()}).strict().refine(ordered,'Invalid page');
