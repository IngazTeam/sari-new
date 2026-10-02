import {z} from 'zod';
import {bookingReadId} from './booking-read';
export const wooOperationKinds=['connect','verify','disconnect','sync_products','sync_orders','reconcile','order_status','order_notify'] as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative().safe();
/** Internal admission metadata. Public handlers compute the payload digest from validated input. */
export const wooOperationIntent=z.object({requestId:z.string().uuid().toLowerCase(),kind:z.enum(wooOperationKinds),revision:digest,payloadDigest:digest}).strict();
export const wooOperationLookup=z.object({requestId:z.string().uuid().toLowerCase()}).strict();
export const wooOperationResult=z.discriminatedUnion('type',[
 z.object({type:z.literal('connection'),revision:digest,configured:z.boolean(),remoteCleanup:z.enum(['not_needed','confirmed','unconfirmed']),verification:z.enum(['not_checked','api','api_and_webhooks']).default('not_checked'),localCopies:z.enum(['unknown','retained','cleared']).default('unknown')}).strict(),
 z.object({type:z.literal('sync'),products:count.nullable(),orders:count.nullable(),reconciled:count}).strict(),
 z.object({type:z.literal('order'),orderId:bookingReadId,status:z.string().min(1).max(50)}).strict(),
 z.object({type:z.literal('notification'),orderId:bookingReadId,accepted:z.literal(true),duplicate:z.boolean()}).strict(),
]);
export const wooOperationReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,requestId:z.string().uuid(),kind:z.enum(wooOperationKinds),revision:digest,outcome:z.enum(['pending','success','rejected','unknown']),started:z.boolean(),reviewRequired:z.boolean(),result:wooOperationResult.nullable(),createdAt:z.string().datetime(),checkedAt:z.string().datetime(),replayed:z.boolean()}).strict().superRefine((v,ctx)=>{
 const r=v.result;
 if((v.outcome==='success')!==(r!==null)||v.outcome==='success'&&!v.started||v.outcome==='rejected'&&v.started||v.reviewRequired&&v.outcome!=='unknown'||r&&(r.type!==({connect:'connection',verify:'connection',disconnect:'connection',sync_products:'sync',sync_orders:'sync',reconcile:'sync',order_status:'order',order_notify:'notification'} as const)[v.kind]||r.type==='connection'&&r.configured!==(v.kind!=='disconnect')||r.type==='sync'&&(v.kind==='sync_products'&&(r.products===null||r.orders!==null||r.reconciled!==0)||v.kind==='sync_orders'&&(r.orders===null||r.products!==null||r.reconciled!==0)||v.kind==='reconcile'&&(r.products===null||r.orders===null))))ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce operation evidence'});
});
export type WooOperationReceipt=z.infer<typeof wooOperationReceipt>;
export type WooOperationKind=typeof wooOperationKinds[number];
export const wooOperationReviewWorkspace=z.object({actorId:bookingReadId,merchantId:bookingReadId,operation:wooOperationReceipt.nullable()}).strict().refine(v=>!v.operation||v.operation.merchantId===v.merchantId,'Foreign operation');
