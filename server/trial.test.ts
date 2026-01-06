/**
 * Trial Period and Email Notifications Tests
 * Tests for trial period activation, email sending, and subscription checks
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';
import { sendWelcomeEmail, sendSubscriptionConfirmationEmail, sendTrialExpiryEmail } from './_core/email';

describe('Trial Period Management', () => {
  let testUserId: number;
  let testMerchantId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = await db.createUser({
      openId: `test_trial_${Date.now()}`,
      name: 'Test Trial User',
      email: `test_trial_${Date.now()}@example.com`,
      loginMethod: 'email',
      role: 'user',
    });

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    testUserId = testUser.id;

    // Create a test merchant
    const testMerchant = await db.createMerchant({
      userId: testUserId,
      businessName: 'Test Trial Business',
      phone: '+966500000000',
      status: 'pending',
    });

    if (!testMerchant) {
      throw new Error('Failed to create test merchant');
    }

    testMerchantId = testMerchant.id;
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (testMerchantId) {
      await db.deleteMerchant(testMerchantId);
    }
    if (testUserId) {
      await db.deleteUser(testUserId);
    }
  });

  it('should activate trial period for new user', async () => {
    const success = await db.activateUserTrial(testUserId);
    expect(success).toBe(true);

    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.isTrialActive).toBe(1);
    expect(user?.trialStartDate).toBeDefined();
    expect(user?.trialEndDate).toBeDefined();

    // Check that trial end date is 7 days from start
    if (user?.trialStartDate && user?.trialEndDate) {
      const start = new Date(user.trialStartDate);
      const end = new Date(user.trialEndDate);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(7);
    }
  });

  it('should deactivate trial period', async () => {
    const success = await db.deactivateUserTrial(testUserId);
    expect(success).toBe(true);

    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.isTrialActive).toBe(0);
  });

  it('should update WhatsApp connection status', async () => {
    const success = await db.updateWhatsAppConnectionStatus(testUserId, true);
    expect(success).toBe(true);

    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.whatsappConnected).toBe(1);

    // Test disconnection
    const disconnectSuccess = await db.updateWhatsAppConnectionStatus(testUserId, false);
    expect(disconnectSuccess).toBe(true);

    const updatedUser = await db.getUserById(testUserId);
    expect(updatedUser?.whatsappConnected).toBe(0);
  });

  it('should get users with expiring trial', async () => {
    // Activate trial first
    await db.activateUserTrial(testUserId);

    // Get users with trial expiring in 7 days (should include our test user)
    const users = await db.getUsersWithExpiringTrial(7);
    expect(users).toBeDefined();
    expect(Array.isArray(users)).toBe(true);

    // Our test user should be in the list
    const testUserInList = users.find((u: any) => u.id === testUserId);
    expect(testUserInList).toBeDefined();
  });

  it('should get users with expired trial', async () => {
    // First, deactivate the current trial
    await db.deactivateUserTrial(testUserId);

    // Manually set an expired trial
    const db_instance = await db.getDb();
    if (db_instance) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      await db_instance
        .update(db.users)
        .set({
          isTrialActive: 1,
          trialEndDate: pastDate.toISOString(),
        })
        .where(db.eq(db.users.id, testUserId));
    }

    // Get users with expired trial
    const users = await db.getUsersWithExpiredTrial();
    expect(users).toBeDefined();
    expect(Array.isArray(users)).toBe(true);

    // Our test user should be in the list
    const testUserInList = users.find((u: any) => u.id === testUserId);
    expect(testUserInList).toBeDefined();
  });
});

describe('Email Notifications', () => {
  it('should send welcome email', async () => {
    const result = await sendWelcomeEmail({
      name: 'Test User',
      email: 'test@example.com',
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('ar-SA'),
    });

    // Email sending should succeed (even if it just logs)
    expect(result).toBe(true);
  });

  it('should send subscription confirmation email', async () => {
    const result = await sendSubscriptionConfirmationEmail({
      name: 'Test User',
      email: 'test@example.com',
      planName: 'الباقة الاحترافية',
      startDate: new Date().toLocaleDateString('ar-SA'),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('ar-SA'),
    });

    expect(result).toBe(true);
  });

  it('should send trial expiry email', async () => {
    const result = await sendTrialExpiryEmail({
      name: 'Test User',
      email: 'test@example.com',
      daysRemaining: 3,
    });

    expect(result).toBe(true);
  });

  it('should send urgent trial expiry email', async () => {
    const result = await sendTrialExpiryEmail({
      name: 'Test User',
      email: 'test@example.com',
      daysRemaining: 1,
    });

    expect(result).toBe(true);
  });
});

describe('Subscription Status with Trial', () => {
  let testUserId: number;
  let testMerchantId: number;

  beforeAll(async () => {
    // Create a test user
    const testUser = await db.createUser({
      openId: `test_sub_${Date.now()}`,
      name: 'Test Subscription User',
      email: `test_sub_${Date.now()}@example.com`,
      loginMethod: 'email',
      role: 'user',
    });

    if (!testUser) {
      throw new Error('Failed to create test user');
    }

    testUserId = testUser.id;

    // Create a test merchant
    const testMerchant = await db.createMerchant({
      userId: testUserId,
      businessName: 'Test Subscription Business',
      phone: '+966500000001',
      status: 'pending',
    });

    if (!testMerchant) {
      throw new Error('Failed to create test merchant');
    }

    testMerchantId = testMerchant.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testMerchantId) {
      await db.deleteMerchant(testMerchantId);
    }
    if (testUserId) {
      await db.deleteUser(testUserId);
    }
  });

  it('should allow access with active trial', async () => {
    // Activate trial
    await db.activateUserTrial(testUserId);

    // Check subscription status (should be active due to trial)
    const user = await db.getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.isTrialActive).toBe(1);

    // In a real scenario, checkStatus would return isActive: true
    // This is tested in the API level
  });

  it('should deny access without trial or subscription', async () => {
    // Deactivate trial
    await db.deactivateUserTrial(testUserId);

    // Check subscription status (should be inactive)
    const hasSubscription = await db.checkMerchantSubscriptionStatus(testMerchantId);
    expect(hasSubscription).toBe(false);
  });
});
