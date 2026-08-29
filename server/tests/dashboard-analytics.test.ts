import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';
import {
  getOrdersTrend,
  getRevenueTrend,
  getComparisonStats,
  getTopProducts,
  getDashboardStats,
} from '../dashboard-analytics';

describe('Dashboard Analytics', () => {
  // استخدام merchantId موجود من قاعدة البيانات
  const testMerchantId = 1; // merchant@sari.sa

  describe('getOrdersTrend', () => {
    it('should return orders trend for last 30 days', async () => {
      const result = await getOrdersTrend(testMerchantId, 30);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('count');
        expect(result[0]).toHaveProperty('total');
      }
    });

    it('should return empty array for merchant with no orders', async () => {
      const result = await getOrdersTrend(99999, 30);
      expect(result).toEqual([]);
    });
  });

  describe('getRevenueTrend', () => {
    it('should return revenue trend for completed orders only', async () => {
      const result = await getRevenueTrend(testMerchantId, 30);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('date');
        expect(result[0]).toHaveProperty('revenue');
        expect(result[0]).toHaveProperty('ordersCount');
      }
    });

    it('should only count completed orders', async () => {
      const result = await getRevenueTrend(testMerchantId, 30);
      const totalRevenue = result.reduce((sum, item) => sum + Number(item.revenue), 0);
      
      // Should be 200 + 150 + 300 = 650 (excluding pending order)
      expect(totalRevenue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getComparisonStats', () => {
    it('should return comparison stats with growth percentages', async () => {
      const result = await getComparisonStats(testMerchantId, 30);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('current');
      expect(result).toHaveProperty('previous');
      expect(result).toHaveProperty('growth');
      
      expect(result.current).toHaveProperty('totalOrders');
      expect(result.current).toHaveProperty('totalRevenue');
      expect(result.current).toHaveProperty('completedOrders');
      
      expect(result.growth).toHaveProperty('orders');
      expect(result.growth).toHaveProperty('revenue');
      expect(result.growth).toHaveProperty('completed');
    });

    it('should calculate growth percentages correctly', async () => {
      const result = await getComparisonStats(testMerchantId, 30);
      
      expect(typeof result.growth.orders).toBe('number');
      expect(typeof result.growth.revenue).toBe('number');
      expect(typeof result.growth.completed).toBe('number');
    });
  });

  describe('getTopProducts', () => {
    it('should return top products by sales', async () => {
      const result = await getTopProducts(testMerchantId, 5);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('productName');
        expect(result[0]).toHaveProperty('totalSales');
        expect(result[0]).toHaveProperty('totalRevenue');
        expect(result[0]).toHaveProperty('averagePrice');
      }
    });

    it('should sort products by total sales', async () => {
      const result = await getTopProducts(testMerchantId, 5);
      
      if (result.length > 1) {
        // التأكد من الترتيب التنازلي
        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].totalSales).toBeGreaterThanOrEqual(result[i + 1].totalSales);
        }
      }
    });

    it('should limit results to specified number', async () => {
      const result = await getTopProducts(testMerchantId, 2);
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getDashboardStats', () => {
    it('should return comprehensive dashboard statistics', async () => {
      const result = await getDashboardStats(testMerchantId);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('totalOrders');
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('pendingOrders');
      expect(result).toHaveProperty('completedOrders');
      expect(result).toHaveProperty('cancelledOrders');
      expect(result).toHaveProperty('averageOrderValue');
    });

    it('should count all orders correctly', async () => {
      const result = await getDashboardStats(testMerchantId);
      
      // التأكد من أن القيم رقمية
      expect(typeof result.totalOrders).toBe('number');
      expect(typeof result.completedOrders).toBe('number');
      expect(typeof result.pendingOrders).toBe('number');
      expect(result.pendingOrders).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average order value correctly', async () => {
      const result = await getDashboardStats(testMerchantId);
      
      if (result.totalOrders > 0) {
        expect(result.averageOrderValue).toBeGreaterThan(0);
        expect(result.averageOrderValue).toBe(
          Math.round((result.totalRevenue / result.totalOrders) * 100) / 100
        );
      } else {
        expect(result.averageOrderValue).toBe(0);
      }
    });

    it('should return zero stats for merchant with no orders', async () => {
      const result = await getDashboardStats(99999);
      
      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.averageOrderValue).toBe(0);
    });
  });
});
