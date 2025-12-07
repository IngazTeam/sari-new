import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';

describe('Analytics Functions', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 999,
      businessName: 'Test Analytics Store',
      phoneNumber: '+966501234567',
      status: 'active',
    });
    testMerchantId = merchant!.id;
  });

  describe('getMessageStats', () => {
    it('should return zero stats for merchant with no messages', async () => {
      const stats = await db.getMessageStats(testMerchantId);
      
      expect(stats).toBeDefined();
      expect(stats.text).toBe(0);
      expect(stats.voice).toBe(0);
      expect(stats.image).toBe(0);
      expect(stats.total).toBe(0);
    });

    it('should return stats object with correct structure', async () => {
      const stats = await db.getMessageStats(testMerchantId);
      
      expect(stats).toHaveProperty('text');
      expect(stats).toHaveProperty('voice');
      expect(stats).toHaveProperty('image');
      expect(stats).toHaveProperty('total');
      expect(typeof stats.text).toBe('number');
      expect(typeof stats.voice).toBe('number');
      expect(typeof stats.image).toBe('number');
      expect(typeof stats.total).toBe('number');
    });
  });

  describe('getPeakHours', () => {
    it('should return empty array for merchant with no messages', async () => {
      const peakHours = await db.getPeakHours(testMerchantId);
      
      expect(Array.isArray(peakHours)).toBe(true);
      expect(peakHours.length).toBe(0);
    });

    it('should return array of hour objects', async () => {
      const peakHours = await db.getPeakHours(testMerchantId);
      
      expect(Array.isArray(peakHours)).toBe(true);
      // If there are results, check structure
      if (peakHours.length > 0) {
        expect(peakHours[0]).toHaveProperty('hour');
        expect(peakHours[0]).toHaveProperty('count');
        expect(typeof peakHours[0].hour).toBe('number');
        expect(typeof peakHours[0].count).toBe('number');
      }
    });
  });

  describe('getTopProducts', () => {
    it('should return empty array for merchant with no product mentions', async () => {
      const topProducts = await db.getTopProducts(testMerchantId, 10);
      
      expect(Array.isArray(topProducts)).toBe(true);
      expect(topProducts.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const limit = 5;
      const topProducts = await db.getTopProducts(testMerchantId, limit);
      
      expect(Array.isArray(topProducts)).toBe(true);
      expect(topProducts.length).toBeLessThanOrEqual(limit);
    });

    it('should return products with correct structure', async () => {
      const topProducts = await db.getTopProducts(testMerchantId, 10);
      
      expect(Array.isArray(topProducts)).toBe(true);
      // If there are results, check structure
      if (topProducts.length > 0) {
        expect(topProducts[0]).toHaveProperty('productId');
        expect(topProducts[0]).toHaveProperty('productName');
        expect(topProducts[0]).toHaveProperty('mentionCount');
        expect(topProducts[0]).toHaveProperty('price');
      }
    });
  });

  describe('getConversionRate', () => {
    it('should return zero conversion rate for merchant with no conversations', async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);
      
      expect(conversionRate).toBeDefined();
      expect(conversionRate.rate).toBe(0);
      expect(conversionRate.totalConversations).toBe(0);
      expect(conversionRate.convertedConversations).toBe(0);
    });

    it('should return conversion rate object with correct structure', async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);
      
      expect(conversionRate).toHaveProperty('rate');
      expect(conversionRate).toHaveProperty('totalConversations');
      expect(conversionRate).toHaveProperty('convertedConversations');
      expect(typeof conversionRate.rate).toBe('number');
      expect(typeof conversionRate.totalConversations).toBe('number');
      expect(typeof conversionRate.convertedConversations).toBe('number');
    });

    it('should return rate between 0 and 100', async () => {
      const conversionRate = await db.getConversionRate(testMerchantId);
      
      expect(conversionRate.rate).toBeGreaterThanOrEqual(0);
      expect(conversionRate.rate).toBeLessThanOrEqual(100);
    });
  });

  describe('getDailyMessageCount', () => {
    it('should return empty array for merchant with no messages', async () => {
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, 30);
      
      expect(Array.isArray(dailyMessages)).toBe(true);
      expect(dailyMessages.length).toBe(0);
    });

    it('should return array of daily message objects', async () => {
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, 30);
      
      expect(Array.isArray(dailyMessages)).toBe(true);
      // If there are results, check structure
      if (dailyMessages.length > 0) {
        expect(dailyMessages[0]).toHaveProperty('date');
        expect(dailyMessages[0]).toHaveProperty('count');
        expect(typeof dailyMessages[0].date).toBe('string');
        expect(typeof dailyMessages[0].count).toBe('number');
      }
    });

    it('should respect days parameter', async () => {
      const days = 7;
      const dailyMessages = await db.getDailyMessageCount(testMerchantId, days);
      
      expect(Array.isArray(dailyMessages)).toBe(true);
      // Should not return more days than requested
      expect(dailyMessages.length).toBeLessThanOrEqual(days);
    });
  });
});
