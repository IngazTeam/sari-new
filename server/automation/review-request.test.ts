import { describe, it, expect, beforeAll } from 'vitest';
import { 
  shouldRequestReview, 
  generateReviewMessage, 
  sendReviewRequest,
  processReviewResponse,
  getMerchantReviewStats
} from './review-request';
import * as db from '../db';

describe('Review Request System', () => {
  let testMerchantId: number;
  let testOrderId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'Test Business',
      phone: '+966500000001',
      email: 'test@example.com',
    });
    testMerchantId = merchant!.id;

    // Create test order
    const order = await db.createOrder({
      merchantId: testMerchantId,
      customerPhone: '+966500000002',
      customerName: 'Test Customer',
      orderNumber: 'ORD-TEST-001',
      totalAmount: 150,
      status: 'delivered',
      items: JSON.stringify([
        { productId: 1, productName: 'Test Product', quantity: 1, price: 150 }
      ]),
    });
    testOrderId = order!.id;
  });

  describe('shouldRequestReview', () => {
    it('should return false for non-delivered orders', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '+966500000003',
        customerName: 'Test Customer 2',
        orderNumber: 'ORD-TEST-002',
        totalAmount: 200,
        status: 'pending',
        items: JSON.stringify([]),
      });

      const should = await shouldRequestReview(order!.id);
      expect(should).toBe(false);
    });

    it('should return false if review already exists', async () => {
      // Create review first
      await db.createCustomerReview({
        orderId: testOrderId,
        merchantId: testMerchantId,
        customerPhone: '+966500000002',
        customerName: 'Test Customer',
        rating: 5,
        comment: 'Great!',
        isPublic: true,
      });

      const should = await shouldRequestReview(testOrderId);
      expect(should).toBe(false);
    });
  });

  describe('generateReviewMessage', () => {
    it('should generate review message with customer name', () => {
      const message = generateReviewMessage(
        'أحمد',
        'ORD-123',
        'متجر الاختبار'
      );

      expect(message).toContain('أحمد');
      expect(message).toContain('ORD-123');
      expect(message).toContain('متجر الاختبار');
      expect(message).toContain('⭐');
    });
  });

  describe('sendReviewRequest', () => {
    it('should return error for non-existent order', async () => {
      const result = await sendReviewRequest(999999);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Order not found');
    });

    it('should handle order without phone', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '', // Empty phone
        customerName: 'Test Customer',
        orderNumber: 'ORD-TEST-003',
        totalAmount: 100,
        status: 'delivered',
        items: JSON.stringify([]),
      });

      const result = await sendReviewRequest(order!.id);
      
      // Should fail due to missing phone
      expect(result.success).toBe(false);
    });
  });

  describe('processReviewResponse', () => {
    it('should reject invalid rating', async () => {
      const result = await processReviewResponse(testOrderId, 6);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid rating');
    });

    it('should create review with valid rating', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '+966500000010',
        customerName: 'Test Customer 10',
        orderNumber: 'ORD-TEST-010',
        totalAmount: 300,
        status: 'delivered',
        items: JSON.stringify([]),
      });

      const result = await processReviewResponse(order!.id, 5, 'Excellent service!');
      
      expect(result.success).toBe(true);
    });

    it('should mark positive reviews as public', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '+966500000011',
        customerName: 'Test Customer 11',
        orderNumber: 'ORD-TEST-011',
        totalAmount: 250,
        status: 'delivered',
        items: JSON.stringify([]),
      });

      await processReviewResponse(order!.id, 5, 'Great!');
      
      const reviews = await db.getCustomerReviewsByOrderId(order!.id);
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0].isPublic).toBe(true);
    });

    it('should not mark negative reviews as public', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '+966500000012',
        customerName: 'Test Customer 12',
        orderNumber: 'ORD-TEST-012',
        totalAmount: 150,
        status: 'delivered',
        items: JSON.stringify([]),
      });

      await processReviewResponse(order!.id, 2, 'Not good');
      
      const reviews = await db.getCustomerReviewsByOrderId(order!.id);
      expect(reviews.length).toBeGreaterThan(0);
      expect(reviews[0].isPublic).toBe(false);
    });
  });

  describe('getMerchantReviewStats', () => {
    it('should return zero stats for merchant with no reviews', async () => {
      const merchant = await db.createMerchant({
        userId: 2,
        businessName: 'New Business',
        phone: '+966500000020',
        email: 'new@example.com',
      });

      const stats = await getMerchantReviewStats(merchant!.id);
      
      expect(stats.totalReviews).toBe(0);
      expect(stats.averageRating).toBe(0);
    });

    it('should calculate correct average rating', async () => {
      const stats = await getMerchantReviewStats(testMerchantId);
      
      expect(stats.totalReviews).toBeGreaterThan(0);
      expect(stats.averageRating).toBeGreaterThanOrEqual(1);
      expect(stats.averageRating).toBeLessThanOrEqual(5);
    });

    it('should have correct rating distribution', async () => {
      const stats = await getMerchantReviewStats(testMerchantId);
      
      expect(stats.ratingDistribution).toHaveProperty('1');
      expect(stats.ratingDistribution).toHaveProperty('5');
      
      // Sum of distribution should equal total reviews
      const sum = Object.values(stats.ratingDistribution).reduce((a, b) => a + b, 0);
      expect(sum).toBe(stats.totalReviews);
    });
  });
});
