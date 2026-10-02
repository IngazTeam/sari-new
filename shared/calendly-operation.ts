import {calendlySyncPeriod} from './calendly-sync';
import {z} from 'zod';
import {bookingReadId} from './booking-read';
export const calendlyOperationKinds=['connect','verify','disconnect','sync','settings'] as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative().safe();
/** Private admission contract: handlers compute the digest from validated input. */
export const calendlyOperationIntent=z.object({requestId:z.string().uuid().toLowerCase(),kind:z.enum(calendlyOperationKinds),revision:digest,payloadDigest:digest}).strict();
export const calendlyOperationLookup=z.object({requestId:z.string().uuid().toLowerCase()}).strict();
export const calendlyOperationResult=z.discriminatedUnion('type',[
 z.object({type:z.literal('connection'),revision:digest,configured:z.boolean(),remoteCleanup:z.enum(['not_needed','confirmed','unconfirmed']),verification:z.enum(['not_checked','api','api_and_webhooks']),localCopies:z.enum(['retained','cleared'])}).strict(),
 z.object({type:z.literal('sync'),period:calendlySyncPeriod,appointments:count,active:count,cancelled:count}).strict(),
 z.object({type:z.literal('settings'),revision:digest,syncToWhatsApp:z.boolean()}).strict(),
]);
export const calendlyOperationReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,requestId:z.string().uuid(),kind:z.enum(calendlyOperationKinds),revision:digest,outcome:z.enum(['pending','success','rejected','unknown']),started:z.boolean(),reviewRequired:z.boolean(),result:calendlyOperationResult.nullable(),createdAt:z.string().datetime(),checkedAt:z.string().datetime(),replayed:z.boolean()}).strict().superRefine((v,ctx)=>{
 const r=v.result;
 if((v.outcome==='success')!==(r!==null)||(v.outcome==='success'||v.outcome==='unknown')&&!v.started||v.outcome==='rejected'&&v.started||v.reviewRequired&&v.outcome!=='unknown'||r&&(r.type!==({connect:'connection',verify:'connection',disconnect:'connection',sync:'sync',settings:'settings'} as const)[v.kind]||r.type==='connection'&&(r.configured!==(v.kind!=='disconnect')||v.kind==='disconnect'&&r.verification!=='not_checked')||r.type==='sync'&&r.active+r.cancelled!==r.appointments))ctx.addIssue({code:'custom',message:'Inconsistent Calendly operation evidence'});
});
export type CalendlyOperationReceipt=z.infer<typeof calendlyOperationReceipt>;
export type CalendlyOperationKind=typeof calendlyOperationKinds[number];
export const calendlyOperationReviewWorkspace=z.object({actorId:bookingReadId,merchantId:bookingReadId,operation:calendlyOperationReceipt.nullable()}).strict().refine(v=>!v.operation||v.operation.merchantId===v.merchantId,'Foreign operation');
