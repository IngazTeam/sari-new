import {z} from 'zod';
import {wooOperationIntent} from './woocommerce-operation';
const base=wooOperationIntent.pick({requestId:true,revision:true});
const credential=(prefix:string)=>z.string().trim().min(23).max(160).regex(new RegExp('^'+prefix+'[a-zA-Z0-9_]+$')).optional();
export const wooConnectionCommand=z.discriminatedUnion('action',[
 base.extend({action:z.literal('connect'),storeUrl:z.string().trim().min(8).max(500),consumerKey:credential('ck_'),consumerSecret:credential('cs_'),replaceLocalCopies:z.boolean().default(false)}).strict(),
 base.extend({action:z.literal('verify')}).strict(),
 base.extend({action:z.literal('disconnect'),clearLocalCopies:z.literal(true)}).strict(),
]);
