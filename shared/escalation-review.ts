import {z} from 'zod';
const id=z.number().int().positive().safe(), revision=z.number().int().nonnegative().safe(), at=z.string().datetime({precision:3});
export const escalationReviewOutcome=z.enum(['accepted','failed','unresolved']);
export const escalationReviewInput=z.object({conversationId:id,beforeId:id.optional()}).strict();
export const escalationReviewResult=z.object({outcome:escalationReviewOutcome,customerPhone:z.string()}).strict();
export const escalationReviewItem=z.object({id,revision,evidence:z.string().regex(/^[a-f0-9]{64}$/),
  state:z.enum(['missing','invalid','pending','failed','accepted','delivered','read']),outcome:escalationReviewOutcome,projected:z.boolean(),
  sourceMessageId:id,question:z.string(),reply:z.string(),authorPhone:z.string(),createdAt:at,
  receipt:z.string().regex(/^[^\s<>\x00-\x1f]{1,255}$/).nullable(),
  lastReview:z.object({actorUserId:id,note:z.string().max(1000),outcome:escalationReviewOutcome,at}).strict().nullable(),
}).strict().refine(item=>(item.outcome==='accepted')===(item.receipt!==null),'Receipt must support the accepted outcome');
export const escalationReviewPage=z.object({items:z.array(escalationReviewItem).max(10),nextCursor:id.nullable()}).strict().superRefine((page,ctx)=>{
  if(page.items.some((item,i)=>i>0&&item.id>=page.items[i-1].id)||(page.nextCursor!==null&&(page.items.length!==10||page.nextCursor!==page.items.at(-1)?.id)))ctx.addIssue({code:'custom',message:'Invalid escalation pagination'});
});
export const escalationReviewSnapshot=z.object({merchantId:id,actorUserId:id,conversationId:id,beforeId:id.nullable(),canManage:z.boolean(),page:escalationReviewPage}).strict()
  .refine(s=>s.beforeId===null||s.page.items.every(item=>item.id<s.beforeId!),'Rows exceed escalation cursor');
