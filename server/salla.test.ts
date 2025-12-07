import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import { SallaIntegration } from './integrations/salla';

/**
 * Salla Integration Tests
 * 
 * These tests verify:
 * 1. Database functions for Salla connections
 * 2. Sync logs creation and retrieval
 * 3. Product mapping with Salla IDs
 * 4. Order creation and management
 */

describe('Salla Integration - Database Functions', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Get or create a test merchant
    const merchants = await db.getAllMerchants();
    if (merchants.length > 0) {
      testMerchantId = merchants[0].id;
    } else {
      // Create a test merchant if none exists
      const users = await db.getAllUsers();
      if (users.length > 0) {
        const merchant = await db.createMerchant({
          userId: users[0].id,
          businessName: 'Test Store',
          status: 'active',
        });
        testMerchantId = merchant!.id;
      } else {
        throw new Error('No users found for testing');
      }
    }
  });

  describe('Salla Connections', () => {
    it('should create a Salla connection', async () => {
      const connection = await db.createSallaConnection({
        merchantId: testMerchantId,
        storeUrl: 'https://test-store.salla.sa',
        accessToken: 'test_token_123',
        syncStatus: 'active',
      });

      expect(connection).toBeDefined();
      expect(connection?.merchantId).toBe(testMerchantId);
      expect(connection?.storeUrl).toBe('https://test-store.salla.sa');
      expect(connection?.syncStatus).toBe('active');
    });

    it('should get Salla connection by merchant ID', async () => {
      const connection = await db.getSallaConnectionByMerchantId(testMerchantId);

      expect(connection).toBeDefined();
      expect(connection?.merchantId).toBe(testMerchantId);
    });

    it('should update Salla connection', async () => {
      await db.updateSallaConnection(testMerchantId, {
        syncStatus: 'syncing',
      });

      const connection = await db.getSallaConnectionByMerchantId(testMerchantId);
      expect(connection?.syncStatus).toBe('syncing');
    });

    it('should get all active Salla connections', async () => {
      // Update back to active
      await db.updateSallaConnection(testMerchantId, {
        syncStatus: 'active',
      });

      const connections = await db.getAllSallaConnections();
      expect(connections).toBeDefined();
      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBeGreaterThan(0);
    });
  });

  describe('Sync Logs', () => {
    it('should create a sync log', async () => {
      const logId = await db.createSyncLog(testMerchantId, 'full_sync', 'in_progress');

      expect(logId).toBeGreaterThan(0);
    });

    it('should update sync log', async () => {
      const logId = await db.createSyncLog(testMerchantId, 'stock_sync', 'in_progress');
      
      await db.updateSyncLog(logId, 'success', 150);

      const logs = await db.getSyncLogsByMerchantId(testMerchantId, 1);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].status).toBe('success');
      expect(logs[0].itemsSynced).toBe(150);
    });

    it('should get sync logs by merchant ID', async () => {
      const logs = await db.getSyncLogsByMerchantId(testMerchantId, 10);

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Products with Salla Integration', () => {
    let testProductId: number;

    it('should create a product with Salla ID', async () => {
      const product = await db.createProduct({
        merchantId: testMerchantId,
        sallaProductId: 'salla_prod_123',
        name: 'Test Product',
        price: 10000, // 100 SAR
        stock: 50,
        isActive: true,
      });

      expect(product).toBeDefined();
      expect(product?.sallaProductId).toBe('salla_prod_123');
      testProductId = product!.id;
    });

    it('should get product by Salla ID', async () => {
      const product = await db.getProductBySallaId(testMerchantId, 'salla_prod_123');

      expect(product).toBeDefined();
      expect(product?.sallaProductId).toBe('salla_prod_123');
      expect(product?.name).toBe('Test Product');
    });

    it('should get products with Salla ID', async () => {
      const products = await db.getProductsWithSallaId(testMerchantId);

      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBeGreaterThan(0);
      expect(products[0].sallaProductId).toBeDefined();
    });

    it('should update product stock', async () => {
      await db.updateProductStock(testProductId, 75);

      const product = await db.getProductById(testProductId);
      expect(product?.stock).toBe(75);
      expect(product?.isActive).toBe(true);
      expect(product?.lastSyncedAt).toBeDefined();
    });

    it('should mark product as inactive when stock is 0', async () => {
      await db.updateProductStock(testProductId, 0);

      const product = await db.getProductById(testProductId);
      expect(product?.stock).toBe(0);
      expect(product?.isActive).toBe(false);
    });
  });

  describe('Orders', () => {
    let testOrderId: number;

    it('should create an order', async () => {
      const order = await db.createOrder({
        merchantId: testMerchantId,
        sallaOrderId: 'salla_order_123',
        orderNumber: 'ORD-2024-001',
        customerPhone: '+966501234567',
        customerName: 'Ahmed Ali',
        customerEmail: 'ahmed@example.com',
        address: 'Riyadh, Al Nargis District',
        city: 'Riyadh',
        items: JSON.stringify([
          {
            sallaProductId: 'salla_prod_123',
            quantity: 2,
            price: 10000,
          },
        ]),
        totalAmount: 20000, // 200 SAR
        status: 'pending',
      });

      expect(order).toBeDefined();
      expect(order?.sallaOrderId).toBe('salla_order_123');
      expect(order?.orderNumber).toBe('ORD-2024-001');
      testOrderId = order!.id;
    });

    it('should get order by ID', async () => {
      const order = await db.getOrderById(testOrderId);

      expect(order).toBeDefined();
      expect(order?.orderNumber).toBe('ORD-2024-001');
    });

    it('should get order by Salla ID', async () => {
      const order = await db.getOrderBySallaId(testMerchantId, 'salla_order_123');

      expect(order).toBeDefined();
      expect(order?.sallaOrderId).toBe('salla_order_123');
    });

    it('should get orders by merchant ID', async () => {
      const orders = await db.getOrdersByMerchantId(testMerchantId);

      expect(orders).toBeDefined();
      expect(Array.isArray(orders)).toBe(true);
      expect(orders.length).toBeGreaterThan(0);
    });

    it('should update order status', async () => {
      await db.updateOrderStatus(testOrderId, 'shipped', 'TRACK123456');

      const order = await db.getOrderById(testOrderId);
      expect(order?.status).toBe('shipped');
      expect(order?.trackingNumber).toBe('TRACK123456');
    });

    it('should update order by Salla ID', async () => {
      await db.updateOrderBySallaId(testMerchantId, 'salla_order_123', {
        status: 'delivered',
      });

      const order = await db.getOrderBySallaId(testMerchantId, 'salla_order_123');
      expect(order?.status).toBe('delivered');
    });
  });

  describe('Integration Class', () => {
    it('should create SallaIntegration instance', () => {
      const salla = new SallaIntegration(testMerchantId, 'test_token');
      
      expect(salla).toBeDefined();
      expect(salla).toBeInstanceOf(SallaIntegration);
    });

    // Note: We don't test actual API calls here to avoid hitting Salla's servers
    // Real API tests should be done in a separate integration test suite
  });

  // Cleanup
  describe('Cleanup', () => {
    it('should delete Salla connection', async () => {
      await db.deleteSallaConnection(testMerchantId);

      const connection = await db.getSallaConnectionByMerchantId(testMerchantId);
      expect(connection).toBeUndefined();
    });
  });
});

describe('Salla Integration - Edge Cases', () => {
  it('should handle non-existent merchant gracefully', async () => {
    const connection = await db.getSallaConnectionByMerchantId(999999);
    expect(connection).toBeUndefined();
  });

  it('should handle non-existent Salla product ID gracefully', async () => {
    const product = await db.getProductBySallaId(1, 'non_existent_id');
    expect(product).toBeUndefined();
  });

  it('should handle non-existent Salla order ID gracefully', async () => {
    const order = await db.getOrderBySallaId(1, 'non_existent_order');
    expect(order).toBeUndefined();
  });
});
