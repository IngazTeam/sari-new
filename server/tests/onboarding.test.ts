import { describe, it, expect, beforeAll } from 'vitest';
import * as db from '../db';

describe('Onboarding System', () => {
  let testMerchantId: number;

  beforeAll(async () => {
    // Create a test merchant
    const merchant = await db.createMerchant({
      userId: 999,
      businessName: 'Test Merchant for Onboarding',
      phone: '0512345678',
      status: 'pending',
    });
    
    if (merchant) {
      testMerchantId = merchant.id;
    }
  });

  it('should get onboarding status for a new merchant', async () => {
    const status = await db.getOnboardingStatus(testMerchantId);
    
    expect(status).toBeDefined();
    expect(status.completed).toBe(false);
    expect(status.currentStep).toBe(0);
    expect(status.completedAt).toBeNull();
  });

  it('should update onboarding step', async () => {
    await db.updateOnboardingStep(testMerchantId, 1);
    
    const status = await db.getOnboardingStatus(testMerchantId);
    expect(status.currentStep).toBe(1);
    expect(status.completed).toBe(false);
  });

  it('should update to step 2', async () => {
    await db.updateOnboardingStep(testMerchantId, 2);
    
    const status = await db.getOnboardingStatus(testMerchantId);
    expect(status.currentStep).toBe(2);
  });

  it('should update to step 3', async () => {
    await db.updateOnboardingStep(testMerchantId, 3);
    
    const status = await db.getOnboardingStatus(testMerchantId);
    expect(status.currentStep).toBe(3);
  });

  it('should complete onboarding', async () => {
    await db.completeOnboarding(testMerchantId);
    
    const status = await db.getOnboardingStatus(testMerchantId);
    expect(status.completed).toBe(true);
    expect(status.currentStep).toBe(4);
    expect(status.completedAt).toBeDefined();
  });

  it('should keep onboarding completed after completion', async () => {
    const status = await db.getOnboardingStatus(testMerchantId);
    
    expect(status.completed).toBe(true);
    expect(status.currentStep).toBe(4);
  });
});
