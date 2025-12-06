import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';

describe('Campaign Send API', () => {
  let testMerchantId: number;
  let testCampaignId: number;

  beforeAll(async () => {
    // Create test merchant (userId 1 should exist from other tests)
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'Test Store for Campaign Send',
      ownerName: 'Test Owner',
      email: 'campaignsend@test.com',
      phone: '966500000099',
      status: 'active',
    });
    testMerchantId = merchant.id;

    // Create test campaign with proper targetAudience format
    const campaign = await db.createCampaign({
      merchantId: testMerchantId,
      name: 'Test Campaign to Send',
      message: 'Hello from test campaign',
      targetAudience: JSON.stringify(['966500000001', '966500000002']),
      totalRecipients: 2,
      status: 'draft',
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testCampaignId) {
      await db.updateCampaign(testCampaignId, { status: 'failed' });
    }
  });

  it('should send a draft campaign successfully', async () => {
    // Get merchant to find userId
    const merchant = await db.getMerchantById(testMerchantId);
    if (!merchant) throw new Error('Merchant not found');

    const caller = appRouter.createCaller({
      user: {
        id: merchant.userId.toString(),
        openId: 'test-open-id-campaign-send',
        name: 'Test Owner',
        email: 'campaignsend@test.com',
        role: 'user',
      },
    });

    const result = await caller.campaigns.send({ id: testCampaignId });

    expect(result.success).toBe(true);
    expect(result.message).toContain('being sent');

    // Check campaign status was updated to sending
    const updatedCampaign = await db.getCampaignById(testCampaignId);
    expect(updatedCampaign?.status).toBe('sending');
  });

  it('should reject sending already sent campaign', async () => {
    // Update campaign to completed
    await db.updateCampaign(testCampaignId, { status: 'completed' });

    // Get merchant to find userId
    const merchant = await db.getMerchantById(testMerchantId);
    if (!merchant) throw new Error('Merchant not found');

    const caller = appRouter.createCaller({
      user: {
        id: merchant.userId.toString(),
        openId: 'test-open-id-campaign-send',
        name: 'Test Owner',
        email: 'campaignsend@test.com',
        role: 'user',
      },
    });

    await expect(
      caller.campaigns.send({ id: testCampaignId })
    ).rejects.toThrow('already sent');

    // Reset to draft for other tests
    await db.updateCampaign(testCampaignId, { status: 'draft' });
  });

  it('should reject sending campaign with invalid target audience', async () => {
    // Create campaign with invalid JSON
    const invalidCampaign = await db.createCampaign({
      merchantId: testMerchantId,
      name: 'Invalid Campaign',
      message: 'Test',
      targetAudience: 'invalid-json',
      totalRecipients: 0,
      status: 'draft',
    });

    // Get merchant to find userId
    const merchant = await db.getMerchantById(testMerchantId);
    if (!merchant) throw new Error('Merchant not found');

    const caller = appRouter.createCaller({
      user: {
        id: merchant.userId.toString(),
        openId: 'test-open-id-campaign-send',
        name: 'Test Owner',
        email: 'campaignsend@test.com',
        role: 'user',
      },
    });

    await expect(
      caller.campaigns.send({ id: invalidCampaign.id })
    ).rejects.toThrow('Invalid target audience');

    // Cleanup
    await db.updateCampaign(invalidCampaign.id, { status: 'failed' });
  });

  it('should reject sending campaign with no recipients', async () => {
    // Create campaign with empty recipients
    const emptyCampaign = await db.createCampaign({
      merchantId: testMerchantId,
      name: 'Empty Campaign',
      message: 'Test',
      targetAudience: JSON.stringify([]),
      totalRecipients: 0,
      status: 'draft',
    });

    // Get merchant to find userId
    const merchant = await db.getMerchantById(testMerchantId);
    if (!merchant) throw new Error('Merchant not found');

    const caller = appRouter.createCaller({
      user: {
        id: merchant.userId.toString(),
        openId: 'test-open-id-campaign-send',
        name: 'Test Owner',
        email: 'campaignsend@test.com',
        role: 'user',
      },
    });

    await expect(
      caller.campaigns.send({ id: emptyCampaign.id })
    ).rejects.toThrow('No recipients found');

    // Cleanup
    await db.updateCampaign(emptyCampaign.id, { status: 'failed' });
  });

  it('should reject unauthorized merchant from sending campaign', async () => {
    const caller = appRouter.createCaller({
      user: {
        id: '99999',
        openId: 'unauthorized-open-id',
        name: 'Unauthorized User',
        email: 'unauthorized@test.com',
        role: 'user',
      },
    });

    await expect(
      caller.campaigns.send({ id: testCampaignId })
    ).rejects.toThrow('FORBIDDEN');
  });
});
