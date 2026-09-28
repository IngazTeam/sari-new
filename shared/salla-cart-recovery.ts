import { z } from 'zod';
import { sallaCheckoutReference } from './salla-checkout-evidence';
const id=z.number().int().positive().max(2147483647);
export const sallaCartRecoveryInput=z.object({requestId:z.string().uuid().transform(v=>v.toLowerCase())}).strict();
export const sallaCartRecoveryStamp=z.object({reviewerUserId:id,observedAt:z.string().datetime({precision:3})}).strict();
export const sallaCartProblemListInput=z.object({state:z.enum(['review','preparing','dispatching','rejected']),beforeId:id.optional()}).strict();
export const sallaCartProblemItem=z.object({id,requestId:z.string().uuid(),createdAt:z.string().datetime({precision:3}),
  state:z.enum(['review','preparing','dispatching','rejected']),
  diagnostic:z.enum(['verifiable','missing_reference','invalid_evidence','in_progress','rejected_before_send']),cartId:sallaCheckoutReference.nullable()}).strict().superRefine((v,c)=>{
  if((v.diagnostic==='verifiable'&&(v.state!=='review'||v.cartId===null))
    ||v.diagnostic==='in_progress'&&!['preparing','dispatching'].includes(v.state)
    ||v.diagnostic==='rejected_before_send'&&v.state!=='rejected'
    ||v.diagnostic==='missing_reference'&&(v.state!=='review'||v.cartId!==null)
    ||v.diagnostic==='invalid_evidence'&&v.cartId!==null)c.addIssue({code:'custom',message:'Invalid cart diagnostic'});
});
export const sallaCartProblemPage=z.object({merchantId:id,items:z.array(sallaCartProblemItem).max(20),nextCursor:id.nullable()}).strict().superRefine((v,c)=>{
  if(new Set(v.items.map(i=>i.requestId.toLowerCase())).size!==v.items.length||v.items.some((i,n)=>n>0&&i.id>=v.items[n-1].id)
    ||v.nextCursor!==null&&(v.items.length!==20||v.items.at(-1)?.id!==v.nextCursor))c.addIssue({code:'custom',message:'Invalid cart page'});
});
export const sallaCartRecoveryOutput=z.object({merchantId:id,requestId:z.string().uuid(),cartId:sallaCheckoutReference,
  recovery:sallaCartRecoveryStamp,replayed:z.boolean(),outcome:z.literal('contents_verified'),
  paymentFact:z.literal('not_recorded'),attribution:z.literal('not_recorded'),customerMessage:z.literal('not_sent')}).strict();
