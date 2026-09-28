import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from '../db';

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
