import { z } from 'zod';

export const campaignRecipientLimit = 2_000;
export const campaignAudienceSchema = z.object({
  lastActivityDays: z.number().int().min(1).max(3650).optional(),
  purchaseCountMin: z.number().int().min(0).max(1_000_000).optional(),
  purchaseCountMax: z.number().int().min(0).max(1_000_000).optional(),
}).strict().refine(value => value.purchaseCountMin === undefined
  || value.purchaseCountMax === undefined || value.purchaseCountMin <= value.purchaseCountMax,
{ message: 'Invalid purchase count range' });

export class CampaignTargetingError extends Error {
  constructor() { super('Campaign targeting definition is invalid'); this.name = 'CampaignTargetingError'; }
}

export function parseCampaignAudience(value: string | null | undefined) {
  if (value == null || value === '') return {} as z.infer<typeof campaignAudienceSchema>;
  try {
    if (value.length > 1_000) throw new Error();
    return campaignAudienceSchema.parse(JSON.parse(value));
  } catch { throw new CampaignTargetingError(); }
}

export function isValidCampaignTargetAudience(value: string): boolean {
  try { parseCampaignAudience(value); return true; } catch { return false; }
}

export function campaignAudienceClock(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new CampaignTargetingError();
  return Math.floor(now.getTime() / 1_000) * 1_000;
}

export function filterCampaignAudience<T extends { lastActivityAt?: Date | string | null; purchaseCount: number }>(
  customers: T[], targetAudience: string | null | undefined, now = new Date(),
): T[] {
  const filters = parseCampaignAudience(targetAudience);
  const through = campaignAudienceClock(now);
  const cutoff = filters.lastActivityDays === undefined ? null : through - filters.lastActivityDays * 86_400_000;
  return customers.filter(customer => {
    if (cutoff !== null) {
      const value = customer.lastActivityAt;
      const activity = value instanceof Date ? value.getTime() : typeof value === 'string'
        ? new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z').getTime() : NaN;
      const activitySecond = Math.floor(activity / 1_000) * 1_000;
      if (!Number.isFinite(activity) || activitySecond < cutoff || activitySecond > through) return false;
    }
    if ((filters.purchaseCountMin !== undefined || filters.purchaseCountMax !== undefined)
      && (!Number.isSafeInteger(customer.purchaseCount) || customer.purchaseCount < 0)) return false;
    if (filters.purchaseCountMin !== undefined && customer.purchaseCount < filters.purchaseCountMin) return false;
    if (filters.purchaseCountMax !== undefined && customer.purchaseCount > filters.purchaseCountMax) return false;
    return true;
  });
}
