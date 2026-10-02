import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {wooOperationIntent} from './woocommerce-operation';
import {wooOrderDetails} from './woocommerce-data-workspace';
const revision=z.string().regex(/^[a-f0-9]{64}$/);
export const wooOrderActionLookup=z.object({orderId:bookingReadId}).strict();
export const wooOrderStatusRequest=wooOperationIntent.pick({requestId:true,revision:true}).extend({orderId:bookingReadId,orderRevision:revision,status:z.enum(['pending','processing','on-hold','completed','cancelled','refunded','failed']),note:z.string().trim().max(1000).optional()}).strict();
export const wooOrderActionWorkspace=z.object({actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),revision,configured:z.boolean(),order:wooOrderDetails.nullable(),canChangeStatus:z.boolean()}).strict().superRefine((v,ctx)=>{
 if(v.order&&v.order.merchantId!==v.merchantId||v.canChangeStatus!==Boolean(v.configured&&v.order?.providerId&&v.order.providerUpdatedAt&&v.order.state!=='unknown'))ctx.addIssue({code:'custom',message:'Inconsistent WooCommerce order action review'});
});
