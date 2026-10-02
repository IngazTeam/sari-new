import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {calendlyBookingUrl} from './calendly-provider';
export const calendlyBookingLinksSchema=z.object({
 actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),revision:z.string().regex(/^[a-f0-9]{64}$/),
 rows:z.array(z.object({name:z.string().max(255).nullable(),duration:z.number().int().positive().max(10080).nullable(),schedulingUrl:z.string().refine(v=>!!calendlyBookingUrl(v)).nullable()}).strict()).max(100),
}).strict();
