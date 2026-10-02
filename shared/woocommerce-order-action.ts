import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {wooOperationIntent} from './woocommerce-operation';
import {wooOrderDetails} from './woocommerce-data-workspace';
const revision=z.string().regex(/^[a-f0-9]{64}$/);
export const wooNotificationRecipient=z.string().regex(/^[1-9][0-9]{7,14}$/);
/** Formatting only: do not invent a country code for a local number. */
export function normalizeWooRecipient(value:unknown):string|null{
 if(typeof value!=='string'||!/^\+?[0-9 ()-]+$/.test(value.trim()))return null;
 let digits=value.trim().replace(/[ ()-]/g,'').replace(/^\+/,'');if(digits.startsWith('00'))digits=digits.slice(2);
 return wooNotificationRecipient.safeParse(digits).success?digits:null;
}
export const wooOrderActionLookup=z.object({orderId:bookingReadId}).strict();
export const wooOrderStatusRequest=wooOperationIntent.pick({requestId:true,revision:true}).extend({orderId:bookingReadId,orderRevision:revision,status:z.enum(['pending','processing','on-hold','completed','cancelled','refunded','failed']),note:z.string().trim().max(1000).optional()}).strict();
export const wooOrderNotificationRequest=wooOperationIntent.pick({requestId:true,revision:true}).extend({orderId:bookingReadId,orderRevision:revision,recipient:wooNotificationRecipient,message:z.string().trim().min(1).max(2000).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),'Invalid message')}).strict();
export const wooOrderActionWorkspace=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),revision,configured:z.boolean(),order:wooOrderDetails.nullable(),canChangeStatus:z.boolean(),recipient:wooNotificationRecipient.nullable(),notificationChannelReady:z.boolean(),canNotify:z.boolean()}).strict().superRefine((v,ctx)=>{
 if(v.order&&v.order.merchantId!==v.merchantId||v.canChangeStatus!==Boolean(v.configured&&v.order?.providerId&&v.order.providerUpdatedAt&&v.order.state!=='unknown')||v.recipient!==normalizeWooRecipient(v.order?.customerPhone)||v.canNotify!==Boolean(v.configured&&v.order?.providerId&&v.recipient&&v.notificationChannelReady))ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce order action review'});
});
