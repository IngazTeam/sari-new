/**
 * Merchant Payment Settings Tests
 * 
 * Tests for merchant-specific Tap payment configuration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { closeDb } from './db/connection';

// Test merchant ID (use existing test merchant)
let testMerchantId: number;
let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;

describe.skipIf(!process.env.DATABASE_URL)('Merchant Payment Settings', () => {
  beforeAll(async () => { fixture = await createDisposableMerchant('tap-settings'); testMerchantId = fixture.merchantId; });
  describe('Database Functions', () => {
    it('should create payment settings for merchant', async () => {
      const settings = await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 1,
        tapPublicKey: 'pk_test_123456',
        tapSecretKey: 'sk_test_789012',
        tapTestMode: 1,
        autoSendPaymentLink: 1,
        defaultCurrency: 'SAR',
      });

      expect(settings).toBeDefined();
      expect(settings?.merchantId).toBe(testMerchantId);
      expect(settings?.tapEnabled).toBe(1);
      expect(settings?.tapPublicKey).toBe('pk_test_123456');
      expect(settings?.tapTestMode).toBe(1);
    });

    it('should get payment settings for merchant', async () => {
      const settings = await db.getMerchantPaymentSettings(testMerchantId);

      expect(settings).toBeDefined();
      expect(settings?.merchantId).toBe(testMerchantId);
    });

    it('should update existing payment settings', async () => {
      const updatedSettings = await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 0,
        autoSendPaymentLink: 0,
      });

      expect(updatedSettings).toBeDefined();
      expect(updatedSettings?.tapEnabled).toBe(0);
      expect(updatedSettings?.autoSendPaymentLink).toBe(0);
      // Original values should be preserved
      expect(updatedSettings?.tapPublicKey).toBe('pk_test_123456');
    });

    it('should update Tap keys for merchant', async () => {
      const settings = await db.updateMerchantTapKeys(
        testMerchantId,
        'pk_test_new_key',
        'sk_test_new_secret',
        false // live mode
      );

      expect(settings).toBeDefined();
      expect(settings?.tapPublicKey).toBe('pk_test_new_key');
      expect(settings?.tapSecretKey).toBe('sk_test_new_secret');
      expect(settings?.tapTestMode).toBe(0);
    });

    it('should set merchant payment as verified', async () => {
      await db.setMerchantPaymentVerified(testMerchantId, true);
      
      const settings = await db.getMerchantPaymentSettings(testMerchantId);
      expect(settings?.isVerified).toBe(1);
      expect(settings?.lastVerifiedAt).toBeDefined();
    });

    it('should check if merchant has valid Tap config', async () => {
      // First enable Tap
      await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 1,
        tapPublicKey: 'pk_test_valid',
        tapSecretKey: 'sk_test_valid',
      });

      const hasValidConfig = await db.hasMerchantValidTapConfig(testMerchantId);
      expect(hasValidConfig).toBe(true);
    });

    it('should return false for invalid Tap config', async () => {
      // Disable Tap
      await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 0,
      });

      const hasValidConfig = await db.hasMerchantValidTapConfig(testMerchantId);
      expect(hasValidConfig).toBe(false);
    });

    it('should return null for non-existent merchant', async () => {
      const settings = await db.getMerchantPaymentSettings(2147483647);
      expect(settings).toBeNull();
    });
  });

  describe('Payment Settings Validation', () => {
    it('should handle empty public key', async () => {
      const settings = await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 1,
        tapPublicKey: '',
        tapSecretKey: 'sk_test_valid',
      });

      const hasValidConfig = await db.hasMerchantValidTapConfig(testMerchantId);
      expect(hasValidConfig).toBe(false);
    });

    it('should handle empty secret key', async () => {
      const settings = await db.upsertMerchantPaymentSettings(testMerchantId, {
        tapEnabled: 1,
        tapPublicKey: 'pk_test_valid',
        tapSecretKey: '',
      });

      const hasValidConfig = await db.hasMerchantValidTapConfig(testMerchantId);
      expect(hasValidConfig).toBe(false);
    });
  });

  afterAll(async () => { if (fixture) await cleanupDisposableMerchants([fixture.userId]); await closeDb(); });
});
