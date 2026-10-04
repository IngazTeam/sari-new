import { z } from 'zod';
import {
  loyaltyId,
  loyaltyPhone,
  loyaltySettingsInput,
  loyaltyTierInput,
  loyaltyRewardInput,
  loyaltyPointsAmount,
} from './loyalty-input';
const revision = z.string().regex(/^[a-f0-9]{64}$/),
  date = z.string().datetime().nullable(),
  count = z.number().int().nonnegative().safe();
export const loyaltyWorkspaceSelection = z
  .object({
    view: z.enum(['customers', 'settings', 'tiers', 'rewards']),
    search: z.string().trim().max(100).default(''),
    offset: z.number().int().min(0).max(1000000).default(0),
    customerPhone: loyaltyPhone.optional(),
    historyOffset: z.number().int().min(0).max(1000000).default(0),
  })
  .strict();
export type LoyaltySelection = z.infer<typeof loyaltyWorkspaceSelection>;
export const loyaltyTierView = loyaltyTierInput
  .extend({ id: loyaltyId, revision, createdAt: date, updatedAt: date })
  .strict();
export const loyaltyRewardView = loyaltyRewardInput
  .extend({
    id: loyaltyId,
    revision,
    currentRedemptions: count,
    available: z.boolean(),
    redemptionRevision: revision.nullable(),
    createdAt: date,
    updatedAt: date,
  })
  .strict();
export const loyaltyCustomerView = z
  .object({
    id: loyaltyId,
    customerPhone: loyaltyPhone,
    customerName: z.string().max(255).nullable(),
    totalPoints: count,
    lifetimePoints: count,
    tierId: loyaltyId.nullable(),
    lastPointsEarnedAt: date,
    lastPointsRedeemedAt: date,
    revision,
  })
  .strict();
export const loyaltyTransactionView = z
  .object({
    id: loyaltyId,
    type: z.enum(['earn', 'redeem', 'expire', 'adjustment']),
    points: z.number().int().safe(),
    reason: z.string().max(255),
    reasonAr: z.string().max(255),
    balanceBefore: count,
    balanceAfter: count,
    orderId: loyaltyId.nullable(),
    rewardId: loyaltyId.nullable(),
    redemptionId: loyaltyId.nullable(),
    expiresAt: date,
    createdAt: date,
  })
  .strict();
export const loyaltyRedemptionView = z
  .object({
    id: loyaltyId,
    rewardId: loyaltyId,
    pointsSpent: count,
    status: z.enum(['pending', 'approved', 'used', 'cancelled', 'expired']),
    orderId: loyaltyId.nullable(),
    usedAt: date,
    expiresAt: date,
    notes: z.string().max(10000).nullable(),
    createdAt: date,
    revision,
  })
  .strict();
export const loyaltyWorkspaceSchema = z
  .object({
    actorId: loyaltyId,
    merchantId: loyaltyId,
    selection: loyaltyWorkspaceSelection,
    settings: loyaltySettingsInput.nullable(),
    settingsRevision: revision,
    tiers: z.array(loyaltyTierView).max(1000),
    customers: z.array(loyaltyCustomerView).max(25),
    rewards: z.array(loyaltyRewardView).max(25),
    total: count,
    hasMore: z.boolean(),
    stats: z
      .object({
        totalCustomers: count,
        totalPointsDistributed: count,
        totalPointsRedeemed: count,
        totalRedemptions: count,
      })
      .strict(),
    customer: loyaltyCustomerView.nullable(),
    customerRevision: revision,
    transactions: z.array(loyaltyTransactionView).max(25),
    redemptions: z.array(loyaltyRedemptionView).max(25),
    hasMoreTransactions: z.boolean(),
    hasMoreRedemptions: z.boolean(),
  })
  .strict();
export type LoyaltyWorkspace = z.infer<typeof loyaltyWorkspaceSchema>;
const reviewed = { reviewed: z.literal(true), requestId: z.string().uuid() };
const reason = z.string().trim().min(1).max(255);
export const loyaltyActionInput = z.discriminatedUnion('kind', [
  z
    .object({
      ...reviewed,
      kind: z.literal('settings'),
      expectedVersion: revision,
      values: loyaltySettingsInput,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('tier'),
      id: loyaltyId,
      expectedVersion: revision,
      values: loyaltyTierInput,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('createReward'),
      values: loyaltyRewardInput,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('reward'),
      id: loyaltyId,
      expectedVersion: revision,
      values: loyaltyRewardInput,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('deleteReward'),
      id: loyaltyId,
      expectedVersion: revision,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('points'),
      customerPhone: loyaltyPhone,
      mode: z.enum(['credit', 'debit']),
      points: loyaltyPointsAmount.refine(v => v > 0),
      reason,
      reasonAr: reason,
      expectedVersion: revision,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('redeem'),
      customerPhone: loyaltyPhone,
      id: loyaltyId,
      expectedVersion: revision,
    })
    .strict(),
  z
    .object({
      ...reviewed,
      kind: z.literal('redemption'),
      id: loyaltyId,
      expectedVersion: revision,
      status: z.enum(['pending', 'approved', 'used', 'cancelled', 'expired']),
      notes: z.string().max(10000),
      orderId: loyaltyId.nullable(),
    })
    .strict(),
]);
export type LoyaltyAction = z.infer<typeof loyaltyActionInput>;
export const loyaltyReceiptSchema = z
  .object({
    success: z.literal(true),
    actorId: loyaltyId,
    merchantId: loyaltyId,
    requestId: z.string().uuid(),
    kind: z.enum([
      'settings',
      'tier',
      'createReward',
      'reward',
      'deleteReward',
      'points',
      'redeem',
      'redemption',
    ]),
    targetId: loyaltyId.nullable(),
    customerPhone: loyaltyPhone.nullable(),
    newBalance: count.nullable(),
  })
  .strict();
export type LoyaltyReceipt = z.infer<typeof loyaltyReceiptSchema>;
