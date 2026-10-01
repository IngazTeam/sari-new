import { createHash } from 'node:crypto';

export type CampaignDefinition = {
  name: string;
  message: string;
  status: string;
  imageUrl: string | null;
  targetAudience: string | null;
  scheduledAt: string | Date | null;
};

/** Optimistic content identity for admission and review, never an authorization token.
 * Comparing content also catches two edits within a timestamp's one-second precision.
 */
export function campaignDefinitionKey(campaign: CampaignDefinition): string {
  let scheduledAt: string | null = null;
  if (campaign.scheduledAt != null) {
    const value = campaign.scheduledAt;
    const parsed = value instanceof Date ? value : new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(' ', 'T') + 'Z');
    if (!Number.isFinite(parsed.getTime())) throw new Error('Invalid campaign schedule');
    scheduledAt = parsed.toISOString();
  }
  if (typeof campaign.name !== 'string' || typeof campaign.message !== 'string' || typeof campaign.status !== 'string'
    || !(campaign.imageUrl === null || typeof campaign.imageUrl === 'string')
    || !(campaign.targetAudience === null || typeof campaign.targetAudience === 'string')) throw new Error('Invalid campaign definition');
  return createHash('sha256').update(JSON.stringify([
    'campaign-admission-v1', campaign.name, campaign.message, campaign.imageUrl, campaign.targetAudience, scheduledAt, campaign.status,
  ])).digest('hex');
}
