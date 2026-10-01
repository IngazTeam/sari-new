import {z} from 'zod';
const id=z.number().int().positive().safe(),at=z.string().datetime({precision:3});
export const salesOfferDeliveryState=z.enum(['missing','invalid','failed','sent','delivered','read','pending']);
export const salesOfferReviewOutcome=z.enum(['recorded','accepted_unprojected','failed','unresolved']);
export const salesOfferReviewResult=z.object({accepted:z.boolean(),projected:z.boolean(),deliveryState:salesOfferDeliveryState,outcome:salesOfferReviewOutcome}).strict()
  .refine(s=>s.accepted?s.outcome===(s.projected?'recorded':'accepted_unprojected'):!s.projected&&['failed','unresolved'].includes(s.outcome),'Invalid offer review outcome');
export const salesOfferReviewItem=z.object({id:z.string().uuid(),revision:z.number().int().nonnegative().safe(),evidence:z.string().regex(/^[a-f0-9]{64}$/),
  state:salesOfferDeliveryState,accepted:z.boolean(),projected:z.boolean(),projectionConflict:z.boolean(),attemptState:z.enum(['reserved','dispatching','accepted','unknown','cancelled']),
  sourceMessageId:id,sourceText:z.string().nullable(),text:z.string().nullable(),createdAt:at,receipt:z.string().regex(/^[^\s<>\x00-\x1f]{1,255}$/).nullable(),
  lastReview:z.object({actorUserId:id,note:z.string().max(1000),outcome:salesOfferReviewOutcome,deliveryState:salesOfferDeliveryState,at}).strict().nullable(),
}).strict().refine(s=>s.accepted===(s.receipt!==null)&&(!s.projected||(s.accepted&&!s.projectionConflict))&&(!s.projectionConflict||s.accepted),'Invalid offer receipt/projection');
export const salesOfferReviewPage=z.object({items:z.array(salesOfferReviewItem).max(10),nextCursor:id.nullable()}).strict().superRefine((page,ctx)=>{
  if(new Set(page.items.map(i=>i.id)).size!==page.items.length||page.items.some((item,i)=>i>0&&item.sourceMessageId>=page.items[i-1].sourceMessageId)
    ||(page.nextCursor!==null&&(page.items.length!==10||page.nextCursor!==page.items.at(-1)?.sourceMessageId)))ctx.addIssue({code:'custom',message:'Invalid offer pagination'});
});
export const salesOfferReviewSnapshot=z.object({merchantId:id,actorUserId:id,conversationId:id,beforeSourceId:id.nullable(),canManage:z.boolean(),page:salesOfferReviewPage}).strict()
  .refine(s=>s.beforeSourceId===null||s.page.items.every(i=>i.sourceMessageId<s.beforeSourceId!),'Offer rows exceed source cursor');
