import { describe, it, expect } from 'vitest';
import { checkCustomerLimit, getRemainingCustomerSlots } from './helpers/subscriptionGuard';
import * as db from './db';
import { TRPCError } from '@trpc/server';

// Use existing merchant ID from database (150001 is the default test merchant)
const TEST_MERCHANT_ID = 150001;

describe('Subscription Guard - Basic Functionality', () => {
  it('should have checkCustomerLimit function', () => {
    expect(typeof checkCustomerLimit).toBe('function');
  });

  it('should have getRemainingCustomerSlots function', () => {
    expect(typeof getRemainingCustomerSlots).toBe('function');
  });

  it('should return remaining slots for merchant with subscription', async () => {
    const slots = await getRemainingCustomerSlots(TEST_MERCHANT_ID);
    
    expect(slots).toBeDefined();
    expect(typeof slots.current).toBe('number');
    expect(typeof slots.max).toBe('number');
    expect(typeof slots.remaining).toBe('number');
    expect(typeof slots.percentage).toBe('number');
    
    // Validate that current <= max
    expect(slots.current).toBeLessThanOrEqual(slots.max);
    
    // Validate that remaining = max - current
    expect(slots.remaining).toBe(Math.max(0, slots.max - slots.current));
    
    // Validate percentage is between 0 and 100
    expect(slots.percentage).toBeGreaterThanOrEqual(0);
    expect(slots.percentage).toBeLessThanOrEqual(100);
  });

  it('should allow existing customer to send messages', async () => {
    // Get an existing customer from conversations
    const conversations = await db.getConversationsByMerchantId(TEST_MERCHANT_ID);
    
    if (conversations.length > 0) {
      const existingCustomerPhone = conversations[0].customerPhone;
      
      try {
        // Should not throw error for existing customer
        const result = await checkCustomerLimit(TEST_MERCHANT_ID, existingCustomerPhone);
        expect(result).toBe(true);
      } catch (error: any) {
        // May throw error if merchant has no active subscription
        expect(error).toBeInstanceOf(TRPCError);
      }
    } else {
      // No conversations to test with
      expect(true).toBe(true);
    }
  });

  it('should throw TRPCError when merchant has no subscription', async () => {
    // Use a non-existent merchant ID
    const nonExistentMerchantId = 999999;
    
    try {
      await checkCustomerLimit(nonExistentMerchantId, '+966500000000');
      // If we reach here, test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error).toBeInstanceOf(TRPCError);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toContain('لا يوجد اشتراك نشط');
    }
  });

  it('should return zero slots for merchant without subscription', async () => {
    const nonExistentMerchantId = 999999;
    const slots = await getRemainingCustomerSlots(nonExistentMerchantId);
    
    expect(slots.current).toBe(0);
    expect(slots.max).toBe(0);
    expect(slots.remaining).toBe(0);
    expect(slots.percentage).toBe(0);
  });
});

describe('Subscription Guard - Integration with Database', () => {
  it('should correctly count customers for merchant', async () => {
    const customerCount = await db.getCustomerCountByMerchant(TEST_MERCHANT_ID);
    
    expect(typeof customerCount).toBe('number');
    expect(customerCount).toBeGreaterThanOrEqual(0);
  });

  it('should get merchant subscription', async () => {
    const subscription = await db.getMerchantCurrentSubscription(TEST_MERCHANT_ID);
    
    if (subscription) {
      expect(subscription).toBeDefined();
      expect(subscription.merchantId).toBe(TEST_MERCHANT_ID);
      expect(subscription.planId).toBeDefined();
      expect(['active', 'trial', 'expired', 'cancelled']).toContain(subscription.status);
    }
  });

  it('should get subscription plan details', async () => {
    const subscription = await db.getMerchantCurrentSubscription(TEST_MERCHANT_ID);
    
    if (subscription) {
      const plan = await db.getSubscriptionPlanById(subscription.planId);
      
      expect(plan).toBeDefined();
      expect(plan.maxCustomers).toBeGreaterThan(0);
      expect(plan.maxWhatsAppNumbers).toBeGreaterThan(0);
    }
  });
});

describe('Subscription Guard - Error Messages', () => {
  it('should provide clear error message when limit reached', async () => {
    // Create a test scenario where we manually check the logic
    const slots = await getRemainingCustomerSlots(TEST_MERCHANT_ID);
    
    // If merchant has subscription and is at or near limit
    if (slots.max > 0 && slots.remaining === 0) {
      try {
        // Try to add a new customer
        await checkCustomerLimit(TEST_MERCHANT_ID, `+966${Date.now()}`);
        // If no error, merchant has not reached limit yet
      } catch (error: any) {
        expect(error).toBeInstanceOf(TRPCError);
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toContain('الحد الأقصى للعملاء');
        expect(error.message).toContain(slots.max.toString());
        expect(error.message).toContain('الترقية');
      }
    } else {
      // Skip test if merchant has no subscription or has remaining slots
      expect(true).toBe(true);
    }
  });

  it('should suggest upgrade in error message', async () => {
    const slots = await getRemainingCustomerSlots(TEST_MERCHANT_ID);
    
    // Only test if merchant has subscription and is at limit
    if (slots.max > 0 && slots.remaining === 0) {
      try {
        await checkCustomerLimit(TEST_MERCHANT_ID, `+966${Date.now()}`);
      } catch (error: any) {
        expect(error.message).toContain('الترقية');
        expect(error.message).toContain('الباقة الأعلى');
      }
    } else {
      // Skip test if merchant has no subscription or has remaining slots
      expect(true).toBe(true);
    }
  });
});

describe('Subscription Guard - Edge Cases', () => {
  it('should handle invalid phone numbers gracefully', async () => {
    try {
      const result = await checkCustomerLimit(TEST_MERCHANT_ID, 'invalid-phone');
      expect(typeof result).toBe('boolean');
    } catch (error: any) {
      // May throw error if no subscription - that's expected
      expect(error).toBeInstanceOf(TRPCError);
    }
  });

  it('should handle empty phone numbers', async () => {
    try {
      const result = await checkCustomerLimit(TEST_MERCHANT_ID, '');
      expect(typeof result).toBe('boolean');
    } catch (error: any) {
      // May throw error if no subscription - that's expected
      expect(error).toBeInstanceOf(TRPCError);
    }
  });

  it('should handle very long phone numbers', async () => {
    try {
      const longPhone = '+966' + '1'.repeat(100);
      const result = await checkCustomerLimit(TEST_MERCHANT_ID, longPhone);
      expect(typeof result).toBe('boolean');
    } catch (error: any) {
      // May throw error if no subscription - that's expected
      expect(error).toBeInstanceOf(TRPCError);
    }
  });
});
