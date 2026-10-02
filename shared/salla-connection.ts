import { z } from 'zod';
import { bookingReadId } from './booking-read';
export const sallaConnectionRevision = z.string().regex(/^[a-f0-9]{64}$/);
export const sallaConnectionToken = z.string().trim().min(10).max(8192).regex(/^[\x21-\x7e]+$/).refine(value=>!value.startsWith('enc:v1:'),'Enter a provider access token');
export const sallaRegisterInput = z.object({ revision:sallaConnectionRevision,accessToken:sallaConnectionToken }).strict();
export const sallaDisconnectInput = z.object({ revision:sallaConnectionRevision }).strict();
export const sallaSyncInput = z.object({ revision:sallaConnectionRevision,syncType:z.enum(['full','stock']).default('stock') }).strict();
export const sallaRegisterReceipt = z.object({ actorId:bookingReadId,merchantId:bookingReadId,registered:z.literal(true),revision:sallaConnectionRevision,storeId:z.string().regex(/^[1-9][0-9]{0,19}$/),storeUrl:z.string().url().max(2048) }).strict();
export const sallaDisconnectReceipt = z.object({ actorId:bookingReadId,merchantId:bookingReadId,disconnected:z.literal(true) }).strict();
