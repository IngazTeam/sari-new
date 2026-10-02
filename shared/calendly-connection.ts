import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {calendlyResourceUri} from './calendly-provider';
const apiKey=z.string().trim().min(20).max(4096).refine(v=>!/[\u0000-\u001f\u007f]/.test(v),'Invalid token');
const revision=z.string().regex(/^[a-f0-9]{64}$/),userUri=z.string().max(500).refine(v=>!!calendlyResourceUri(v,'user'));
const base={requestId:z.string().uuid().toLowerCase(),revision};
export const calendlyConnectionPreviewInput=z.object({apiKey}).strict();
export const calendlyConnectionPreviewSchema=z.object({actorId:bookingReadId,merchantId:bookingReadId,revision,checkedAt:z.string().datetime(),userUri,userName:z.string().max(255),replacing:z.boolean(),localAppointments:z.number().int().nonnegative().safe(),localReceipts:z.number().int().nonnegative().safe()}).strict();
export const calendlyConnectionCommand=z.discriminatedUnion('action',[
 z.object({...base,action:z.literal('connect'),apiKey,userUri,replaceLocalCopies:z.boolean().default(false)}).strict(),
 z.object({...base,action:z.literal('verify')}).strict(),
 z.object({...base,action:z.literal('disconnect'),clearLocalCopies:z.literal(true)}).strict(),
]);
