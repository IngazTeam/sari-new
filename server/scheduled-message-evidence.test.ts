import { expect, it, vi } from 'vitest';
import { scheduledOccurrence, scheduledHistoryInput } from '../shared/scheduled-message-evidence';
import { projectScheduledOccurrences } from './scheduled-message-evidence-store';
const base = { id: 1, dueAt: '2026-10-03T09:00:00.000Z', expiresAt: '2026-10-04T09:00:00.000Z', campaignId: null, campaignState: null, linkState: 'missing', recipients: null, acceptedByProvider: null, unconfirmed: null, needsReview: null, evidence: 'scoped_provider_receipts', salesVerified: false };
it('keeps unknown historical evidence unknown instead of turning missing binding into zero', async () => {
  const execute = vi.fn(); const result = await projectScheduledOccurrences({ execute } as any, 20, [{ id: 1, due_at: '2026-10-03 09:00:00', expires_at: '2026-10-04 09:00:00', campaign_id: null, linked_id: null }]);
  expect(result).toEqual([base]); expect(execute).not.toHaveBeenCalled();
});
it.each([{ ...base, acceptedByProvider: 0 }, { ...base, linkState: 'verified', campaignId: 2 }, { ...base, salesVerified: true }, { ...base, linkState: 'verified', campaignId: 2, campaignState: 'completed', recipients: 1, acceptedByProvider: 2, unconfirmed: 0, needsReview: 0 }])('rejects impossible or inflated occurrence evidence %#', raw => {
  expect(scheduledOccurrence.safeParse(raw).success).toBe(false);
});
it.each([{ id: 0 }, { id: 1, page: 0 }, { id: 1, page: 1.5 }, { id: 1, merchantId: 9 }])('bounds paged history input %#', raw => { expect(scheduledHistoryInput.safeParse(raw).success).toBe(false); });
