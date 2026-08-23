import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import {
  defaultTemplates,
  ORDER_NOTIFICATION_STATUSES,
  prepareOrderStatusNotification,
  saveOrderNotificationTemplate,
} from './notifications/order-notifications';

describe('Order Notifications System', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'Test Store',
      phone: '+966501234567',
      email: 'test@example.com',
    });
    testMerchantId = merchant!.id;
  });

  describe('Notification Templates', () => {
    it('should initialize default templates', async () => {
      for (const status of ORDER_NOTIFICATION_STATUSES) {
        await saveOrderNotificationTemplate({
          merchantId: testMerchantId,
          status,
          template: defaultTemplates[status],
          enabled: false,
        });
      }
      
      const templates = await db.getNotificationTemplatesByMerchantId(testMerchantId);
      
      expect(templates.length).toBeGreaterThanOrEqual(6);
    });

    it('should get template by status', async () => {
      const template = await db.getNotificationTemplateByStatus(testMerchantId, 'paid');
      
      expect(template).toBeDefined();
      expect(template?.merchantId).toBe(testMerchantId);
      expect(template?.status).toBe('paid');
      expect(Boolean(template?.enabled)).toBe(false);
      expect(template?.template).toContain('{{customerName}}');
    });

    it('should get all templates for merchant', async () => {
      const templates = await db.getNotificationTemplatesByMerchantId(testMerchantId);
      
      expect(templates.length).toBeGreaterThanOrEqual(5);
    });

    it('should update template', async () => {
      const template = await db.getNotificationTemplateByStatus(testMerchantId, 'delivered');
      const customTemplate = 'Custom message for {customerName}';
      
      const updated = await db.updateNotificationTemplate(template!.id, {
        template: customTemplate,
        enabled: false,
      });
      
      expect(updated?.template).toBe(customTemplate);
      expect(updated?.enabled).toBe(false);
    });
  });

  describe('Order Notifications', () => {
    let testOrderId: number;

    beforeAll(async () => {
      // Create test order
      const order = await db.createOrder({
        merchantId: testMerchantId,
        customerPhone: '+966501234567',
        customerName: 'Test Customer',
        status: 'pending',
        totalAmount: 100,
        orderNumber: 'TEST-001',
        items: JSON.stringify([]),
      });
      testOrderId = order!.id;
    });

    it('should create notification record', async () => {
      const notification = await db.createOrderNotification({
        orderId: testOrderId,
        merchantId: testMerchantId,
        customerPhone: '+966501234567',
        status: 'paid',
        message: 'Test message',
        sent: false,
      });
      
      expect(notification).toBeDefined();
      expect(notification?.orderId).toBe(testOrderId);
      expect(notification?.status).toBe('paid');
      expect(notification?.sent).toBe(false);
    });

    it('should get notifications by order', async () => {
      const notifications = await db.getOrderNotificationsByOrderId(testOrderId);
      
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].orderId).toBe(testOrderId);
    });

    it('should get notifications by merchant', async () => {
      const notifications = await db.getOrderNotificationsByMerchantId(testMerchantId, 10);
      
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].merchantId).toBe(testMerchantId);
    });

    it('should update notification status', async () => {
      const notification = await db.createOrderNotification({
        orderId: testOrderId,
        merchantId: testMerchantId,
        customerPhone: '+966501234567',
        status: 'shipped',
        message: 'Test message',
        sent: false,
      });
      
      const updated = await db.updateOrderNotification(notification!.id, {
        sent: true,
        sentAt: new Date(),
      });
      
      expect(updated?.sent).toBe(true);
      expect(updated?.sentAt).toBeDefined();
    });
  });

  describe('Send Notification (Mock)', () => {
    it('should handle disabled template', async () => {
      // Get template and disable it
      const template = await db.getNotificationTemplateByStatus(testMerchantId, 'cancelled');
      if (template) {
        await db.updateNotificationTemplate(template.id, { enabled: false });
      }
      
      const result = await prepareOrderStatusNotification(
        testMerchantId,
        '+966501234567',
        'cancelled',
        {
          customerName: 'Test',
          storeName: 'Test Store',
          orderNumber: 'TEST-001',
          total: 100,
        }
      );
      
      expect(result).toBeNull();
    });
  });
});
