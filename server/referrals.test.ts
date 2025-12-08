import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Referrals & Rewards System', () => {
  let testMerchantId: number;
  let testReferralCodeId: number;
  let testReferralId: number;
  let testRewardId: number;

  beforeAll(async () => {
    // Create a test merchant
    const merchant = await db.createMerchant({
      userId: 1,
      businessName: 'Test Referral Business',
      phone: '+966500000001',
      status: 'active',
    });
    testMerchantId = merchant!.id;
  });

  it('should generate a unique referral code for merchant', async () => {
    const code = await db.generateReferralCode(
      testMerchantId,
      'Test Merchant',
      '+966500000001'
    );

    expect(code).toBeDefined();
    expect(code?.code).toMatch(/^REF\d{8}$/);
    expect(code?.merchantId).toBe(testMerchantId);
    expect(code?.isActive).toBe(true);
    expect(code?.referralCount).toBe(0);

    testReferralCodeId = code!.id;
  });

  it('should not generate duplicate code for same merchant', async () => {
    const code1 = await db.getReferralCodeByMerchantId(testMerchantId);
    const code2 = await db.generateReferralCode(
      testMerchantId,
      'Test Merchant',
      '+966500000001'
    );

    expect(code1?.id).toBe(code2?.id);
    expect(code1?.code).toBe(code2?.code);
  });

  it('should create a referral record', async () => {
    const referral = await db.createReferral({
      referralCodeId: testReferralCodeId,
      referredPhone: '+966500000002',
      referredName: 'Referred Friend',
      orderCompleted: false,
    });

    expect(referral).toBeDefined();
    expect(referral?.referralCodeId).toBe(testReferralCodeId);
    expect(referral?.referredPhone).toBe('+966500000002');
    expect(referral?.orderCompleted).toBe(false);

    testReferralId = referral!.id;
  });

  it('should increment referral count', async () => {
    const initialCode = await db.getReferralCodeById(testReferralCodeId);
    const initialCount = initialCode?.referralCount || 0;

    await db.incrementReferralCount(testReferralCodeId);

    const updatedCode = await db.getReferralCodeById(testReferralCodeId);
    expect(updatedCode?.referralCount).toBe(initialCount + 1);
  });

  it('should create a reward for successful referral', async () => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const reward = await db.createReward({
      merchantId: testMerchantId,
      referralId: testReferralId,
      rewardType: 'discount_10',
      status: 'pending',
      expiresAt,
      description: 'خصم 10% على الاشتراك القادم',
    });

    expect(reward).toBeDefined();
    expect(reward?.merchantId).toBe(testMerchantId);
    expect(reward?.referralId).toBe(testReferralId);
    expect(reward?.rewardType).toBe('discount_10');
    expect(reward?.status).toBe('pending');

    testRewardId = reward!.id;
  });

  it('should get all rewards for merchant', async () => {
    const rewards = await db.getRewardsByMerchantId(testMerchantId);

    expect(rewards).toBeDefined();
    expect(Array.isArray(rewards)).toBe(true);
    expect(rewards.length).toBeGreaterThan(0);
    expect(rewards[0].merchantId).toBe(testMerchantId);
  });

  it('should get pending rewards for merchant', async () => {
    const pendingRewards = await db.getPendingRewardsByMerchantId(testMerchantId);

    expect(pendingRewards).toBeDefined();
    expect(Array.isArray(pendingRewards)).toBe(true);
    expect(pendingRewards.every(r => r.status === 'pending')).toBe(true);
  });

  it('should claim a reward', async () => {
    await db.claimReward(testRewardId);

    const claimedReward = await db.getRewardById(testRewardId);
    expect(claimedReward?.status).toBe('claimed');
    expect(claimedReward?.claimedAt).toBeDefined();
  });

  it('should get referral statistics', async () => {
    const stats = await db.getReferralStats(testMerchantId);

    expect(stats).toBeDefined();
    expect(stats.totalReferrals).toBeGreaterThan(0);
    expect(stats.totalRewards).toBeGreaterThan(0);
    expect(stats.claimedRewards).toBeGreaterThan(0);
  });

  it('should get referrals with details', async () => {
    const referrals = await db.getReferralsWithDetails(testMerchantId);

    expect(referrals).toBeDefined();
    expect(Array.isArray(referrals)).toBe(true);
    expect(referrals.length).toBeGreaterThan(0);
  });

  it('should update referral status to completed', async () => {
    await db.updateReferralStatus(testReferralId, true);

    const updatedReferral = await db.getReferralByPhone(
      testReferralCodeId,
      '+966500000002'
    );
    expect(updatedReferral?.orderCompleted).toBe(true);
  });

  it('should get referral code by code string', async () => {
    const originalCode = await db.getReferralCodeById(testReferralCodeId);
    const foundCode = await db.getReferralCodeByCode(originalCode!.code);

    expect(foundCode).toBeDefined();
    expect(foundCode?.id).toBe(testReferralCodeId);
    expect(foundCode?.code).toBe(originalCode?.code);
  });
});
