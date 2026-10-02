import {z} from 'zod';
import {wooOperationIntent} from './woocommerce-operation';

/** A server-derived intent; actor and tenant always come from the session. */
export const wooSyncRequest=wooOperationIntent.pick({requestId:true,revision:true}).extend({resource:z.enum(['products','orders'])}).strict();

