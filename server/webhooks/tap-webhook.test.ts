/**
 * اختبارات Tap Webhook Handler
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';
import * as dbPayments from '../db_payments';
import { processTapWebhook, verifyTapSignature } from './tap-webhook';

describe('Tap Webhook Handler', () => {
  let testMerchantId: number;
  let testPaymentId: number;
  let testChargeId: string;

  beforeAll(async () => {
    // إنشاء تاجر للاختبار
    const merchant = await db.createMerchant({
      name: 'Test Merchant',
      email: 'test@example.com',
      phone: '+966500000000',
      businessName: 'Test Business',
    });
    testMerchantId = merchant!.id;

    // إنشاء معاملة دفع للاختبار
    testChargeId = 'chg_test_' + Date.now();
    const payment = await dbPayments.createOrderPayment({
      merchantId: testMerchantId,
      orderId: null,
      bookingId: null,
      customerPhone: '+966501234567',
      customerName: 'Test Customer',
      customerEmail: 'customer@example.com',
      amount: 100,
      currency: 'SAR',
      tapChargeId: testChargeId,
      tapPaymentUrl: 'https://tap.company/test',
      status: 'pending',
      description: 'Test payment',
    });
    testPaymentId = payment!.id;
  });

  describe('verifyTapSignature', () => {
    it('should verify valid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test_secret_key';
      
      // إنشاء توقيع صحيح
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const validSignature = hmac.digest('hex');

      const isValid = verifyTapSignature(payload, validSignature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test_secret_key';
      const invalidSignature = 'invalid_signature';

      const isValid = verifyTapSignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('processTapWebhook', () => {
    it('should process successful payment webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_123',
        object: 'event',
        live_mode: false,
        api_version: '2.0',
        created: Date.now(),
        data: {
          object: {
            id: testChargeId,
            object: 'charge',
            live_mode: false,
            customer: {
              id: 'cus_test_123',
              first_name: 'Test',
              last_name: 'Customer',
              email: 'customer@example.com',
              phone: {
                country_code: '+966',
                number: '501234567'
              }
            },
            amount: 100,
            currency: 'SAR',
            status: 'CAPTURED' as const,
            description: 'Test payment',
            metadata: {
              orderId: '1',
              type: 'order' as const
            },
            reference: {
              transaction: 'txn_test_123',
              order: 'ord_test_123',
              payment: 'pay_test_123'
            },
            receipt: {
              id: 'rcp_test_123',
              email: true,
              sms: true
            },
            source: {
              id: 'src_test_123',
              object: 'source',
              type: 'card',
              payment_method: 'VISA'
            },
            redirect: {
              status: 'success',
              url: 'https://example.com/success'
            },
            post: {
              status: 'success',
              url: 'https://example.com/webhook'
            },
            response: {
              code: '000',
              message: 'Approved'
            },
            created: Date.now()
          }
        }
      };

      const result = await processTapWebhook(webhookPayload);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook processed successfully');

      // التحقق من تحديث حالة المعاملة
      const updatedPayment = await dbPayments.getOrderPaymentById(testPaymentId);
      expect(updatedPayment?.status).toBe('captured');
    });

    it('should process failed payment webhook', async () => {
      const webhookPayload = {
        id: 'evt_test_456',
        object: 'event',
        live_mode: false,
        api_version: '2.0',
        created: Date.now(),
        data: {
          object: {
            id: testChargeId,
            object: 'charge',
            live_mode: false,
            customer: {
              id: 'cus_test_123',
              first_name: 'Test',
              last_name: 'Customer',
              email: 'customer@example.com',
              phone: {
                country_code: '+966',
                number: '501234567'
              }
            },
            amount: 100,
            currency: 'SAR',
            status: 'FAILED' as const,
            description: 'Test payment',
            metadata: {
              orderId: '1',
              type: 'order' as const
            },
            reference: {
              transaction: 'txn_test_456',
              order: 'ord_test_456',
              payment: 'pay_test_456'
            },
            receipt: {
              id: 'rcp_test_456',
              email: false,
              sms: false
            },
            source: {
              id: 'src_test_456',
              object: 'source',
              type: 'card',
              payment_method: 'VISA'
            },
            redirect: {
              status: 'failed',
              url: 'https://example.com/failed'
            },
            post: {
              status: 'failed',
              url: 'https://example.com/webhook'
            },
            response: {
              code: '100',
              message: 'Declined'
            },
            created: Date.now()
          }
        }
      };

      const result = await processTapWebhook(webhookPayload);
      
      expect(result.success).toBe(true);

      // التحقق من تحديث حالة المعاملة
      const updatedPayment = await dbPayments.getOrderPaymentById(testPaymentId);
      expect(updatedPayment?.status).toBe('failed');
    });

    it('should handle webhook for non-existent payment', async () => {
      const webhookPayload = {
        id: 'evt_test_789',
        object: 'event',
        live_mode: false,
        api_version: '2.0',
        created: Date.now(),
        data: {
          object: {
            id: 'chg_nonexistent_123',
            object: 'charge',
            live_mode: false,
            customer: {
              id: 'cus_test_123',
              first_name: 'Test',
              last_name: 'Customer',
              email: 'customer@example.com',
              phone: {
                country_code: '+966',
                number: '501234567'
              }
            },
            amount: 100,
            currency: 'SAR',
            status: 'CAPTURED' as const,
            description: 'Test payment',
            metadata: {},
            reference: {
              transaction: 'txn_test_789',
              order: 'ord_test_789',
              payment: 'pay_test_789'
            },
            receipt: {
              id: 'rcp_test_789',
              email: true,
              sms: true
            },
            source: {
              id: 'src_test_789',
              object: 'source',
              type: 'card',
              payment_method: 'VISA'
            },
            redirect: {
              status: 'success',
              url: 'https://example.com/success'
            },
            post: {
              status: 'success',
              url: 'https://example.com/webhook'
            },
            response: {
              code: '000',
              message: 'Approved'
            },
            created: Date.now()
          }
        }
      };

      const result = await processTapWebhook(webhookPayload);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Payment not found');
    });
  });
});
