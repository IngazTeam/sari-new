import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {zidConnectionRevision} from './zid-connection';
export const zidSyncKinds=['products','orders','customers'] as const;
export const zidSyncRequest=z.object({requestId:z.string().uuid().toLowerCase(),revision:zidConnectionRevision,resource:z.enum(['all',...zidSyncKinds])}).strict();
export const zidSyncLookup=zidSyncRequest.pick({requestId:true});
export const zidSyncReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,requestId:z.string().uuid(),revision:zidConnectionRevision,resource:z.enum(['all',...zidSyncKinds]),outcome:z.enum(['pending','success','failed','interrupted']),
 resources:z.array(z.object({kind:z.enum(zidSyncKinds),logId:bookingReadId.nullable(),state:z.enum(['not_started','pending','completed','failed','unknown']),itemsSynced:z.number().int().nonnegative().max(2147483647).nullable()}).strict()).min(1).max(3),
 createdAt:z.string().datetime(),checkedAt:z.string().datetime(),replayed:z.boolean(),
}).strict().superRefine((v,ctx)=>{
 if(v.resource!=='all'&&(v.resources.length!==1||v.resources[0].kind!==v.resource)||v.resources.some((r,i)=>i>0&&zidSyncKinds.indexOf(r.kind)<=zidSyncKinds.indexOf(v.resources[i-1].kind)||r.state==='completed'&&(r.logId===null||r.itemsSynced===null)||r.state!=='completed'&&r.itemsSynced!==null||r.state==='failed'&&r.logId===null||r.state==='not_started'&&r.logId!==null||r.state==='pending'&&(r.logId===null||v.outcome!=='pending'))||v.outcome==='success'&&v.resources.some(r=>r.state!=='completed'))ctx.addIssue({code:'custom',message:'Inconsistent Zid sync evidence'});
});
export type ZidSyncReceipt=z.infer<typeof zidSyncReceipt>;
