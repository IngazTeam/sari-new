import { z } from 'zod';
import { bookingReadId } from './booking-read';
export const platformIds = ['salla', 'zid', 'woocommerce', 'shopify', 'byaan'] as const;
export const platformState = z.enum(['unlinked', 'configured', 'syncing', 'paused', 'error', 'pending_verification', 'disabled', 'unavailable', 'unknown']);
export const platformSummary = z.object({
  platform: z.enum(platformIds), present: z.boolean(), occupiesSlot: z.boolean(),
  state: platformState, storeUrl: z.string().max(2048).nullable(),
  createdAt: z.string().datetime().nullable(), lastSyncAt: z.string().datetime().nullable(),
  hasSyncErrors: z.boolean(), legacy: z.boolean(),
}).strict();
export const platformWorkspaceSchema = z.object({
  actorId: bookingReadId, merchantId: bookingReadId, checkedAt: z.string().datetime(),
  source: z.string().max(40), platforms: z.array(platformSummary).length(5),
  occupied: z.number().int().min(0).max(5), conflict: z.boolean(),
  stats: z.object({ products: z.number().int().nonnegative().safe(), customers: z.number().int().nonnegative().safe(), audience: z.enum(['trainees', 'customers']) }).strict(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.platforms.map(p => p.platform)).size !== 5 || value.occupied !== value.platforms.filter(p => p.occupiesSlot).length || value.conflict !== (value.occupied > 1)) ctx.addIssue({code:'custom', message:'Inconsistent platform summary'});
});
export type PlatformSummary = z.infer<typeof platformSummary>;
export const platformInventorySchema = z.object(platformWorkspaceSchema.shape).omit({actorId:true});
export type PlatformWorkspace = z.infer<typeof platformWorkspaceSchema>;
/** Public display links never carry credentials, query parameters or fragments. */
export function safePlatformUrl(value: unknown, domainOnly = false): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(domainOnly ? 'https://' + value.trim() : value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}
