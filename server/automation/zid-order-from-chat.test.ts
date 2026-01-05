/**
 * اختبارات وحدة إنشاء الطلبات في Zid من المحادثات
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isZidOrderRequest,
  isOrderConfirmation,
  isOrderRejection,
  generateZidOrderConfirmationMessage,
  generateZidPaymentLinkMessage,
} from './zid-order-from-chat';

describe('Zid Order From Chat', () => {
  describe('isZidOrderRequest', () => {
    it('should detect Arabic order keywords', async () => {
      expect(await isZidOrderRequest('أبغى أشتري منتج')).toBe(true);
      expect(await isZidOrderRequest('أريد طلب هذا المنتج')).toBe(true);
      expect(await isZidOrderRequest('كم سعر الجهاز؟')).toBe(true);
      expect(await isZidOrderRequest('عندكم ساعات ذكية؟')).toBe(true);
      expect(await isZidOrderRequest('ابي اطلب 2 قطع')).toBe(true);
    });

    it('should not detect non-order messages', async () => {
      expect(await isZidOrderRequest('مرحبا')).toBe(false);
      expect(await isZidOrderRequest('شكرا')).toBe(false);
      expect(await isZidOrderRequest('وين موقعكم؟')).toBe(false);
    });
  });

  describe('isOrderConfirmation', () => {
    it('should detect confirmation keywords', () => {
      expect(isOrderConfirmation('نعم')).toBe(true);
      expect(isOrderConfirmation('أيوه')).toBe(true);
      expect(isOrderConfirmation('تمام')).toBe(true);
      expect(isOrderConfirmation('موافق')).toBe(true);
      expect(isOrderConfirmation('أكد الطلب')).toBe(true);
      expect(isOrderConfirmation('ok')).toBe(true);
      expect(isOrderConfirmation('yes')).toBe(true);
    });

    it('should not detect non-confirmation messages', () => {
      expect(isOrderConfirmation('ربما')).toBe(false);
      expect(isOrderConfirmation('ممكن')).toBe(false);
      expect(isOrderConfirmation('ما أدري')).toBe(false);
    });
  });

  describe('isOrderRejection', () => {
    it('should detect rejection keywords', () => {
      expect(isOrderRejection('لا')).toBe(true);
      expect(isOrderRejection('لأ')).toBe(true);
      expect(isOrderRejection('no')).toBe(true);
      expect(isOrderRejection('الغي الطلب')).toBe(true);
      expect(isOrderRejection('مابي')).toBe(true);
      expect(isOrderRejection('بعدين')).toBe(true);
    });

    it('should not detect non-rejection messages', () => {
      expect(isOrderRejection('نعم')).toBe(false);
      expect(isOrderRejection('تمام')).toBe(false);
    });
  });

  describe('generateZidOrderConfirmationMessage', () => {
    it('should generate proper confirmation message', () => {
      const items = [
        { name: 'ساعة ذكية', quantity: 1, price: 500 },
        { name: 'سماعة بلوتوث', quantity: 2, price: 150 },
      ];
      
      const message = generateZidOrderConfirmationMessage(
        'ZID-001',
        items,
        800,
        'https://zid.store/order/123'
      );
      
      expect(message).toContain('ZID-001');
      expect(message).toContain('ساعة ذكية');
      expect(message).toContain('سماعة بلوتوث');
      expect(message).toContain('800');
      expect(message).toContain('https://zid.store/order/123');
      expect(message).toContain('تم إنشاء طلبك بنجاح');
    });
  });

  describe('generateZidPaymentLinkMessage', () => {
    it('should generate proper payment link message', () => {
      const message = generateZidPaymentLinkMessage(
        'ZID-002',
        1500,
        'https://zid.store/pay/456'
      );
      
      expect(message).toContain('ZID-002');
      expect(message).toContain('1500');
      expect(message).toContain('https://zid.store/pay/456');
      expect(message).toContain('رابط الدفع جاهز');
    });
  });
});
