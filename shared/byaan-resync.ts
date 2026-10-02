import { z } from 'zod';
import { bookingReadId } from './booking-read';
export const byaanResyncRequest = z.object({ requestId: z.string().uuid().toLowerCase(), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const byaanResyncLookup = byaanResyncRequest.pick({ requestId: true });
export const byaanResyncReceipt = z.object({ actorId: bookingReadId, merchantId: bookingReadId, requestId: z.string().uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/), outcome: z.enum(['queued','not_sent','unknown']), createdAt: z.string().datetime(), replayed: z.boolean() }).strict();
export type ByaanResyncReceipt = z.infer<typeof byaanResyncReceipt>;
