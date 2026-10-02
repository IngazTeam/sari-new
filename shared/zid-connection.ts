import {z} from 'zod';
import {bookingReadId} from './booking-read';
import {zidSettingsFields} from './zid-workspace';
export const zidConnectionRevision=z.string().regex(/^[a-f0-9]{64}$/);
export const zidSettingsInput=z.object({revision:zidConnectionRevision,settings:zidSettingsFields}).strict();
export const zidReviewedSensitiveInput=z.object({revision:zidConnectionRevision,password:z.string().min(8).max(128).optional()}).strict();
export const zidSettingsReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,saved:z.literal(true),revision:zidConnectionRevision,settings:zidSettingsFields}).strict();
export const zidDisconnectReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,disconnected:z.literal(true),revision:zidConnectionRevision}).strict();
export const zidWebhookReceipt=z.object({actorId:bookingReadId,merchantId:bookingReadId,rotated:z.literal(true),revision:zidConnectionRevision,endpointPath:z.string().regex(/^\/api\/webhooks\/zid\/[a-f0-9]{48}$/),username:z.literal('sari'),password:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
