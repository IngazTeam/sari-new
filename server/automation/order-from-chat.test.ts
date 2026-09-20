import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { formatMinorMoney } from '../../shared/product-money';
import * as db from '../db';
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

    it('should calculate item totals correctly', () => {
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

      expect(message).toContain(formatMinorMoney(200)); // 2 × 100
      expect(message).toContain(formatMinorMoney(150)); // 3 × 50
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

      expect(message).toContain('بطاقة تهنئة');
      expect(message).toContain('💝');
    });
  });
});

describe('Order From Chat - Database Integration', () => {
  let testMerchantId: number;
  let testProductId: number;

  beforeAll(async () => {
    // Create test merchant
    const user = await db.createUser({
      openId: 'test-order-user',
      name: 'Test Order User',
      email: 'test-order@test.com',
      role: 'admin'
    });

    if (user) {
      const merchant = await db.createMerchant({
        userId: user.id,
        businessName: 'Test Order Business',
        phone: '+966500000000',
        status: 'active'
      });

      if (merchant) {
        testMerchantId = merchant.id;

        // Create test product
        const product = await db.createProduct({
          merchantId: testMerchantId,
          name: 'Test Product',
          description: 'Test Description',
          price: 100,
          stock: 10,
          isActive: true
        });

        if (product) {
          testProductId = product.id;
        }
      }
    }
  });

  it('should create order in database', async () => {
    const order = await db.createOrder({
      merchantId: testMerchantId,
      orderNumber: 'TEST-001',
      customerPhone: '+966501234567',
      customerName: 'Test Customer',
      address: 'Test Address',
      city: 'Riyadh',
      items: JSON.stringify([
        {
          productId: testProductId,
          name: 'Test Product',
          quantity: 2,
          price: 100
        }
      ]),
      totalAmount: 200,
      status: 'pending',
      isGift: false
    });

    expect(order).toBeDefined();
    expect(order?.orderNumber).toBe('TEST-001');
    expect(order?.customerPhone).toBe('+966501234567');
    expect(order?.totalAmount).toBe(200);
    expect(order?.status).toBe('pending');
  });

  it('should create gift order with recipient info', async () => {
    const order = await db.createOrder({
      merchantId: testMerchantId,
      orderNumber: 'GIFT-001',
      customerPhone: '+966509876543',
      customerName: 'Gift Sender',
      address: 'Gift Address',
      city: 'Jeddah',
      items: JSON.stringify([
        {
          productId: testProductId,
          name: 'Gift Item',
          quantity: 1,
          price: 299
        }
      ]),
      totalAmount: 299,
      status: 'pending',
      isGift: true,
      giftRecipientName: 'Gift Recipient',
      giftMessage: 'Happy Birthday!'
    });

    expect(order).toBeDefined();
    expect(order?.isGift).toBe(true);
    expect(order?.giftRecipientName).toBe('Gift Recipient');
    expect(order?.giftMessage).toBe('Happy Birthday!');
  });

  it('should retrieve order by ID', async () => {
    const created = await db.createOrder({
      merchantId: testMerchantId,
      orderNumber: 'TEST-002',
      customerPhone: '+966501111111',
      customerName: 'Customer 2',
      items: JSON.stringify([]),
      totalAmount: 150,
      status: 'pending',
      isGift: false
    });

    if (created) {
      const retrieved = await db.getOrderById(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.orderNumber).toBe('TEST-002');
    }
  });

  it('should list orders by merchant', async () => {
    const orders = await db.getOrdersByMerchantId(testMerchantId);
    expect(orders).toBeDefined();
    expect(orders.length).toBeGreaterThan(0);
  });

  it('should update order status', async () => {
    const order = await db.createOrder({
      merchantId: testMerchantId,
      orderNumber: 'TEST-003',
      customerPhone: '+966502222222',
      customerName: 'Customer 3',
      items: JSON.stringify([]),
      totalAmount: 200,
      status: 'pending',
      isGift: false
    });

    if (order) {
      await db.updateOrderStatus(order.id, 'paid');
      const updated = await db.getOrderById(order.id);
      expect(updated?.status).toBe('paid');
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testMerchantId) {
      const orders = await db.getOrdersByMerchantId(testMerchantId);
      // Note: Add cleanup logic if needed
    }
  });
});
