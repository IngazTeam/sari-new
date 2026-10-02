import { z } from 'zod';
import { bookingReadId } from './booking-read';
export const byaanDomainInput = z.string().trim().toLowerCase().transform(value => value.replace(/\.$/, '')).pipe(
  z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).refine(value => !value.endsWith('.local') && !value.endsWith('.internal')));
export const byaanRegisterInput = z.object({tenantDomain:byaanDomainInput}).strict();
export const byaanDisconnectInput = z.object({revision:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const byaanConnectionState = z.enum(['unlinked','pending_verification','configured','syncing','paused','error','disabled','unknown']);
const count = z.number().int().nonnegative().safe();
export const byaanConnectionWorkspaceSchema = z.object({
  actorId:bookingReadId,merchantId:bookingReadId,checkedAt:z.string().datetime(),source:z.string().max(40),
  present:z.boolean(),state:byaanConnectionState,tenantDomain:byaanDomainInput.nullable(),revision:z.string().regex(/^[a-f0-9]{64}$/),
  verifiedAt:z.string().datetime().nullable(),lastSyncAt:z.string().datetime().nullable(),hasSyncErrors:z.boolean(),managedContent:z.boolean(),
  blockingPlatforms:z.array(z.enum(['salla','zid','woocommerce','shopify'])).max(4),
  counts:z.object({catalog:count,activeTrainees:count,activeFaqs:count,sitePages:count}).strict(),
}).strict();
export type ByaanConnectionWorkspace = z.infer<typeof byaanConnectionWorkspaceSchema>;
export const byaanDisconnectResultSchema = z.object({actorId:bookingReadId,merchantId:bookingReadId,disconnected:z.literal(true),notification:z.enum(['queued','not_required'])}).strict();
