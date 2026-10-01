import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pool: vi.fn(), merchant: vi.fn(), audience: vi.fn() }));
vi.mock('./db/connection', async original => ({ ...await original<typeof import('./db/connection')>(), getPool: mocks.pool }));
import { readCampaignAudience, requireCompleteCampaignAudience } from './campaign-audience';
import { campaignAudienceSchema, filterCampaignAudience, parseCampaignAudience } from '../shared/campaign-audience';
beforeEach(() => { mocks.pool.mockReset().mockResolvedValue(null); });
describe('campaign audience validation and storage boundaries', () => {
  it.each([{ lastActivityDays: 0 }, { lastActivityDays: 3651 }, { lastActivityDays: 1.5 }, { purchaseCountMin: -1 }, { purchaseCountMax: 1000001 }, { purchaseCountMin: 3, purchaseCountMax: 2 }, { merchantId: 99 }, { unknown: true }])('rejects malformed filters %j before any read', async filters => {
    expect(campaignAudienceSchema.safeParse(filters).success).toBe(false); await expect(readCampaignAudience(7, JSON.stringify(filters))).rejects.toThrow('Campaign targeting definition is invalid'); expect(mocks.pool).not.toHaveBeenCalled();
  });
  it.each(['invalid-json', 'null', '[]', 'true', '"all"'])('rejects a saved %s audience instead of broadening it', value => expect(() => parseCampaignAudience(value)).toThrow());
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])('rejects invalid tenant %s before storage', async id => { await expect(readCampaignAudience(id, '{}')).rejects.toThrow('Invalid campaign audience scope'); expect(mocks.pool).not.toHaveBeenCalled(); });
  it('fails closed on missing storage', async () => { await expect(readCampaignAudience(7, '{}')).rejects.toThrow('Database not available'); });
  it('rejects an invalid clock before storage', async () => { await expect(readCampaignAudience(7, '{}', new Date(NaN))).rejects.toThrow(); expect(mocks.pool).not.toHaveBeenCalled(); });
  it('refuses incomplete recipient projections', () => { expect(() => requireCompleteCampaignAudience({ customers: [], recipientCount: 1 } as any)).toThrow(); });
  it('accepts UTC storage strings, rejects future/unknown activity and corrupt purchase counts when filtered', () => {
    const rows = [{ id: 1, lastActivityAt: '2026-10-01 10:00:00', purchaseCount: 1 }, { id: 2, lastActivityAt: '2026-10-02T12:00:00Z', purchaseCount: 1 }, { id: 3, lastActivityAt: 'broken', purchaseCount: 1 }, { id: 4, lastActivityAt: '2026-10-01T10:00:00Z', purchaseCount: NaN }];
    expect(filterCampaignAudience(rows, '{"lastActivityDays":1,"purchaseCountMin":0}', new Date('2026-10-01T12:00:00Z')).map(row => row.id)).toEqual([1]);
  });
});
