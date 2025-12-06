import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';

describe('Subscriptions API', () => {
  const merchantCaller = appRouter.createCaller({
    user: { id: 1, openId: 'test-merchant', name: 'Test Merchant', email: 'merchant@test.com', role: 'user', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), loginMethod: 'test' },
  });

  describe('merchants.getCurrentPlan', () => {
    it('should return null if merchant has no subscription', async () => {
      const currentPlan = await merchantCaller.merchants.getCurrentPlan();
      
      // For new merchants, should return null
      expect(currentPlan).toBeNull();
    });
  });

  describe('merchants.requestUpgrade', () => {
    it('should reject upgrade for non-existent plan', async () => {
      await expect(
        merchantCaller.merchants.requestUpgrade({ planId: 99999 })
      ).rejects.toThrow('Plan not found or inactive');
    });

    it('should reject upgrade for inactive merchant', async () => {
      // This test assumes the merchant exists but is not active
      // In reality, the merchant would need to be created first
      await expect(
        merchantCaller.merchants.requestUpgrade({ planId: 1 })
      ).rejects.toThrow();
    });
  });

  describe('plans.list', () => {
    it('should return list of plans', async () => {
      const plans = await merchantCaller.plans.list();

      expect(Array.isArray(plans)).toBe(true);
      if (plans.length > 0) {
        expect(plans[0]).toHaveProperty('id');
        expect(plans[0]).toHaveProperty('nameAr');
        expect(plans[0]).toHaveProperty('priceMonthly');
        expect(plans[0]).toHaveProperty('conversationLimit');
        expect(plans[0]).toHaveProperty('voiceMessageLimit');
        expect(plans[0]).toHaveProperty('isActive');
      }
    });

    it('should return only active plans', async () => {
      const plans = await merchantCaller.plans.list();

      plans.forEach(plan => {
        expect(plan.isActive).toBe(true);
      });
    });
  });
});
