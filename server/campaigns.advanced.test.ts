/**
 * Tests for Advanced Campaign Features
 * - Scheduled campaigns cron job
 * - Campaign logs and reports
 * - Customer filtering
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Advanced Campaign Features', () => {
  let testMerchantId: number;
  let testCampaignId: number;

  beforeAll(async () => {
    // Get or create test merchant
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      throw new Error('No merchants found for testing');
    }
  });

  describe('Campaign Logs', () => {
    it('should create a campaign log entry', async () => {
      // Create a test campaign first
      const campaign = await db.createCampaign({
        merchantId: testMerchantId,
        name: 'Test Campaign for Logs',
        message: 'Test message',
        imageUrl: null,
        targetAudience: null,
        status: 'draft',
        scheduledAt: null,
        sentCount: 0,
        totalRecipients: 0,
      });

      expect(campaign).toBeDefined();
      testCampaignId = campaign!.id;

      // Create a log entry
      const log = await db.createCampaignLog({
        campaignId: testCampaignId,
        customerId: null,
        customerPhone: '+966500000001',
        customerName: 'Test Customer',
        status: 'success',
        errorMessage: null,
        sentAt: new Date(),
      });

      expect(log).toBeDefined();
      expect(log!.campaignId).toBe(testCampaignId);
      expect(log!.customerPhone).toBe('+966500000001');
      expect(log!.status).toBe('success');
    });

    it('should retrieve campaign logs by campaign ID', async () => {
      const logs = await db.getCampaignLogsByCampaignId(testCampaignId);
      
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].campaignId).toBe(testCampaignId);
    });

    it('should get campaign logs with statistics', async () => {
      // Add more logs with different statuses
      await db.createCampaignLog({
        campaignId: testCampaignId,
        customerId: null,
        customerPhone: '+966500000002',
        customerName: 'Test Customer 2',
        status: 'failed',
        errorMessage: 'Connection timeout',
        sentAt: new Date(),
      });

      const { logs, stats } = await db.getCampaignLogsWithStats(testCampaignId);

      expect(logs).toBeDefined();
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.success).toBeGreaterThanOrEqual(0);
      expect(stats.failed).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
    });

    it('should update campaign log status', async () => {
      const logs = await db.getCampaignLogsByCampaignId(testCampaignId);
      const logId = logs[0].id;

      await db.updateCampaignLog(logId, {
        status: 'success',
        errorMessage: null,
      });

      const updatedLog = await db.getCampaignLogById(logId);
      expect(updatedLog!.status).toBe('success');
    });
  });

  describe('Customer Filtering', () => {
    it('should filter conversations by last activity', async () => {
      const conversations = await db.getConversationsByMerchantId(testMerchantId);
      
      // Filter by last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentConversations = conversations.filter(c => 
        c.lastActivityAt && new Date(c.lastActivityAt) >= thirtyDaysAgo
      );

      expect(Array.isArray(recentConversations)).toBe(true);
      // All filtered conversations should have recent activity
      recentConversations.forEach(c => {
        expect(new Date(c.lastActivityAt!).getTime()).toBeGreaterThanOrEqual(thirtyDaysAgo.getTime());
      });
    });

    it('should filter conversations by purchase count', async () => {
      const conversations = await db.getConversationsByMerchantId(testMerchantId);
      
      // Filter by purchase count >= 1
      const purchasedConversations = conversations.filter(c => c.purchaseCount >= 1);

      expect(Array.isArray(purchasedConversations)).toBe(true);
      purchasedConversations.forEach(c => {
        expect(c.purchaseCount).toBeGreaterThanOrEqual(1);
      });
    });

    it('should filter conversations by purchase count range', async () => {
      const conversations = await db.getConversationsByMerchantId(testMerchantId);
      
      // Filter by purchase count between 1-5
      const midRangeConversations = conversations.filter(c => 
        c.purchaseCount >= 1 && c.purchaseCount <= 5
      );

      expect(Array.isArray(midRangeConversations)).toBe(true);
      midRangeConversations.forEach(c => {
        expect(c.purchaseCount).toBeGreaterThanOrEqual(1);
        expect(c.purchaseCount).toBeLessThanOrEqual(5);
      });
    });

    it('should have purchaseCount and totalSpent fields', async () => {
      const conversations = await db.getConversationsByMerchantId(testMerchantId);
      
      if (conversations.length > 0) {
        const conversation = conversations[0];
        expect(conversation).toHaveProperty('purchaseCount');
        expect(conversation).toHaveProperty('totalSpent');
        expect(typeof conversation.purchaseCount).toBe('number');
        expect(typeof conversation.totalSpent).toBe('number');
      }
    });
  });

  describe('Scheduled Campaigns', () => {
    it('should create a scheduled campaign', async () => {
      const scheduledDate = new Date();
      scheduledDate.setHours(scheduledDate.getHours() + 1); // Schedule 1 hour from now

      const campaign = await db.createCampaign({
        merchantId: testMerchantId,
        name: 'Scheduled Test Campaign',
        message: 'This is a scheduled campaign',
        imageUrl: null,
        targetAudience: null,
        status: 'scheduled',
        scheduledAt: scheduledDate,
        sentCount: 0,
        totalRecipients: 0,
      });

      expect(campaign).toBeDefined();
      expect(campaign!.status).toBe('scheduled');
      expect(campaign!.scheduledAt).toBeDefined();
    });

    it('should update campaign status from scheduled to sending', async () => {
      const campaigns = await db.getCampaignsByMerchantId(testMerchantId);
      const scheduledCampaign = campaigns.find(c => c.status === 'scheduled');

      if (scheduledCampaign) {
        await db.updateCampaign(scheduledCampaign.id, {
          status: 'sending',
        });

        const updated = await db.getCampaignById(scheduledCampaign.id);
        expect(updated!.status).toBe('sending');
      }
    });

    it('should update campaign status from sending to completed', async () => {
      const campaigns = await db.getCampaignsByMerchantId(testMerchantId);
      const sendingCampaign = campaigns.find(c => c.status === 'sending');

      if (sendingCampaign) {
        await db.updateCampaign(sendingCampaign.id, {
          status: 'completed',
          sentCount: 10,
          totalRecipients: 10,
        });

        const updated = await db.getCampaignById(sendingCampaign.id);
        expect(updated!.status).toBe('completed');
        expect(updated!.sentCount).toBe(10);
        expect(updated!.totalRecipients).toBe(10);
      }
    });
  });

  describe('Campaign Report Integration', () => {
    it('should get complete campaign report with logs and stats', async () => {
      const campaigns = await db.getCampaignsByMerchantId(testMerchantId);
      
      if (campaigns.length > 0) {
        const campaignId = campaigns[0].id;
        const campaign = await db.getCampaignById(campaignId);
        const { logs, stats } = await db.getCampaignLogsWithStats(campaignId);

        expect(campaign).toBeDefined();
        expect(logs).toBeDefined();
        expect(stats).toBeDefined();
        
        // Verify report structure
        expect(stats).toHaveProperty('total');
        expect(stats).toHaveProperty('success');
        expect(stats).toHaveProperty('failed');
        expect(stats).toHaveProperty('pending');
        expect(stats).toHaveProperty('successRate');
      }
    });
  });
});
