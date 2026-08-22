import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
vi.mock('./db', () => ({
  getIntegrationByType: vi.fn(),
  createIntegration: vi.fn(),
  deleteIntegrationByType: vi.fn(),
  updateIntegrationLastSync: vi.fn(),
  updateIntegrationSettings: vi.fn(),
  getIntegrationsByMerchant: vi.fn(),
  upsertProductFromZid: vi.fn(),
  upsertOrderFromZid: vi.fn(),
  updateProductInventoryFromZid: vi.fn(),
  createSyncLog: vi.fn(),
  getProductCountByMerchant: vi.fn(),
  getOrderCountByMerchant: vi.fn(),
  getCustomerCountByMerchant: vi.fn(),
  getSyncLogsByMerchant: vi.fn(),
}));

vi.mock('./db_zid', () => ({
  createZidSyncLog: vi.fn(async (data) => ({ id: 1, ...data })),
  updateZidSyncLog: vi.fn(),
  getZidSyncLogs: vi.fn(async () => []),
  deleteAllZidConnections: vi.fn(),
  deleteZidSettings: vi.fn(),
}));

import * as db from './db';
import * as dbZid from './db_zid';
import { handleZidWebhook } from './integrations/zid';

describe('Zid Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleZidWebhook', () => {
    it('should ignore webhook if integration is not active', async () => {
      vi.mocked(db.getIntegrationByType).mockResolvedValue(undefined);

      await handleZidWebhook(1, 'order.created', { id: 123 });

      expect(db.upsertOrderFromZid).not.toHaveBeenCalled();
    });

    it('should process order.created event when syncOrders is enabled', async () => {
      vi.mocked(db.getIntegrationByType).mockResolvedValue({
        id: 1,
        merchantId: 1,
        platformType: 'zid',
        storeName: 'Test Store',
        storeUrl: 'https://test.zid.store',
        accessToken: 'token123',
        refreshToken: null,
        isActive: 1,
        settings: JSON.stringify({ syncOrders: true }),
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const orderPayload = { id: 123, total: 100, customer: { phone: '966500000000' } };
      await handleZidWebhook(1, 'order.created', orderPayload);

      expect(db.upsertOrderFromZid).toHaveBeenCalledWith(1, orderPayload);
      expect(dbZid.createZidSyncLog).toHaveBeenCalled();
    });

    it('should process product.created event when syncProducts is enabled', async () => {
      vi.mocked(db.getIntegrationByType).mockResolvedValue({
        id: 1,
        merchantId: 1,
        platformType: 'zid',
        storeName: 'Test Store',
        storeUrl: 'https://test.zid.store',
        accessToken: 'token123',
        refreshToken: null,
        isActive: 1,
        settings: JSON.stringify({ syncProducts: true }),
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const productPayload = { id: 456, name: 'Test Product', price: 50 };
      await handleZidWebhook(1, 'product.created', productPayload);

      expect(db.upsertProductFromZid).toHaveBeenCalledWith(1, productPayload);
      expect(dbZid.createZidSyncLog).toHaveBeenCalled();
    });

    it('should process inventory.updated event', async () => {
      vi.mocked(db.getIntegrationByType).mockResolvedValue({
        id: 1,
        merchantId: 1,
        platformType: 'zid',
        storeName: 'Test Store',
        storeUrl: 'https://test.zid.store',
        accessToken: 'token123',
        refreshToken: null,
        isActive: 1,
        settings: JSON.stringify({ syncProducts: true }),
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const inventoryPayload = { product_id: 789, quantity: 10 };
      await handleZidWebhook(1, 'inventory.updated', inventoryPayload);

      expect(db.updateProductInventoryFromZid).toHaveBeenCalledWith(1, inventoryPayload);
    });

    it('should skip events when sync settings are disabled', async () => {
      vi.mocked(db.getIntegrationByType).mockResolvedValue({
        id: 1,
        merchantId: 1,
        platformType: 'zid',
        storeName: 'Test Store',
        storeUrl: 'https://test.zid.store',
        accessToken: 'token123',
        refreshToken: null,
        isActive: 1,
        settings: JSON.stringify({ syncOrders: false, syncProducts: false }),
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await handleZidWebhook(1, 'order.created', { id: 123 });
      await handleZidWebhook(1, 'product.created', { id: 456 });

      expect(db.upsertOrderFromZid).not.toHaveBeenCalled();
      expect(db.upsertProductFromZid).not.toHaveBeenCalled();
    });
  });
});

describe('Integration Database Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get integration by type', async () => {
    const mockIntegration = {
      id: 1,
      merchantId: 1,
      platformType: 'zid' as const,
      storeName: 'Test Store',
      storeUrl: 'https://test.zid.store',
      accessToken: 'token123',
      refreshToken: null,
      isActive: 1,
      settings: null,
      lastSyncAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(db.getIntegrationByType).mockResolvedValue(mockIntegration);

    const result = await db.getIntegrationByType(1, 'zid');

    expect(result).toEqual(mockIntegration);
    expect(db.getIntegrationByType).toHaveBeenCalledWith(1, 'zid');
  });

  it('should return undefined for non-existent integration', async () => {
    vi.mocked(db.getIntegrationByType).mockResolvedValue(undefined);

    const result = await db.getIntegrationByType(999, 'calendly');

    expect(result).toBeUndefined();
  });

  it('should create new integration', async () => {
    const newIntegration = {
      id: 2,
      merchantId: 1,
      platformType: 'calendly' as const,
      storeName: 'Calendly User',
      storeUrl: 'https://api.calendly.com/users/abc',
      accessToken: 'api_key',
      refreshToken: null,
      isActive: 1,
      settings: JSON.stringify({ autoConfirm: true }),
      lastSyncAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    vi.mocked(db.createIntegration).mockResolvedValue(newIntegration);

    const result = await db.createIntegration({
      merchantId: 1,
      type: 'calendly',
      storeName: 'Calendly User',
      storeUrl: 'https://api.calendly.com/users/abc',
      accessToken: 'api_key',
      settings: JSON.stringify({ autoConfirm: true }),
    });

    expect(result).toEqual(newIntegration);
  });

  it('should delete integration by type', async () => {
    vi.mocked(db.deleteIntegrationByType).mockResolvedValue(undefined);

    await db.deleteIntegrationByType(1, 'zid');

    expect(db.deleteIntegrationByType).toHaveBeenCalledWith(1, 'zid');
  });

  it('should update integration settings', async () => {
    vi.mocked(db.updateIntegrationSettings).mockResolvedValue(undefined);

    await db.updateIntegrationSettings(1, { autoSync: true, syncProducts: true });

    expect(db.updateIntegrationSettings).toHaveBeenCalledWith(1, { autoSync: true, syncProducts: true });
  });

  it('should get all integrations for merchant', async () => {
    const mockIntegrations = [
      {
        id: 1,
        merchantId: 1,
        platformType: 'zid' as const,
        storeName: 'Zid Store',
        storeUrl: 'https://test.zid.store',
        accessToken: 'token1',
        refreshToken: null,
        isActive: 1,
        settings: null,
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        merchantId: 1,
        platformType: 'calendly' as const,
        storeName: 'Calendly User',
        storeUrl: 'https://api.calendly.com/users/abc',
        accessToken: 'token2',
        refreshToken: null,
        isActive: 1,
        settings: null,
        lastSyncAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(db.getIntegrationsByMerchant).mockResolvedValue(mockIntegrations);

    const result = await db.getIntegrationsByMerchant(1);

    expect(result).toHaveLength(2);
    expect(result[0].platformType).toBe('zid');
    expect(result[1].platformType).toBe('calendly');
  });
});
