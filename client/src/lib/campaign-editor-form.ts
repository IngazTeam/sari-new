import { campaignAudienceSchema } from '@shared/campaign-audience';
export type CampaignAudienceFields = { lastActivityDays: string; purchaseCountMin: string; purchaseCountMax: string };
export const emptyCampaignAudience: CampaignAudienceFields = { lastActivityDays: '', purchaseCountMin: '', purchaseCountMax: '' };
export function campaignAudienceFields(filters: { lastActivityDays?: number; purchaseCountMin?: number; purchaseCountMax?: number }): CampaignAudienceFields {
  return { lastActivityDays: filters.lastActivityDays?.toString() ?? '', purchaseCountMin: filters.purchaseCountMin?.toString() ?? '', purchaseCountMax: filters.purchaseCountMax?.toString() ?? '' };
}
export function parseCampaignAudienceFields(fields: CampaignAudienceFields) {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === '') continue;
    if (!/^\d+$/.test(value)) return null;
    values[key] = Number(value);
  }
  const parsed = campaignAudienceSchema.safeParse(values); return parsed.success ? parsed.data : null;
}
export function campaignAudienceSelectionKey(filters: { lastActivityDays?: number; purchaseCountMin?: number; purchaseCountMax?: number }) {
  return JSON.stringify([filters.lastActivityDays ?? null, filters.purchaseCountMin ?? null, filters.purchaseCountMax ?? null]);
}
