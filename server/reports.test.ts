import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';

describe('Reports API', () => {
  const merchantCaller = appRouter.createCaller({
    user: { id: 1, openId: 'test-merchant', name: 'Test Merchant', email: 'merchant@test.com', role: 'user', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), loginMethod: 'test' },
  });

  describe('campaigns.getStats', () => {
    it('should return campaign statistics for merchant', async () => {
      const stats = await merchantCaller.campaigns.getStats();

      expect(stats).toBeDefined();
      expect(stats.totalCampaigns).toBeGreaterThanOrEqual(0);
      expect(stats.completedCampaigns).toBeGreaterThanOrEqual(0);
      expect(stats.totalAcceptedByProvider).toBeGreaterThanOrEqual(0);
      expect(stats.totalUnconfirmed).toBeGreaterThanOrEqual(0);
      expect(stats.providerAcceptanceRate).toBeGreaterThanOrEqual(0);
      expect(stats.providerAcceptanceRate).toBeLessThanOrEqual(100);
      expect(stats).not.toHaveProperty('deliveryRate');
      expect(stats).not.toHaveProperty('readRate');
    });

    it('should bound the provider acceptance rate correctly', async () => {
      const stats = await merchantCaller.campaigns.getStats();

      expect(stats.providerAcceptanceRate).toBeGreaterThanOrEqual(0);
      expect(stats.providerAcceptanceRate).toBeLessThanOrEqual(100);
    });
  });

  describe('campaigns.getTimelineData', () => {
    it('should return timeline data for last 7 days', async () => {
      const timeline = await merchantCaller.campaigns.getTimelineData({ days: 7 });

      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBe(7);

      // Check data structure
      timeline.forEach(item => {
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('acceptedByProvider');
        expect(item).not.toHaveProperty('delivered');
        expect(item).not.toHaveProperty('read');
        expect(item.acceptedByProvider).toBeGreaterThanOrEqual(0);
      });
    });

    it('should return timeline data for last 30 days', async () => {
      const timeline = await merchantCaller.campaigns.getTimelineData({ days: 30 });

      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBe(30);
    });

    it('should return timeline data for last 90 days', async () => {
      const timeline = await merchantCaller.campaigns.getTimelineData({ days: 90 });

      expect(Array.isArray(timeline)).toBe(true);
      expect(timeline.length).toBe(90);
    });

    it('should never fabricate delivery or read receipt counts', async () => {
      const timeline = await merchantCaller.campaigns.getTimelineData({ days: 30 });

      timeline.forEach(item => {
        expect(item).not.toHaveProperty('delivered');
        expect(item).not.toHaveProperty('read');
      });
    });

    it('should reject invalid days parameter', async () => {
      await expect(
        merchantCaller.campaigns.getTimelineData({ days: 0 })
      ).rejects.toThrow();

      await expect(
        merchantCaller.campaigns.getTimelineData({ days: 400 })
      ).rejects.toThrow();
    });
  });
});
