import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from './db';
import * as dbZid from './db_zid';
import type { InsertZidSettings } from '../drizzle/schema';

describe('Zid Integration', () => {
  const testMerchantId = 99999; // Test merchant ID

  // Cleanup after tests
  afterAll(async () => {
    try {
      await dbZid.deleteZidSettings(testMerchantId);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Zid Settings', () => {
    it('should create Zid settings', async () => {
      const settingsData: InsertZidSettings = {
        merchantId: testMerchantId,
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        accessToken: 'test_access_token',
        managerToken: 'test_manager_token',
        refreshToken: 'test_refresh_token',
        storeName: 'Test Store',
        storeUrl: 'https://test-store.zid.sa',
        isActive: 1,
        autoSyncProducts: 1,
        autoSyncOrders: 1,
        autoSyncCustomers: 0,
      };

      await dbZid.createZidSettings(settingsData);

      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings).toBeDefined();
      expect(settings?.merchantId).toBe(testMerchantId);
      expect(settings?.storeName).toBe('Test Store');
      expect(settings?.isActive).toBe(1);
    });

    it('should get Zid settings', async () => {
      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings).toBeDefined();
      expect(settings?.clientId).toBe('test_client_id');
    });

    it('should check if Zid is connected', async () => {
      const isConnected = await dbZid.isZidConnected(testMerchantId);
      expect(isConnected).toBe(true);
    });

    it('should update Zid settings', async () => {
      await dbZid.updateZidSettings(testMerchantId, {
        storeName: 'Updated Store',
      });

      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings?.storeName).toBe('Updated Store');
    });

    it('should update auto-sync settings', async () => {
      await dbZid.updateAutoSyncSettings(testMerchantId, {
        autoSyncProducts: false,
        autoSyncOrders: true,
        autoSyncCustomers: true,
      });

      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings?.autoSyncProducts).toBe(0);
      expect(settings?.autoSyncOrders).toBe(1);
      expect(settings?.autoSyncCustomers).toBe(1);
    });

    it('should toggle Zid connection', async () => {
      await dbZid.toggleZidConnection(testMerchantId, false);
      let settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings?.isActive).toBe(0);

      await dbZid.toggleZidConnection(testMerchantId, true);
      settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings?.isActive).toBe(1);
    });

    it('should update last sync time', async () => {
      await dbZid.updateLastSync(testMerchantId, 'products');
      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings?.lastProductSync).toBeDefined();
    });
  });

  describe('Zid Sync Logs', () => {
    let syncLogId: number;

    it('should create sync log', async () => {
      const log = await dbZid.createZidSyncLog({
        merchantId: testMerchantId,
        syncType: 'products',
        status: 'pending',
        totalItems: 100,
      });

      expect(log).toBeDefined();
      expect(log.syncType).toBe('products');
      expect(log.status).toBe('pending');
      syncLogId = log.id;
    });

    it('should update sync status', async () => {
      await dbZid.updateSyncStatus(syncLogId, 'in_progress');
      const log = await dbZid.getZidSyncLog(syncLogId);
      expect(log?.status).toBe('in_progress');
    });

    it('should update sync stats', async () => {
      await dbZid.updateSyncStats(syncLogId, {
        processedItems: 50,
        successCount: 45,
        failedCount: 5,
      });

      const log = await dbZid.getZidSyncLog(syncLogId);
      expect(log?.processedItems).toBe(50);
      expect(log?.successCount).toBe(45);
      expect(log?.failedCount).toBe(5);
    });

    it('should complete sync', async () => {
      await dbZid.updateSyncStatus(syncLogId, 'completed');
      const log = await dbZid.getZidSyncLog(syncLogId);
      expect(log?.status).toBe('completed');
      expect(log?.completedAt).toBeDefined();
    });

    it('should get sync logs', async () => {
      const logs = await dbZid.getZidSyncLogs(testMerchantId);
      expect(logs).toBeDefined();
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should get sync logs by type', async () => {
      const logs = await dbZid.getZidSyncLogs(testMerchantId, 'products');
      expect(logs).toBeDefined();
      expect(logs.every(log => log.syncType === 'products')).toBe(true);
    });

    it('should get last successful sync', async () => {
      const log = await dbZid.getLastSuccessfulSync(testMerchantId, 'products');
      expect(log).toBeDefined();
      expect(log?.status).toBe('completed');
    });

    it('should get sync stats', async () => {
      const stats = await dbZid.getZidSyncStats(testMerchantId);
      expect(stats).toBeDefined();
      expect(stats.totalSyncs).toBeGreaterThan(0);
      expect(stats.successfulSyncs).toBeGreaterThan(0);
    });
  });

  describe('Zid Client', () => {
    it('should create Zid client instance', async () => {
      const { ZidClient } = await import('./integrations/zid/zidClient');
      
      const client = new ZidClient({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'https://example.com/callback',
      });

      expect(client).toBeDefined();
    });

    it('should generate authorization URL', async () => {
      const { ZidClient } = await import('./integrations/zid/zidClient');
      
      const client = new ZidClient({
        clientId: 'test_client_id',
        clientSecret: 'test_client_secret',
        redirectUri: 'https://example.com/callback',
      });

      const authUrl = client.getAuthorizationUrl();
      expect(authUrl).toContain('oauth.zid.sa');
      expect(authUrl).toContain('test_client_id');
      expect(authUrl).toContain('response_type=code');
    });
  });

  describe('Cleanup', () => {
    it('should delete Zid settings', async () => {
      await dbZid.deleteZidSettings(testMerchantId);
      const settings = await dbZid.getZidSettings(testMerchantId);
      expect(settings).toBeUndefined();
    });
  });
});
