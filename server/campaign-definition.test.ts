import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ pool: vi.fn(), schema: vi.fn() }));
vi.mock('./db', () => ({ getPool: mocks.pool }));
vi.mock('./db/schema-readiness', () => ({ assertRuntimeSchema: mocks.schema }));
import { campaignDefinitionKey, type CampaignDefinition } from './campaign-definition';
import { enqueueCampaignDeliveries, completeCampaignWithoutRecipients } from './automation/campaign-delivery-outbox';
const definition: CampaignDefinition = { name: 'Fixture', message: 'Message', imageUrl: null, targetAudience: '{}', scheduledAt: '2027-01-01 12:00:00', status: 'scheduled' };
describe('definition admission identity', () => {
  it('gives the same identity to UTC database and driver dates without exposing the text', () => {
    const key = campaignDefinitionKey(definition); expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(campaignDefinitionKey({ ...definition, scheduledAt: new Date('2027-01-01T12:00:00Z') })).toBe(key);
    expect(campaignDefinitionKey({ ...definition, scheduledAt: '2027-01-01T15:00:00+03:00' })).toBe(key);
  });
  it.each([['name', 'Other'], ['message', 'Other'], ['imageUrl', 'https://example.test/image.png'], ['targetAudience', '{"purchaseCountMax":3}'], ['scheduledAt', null], ['status', 'draft']])('changes its identity when %s changes', (field, value) => {
    expect(campaignDefinitionKey({ ...definition, [field]: value })).not.toBe(campaignDefinitionKey(definition));
  });
  it.each([undefined, '', 'fake', 'a'.repeat(63), 'A'.repeat(64)])('refuses a missing/invalid expected identity before database work', async expectedDefinition => {
    await expect(enqueueCampaignDeliveries({ campaignId: 1, merchantId: 1, expectedDefinition: expectedDefinition as string, recipients: [{ phone: '99900000001' }] })).rejects.toThrow();
    await expect(completeCampaignWithoutRecipients(1, 1, expectedDefinition as string)).rejects.toThrow();
    expect(mocks.pool).not.toHaveBeenCalled(); expect(mocks.schema).not.toHaveBeenCalled();
  });
  it('rejects corrupt source dates and missing source fields', () => {
    expect(() => campaignDefinitionKey({ ...definition, scheduledAt: 'broken' })).toThrow('Invalid campaign schedule');
    expect(() => campaignDefinitionKey({ ...definition, message: undefined } as any)).toThrow('Invalid campaign definition');
  });
});
