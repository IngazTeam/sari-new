import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: vi.fn(), execute: vi.fn(), summary: vi.fn() }));
vi.mock('./db/connection', () => ({ getDb: mocks.db }));
vi.mock('./campaign-audience', () => ({ readCampaignAudienceSummary: mocks.summary }));
import { readCampaignEditor, readCampaignAudiencePreview, CampaignEditorMissingError, CampaignEditorUnavailableError } from './campaign-editor';
import { campaignAudiencePreviewSchema } from '../shared/campaign-editor';
const now = new Date('2026-10-01T12:00:00Z');
const row = () => ({ merchantId: 2, merchantStatus: 'active', timezone: 'Asia/Riyadh', id: 7, name: 'Fixture', message: 'Text', imageUrl: null, status: 'draft', scheduledAt: null, targetAudience: '{"purchaseCountMin":0,"purchaseCountMax":2,"lastActivityDays":45}' });
beforeEach(() => { vi.resetAllMocks(); mocks.db.mockResolvedValue({ execute: mocks.execute }); mocks.execute.mockResolvedValue([[row()]]); mocks.summary.mockResolvedValue({ count: 5, recipientCount: 2, duplicateCount: 1, invalidPhoneCount: 2, recipientLimit: 2000, asOf: now.toISOString() }); });
describe('scoped campaign editor and audience contracts', () => {
  it('keeps every exact saved targeting value and returns a definition identity', async () => {
    expect(await readCampaignEditor(1, 2, { id: 7 }, now)).toMatchObject({ actorId: 1, merchantId: 2, canManage: false, timezone: 'Asia/Riyadh', campaign: { id: 7, audience: { status: 'valid', filters: { purchaseCountMin: 0, purchaseCountMax: 2, lastActivityDays: 45 } }, definitionKey: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });
  it('returns a new editor without fabricating a saved campaign', async () => {
    expect(await readCampaignEditor(1, 2, {}, now)).toMatchObject({ campaign: null, checkedAt: now.toISOString(), merchantStatus: 'active' });
  });
  it('reports malformed saved audience explicitly without defaulting to everyone', async () => {
    mocks.execute.mockResolvedValue([[{ ...row(), targetAudience: 'PRIVATE BROKEN JSON' }]]);
    const data = await readCampaignEditor(1, 2, { id: 7 }, now); expect(data.campaign?.audience).toEqual({ status: 'invalid' }); expect(JSON.stringify(data)).not.toContain('PRIVATE');
  });
  it('marks invalid timezone as unavailable rather than substituting the device zone', async () => {
    mocks.execute.mockResolvedValue([[{ ...row(), timezone: 'Invalid/Zone' }]]); expect((await readCampaignEditor(1, 2, {}, now)).timezone).toBeNull();
  });
  it.each([{ id: 0 }, { id: '7' }, { id: 7.1 }, { id: 7, merchantId: 9 }, { actorId: 99 }])('rejects forged editor selection %j before storage', async input => {
    await expect(readCampaignEditor(1, 2, input)).rejects.toThrow(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe account or tenant scope %s on both sources', async id => {
    await expect(readCampaignEditor(id, 2, {})).rejects.toBeInstanceOf(CampaignEditorUnavailableError);
    await expect(readCampaignAudiencePreview(1, id, {})).rejects.toBeInstanceOf(CampaignEditorUnavailableError);
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('uses a missing result only for absent rows and sanitizes all storage or contract failures', async () => {
    mocks.execute.mockResolvedValue([[]]); await expect(readCampaignEditor(1, 2, { id: 7 })).rejects.toBeInstanceOf(CampaignEditorMissingError);
    for (const data of [[{ ...row(), merchantId: 99 }], [{ ...row(), id: 8 }], [{ ...row(), status: 'invented' }], [{ ...row(), scheduledAt: 'invalid' }], [row(), row()]]) {
      mocks.execute.mockResolvedValue([data]); await expect(readCampaignEditor(1, 2, { id: 7 })).rejects.toThrow('Campaign editor unavailable');
    }
    mocks.execute.mockRejectedValue(Error('PRIVATE SQL')); await expect(readCampaignEditor(1, 2, {})).rejects.toThrow('Campaign editor unavailable');
    mocks.db.mockResolvedValue(null); await expect(readCampaignEditor(1, 2, {})).rejects.toThrow('Campaign editor unavailable');
  });
  it('returns count-only evidence bound to the exact filters and authenticated scope', async () => {
    mocks.summary.mockResolvedValue({ count: 5, recipientCount: 2, duplicateCount: 1, invalidPhoneCount: 2, recipientLimit: 2000, asOf: now.toISOString(), customers: [{ customerPhone: 'PRIVATE PHONE' }] });
    const data = await readCampaignAudiencePreview(1, 2, { purchaseCountMin: 0 }, now);
    expect(mocks.summary).toHaveBeenCalledWith(2, '{"purchaseCountMin":0}', now);
    expect(data).toEqual({ actorId: 1, merchantId: 2, checkedAt: now.toISOString(), filters: { purchaseCountMin: 0 }, count: 5, recipientCount: 2, duplicateCount: 1, invalidPhoneCount: 2, recipientLimit: 2000, exceedsLimit: false, basis: 'matched_conversations_before_consent' });
  });
  it.each([{ merchantId: 99 }, { purchaseCountMin: 2, purchaseCountMax: 1 }, { lastActivityDays: 0 }])('rejects invalid preview filters %j before storage', async input => {
    await expect(readCampaignAudiencePreview(1, 2, input)).rejects.toThrow(); expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('never converts a failed or inconsistent count read to a successful zero', async () => {
    mocks.summary.mockRejectedValue(Error('PRIVATE SQL')); await expect(readCampaignAudiencePreview(1, 2, {})).rejects.toThrow('Campaign editor unavailable');
    mocks.summary.mockResolvedValue({ count: 1, recipientCount: 2, duplicateCount: 0, invalidPhoneCount: 0, recipientLimit: 2000, asOf: now.toISOString() });
    await expect(readCampaignAudiencePreview(1, 2, {})).rejects.toThrow('Campaign editor unavailable');
  });
  it('rejects dishonest limits or extra private fields in the client contract', async () => {
    const data = await readCampaignAudiencePreview(1, 2, {}, now);
    expect(campaignAudiencePreviewSchema.safeParse({ ...data, exceedsLimit: true }).success).toBe(false);
    expect(campaignAudiencePreviewSchema.safeParse({ ...data, customers: [] }).success).toBe(false);
  });
});
