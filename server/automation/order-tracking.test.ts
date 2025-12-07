import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';
import {
  generateTrackingMessage,
  shouldNotifyCustomer,
} from './order-tracking';

describe('Order Tracking System', () => {
  describe('generateTrackingMessage', () => {
    it('should generate paid status message', () => {
      const message = generateTrackingMessage(
        'ORD-12345',
        'paid',
        'أحمد محمد'
      );

      expect(message).toContain('ORD-12345');
      expect(message).toContain('أحمد محمد');
      expect(message).toContain('تم استلام طلبك');
      expect(message).toContain('تأكيد الدفع');
    });

    it('should generate processing status message', () => {
      const message = generateTrackingMessage(
        'ORD-67890',
        'processing',
        'فاطمة علي'
      );

      expect(message).toContain('ORD-67890');
      expect(message).toContain('فاطمة علي');
      expect(message).toContain('قيد التجهيز');
    });

    it('should generate shipped status message with tracking number', () => {
      const message = generateTrackingMessage(
        'ORD-11111',
        'shipped',
        'خالد سعيد',
        'TRACK-123456'
      );

      expect(message).toContain('ORD-11111');
      expect(message).toContain('خالد سعيد');
      expect(message).toContain('في الطريق');
      expect(message).toContain('TRACK-123456');
    });

    it('should generate delivered status message', () => {
      const message = generateTrackingMessage(
        'ORD-22222',
        'delivered',
        'سارة أحمد'
      );

      expect(message).toContain('ORD-22222');
      expect(message).toContain('سارة أحمد');
      expect(message).toContain('تم توصيل');
      expect(message).toContain('تقييم');
    });

    it('should generate cancelled status message', () => {
      const message = generateTrackingMessage(
        'ORD-33333',
        'cancelled',
        'محمد عبدالله'
      );

      expect(message).toContain('ORD-33333');
      expect(message).toContain('محمد عبدالله');
      expect(message).toContain('تم إلغاء');
    });

    it('should handle unknown status gracefully', () => {
      const message = generateTrackingMessage(
        'ORD-99999',
        'unknown_status',
        'علي حسن'
      );

      expect(message).toContain('ORD-99999');
      expect(message).toContain('unknown_status');
    });
  });

  describe('shouldNotifyCustomer', () => {
    it('should notify when order is paid', () => {
      expect(shouldNotifyCustomer('pending', 'paid')).toBe(true);
    });

    it('should notify when order starts processing', () => {
      expect(shouldNotifyCustomer('paid', 'processing')).toBe(true);
    });

    it('should notify when order is shipped', () => {
      expect(shouldNotifyCustomer('processing', 'shipped')).toBe(true);
    });

    it('should notify when order is delivered', () => {
      expect(shouldNotifyCustomer('shipped', 'delivered')).toBe(true);
    });

    it('should notify when order is cancelled from pending', () => {
      expect(shouldNotifyCustomer('pending', 'cancelled')).toBe(true);
    });

    it('should notify when order is cancelled from paid', () => {
      expect(shouldNotifyCustomer('paid', 'cancelled')).toBe(true);
    });

    it('should NOT notify for same status', () => {
      expect(shouldNotifyCustomer('pending', 'pending')).toBe(false);
    });

    it('should NOT notify for non-critical transitions', () => {
      expect(shouldNotifyCustomer('delivered', 'processing')).toBe(false);
    });
  });

  describe('Order Tracking Logs - Database Integration', () => {
    let testMerchantId: number;
    let testOrderId: number;

    beforeAll(async () => {
      // Create test merchant
      const randomId = Math.random().toString(36).substring(7);
      const user = await db.createUser({
        openId: `test-tracking-user-${randomId}`,
        name: 'Test Tracking User',
        email: `test-tracking-${randomId}@test.com`,
        role: 'admin'
      });

      if (user) {
        const merchant = await db.createMerchant({
          userId: user.id,
          businessName: 'Test Tracking Business',
          phone: '+966500000000',
          status: 'active'
        });

        if (merchant) {
          testMerchantId = merchant.id;

          // Create test order
          const order = await db.createOrder({
            merchantId: testMerchantId,
            orderNumber: 'TRACK-001',
            customerPhone: '+966501234567',
            customerName: 'Test Customer',
            items: JSON.stringify([]),
            totalAmount: 100,
            status: 'pending',
            isGift: false
          });

          if (order) {
            testOrderId = order.id;
          }
        }
      }
    });

    it('should create tracking log', async () => {
      const log = await db.createOrderTrackingLog({
        orderId: testOrderId,
        oldStatus: 'pending',
        newStatus: 'paid',
        notificationSent: true,
        notificationMessage: 'Test notification'
      });

      expect(log).toBeDefined();
      expect(log?.orderId).toBe(testOrderId);
      expect(log?.oldStatus).toBe('pending');
      expect(log?.newStatus).toBe('paid');
      expect(log?.notificationSent).toBe(true);
    });

    it('should retrieve tracking logs for order', async () => {
      // Create multiple logs
      await db.createOrderTrackingLog({
        orderId: testOrderId,
        oldStatus: 'paid',
        newStatus: 'processing',
        notificationSent: true
      });

      await db.createOrderTrackingLog({
        orderId: testOrderId,
        oldStatus: 'processing',
        newStatus: 'shipped',
        trackingNumber: 'TRACK-123',
        notificationSent: true
      });

      const logs = await db.getOrderTrackingLogs(testOrderId);
      expect(logs).toBeDefined();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('should get latest tracking log', async () => {
      const latest = await db.getLatestOrderTrackingLog(testOrderId);
      expect(latest).toBeDefined();
      expect(latest?.orderId).toBe(testOrderId);
      // Latest should be one of the created logs
      expect(['paid', 'processing', 'shipped']).toContain(latest?.newStatus);
    });

    it('should log failed notifications', async () => {
      const log = await db.createOrderTrackingLog({
        orderId: testOrderId,
        oldStatus: 'shipped',
        newStatus: 'delivered',
        notificationSent: false,
        errorMessage: 'WhatsApp API error'
      });

      expect(log).toBeDefined();
      expect(log?.notificationSent).toBe(false);
      expect(log?.errorMessage).toBe('WhatsApp API error');
    });

    it('should include tracking number in log', async () => {
      const log = await db.createOrderTrackingLog({
        orderId: testOrderId,
        oldStatus: 'processing',
        newStatus: 'shipped',
        trackingNumber: 'TRACK-999',
        notificationSent: true
      });

      expect(log).toBeDefined();
      expect(log?.trackingNumber).toBe('TRACK-999');
    });
  });

  describe('Status Transitions', () => {
    it('should identify valid status progression', () => {
      const validTransitions = [
        ['pending', 'paid'],
        ['paid', 'processing'],
        ['processing', 'shipped'],
        ['shipped', 'delivered'],
      ];

      validTransitions.forEach(([from, to]) => {
        expect(shouldNotifyCustomer(from, to)).toBe(true);
      });
    });

    it('should identify cancellation transitions', () => {
      const cancellations = [
        ['pending', 'cancelled'],
        ['paid', 'cancelled'],
        ['processing', 'cancelled'],
      ];

      cancellations.forEach(([from, to]) => {
        expect(shouldNotifyCustomer(from, to)).toBe(true);
      });
    });

    it('should reject invalid transitions', () => {
      const invalidTransitions = [
        ['delivered', 'pending'],
        ['shipped', 'paid'],
        ['cancelled', 'processing'],
      ];

      invalidTransitions.forEach(([from, to]) => {
        expect(shouldNotifyCustomer(from, to)).toBe(false);
      });
    });
  });
});
