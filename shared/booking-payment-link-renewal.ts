import { z } from 'zod';

export const bookingPaymentLinkRenewalSchema = z.object({
  bookingId: z.number().int().positive().safe(),
  evidence: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(500),
  reviewed: z.literal(true),
}).strict();
export type BookingPaymentLinkRenewalInput = z.infer<typeof bookingPaymentLinkRenewalSchema>;
export type BookingPaymentLinkRenewalBlocker = 'booking' | 'legacy' | 'identity' | 'link' | 'payment';
