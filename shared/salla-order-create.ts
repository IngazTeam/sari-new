import { z } from 'zod';
import { sallaShippingSchema } from './salla-order';

export const sallaOrderIntentSchema = z.object({
  customerPhone: z.string().trim().min(7).max(50),
  customerName: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(10_000),
  shipTo: sallaShippingSchema,
}).strict();
export const sallaOrderCreateSchema = sallaOrderIntentSchema.extend({ requestId: z.string().uuid().transform(v => v.toLowerCase()) });
export type SallaOrderIntent = z.infer<typeof sallaOrderIntentSchema>;
export type SallaCreationResult = { orderId: number; orderNumber: string; paymentUrl: string | null };
