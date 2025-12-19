/**
 * Loyalty System Tests
 * 
 * Tests for loyalty system integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as loyaltyDb from './db_loyalty';
import * as db from './db';
import { calculatePointsFromOrder, awardPointsForOrder } from './loyalty-integration';

describe('Loyalty System', () => {
  let testMerchantId: number;
  let testCustomerPhone: string;

  beforeAll(async () => {
    // استخدام merchant موجود للاختبار
    testMerchantId = 150001;
    testCustomerPhone = '966500000001';
  });

  describe('Loyalty Settings', () => {
    it('should get or create loyalty settings', async () => {
      const settings = await loyaltyDb.getOrCreateLoyaltySettings(testMerchantId);
      
      expect(settings).toBeDefined();
      expect(settings.merchantId).toBe(testMerchantId);
      expect(settings.isEnabled).toBeDefined();
      expect(settings.pointsPerCurrency).toBeGreaterThan(0);
    });

    it('should update loyalty settings', async () => {
      const updated = await loyaltyDb.updateLoyaltySettings(testMerchantId, {
        pointsPerCurrency: 2,
        currencyPerPoint: 5,
      });

      expect(updated).toBeDefined();
      expect(updated?.pointsPerCurrency).toBe(2);
      expect(updated?.currencyPerPoint).toBe(5);
    });
  });

  describe('Loyalty Tiers', () => {
    it('should get all tiers', async () => {
      const tiers = await loyaltyDb.getLoyaltyTiers(testMerchantId);
      
      expect(tiers).toBeDefined();
      expect(Array.isArray(tiers)).toBe(true);
      expect(tiers.length).toBeGreaterThan(0);
    });

    it('should have bronze, silver, gold tiers', async () => {
      const tiers = await loyaltyDb.getLoyaltyTiers(testMerchantId);
      
      const tierNames = tiers.map(t => t.name);
      expect(tierNames).toContain('Bronze');
      expect(tierNames).toContain('Silver');
      expect(tierNames).toContain('Gold');
    });
  });

  describe('Customer Points', () => {
    it('should initialize customer points', async () => {
      const customerPoints = await loyaltyDb.initializeCustomerPoints(
        testMerchantId,
        testCustomerPhone,
        'Test Customer'
      );

      expect(customerPoints).toBeDefined();
      expect(customerPoints.merchantId).toBe(testMerchantId);
      expect(customerPoints.customerPhone).toBe(testCustomerPhone);
      expect(customerPoints.totalPoints).toBeGreaterThanOrEqual(0);
    });

    it('should get customer points', async () => {
      const customerPoints = await loyaltyDb.getCustomerPoints(
        testMerchantId,
        testCustomerPhone
      );

      expect(customerPoints).toBeDefined();
      if (customerPoints) {
        expect(customerPoints.merchantId).toBe(testMerchantId);
        expect(customerPoints.customerPhone).toBe(testCustomerPhone);
      }
    });

    it('should add points to customer', async () => {
      const initialPoints = await loyaltyDb.getCustomerPoints(testMerchantId, testCustomerPhone);
      const initialTotal = initialPoints?.totalPoints || 0;

      const result = await loyaltyDb.addPointsToCustomer(
        testMerchantId,
        testCustomerPhone,
        100,
        'Test points',
        'نقاط اختبار'
      );

      expect(result).toBeDefined();
      expect(result.newBalance).toBe(initialTotal + 100);
    });

    it('should deduct points from customer', async () => {
      const initialPoints = await loyaltyDb.getCustomerPoints(testMerchantId, testCustomerPhone);
      const initialTotal = initialPoints?.totalPoints || 0;

      if (initialTotal >= 50) {
        const result = await loyaltyDb.deductPointsFromCustomer(
          testMerchantId,
          testCustomerPhone,
          50,
          'Test deduction',
          'خصم اختبار'
        );

        expect(result).toBeDefined();
        expect(result.newBalance).toBe(initialTotal - 50);
      }
    });
  });

  describe('Points Calculation', () => {
    it('should calculate points from order amount', async () => {
      const points = await calculatePointsFromOrder(testMerchantId, 100);
      
      expect(points).toBeGreaterThan(0);
    });

    it('should return 0 points if loyalty is disabled', async () => {
      // تعطيل النظام مؤقتاً
      await loyaltyDb.updateLoyaltySettings(testMerchantId, { isEnabled: 0 });
      
      const points = await calculatePointsFromOrder(testMerchantId, 100);
      expect(points).toBe(0);

      // إعادة التفعيل
      await loyaltyDb.updateLoyaltySettings(testMerchantId, { isEnabled: 1 });
    });
  });

  describe('Loyalty Rewards', () => {
    it('should get active rewards', async () => {
      const rewards = await loyaltyDb.getLoyaltyRewards(testMerchantId, true);
      
      expect(rewards).toBeDefined();
      expect(Array.isArray(rewards)).toBe(true);
    });

    it('should create a reward', async () => {
      const reward = await loyaltyDb.createLoyaltyReward({
        merchantId: testMerchantId,
        title: 'Test Reward',
        titleAr: 'مكافأة اختبار',
        description: 'Test description',
        descriptionAr: 'وصف اختبار',
        type: 'discount',
        pointsCost: 100,
        discountAmount: 10,
        discountType: 'fixed',
        isActive: 1,
      });

      expect(reward).toBeDefined();
      expect(reward?.title).toBe('Test Reward');
      expect(reward?.pointsCost).toBe(100);
    });
  });

  describe('Transactions', () => {
    it('should get customer transactions', async () => {
      const transactions = await loyaltyDb.getPointsTransactions(
        testMerchantId,
        testCustomerPhone,
        10,
        0
      );

      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get loyalty statistics', async () => {
      const stats = await loyaltyDb.getLoyaltyStats(testMerchantId);

      expect(stats).toBeDefined();
      expect(stats.totalCustomers).toBeGreaterThanOrEqual(0);
      expect(stats.totalPointsDistributed).toBeGreaterThanOrEqual(0);
      expect(stats.totalRedemptions).toBeGreaterThanOrEqual(0);
    });
  });
});
