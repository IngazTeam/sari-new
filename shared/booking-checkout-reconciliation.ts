import { z } from 'zod';
import { reconcileCheckoutSchema } from './checkout-reconciliation';

export const reconcileBookingCheckoutSchema = reconcileCheckoutSchema.omit({orderId:true})
  .extend({bookingId:z.number().int().positive().safe()}).strict();
export type ReconcileBookingCheckoutInput = z.infer<typeof reconcileBookingCheckoutSchema>;
