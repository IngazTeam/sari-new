/**
 * اختبارات نظام الدفع Tap Payments
 * 
 * هذا الملف يحتوي على اختبارات شاملة لنظام الدفع
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCharge, verifyPayment, createRefund } from './_core/tapPayments';
import * as dbPayments from './db_payments';

describe('Tap Payments Integration', () => {
  let testChargeId: string;
  let testPaymentId: number;

  describe('createCharge', () => {
    it('should create a payment charge successfully', async () => {
      const chargeData = {
        amount: 10000, // 100 SAR
        currency: 'SAR',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        customerPhone: '+966501234567',
        description: 'Test payment',
        redirectUrl: 'https://example.com/success',
        webhookUrl: 'https://example.com/webhook',
      };

      const charge = await createCharge(chargeData);

      expect(charge).toBeDefined();
      expect(charge.id).toBeDefined();
      expect(charge.transaction).toBeDefined();
      expect(charge.transaction.url).toBeDefined();
      expect(charge.status).toBe('INITIATED');

      testChargeId = charge.id;
    });

    it('should reject invalid amount', async () => {
      const chargeData = {
        amount: -100,
        currency: 'SAR',
        customerName: 'Test Customer',
        customerPhone: '+966501234567',
        redirectUrl: 'https://example.com/success',
        webhookUrl: 'https://example.com/webhook',
      };

      await expect(createCharge(chargeData)).rejects.toThrow();
    });

    it('should reject invalid currency', async () => {
      const chargeData = {
        amount: 10000,
        currency: 'INVALID',
        customerName: 'Test Customer',
        customerPhone: '+966501234567',
        redirectUrl: 'https://example.com/success',
        webhookUrl: 'https://example.com/webhook',
      };

      await expect(createCharge(chargeData)).rejects.toThrow();
    });
  });

  describe('verifyPayment', () => {
    it('should verify payment status', async () => {
      if (!testChargeId) {
        // إنشاء charge للاختبار
        const charge = await createCharge({
          amount: 10000,
          currency: 'SAR',
          customerName: 'Test Customer',
          customerPhone: '+966501234567',
          redirectUrl: 'https://example.com/success',
          webhookUrl: 'https://example.com/webhook',
        });
        testChargeId = charge.id;
      }

      const verification = await verifyPayment(testChargeId);

      expect(verification).toBeDefined();
      expect(verification.chargeId).toBe(testChargeId);
      expect(verification.status).toBeDefined();
      expect(['INITIATED', 'CAPTURED', 'AUTHORIZED', 'FAILED']).toContain(verification.status);
    });

    it('should reject invalid charge ID', async () => {
      await expect(verifyPayment('invalid_charge_id')).rejects.toThrow();
    });
  });

  describe('Database Operations', () => {
    describe('createOrderPayment', () => {
      it('should create payment record in database', async () => {
        const paymentData = {
          merchantId: 1,
          orderId: null,
          bookingId: null,
          customerPhone: '+966501234567',
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          amount: 10000,
          currency: 'SAR',
          tapChargeId: testChargeId || 'test_charge_123',
          tapPaymentUrl: 'https://tap.company/pay/test',
          status: 'pending' as const,
          description: 'Test payment',
          metadata: null,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };

        const payment = await dbPayments.createOrderPayment(paymentData);

        expect(payment).toBeDefined();
        expect(payment?.id).toBeDefined();
        expect(payment?.amount).toBe(10000);
        expect(payment?.status).toBe('pending');

        testPaymentId = payment!.id;
      });
    });

    describe('getOrderPaymentById', () => {
      it('should retrieve payment by ID', async () => {
        if (!testPaymentId) {
          // إنشاء payment للاختبار
          const payment = await dbPayments.createOrderPayment({
            merchantId: 1,
            orderId: null,
            bookingId: null,
            customerPhone: '+966501234567',
            customerName: 'Test Customer',
            customerEmail: null,
            amount: 10000,
            currency: 'SAR',
            tapChargeId: 'test_charge_123',
            tapPaymentUrl: 'https://tap.company/pay/test',
            status: 'pending',
            description: null,
            metadata: null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          testPaymentId = payment!.id;
        }

        const payment = await dbPayments.getOrderPaymentById(testPaymentId);

        expect(payment).toBeDefined();
        expect(payment?.id).toBe(testPaymentId);
      });

      it('should return null for non-existent payment', async () => {
        const payment = await dbPayments.getOrderPaymentById(999999);
        expect(payment).toBeNull();
      });
    });

    describe('updateOrderPaymentStatus', () => {
      it('should update payment status', async () => {
        if (!testPaymentId) {
          const payment = await dbPayments.createOrderPayment({
            merchantId: 1,
            orderId: null,
            bookingId: null,
            customerPhone: '+966501234567',
            customerName: 'Test Customer',
            customerEmail: null,
            amount: 10000,
            currency: 'SAR',
            tapChargeId: 'test_charge_123',
            tapPaymentUrl: 'https://tap.company/pay/test',
            status: 'pending',
            description: null,
            metadata: null,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          });
          testPaymentId = payment!.id;
        }

        const updatedPayment = await dbPayments.updateOrderPaymentStatus(
          testPaymentId,
          'captured'
        );

        expect(updatedPayment).toBeDefined();
        expect(updatedPayment?.status).toBe('captured');
        expect(updatedPayment?.capturedAt).toBeDefined();
      });
    });

    describe('getPaymentStats', () => {
      it('should calculate payment statistics', async () => {
        const stats = await dbPayments.getPaymentStats(1);

        expect(stats).toBeDefined();
        expect(stats.totalPayments).toBeGreaterThanOrEqual(0);
        expect(stats.totalAmount).toBeGreaterThanOrEqual(0);
        expect(stats.successfulPayments).toBeGreaterThanOrEqual(0);
        expect(stats.failedPayments).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Payment Links', () => {
    let testLinkId: number;

    describe('createPaymentLink', () => {
      it('should create payment link', async () => {
        const linkData = {
          merchantId: 1,
          linkId: `link_test_${Date.now()}`,
          title: 'Test Payment Link',
          description: 'Test description',
          amount: 10000,
          currency: 'SAR',
          isFixedAmount: 1,
          minAmount: null,
          maxAmount: null,
          tapPaymentUrl: 'https://example.com/pay/test',
          maxUsageCount: null,
          expiresAt: null,
          status: 'active' as const,
          isActive: 1,
          orderId: null,
          bookingId: null,
        };

        const link = await dbPayments.createPaymentLink(linkData);

        expect(link).toBeDefined();
        expect(link?.id).toBeDefined();
        expect(link?.title).toBe('Test Payment Link');
        expect(link?.isActive).toBe(1);

        testLinkId = link!.id;
      });
    });

    describe('getPaymentLinkById', () => {
      it('should retrieve payment link by ID', async () => {
        if (!testLinkId) {
          const link = await dbPayments.createPaymentLink({
            merchantId: 1,
            linkId: `link_test_${Date.now()}`,
            title: 'Test Link',
            description: null,
            amount: 10000,
            currency: 'SAR',
            isFixedAmount: 1,
            minAmount: null,
            maxAmount: null,
            tapPaymentUrl: 'https://example.com/pay/test',
            maxUsageCount: null,
            expiresAt: null,
            status: 'active',
            isActive: 1,
            orderId: null,
            bookingId: null,
          });
          testLinkId = link!.id;
        }

        const link = await dbPayments.getPaymentLinkById(testLinkId);

        expect(link).toBeDefined();
        expect(link?.id).toBe(testLinkId);
      });
    });

    describe('incrementPaymentLinkUsage', () => {
      it('should increment usage count', async () => {
        if (!testLinkId) {
          const link = await dbPayments.createPaymentLink({
            merchantId: 1,
            linkId: `link_test_${Date.now()}`,
            title: 'Test Link',
            description: null,
            amount: 10000,
            currency: 'SAR',
            isFixedAmount: 1,
            minAmount: null,
            maxAmount: null,
            tapPaymentUrl: 'https://example.com/pay/test',
            maxUsageCount: null,
            expiresAt: null,
            status: 'active',
            isActive: 1,
            orderId: null,
            bookingId: null,
          });
          testLinkId = link!.id;
        }

        const linkBefore = await dbPayments.getPaymentLinkById(testLinkId);
        const usageCountBefore = linkBefore?.usageCount || 0;

        await dbPayments.incrementPaymentLinkUsage(testLinkId, 10000, true);

        const linkAfter = await dbPayments.getPaymentLinkById(testLinkId);

        expect(linkAfter?.usageCount).toBe(usageCountBefore + 1);
        expect(linkAfter?.successfulPayments).toBeGreaterThan(linkBefore?.successfulPayments || 0);
      });
    });

    describe('disablePaymentLink', () => {
      it('should disable payment link', async () => {
        if (!testLinkId) {
          const link = await dbPayments.createPaymentLink({
            merchantId: 1,
            linkId: `link_test_${Date.now()}`,
            title: 'Test Link',
            description: null,
            amount: 10000,
            currency: 'SAR',
            isFixedAmount: 1,
            minAmount: null,
            maxAmount: null,
            tapPaymentUrl: 'https://example.com/pay/test',
            maxUsageCount: null,
            expiresAt: null,
            status: 'active',
            isActive: 1,
            orderId: null,
            bookingId: null,
          });
          testLinkId = link!.id;
        }

        await dbPayments.disablePaymentLink(testLinkId);

        const link = await dbPayments.getPaymentLinkById(testLinkId);

        expect(link?.isActive).toBe(0);
        expect(link?.status).toBe('disabled');
      });
    });
  });

  // تنظيف بعد الاختبارات
  afterAll(async () => {
    // حذف البيانات التجريبية
    if (testPaymentId) {
      await dbPayments.deleteOrderPayment(testPaymentId);
    }
    if (testLinkId) {
      await dbPayments.deletePaymentLink(testLinkId);
    }
  });
});

describe('Payment Refunds', () => {
  let testPaymentId: number;
  let testRefundId: number;

  beforeAll(async () => {
    // إنشاء payment للاختبار
    const payment = await dbPayments.createOrderPayment({
      merchantId: 1,
      orderId: null,
      bookingId: null,
      customerPhone: '+966501234567',
      customerName: 'Test Customer',
      customerEmail: null,
      amount: 10000,
      currency: 'SAR',
      tapChargeId: 'test_charge_refund',
      tapPaymentUrl: 'https://tap.company/pay/test',
      status: 'captured',
      description: null,
      metadata: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    testPaymentId = payment!.id;
  });

  describe('createPaymentRefund', () => {
    it('should create refund record', async () => {
      const refundData = {
        paymentId: testPaymentId,
        merchantId: 1,
        amount: 5000, // استرجاع جزئي
        currency: 'SAR',
        reason: 'Customer request',
        tapRefundId: 'test_refund_123',
        status: 'pending' as const,
        processedBy: 1,
      };

      const refund = await dbPayments.createPaymentRefund(refundData);

      expect(refund).toBeDefined();
      expect(refund?.id).toBeDefined();
      expect(refund?.amount).toBe(5000);
      expect(refund?.status).toBe('pending');

      testRefundId = refund!.id;
    });
  });

  describe('getPaymentRefundsByPaymentId', () => {
    it('should retrieve refunds for payment', async () => {
      const refunds = await dbPayments.getPaymentRefundsByPaymentId(testPaymentId);

      expect(refunds).toBeDefined();
      expect(Array.isArray(refunds)).toBe(true);
      expect(refunds.length).toBeGreaterThan(0);
    });
  });

  describe('updatePaymentRefundStatus', () => {
    it('should update refund status', async () => {
      const updatedRefund = await dbPayments.updatePaymentRefundStatus(
        testRefundId,
        'completed'
      );

      expect(updatedRefund).toBeDefined();
      expect(updatedRefund?.status).toBe('completed');
      expect(updatedRefund?.completedAt).toBeDefined();
    });
  });

  afterAll(async () => {
    // تنظيف
    if (testRefundId) {
      await dbPayments.deletePaymentRefund(testRefundId);
    }
    if (testPaymentId) {
      await dbPayments.deleteOrderPayment(testPaymentId);
    }
  });
});
