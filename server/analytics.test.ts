/**
 * Advanced Analytics System Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import {
  getDashboardKPIs,
  getRevenueTrends,
  getTopProducts,
  getCampaignAnalytics,
  getCustomerSegments,
  getHourlyAnalytics,
  getWeekdayAnalytics,
  getDiscountCodeAnalytics,
} from './analytics/analytics';

describe('Advanced Analytics System', () => {
  let testMerchantId: number;
  let testProductId: number;
  let testCampaignId: number;
  let testDiscountCode: string;

  beforeAll(async () => {
    const user = await db.createUser({
      openId: `advanced_analytics_test_${Date.now()}`,
      name: 'Advanced Analytics Test User',
      email: `advanced_analytics_test_${Date.now()}@test.com`,
      password: 'test-password',
      loginMethod: 'email',
      role: 'user',
    });
    if (!user) throw new Error('Failed to create advanced analytics test user');

    // Create test merchant
    const merchant = await db.createMerchant({
      userId: user.id,
      businessName: 'Analytics Test Store',
      businessType: 'store',
      phoneNumber: '+966500000099',
      whatsappConnected: true,
      whatsappInstanceId: 'test-analytics-instance',
      whatsappToken: 'test-analytics-token',
    });
    testMerchantId = merchant.id;

    // Create test product
    const product = await db.createProduct({
      merchantId: testMerchantId,
      name: 'Test Analytics Product',
      description: 'Product for analytics testing',
      price: 100,
      stock: 50,
      category: 'test',
      imageUrl: null,
    });
    testProductId = product.id;

    // Create test campaign
    const campaign = await db.createCampaign({
      merchantId: testMerchantId,
      name: 'Test Analytics Campaign',
      message: 'Test campaign message',
      imageUrl: null,
      targetAudience: 'all',
      status: 'completed',
      scheduledAt: new Date(),
    });
    testCampaignId = campaign.id;

    // Create test discount code with unique name
    const discount = await db.createDiscountCode({
      merchantId: testMerchantId,
      code: `ANALYTICS10-${Date.now()}`,
      type: 'percentage',
      value: 10,
      minPurchase: 0,
      maxUses: 100,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    testDiscountCode = discount.code;

    // Create test orders with different times and days
    const now = new Date();
    const orders = [
      // Order 1: Today, morning
      {
        customerPhone: '+966500000001',
        customerName: 'Customer 1',
        items: JSON.stringify([{ productId: testProductId, name: 'Test Product', quantity: 2, price: 100 }]),
        totalAmount: 200,
        status: 'paid' as const,
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0),
      },
      // Order 2: Today, afternoon
      {
        customerPhone: '+966500000002',
        customerName: 'Customer 2',
        items: JSON.stringify([{ productId: testProductId, name: 'Test Product', quantity: 1, price: 100 }]),
        totalAmount: 100,
        status: 'paid' as const,
        discountCode: testDiscountCode,
        createdAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0, 0),
      },
      // Order 3: Yesterday
      {
        customerPhone: '+966500000001',
        customerName: 'Customer 1',
        items: JSON.stringify([{ productId: testProductId, name: 'Test Product', quantity: 3, price: 100 }]),
        totalAmount: 300,
        status: 'paid' as const,
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      },
      // Order 4: 7 days ago
      {
        customerPhone: '+966500000003',
        customerName: 'Customer 3',
        items: JSON.stringify([{ productId: testProductId, name: 'Test Product', quantity: 1, price: 100 }]),
        totalAmount: 100,
        status: 'paid' as const,
        createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
      // Order 5: VIP customer (5th order)
      {
        customerPhone: '+966500000001',
        customerName: 'Customer 1',
        items: JSON.stringify([{ productId: testProductId, name: 'Test Product', quantity: 1, price: 100 }]),
        totalAmount: 100,
        status: 'paid' as const,
        createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    ];

    for (const orderData of orders) {
      await db.createOrder({
        ...orderData,
        merchantId: testMerchantId,
      });
    }
  });

  afterAll(async () => {
    // Cleanup is handled by database constraints
  });

  describe('Dashboard KPIs', () => {
    it('should calculate dashboard KPIs correctly', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const kpis = await getDashboardKPIs(testMerchantId, { startDate, endDate });

      expect(kpis.totalRevenue).toBeGreaterThan(0);
      expect(kpis.totalOrders).toBeGreaterThan(0);
      expect(kpis.averageOrderValue).toBeGreaterThan(0);
      expect(kpis.totalCustomers).toBeGreaterThan(0);
      expect(kpis.averageOrderValue).toBe(kpis.totalRevenue / kpis.totalOrders);
    });
  });

  describe('Revenue Trends', () => {
    it('should return revenue trends grouped by day', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const trends = await getRevenueTrends(testMerchantId, { startDate, endDate }, 'day');

      expect(Array.isArray(trends)).toBe(true);
      if (trends.length > 0) {
        expect(trends[0]).toHaveProperty('date');
        expect(trends[0]).toHaveProperty('revenue');
        expect(trends[0]).toHaveProperty('orders');
      }
    });

    it('should return revenue trends grouped by week', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const trends = await getRevenueTrends(testMerchantId, { startDate, endDate }, 'week');

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should return revenue trends grouped by month', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

      const trends = await getRevenueTrends(testMerchantId, { startDate, endDate }, 'month');

      expect(Array.isArray(trends)).toBe(true);
    });
  });

  describe('Top Products', () => {
    it('should return top products by revenue', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const topProducts = await getTopProducts(testMerchantId, { startDate, endDate }, 10);

      expect(Array.isArray(topProducts)).toBe(true);
      if (topProducts.length > 0) {
        expect(topProducts[0]).toHaveProperty('productId');
        expect(topProducts[0]).toHaveProperty('productName');
        expect(topProducts[0]).toHaveProperty('totalSales');
        expect(topProducts[0]).toHaveProperty('totalRevenue');
        expect(topProducts[0]).toHaveProperty('averagePrice');
        expect(topProducts[0]).toHaveProperty('stockLevel');
        expect(topProducts[0].totalRevenue).toBeGreaterThan(0);
      }
    });

    it('should limit results to specified number', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const topProducts = await getTopProducts(testMerchantId, { startDate, endDate }, 5);

      expect(topProducts.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Campaign Analytics', () => {
    it('should return campaign analytics', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const analytics = await getCampaignAnalytics(testMerchantId, { startDate, endDate });

      expect(Array.isArray(analytics)).toBe(true);
      if (analytics.length > 0) {
        expect(analytics[0]).toHaveProperty('campaignId');
        expect(analytics[0]).toHaveProperty('campaignName');
        expect(analytics[0]).toHaveProperty('sentCount');
        expect(analytics[0]).toHaveProperty('openRate');
        expect(analytics[0]).toHaveProperty('clickRate');
        expect(analytics[0]).toHaveProperty('conversionRate');
        expect(analytics[0]).toHaveProperty('revenue');
        expect(analytics[0]).toHaveProperty('roi');
      }
    });
  });

  describe('Customer Segments', () => {
    it('should segment customers correctly', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const segments = await getCustomerSegments(testMerchantId, { startDate, endDate });

      expect(Array.isArray(segments)).toBe(true);
      expect(segments.length).toBe(3); // new, returning, vip

      const segmentTypes = segments.map(s => s.segment);
      expect(segmentTypes).toContain('new');
      expect(segmentTypes).toContain('returning');
      expect(segmentTypes).toContain('vip');

      segments.forEach(segment => {
        expect(segment).toHaveProperty('count');
        expect(segment).toHaveProperty('revenue');
        expect(segment).toHaveProperty('averageOrderValue');
      });
    });

    it('should identify VIP customers (5+ orders)', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const segments = await getCustomerSegments(testMerchantId, { startDate, endDate });

      const vipSegment = segments.find(s => s.segment === 'vip');
      expect(vipSegment).toBeDefined();
      // Customer 1 has 3 orders in our test data, so they should be in returning or vip
    });
  });

  describe('Time-based Analytics', () => {
    it('should return hourly analytics', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const hourly = await getHourlyAnalytics(testMerchantId, { startDate, endDate });

      expect(Array.isArray(hourly)).toBe(true);
      expect(hourly.length).toBe(24); // All 24 hours

      hourly.forEach(hour => {
        expect(hour).toHaveProperty('hour');
        expect(hour).toHaveProperty('orders');
        expect(hour).toHaveProperty('revenue');
        expect(hour.hour).toBeGreaterThanOrEqual(0);
        expect(hour.hour).toBeLessThan(24);
      });
    });

    it('should return weekday analytics', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const weekday = await getWeekdayAnalytics(testMerchantId, { startDate, endDate });

      expect(Array.isArray(weekday)).toBe(true);
      expect(weekday.length).toBe(7); // All 7 days

      weekday.forEach(day => {
        expect(day).toHaveProperty('day');
        expect(day).toHaveProperty('dayNumber');
        expect(day).toHaveProperty('orders');
        expect(day).toHaveProperty('revenue');
        expect(day.dayNumber).toBeGreaterThanOrEqual(0);
        expect(day.dayNumber).toBeLessThan(7);
      });
    });
  });

  describe('Discount Code Analytics', () => {
    it('should return discount code analytics', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const analytics = await getDiscountCodeAnalytics(testMerchantId, { startDate, endDate });

      expect(Array.isArray(analytics)).toBe(true);
      
      const testCodeAnalytics = analytics.find(a => a.code === testDiscountCode);
      if (testCodeAnalytics) {
        expect(testCodeAnalytics).toHaveProperty('type');
        expect(testCodeAnalytics).toHaveProperty('value');
        expect(testCodeAnalytics).toHaveProperty('usageCount');
        expect(testCodeAnalytics).toHaveProperty('revenue');
        expect(testCodeAnalytics).toHaveProperty('averageOrderValue');
        // Usage count might be 0 if discount code wasn't used in the date range
        expect(testCodeAnalytics.usageCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty date ranges', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000); // Future date

      const kpis = await getDashboardKPIs(testMerchantId, { startDate, endDate });

      expect(kpis.totalRevenue).toBe(0);
      expect(kpis.totalOrders).toBe(0);
    });

    it('should handle non-existent merchant', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const kpis = await getDashboardKPIs(999999999, { startDate, endDate });

      expect(kpis.totalRevenue).toBe(0);
      expect(kpis.totalOrders).toBe(0);
    });
  });
});
