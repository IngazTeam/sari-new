/**
 * Instance Expiry Notification System Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import { checkInstanceExpiry } from './jobs/instance-expiry-check';

describe('Instance Expiry Notification System', () => {
  let testMerchantId: number;
  let expiring7DaysId: number;
  let expiring3DaysId: number;
  let expiring1DayId: number;
  let expiredId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 999996,
      businessName: 'Instance Expiry Test Store',
      businessType: 'retail',
      phoneNumber: '+966500000096',
      whatsappConnected: false,
      whatsappInstanceId: null,
      whatsappToken: null,
    });
    testMerchantId = merchant.id;

    // Create instances with different expiry dates
    const now = new Date();

    // Expiring in 7 days
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const instance7Days = await db.createWhatsAppInstance({
      merchantId: testMerchantId,
      instanceId: 'TEST_7DAYS',
      token: 'token-7days',
      apiUrl: 'https://api.green-api.com',
      phoneNumber: null,
      webhookUrl: null,
      status: 'active',
      isPrimary: false,
      lastSyncAt: null,
      connectedAt: null,
      expiresAt: in7Days,
      metadata: null,
    });
    if (instance7Days) expiring7DaysId = instance7Days.id;

    // Expiring in 3 days
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);
    const instance3Days = await db.createWhatsAppInstance({
      merchantId: testMerchantId,
      instanceId: 'TEST_3DAYS',
      token: 'token-3days',
      apiUrl: 'https://api.green-api.com',
      phoneNumber: null,
      webhookUrl: null,
      status: 'active',
      isPrimary: false,
      lastSyncAt: null,
      connectedAt: null,
      expiresAt: in3Days,
      metadata: null,
    });
    if (instance3Days) expiring3DaysId = instance3Days.id;

    // Expiring in 1 day
    const in1Day = new Date(now);
    in1Day.setDate(in1Day.getDate() + 1);
    const instance1Day = await db.createWhatsAppInstance({
      merchantId: testMerchantId,
      instanceId: 'TEST_1DAY',
      token: 'token-1day',
      apiUrl: 'https://api.green-api.com',
      phoneNumber: null,
      webhookUrl: null,
      status: 'active',
      isPrimary: false,
      lastSyncAt: null,
      connectedAt: null,
      expiresAt: in1Day,
      metadata: null,
    });
    if (instance1Day) expiring1DayId = instance1Day.id;

    // Already expired
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const instanceExpired = await db.createWhatsAppInstance({
      merchantId: testMerchantId,
      instanceId: 'TEST_EXPIRED',
      token: 'token-expired',
      apiUrl: 'https://api.green-api.com',
      phoneNumber: null,
      webhookUrl: null,
      status: 'active',
      isPrimary: false,
      lastSyncAt: null,
      connectedAt: null,
      expiresAt: yesterday,
      metadata: null,
    });
    if (instanceExpired) expiredId = instanceExpired.id;
  });

  afterAll(async () => {
    // Cleanup is handled by database constraints
  });

  describe('Get Expiring Instances', () => {
    it('should detect instances expiring in 7 days', async () => {
      const { expiring7Days } = await db.getExpiringWhatsAppInstances();
      const testInstance = expiring7Days.find(i => i.id === expiring7DaysId);
      
      expect(testInstance).toBeDefined();
      expect(testInstance?.instanceId).toBe('TEST_7DAYS');
    });

    it('should detect instances expiring in 3 days', async () => {
      const { expiring3Days } = await db.getExpiringWhatsAppInstances();
      const testInstance = expiring3Days.find(i => i.id === expiring3DaysId);
      
      expect(testInstance).toBeDefined();
      expect(testInstance?.instanceId).toBe('TEST_3DAYS');
    });

    it('should detect instances expiring in 1 day', async () => {
      const { expiring1Day } = await db.getExpiringWhatsAppInstances();
      const testInstance = expiring1Day.find(i => i.id === expiring1DayId);
      
      expect(testInstance).toBeDefined();
      expect(testInstance?.instanceId).toBe('TEST_1DAY');
    });

    it('should detect expired instances', async () => {
      const { expired } = await db.getExpiringWhatsAppInstances();
      const testInstance = expired.find(i => i.id === expiredId);
      
      expect(testInstance).toBeDefined();
      expect(testInstance?.instanceId).toBe('TEST_EXPIRED');
    });
  });

  describe('Get Instances Expiring Soon', () => {
    it('should get instances expiring within 7 days', async () => {
      const instances = await db.getInstancesExpiringSoon(7);
      const testInstances = instances.filter(i => i.merchantId === testMerchantId);
      
      expect(testInstances.length).toBeGreaterThanOrEqual(2); // 3-day and 1-day instances
    });

    it('should get instances expiring within 3 days', async () => {
      const instances = await db.getInstancesExpiringSoon(3);
      const testInstances = instances.filter(i => i.merchantId === testMerchantId);
      
      expect(testInstances.length).toBeGreaterThanOrEqual(1); // 1-day instance
    });

    it('should get instances expiring within 1 day', async () => {
      const instances = await db.getInstancesExpiringSoon(1);
      const testInstances = instances.filter(i => i.merchantId === testMerchantId);
      
      expect(testInstances.length).toBeGreaterThanOrEqual(1); // 1-day instance
    });
  });

  describe('Check Instance Expiry Job', () => {
    it('should run expiry check successfully', async () => {
      const result = await checkInstanceExpiry();
      
      expect(result).toBeDefined();
      expect(result.expiring7Days).toBeGreaterThanOrEqual(0);
      expect(result.expiring3Days).toBeGreaterThanOrEqual(0);
      expect(result.expiring1Day).toBeGreaterThanOrEqual(0);
      expect(result.expired).toBeGreaterThanOrEqual(0);
    });

    it('should mark expired instances', async () => {
      await checkInstanceExpiry();
      
      const instance = await db.getWhatsAppInstanceById(expiredId);
      expect(instance?.status).toBe('expired');
    });

    it('should not mark non-expired instances', async () => {
      const instance7Days = await db.getWhatsAppInstanceById(expiring7DaysId);
      const instance3Days = await db.getWhatsAppInstanceById(expiring3DaysId);
      const instance1Day = await db.getWhatsAppInstanceById(expiring1DayId);
      
      expect(instance7Days?.status).toBe('active');
      expect(instance3Days?.status).toBe('active');
      expect(instance1Day?.status).toBe('active');
    });
  });

  describe('Edge Cases', () => {
    it('should handle instances without expiry date', async () => {
      const instance = await db.createWhatsAppInstance({
        merchantId: testMerchantId,
        instanceId: 'TEST_NO_EXPIRY',
        token: 'token-no-expiry',
        apiUrl: 'https://api.green-api.com',
        phoneNumber: null,
        webhookUrl: null,
        status: 'active',
        isPrimary: false,
        lastSyncAt: null,
        connectedAt: null,
        expiresAt: null,
        metadata: null,
      });

      const { expiring7Days, expiring3Days, expiring1Day, expired } = await db.getExpiringWhatsAppInstances();
      
      const noExpiryInstance = [...expiring7Days, ...expiring3Days, ...expiring1Day, ...expired]
        .find(i => i.id === instance?.id);
      
      expect(noExpiryInstance).toBeUndefined();
    });

    it('should handle merchant with no instances', async () => {
      const newMerchant = await db.createMerchant({
        userId: 999995,
        businessName: 'No Instances Store',
        businessType: 'retail',
        phoneNumber: '+966500000095',
        whatsappConnected: false,
        whatsappInstanceId: null,
        whatsappToken: null,
      });

      const instances = await db.getInstancesExpiringSoon(7);
      const merchantInstances = instances.filter(i => i.merchantId === newMerchant.id);
      
      expect(merchantInstances.length).toBe(0);
    });
  });
});
