import { campaignMessageIssue, type CampaignMessageIssue } from '../shared/campaign-message';

export class CampaignContentError extends Error {
  constructor(readonly issue: CampaignMessageIssue) {
    super(`Campaign content invalid: ${issue}`);
    this.name = 'CampaignContentError';
  }
}

export function assertCampaignContent(message: unknown, imageUrl: unknown): void {
  const issue = campaignMessageIssue(message, imageUrl);
  if (issue) throw new CampaignContentError(issue);
}
