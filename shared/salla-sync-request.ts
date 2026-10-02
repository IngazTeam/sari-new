import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {sallaSyncInput,sallaConnectionRevision} from './salla-connection';
export const sallaSyncRequest=sallaSyncInput.extend({requestId:z.string().uuid().toLowerCase()}).strict();
export const sallaSyncLookup=sallaSyncRequest.pick({requestId:true});
export const sallaSyncReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,requestId:z.string().uuid(),revision:sallaConnectionRevision,
  syncType:z.enum(['full','stock']),outcome:z.enum(['pending','success','failed','interrupted']),logId:bookingReadId.nullable(),itemsSynced:z.number().int().nonnegative().max(2147483647).nullable(),
  createdAt:z.string().datetime(),checkedAt:z.string().datetime(),replayed:z.boolean(),
}).strict().superRefine((value,ctx)=>{if(value.outcome==='success'&&(value.itemsSynced===null||value.logId===null))ctx.addIssue({code:'custom',message:'Completed sync requires confirmed evidence'});if(['pending','interrupted'].includes(value.outcome)&&value.itemsSynced!==null)ctx.addIssue({code:'custom',message:'Unconfirmed sync cannot claim a completed count'});});
export type SallaSyncReceipt=z.infer<typeof sallaSyncReceipt>;
