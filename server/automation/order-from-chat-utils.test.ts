import { describe, it, expect } from 'vitest';
import { formatMinorMoney } from '../../shared/product-money';
import {
  isOrderRequest,
  hasAddressInfo,
  generateOrderConfirmationMessage,
  generateGiftOrderConfirmationMessage
} from './order-from-chat';

describe('Order From Chat - Utility Functions', () => {
  describe('isOrderRequest', () => {
    it('should detect order requests with "أبي"', async () => {
      const result = await isOrderRequest('أبي جوال آيفون');
      expect(result).toBe(true);
    });

    it('should detect order requests with "أبغى"', async () => {
      const result = await isOrderRequest('أبغى أشتري لابتوب');
      expect(result).toBe(true);
    });

    it('should detect order requests with "أريد"', async () => {
      const result = await isOrderRequest('أريد سماعة بلوتوث');
      expect(result).toBe(true);
    });

    it('should detect order requests with "عندكم"', async () => {
      const result = await isOrderRequest('عندكم ساعات ذكية؟');
      expect(result).toBe(true);
    });

    it('should detect order requests with "كم سعر"', async () => {
      const result = await isOrderRequest('كم سعر الجوال؟');
      expect(result).toBe(true);
    });

    it('should detect gift orders', async () => {
      const result = await isOrderRequest('أبي هدية لصديقي');
      expect(result).toBe(true);
    });

    it('should NOT detect non-order messages', async () => {
      const result = await isOrderRequest('مرحباً، كيف حالك؟');
      expect(result).toBe(false);
    });

    it('should NOT detect general questions', async () => {
      const result = await isOrderRequest('متى تفتحون؟');
      expect(result).toBe(false);
    });
  });

  describe('hasAddressInfo', () => {
    it('should detect address with "عنوان"', () => {
      const result = hasAddressInfo('عنواني: الرياض، حي النرجس');
      expect(result).toBe(true);
    });

    it('should detect address with city names', () => {
      const result = hasAddressInfo('أنا في جدة');
      expect(result).toBe(true);
    });

    it('should detect address with "حي"', () => {
      const result = hasAddressInfo('حي الملقا، شارع التخصصي');
      expect(result).toBe(true);
    });

    it('should NOT detect messages without address', () => {
      const result = hasAddressInfo('أبي جوال آيفون');
      expect(result).toBe(false);
    });
  });

  describe('generateOrderConfirmationMessage', () => {
    it('should generate confirmation message with correct format', () => {
      const items = [
        { name: 'iPhone 15 Pro', quantity: 1, price: 4999 },
        { name: 'AirPods Pro', quantity: 1, price: 999 }
      ];
      const message = generateOrderConfirmationMessage(
        'ORD-12345',
        items,
        5998,
        'https://pay.salla.sa/12345'
      );

      expect(message).toContain('ORD-12345');
      expect(message).toContain('iPhone 15 Pro');
      expect(message).toContain('AirPods Pro');
      expect(message).toContain(formatMinorMoney(5998));
      expect(message).toContain('https://pay.salla.sa/12345');
    });

    it('shows quantities without presenting catalogue subtotals as invoice amounts', () => {
      const items = [
        { name: 'Product A', quantity: 2, price: 100 },
        { name: 'Product B', quantity: 3, price: 50 }
      ];
      const message = generateOrderConfirmationMessage(
        'ORD-123',
        items,
        350,
        'https://pay.test'
      );

      expect(message).not.toContain(formatMinorMoney(200)); // Catalogue amount is not a verified invoice line.
      expect(message).not.toContain(formatMinorMoney(150));
      expect(message).toContain('Product A × 2'); expect(message).toContain('Product B × 3');
    });
  });

  describe('generateGiftOrderConfirmationMessage', () => {
    it('should generate gift confirmation with recipient name', () => {
      const items = [
        { name: 'Gift Box', quantity: 1, price: 299 }
      ];
      const message = generateGiftOrderConfirmationMessage(
        'ORD-GIFT-123',
        'أحمد محمد',
        items,
        299,
        'https://pay.salla.sa/gift123'
      );

      expect(message).toContain('🎁');
      expect(message).toContain('هدية');
      expect(message).toContain('أحمد محمد');
      expect(message).toContain('ORD-GIFT-123');
      expect(message).toContain(formatMinorMoney(299));
    });

    it('should include gift-specific messaging', () => {
      const items = [{ name: 'Item', quantity: 1, price: 100 }];
      const message = generateGiftOrderConfirmationMessage(
        'ORD-1',
        'علي',
        items,
        100,
        'https://pay.test'
      );

      expect(message).not.toContain('بطاقة تهنئة');
      expect(message).toContain('الدفع عند الاستلام');
    });
  });
});
