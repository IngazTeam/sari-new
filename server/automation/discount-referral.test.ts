import { describe, it, expect, beforeAll } from 'vitest';
import { generateDiscountCode, createDiscountCode, validateDiscountCode } from './discount-system';
import { generateReferralCode, createReferralCodeForCustomer, trackReferral } from './referral-system';
import * as db from '../db';

describe('Discount & Referral System', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Create test merchant
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'Test Business',
      phone: '+966500000001',
      email: 'test@example.com',
    });
    testMerchantId = merchant!.id;
  });

  describe('Discount Code Generation', () => {
    it('should generate discount code with default prefix', () => {
      const code = generateDiscountCode();
      expect(code).toMatch(/^SARI[A-Z0-9]{6}$/);
    });

    it('should generate discount code with custom prefix', () => {
      const code = generateDiscountCode('SALE');
      expect(code).toMatch(/^SALE[A-Z0-9]{6}$/);
    });

    it('should generate unique codes', () => {
      const code1 = generateDiscountCode();
      const code2 = generateDiscountCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('Discount Code Creation', () => {
    it('should create percentage discount code', async () => {
      const result = await createDiscountCode({
        merchantId: testMerchantId,
        type: 'percentage',
        value: 10,
        usageLimit: 100,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code?.type).toBe('percentage');
      expect(result.code?.value).toBe(10);
    });

    it('should create fixed discount code', async () => {
      const result = await createDiscountCode({
        merchantId: testMerchantId,
        type: 'fixed',
        value: 50,
        minPurchase: 200,
        usageLimit: 50,
      });

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code?.type).toBe('fixed');
      expect(result.code?.value).toBe(50);
    });
  });

  describe('Discount Code Validation', () => {
    it('should validate valid discount code', async () => {
      const createResult = await createDiscountCode({
        merchantId: testMerchantId,
        code: 'TESTVALID10',
        type: 'percentage',
        value: 10,
        usageLimit: 100,
      });

      const result = await validateDiscountCode(
        testMerchantId,
        'TESTVALID10',
        1000
      );

      expect(result.valid).toBe(true);
      expect(result.discount).toBe(100); // 10% of 1000
      expect(result.finalAmount).toBe(900);
    });

    it('should reject invalid discount code', async () => {
      const result = await validateDiscountCode(
        testMerchantId,
        'INVALIDCODE',
        1000
      );

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Referral Code Generation', () => {
    it('should generate referral code from phone', () => {
      const code = generateReferralCode('+966501234567');
      expect(code).toMatch(/^REF4567[A-Z]{4}$/);
    });

    it('should generate unique codes for same phone', () => {
      const code1 = generateReferralCode('+966501234567');
      const code2 = generateReferralCode('+966501234567');
      // Codes should have same prefix but different random part
      expect(code1.substring(0, 7)).toBe(code2.substring(0, 7));
      expect(code1).not.toBe(code2);
    });
  });

  describe('Referral Code Creation', () => {
    it('should create referral code for customer', async () => {
      const result = await createReferralCodeForCustomer(
        testMerchantId,
        '+966500000010',
        'Test Customer'
      );

      expect(result.success).toBe(true);
      expect(result.code).toBeDefined();
      expect(result.code).toMatch(/^REF/);
    });

    it('should return existing code for same customer', async () => {
      const result1 = await createReferralCodeForCustomer(
        testMerchantId,
        '+966500000011',
        'Test Customer 2'
      );

      const result2 = await createReferralCodeForCustomer(
        testMerchantId,
        '+966500000011',
        'Test Customer 2'
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.code).toBe(result2.code);
    });
  });

  describe('Referral Tracking', () => {
    it('should track successful referral', async () => {
      // Create referral code
      const codeResult = await createReferralCodeForCustomer(
        testMerchantId,
        '+966500000020',
        'Referrer'
      );

      expect(codeResult.success).toBe(true);

      // Track referral
      const result = await trackReferral(
        testMerchantId,
        codeResult.code!,
        '+966500000021',
        'Referred Customer'
      );

      expect(result.success).toBe(true);
    });

    it('should reject self-referral', async () => {
      // Create referral code
      const codeResult = await createReferralCodeForCustomer(
        testMerchantId,
        '+966500000030',
        'Self Referrer'
      );

      // Try to use own code
      const result = await trackReferral(
        testMerchantId,
        codeResult.code!,
        '+966500000030',
        'Self Referrer'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('لا يمكنك استخدام كود الإحالة الخاص بك');
    });
  });
});
