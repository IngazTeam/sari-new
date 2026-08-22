/**
 * WooCommerce Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';

describe('WooCommerce Integration', () => {
  let testMerchantId: number;
  let testProductId: number;
  let testOrderId: number;

  beforeAll(async () => {
    // Use a test merchant ID (you can change this to match your test environment)
    // For now, we'll use ID 1 if it exists
    const merchant = await db.getMerchantById(1);
    if (merchant) {
      testMerchantId = merchant.id;
    } else {
      // If no merchant exists, skip tests
      testMerchantId = 0;
    }
  });

  afterAll(async () => {
    // Cleanup test data
    if (testProductId) {
      await db.deleteWooCommerceProduct(testProductId);
    }
    if (testOrderId) {
      await db.deleteWooCommerceOrder(testOrderId);
    }
  });

  describe('WooCommerce Settings', () => {
    it('should create WooCommerce settings', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const settings = await db.createWooCommerceSettings({
        merchantId: testMerchantId,
        storeUrl: 'https://test-store.com',
        consumerKey: 'ck_test_key_123',
        consumerSecret: 'cs_test_secret_456',
        autoSyncProducts: 1,
        autoSyncOrders: 1,
        autoSyncCustomers: 0,
        syncInterval: 60,
        isActive: 1,
      });

      expect(settings).toBeDefined();
      expect(settings.merchantId).toBe(testMerchantId);
    });

    it('should get WooCommerce settings by merchant ID', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const settings = await db.getWooCommerceSettings(testMerchantId);
      
      expect(settings).toBeDefined();
      if (settings) {
        expect(settings.merchantId).toBe(testMerchantId);
        expect(settings.storeUrl).toBeDefined();
      }
    });

    it('should update WooCommerce settings', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      await db.updateWooCommerceSettings(testMerchantId, {
        autoSyncProducts: 0,
        syncInterval: 120,
      });

      const settings = await db.getWooCommerceSettings(testMerchantId);
      
      expect(settings).toBeDefined();
      if (settings) {
        expect(settings.autoSyncProducts).toBe(0);
        expect(settings.syncInterval).toBe(120);
      }
    });
  });

  describe('WooCommerce Products', () => {
    it('should create a WooCommerce product', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const product = await db.createWooCommerceProduct({
        merchantId: testMerchantId,
        wooProductId: 999,
        name: 'Test Product',
        slug: 'test-product',
        type: 'simple',
        status: 'publish',
        description: 'Test product description',
        shortDescription: 'Test short description',
        sku: 'TEST-SKU-001',
        price: '99.99',
        regularPrice: '129.99',
        salePrice: '99.99',
        stockQuantity: 10,
        stockStatus: 'instock',
        categories: JSON.stringify([{ id: 1, name: 'Test Category' }]),
        tags: JSON.stringify([]),
        images: JSON.stringify([{ src: 'https://example.com/image.jpg' }]),
        attributes: JSON.stringify([]),
        variations: null,
        permalink: 'https://test-store.com/product/test-product',
        wooCreatedAt: new Date().toISOString(),
        wooUpdatedAt: new Date().toISOString(),
      });

      expect(product).toBeDefined();
      expect(product.id).toBeDefined();
      testProductId = product.id;
    });

    it('should get WooCommerce products by merchant ID', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const products = await db.getWooCommerceProducts(testMerchantId, 10, 0);
      
      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
    });

    it('should search WooCommerce products', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const products = await db.searchWooCommerceProducts(testMerchantId, 'Test', 5);
      
      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
      
      if (products.length > 0) {
        expect(products[0].name).toContain('Test');
      }
    });

    it('should update a WooCommerce product', async () => {
      if (!testMerchantId || !testProductId) {
        console.log('Skipping test: No test product available');
        return;
      }

      await db.updateWooCommerceProduct(testProductId, {
        price: '79.99',
        stockQuantity: 5,
      });

      const product = await db.getWooCommerceProductById(testProductId);
      
      expect(product).toBeDefined();
      if (product) {
        expect(product.price).toBe('79.99');
        expect(product.stockQuantity).toBe(5);
      }
    });
  });

  describe('WooCommerce Orders', () => {
    it('should create a WooCommerce order', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const order = await db.createWooCommerceOrder({
        merchantId: testMerchantId,
        wooOrderId: 888,
        orderNumber: 'TEST-ORDER-001',
        customerName: 'Test Customer',
        customerEmail: 'test@example.com',
        customerPhone: '+966501234567',
        status: 'pending',
        currency: 'SAR',
        total: '199.99',
        subtotal: '199.99',
        shippingTotal: '0.00',
        taxTotal: '0.00',
        discountTotal: '0.00',
        paymentMethod: 'cod',
        paymentMethodTitle: 'Cash on Delivery',
        shippingAddress: JSON.stringify({ city: 'Riyadh' }),
        billingAddress: JSON.stringify({ city: 'Riyadh' }),
        lineItems: JSON.stringify([{ name: 'Test Product', quantity: 1, total: '199.99' }]),
        orderNotes: 'Test order notes',
        notificationSent: 0,
        wooCreatedAt: new Date().toISOString(),
        wooUpdatedAt: new Date().toISOString(),
      });

      expect(order).toBeDefined();
      expect(order.id).toBeDefined();
      testOrderId = order.id;
    });

    it('should get WooCommerce orders by merchant ID', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const orders = await db.getWooCommerceOrders(testMerchantId, 10, 0);
      
      expect(orders).toBeDefined();
      expect(Array.isArray(orders)).toBe(true);
    });

    it('should get a WooCommerce order by ID', async () => {
      if (!testOrderId) {
        console.log('Skipping test: No test order available');
        return;
      }

      const order = await db.getWooCommerceOrderById(testOrderId);
      
      expect(order).toBeDefined();
      if (order) {
        expect(order.id).toBe(testOrderId);
        expect(order.orderNumber).toBe('TEST-ORDER-001');
      }
    });

    it('should update a WooCommerce order', async () => {
      if (!testOrderId) {
        console.log('Skipping test: No test order available');
        return;
      }

      await db.updateWooCommerceOrder(testOrderId, {
        status: 'processing',
        notificationSent: 1,
        notificationSentAt: new Date().toISOString(),
      });

      const order = await db.getWooCommerceOrderById(testOrderId);
      
      expect(order).toBeDefined();
      if (order) {
        expect(order.status).toBe('processing');
        expect(order.notificationSent).toBe(1);
      }
    });

    it('should get WooCommerce order by WooCommerce ID', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const order = await db.getWooCommerceOrderByWooId(testMerchantId, 888);
      
      expect(order).toBeDefined();
      if (order) {
        expect(order.wooOrderId).toBe(888);
      }
    });
  });

  describe('WooCommerce Sync Logs', () => {
    it('should create a sync log', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const log = await db.createWooCommerceSyncLog({
        merchantId: testMerchantId,
        syncType: 'products',
        status: 'success',
        itemsProcessed: 10,
        itemsCreated: 5,
        itemsUpdated: 3,
        itemsFailed: 2,
        errorMessage: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
    });

    it('should get sync logs by merchant ID', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const logs = await db.getWooCommerceSyncLogs(testMerchantId, 10);
      
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should get latest sync log', async () => {
      if (!testMerchantId) {
        console.log('Skipping test: No test merchant available');
        return;
      }

      const log = await db.getLatestWooCommerceSyncLog(testMerchantId, 'products');
      
      expect(log).toBeDefined();
      if (log) {
        expect(log.syncType).toBe('products');
      }
    });
  });

});
