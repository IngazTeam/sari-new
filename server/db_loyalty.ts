import { TRPCError } from '@trpc/server';
import {
  loyaltyDatabase,
  loyaltyContext,
  withLoyaltyTransaction,
} from './loyalty/transaction';
import {
  loyaltyDefaults,
  loyaltyAdjustmentInput,
  loyaltyPhone,
  loyaltyId,
  validLoyaltyReward,
  rewardAvailable,
} from '../shared/loyalty-input';
function fail(message: string): never {
  throw new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: 'loyalty:' + message,
  });
}
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const sqlDate = (value: string) =>
  new Date(value).toISOString().slice(0, 19).replace('T', ' ');
function ack(result: any) {
  if (
    result?.affectedRows !== 1 ||
    !Number.isSafeInteger(Number(result.insertId)) ||
    Number(result.insertId) < 1
  )
    fail('write_unconfirmed');
  return result;
}
async function reference(
  table: 'orders' | 'products' | 'loyalty_rewards' | 'loyalty_redemptions',
  id: number | undefined | null,
  merchantId: number
) {
  if (id == null) return;
  loyaltyId.parse(id);
  const context = loyaltyContext();
  if (!context) fail('transaction_required');
  const column = table.startsWith('loyalty_') ? 'merchant_id' : 'merchantId';
  const [rows] = await context.tx.execute<any[]>(
    'SELECT id FROM ' + table + ' WHERE id=? AND ' + column + '=? FOR SHARE',
    [id, merchantId]
  );
  if (rows.length !== 1)
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'loyalty:reference_unavailable',
    });
}
async function atomic<T>(merchantId: number, work: () => Promise<T>) {
  return withLoyaltyTransaction(merchantId, work);
}

import {
  loyaltySettings,
  loyaltyTiers,
  loyaltyPoints,
  loyaltyTransactions,
  loyaltyRewards,
  loyaltyRedemptions,
  type InsertLoyaltySettings,
  type InsertLoyaltyTier,
  type InsertLoyaltyPoints,
  type InsertLoyaltyTransaction,
  type InsertLoyaltyReward,
  type InsertLoyaltyRedemption,
} from '../drizzle/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

// ==================== Loyalty Settings ====================

export async function getLoyaltySettings(merchantId: number) {
  const db = await loyaltyDatabase();
  const result = await db
    .select()
    .from(loyaltySettings)
    .where(eq(loyaltySettings.merchantId, merchantId))
    .limit(2);
  if (result.length > 1) fail('duplicate_record');
  return result[0] || null;
}

export async function createLoyaltySettings(data: InsertLoyaltySettings) {
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltySettings).values(data);
  return ack(result[0]);
}

export async function updateLoyaltySettings(
  merchantId: number,
  data: Partial<InsertLoyaltySettings>
) {
  return atomic(merchantId, async () => {
    await getOrCreateLoyaltySettings(merchantId);
    const db = await loyaltyDatabase();
    await db
      .update(loyaltySettings)
      .set({ ...data, updatedAt: nowSql() })
      .where(eq(loyaltySettings.merchantId, merchantId));
    return getLoyaltySettings(merchantId);
  });
}

export async function getOrCreateLoyaltySettings(merchantId: number) {
  return atomic(merchantId, async () => {
    const existing = await getLoyaltySettings(merchantId);
    if (existing) return existing;
    await createLoyaltySettings({ merchantId, ...loyaltyDefaults });
    const tiers = await getLoyaltyTiers(merchantId);
    if (!tiers.length)
      for (const tier of [
        {
          name: 'Bronze',
          nameAr: 'برونزي',
          minPoints: 0,
          discountPercentage: 5,
          freeShipping: 0,
          priority: 1,
          color: '#CD7F32',
          icon: '🥉',
        },
        {
          name: 'Silver',
          nameAr: 'فضي',
          minPoints: 500,
          discountPercentage: 10,
          freeShipping: 1,
          priority: 2,
          color: '#C0C0C0',
          icon: '🥈',
        },
        {
          name: 'Gold',
          nameAr: 'ذهبي',
          minPoints: 1500,
          discountPercentage: 15,
          freeShipping: 1,
          priority: 3,
          color: '#FFD700',
          icon: '🥇',
        },
      ])
        await createLoyaltyTier({ merchantId, ...tier });
    return (await getLoyaltySettings(merchantId))!;
  });
}

export const initializeLoyaltySettings = getOrCreateLoyaltySettings;

// ==================== Loyalty Tiers ====================

export async function getLoyaltyTiers(merchantId: number) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyTiers)
    .where(eq(loyaltyTiers.merchantId, merchantId))
    .orderBy(loyaltyTiers.minPoints);
}

export async function getLoyaltyTierById(
  id: number,
  merchantId = loyaltyContext()?.merchantId
) {
  const db = await loyaltyDatabase();
  const result = await db
    .select()
    .from(loyaltyTiers)
    .where(
      and(
        eq(loyaltyTiers.id, id),
        merchantId === undefined
          ? undefined
          : eq(loyaltyTiers.merchantId, merchantId)
      )
    )
    .limit(2);
  if (result.length > 1) fail('duplicate_record');
  return result[0] || null;
}

export async function createLoyaltyTier(data: InsertLoyaltyTier) {
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltyTiers).values(data);
  return ack(result[0]);
}

export async function updateLoyaltyTier(
  id: number,
  data: Partial<InsertLoyaltyTier>
) {
  const merchantId = loyaltyContext()?.merchantId;
  if (!merchantId) fail('transaction_required');
  const db = await loyaltyDatabase();
  await db
    .update(loyaltyTiers)
    .set({ ...data, updatedAt: nowSql() })
    .where(
      and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.merchantId, merchantId))
    );
  return getLoyaltyTierById(id);
}

export async function deleteLoyaltyTier(id: number) {
  const db = await loyaltyDatabase();
  await db.delete(loyaltyTiers).where(eq(loyaltyTiers.id, id));
}

export async function calculateCustomerTier(
  merchantId: number,
  lifetimePoints: number
) {
  const tiers = await getLoyaltyTiers(merchantId);

  const sortedTiers = tiers.sort((a, b) => b.minPoints - a.minPoints);

  for (const tier of sortedTiers) {
    if (lifetimePoints >= tier.minPoints) {
      return tier;
    }
  }

  return null;
}

// ==================== Loyalty Points ====================

export async function getCustomerPoints(
  merchantId: number,
  customerPhone: string
) {
  const db = await loyaltyDatabase();
  const result = await db
    .select()
    .from(loyaltyPoints)
    .where(
      and(
        eq(loyaltyPoints.merchantId, merchantId),
        eq(loyaltyPoints.customerPhone, customerPhone)
      )
    )
    .limit(2);
  if (result.length > 1) fail('duplicate_record');
  return result[0] || null;
}

export async function createCustomerPoints(data: InsertLoyaltyPoints) {
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltyPoints).values(data);
  return ack(result[0]);
}

export async function updateCustomerPoints(
  merchantId: number,
  customerPhone: string,
  data: Partial<InsertLoyaltyPoints>
) {
  const db = await loyaltyDatabase();
  await db
    .update(loyaltyPoints)
    .set({ ...data, updatedAt: nowSql() })
    .where(
      and(
        eq(loyaltyPoints.merchantId, merchantId),
        eq(loyaltyPoints.customerPhone, customerPhone)
      )
    );
  return getCustomerPoints(merchantId, customerPhone);
}

export async function initializeCustomerPoints(
  merchantId: number,
  customerPhone: string,
  customerName?: string
) {
  loyaltyPhone.parse(customerPhone);
  return atomic(merchantId, async () => {
    const existing = await getCustomerPoints(merchantId, customerPhone);
    if (existing) return existing;
    await createCustomerPoints({
      merchantId,
      customerPhone,
      customerName: customerName || null,
      totalPoints: 0,
      lifetimePoints: 0,
    });
    return (await getCustomerPoints(merchantId, customerPhone))!;
  });
}

export async function addPointsToCustomer(
  merchantId: number,
  customerPhone: string,
  points: number,
  reason: string,
  reasonAr: string,
  orderId?: number,
  rewardId?: number
) {
  return atomic(merchantId, async () => {
    loyaltyAdjustmentInput.parse({
      customerPhone,
      points,
      reason,
      reasonAr,
      orderId,
    });
    await reference('orders', orderId, merchantId);
    await reference('loyalty_rewards', rewardId, merchantId);
    if (orderId) {
      const [prior] = await loyaltyContext()!.tx.execute<any[]>(
        "SELECT customer_phone,points FROM loyalty_transactions WHERE merchant_id=? AND order_id=? AND type='earn' LIMIT 2",
        [merchantId, orderId]
      );
      if (prior.length) {
        if (
          prior.length !== 1 ||
          prior[0].customer_phone !== customerPhone ||
          prior[0].points !== points
        )
          fail('order_points_conflict');
        const existing = await getCustomerPoints(merchantId, customerPhone);
        if (!existing) fail('balance_missing');
        return {
          newBalance: existing.totalPoints,
          newTier: await calculateCustomerTier(
            merchantId,
            existing.lifetimePoints
          ),
          tierUpgraded: false,
          alreadyApplied: true,
        };
      }
    }
    let customerPoints = await getCustomerPoints(merchantId, customerPhone);
    if (!customerPoints) {
      customerPoints = await initializeCustomerPoints(
        merchantId,
        customerPhone
      );
    }

    const balanceBefore = customerPoints!.totalPoints;
    const balanceAfter = balanceBefore + points;
    const newLifetimePoints = customerPoints!.lifetimePoints + points;
    if (
      ![balanceBefore, customerPoints!.lifetimePoints].every(
        n => Number.isSafeInteger(n) && n >= 0
      ) ||
      Math.max(balanceAfter, newLifetimePoints) > 2147483647
    )
      fail('balance_limit');

    const newTier = await calculateCustomerTier(merchantId, newLifetimePoints);

    await updateCustomerPoints(merchantId, customerPhone, {
      totalPoints: balanceAfter,
      lifetimePoints: newLifetimePoints,
      currentTierId: newTier?.id || null,
      lastPointsEarnedAt: nowSql(),
    });

    const settings = await getLoyaltySettings(merchantId);
    const expiresAt = settings?.pointsExpiryDays
      ? sqlDate(
          new Date(
            Math.min(
              Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000,
              2147483646000
            )
          ).toISOString()
        )
      : null;

    await createLoyaltyTransaction({
      merchantId,
      customerPhone,
      type: 'earn',
      points,
      reason,
      reasonAr,
      orderId: orderId || null,
      rewardId: rewardId || null,
      balanceBefore,
      balanceAfter,
      expiresAt,
    });

    return {
      newBalance: balanceAfter,
      newTier,
      tierUpgraded: !!newTier && newTier.id !== customerPoints!.currentTierId,
      alreadyApplied: false,
    };
  });
}

export async function deductPointsFromCustomer(
  merchantId: number,
  customerPhone: string,
  points: number,
  reason: string,
  reasonAr: string,
  redemptionId?: number
) {
  return atomic(merchantId, async () => {
    loyaltyAdjustmentInput.parse({ customerPhone, points, reason, reasonAr });
    await reference('loyalty_redemptions', redemptionId, merchantId);
    const customerPoints = await getCustomerPoints(merchantId, customerPhone);
    if (!customerPoints) {
      fail('customer_missing');
    }

    if (
      !Number.isSafeInteger(customerPoints.totalPoints) ||
      customerPoints.totalPoints < points
    ) {
      fail('insufficient_points');
    }

    const balanceBefore = customerPoints.totalPoints;
    const balanceAfter = balanceBefore - points;

    await updateCustomerPoints(merchantId, customerPhone, {
      totalPoints: balanceAfter,
      lastPointsRedeemedAt: nowSql(),
    });

    await createLoyaltyTransaction({
      merchantId,
      customerPhone,
      type: 'redeem',
      points: -points,
      reason,
      reasonAr,
      redemptionId: redemptionId || null,
      balanceBefore,
      balanceAfter,
    });

    return {
      newBalance: balanceAfter,
    };
  });
}

export async function getAllCustomersPoints(
  merchantId: number,
  limit = 100,
  offset = 0
) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.merchantId, merchantId))
    .orderBy(desc(loyaltyPoints.lifetimePoints), desc(loyaltyPoints.id))
    .limit(limit)
    .offset(offset);
}

// ==================== Loyalty Transactions ====================

export async function createLoyaltyTransaction(data: InsertLoyaltyTransaction) {
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltyTransactions).values(data);
  return ack(result[0]);
}

export async function getCustomerTransactions(
  merchantId: number,
  customerPhone: string,
  limit = 50,
  offset = 0
) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyTransactions)
    .where(
      and(
        eq(loyaltyTransactions.merchantId, merchantId),
        eq(loyaltyTransactions.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(loyaltyTransactions.createdAt), desc(loyaltyTransactions.id))
    .limit(limit)
    .offset(offset);
}

export async function getAllTransactions(
  merchantId: number,
  limit = 100,
  offset = 0
) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.merchantId, merchantId))
    .orderBy(desc(loyaltyTransactions.createdAt), desc(loyaltyTransactions.id))
    .limit(limit)
    .offset(offset);
}

// ==================== Loyalty Rewards ====================

export async function getLoyaltyRewards(
  merchantId: number,
  activeOnly = false
) {
  const db = await loyaltyDatabase();
  const conditions = [eq(loyaltyRewards.merchantId, merchantId)];
  if (activeOnly) {
    conditions.push(eq(loyaltyRewards.isActive, 1 as any));
  }

  return db
    .select()
    .from(loyaltyRewards)
    .where(and(...conditions))
    .orderBy(loyaltyRewards.pointsCost);
}

export async function getLoyaltyRewardById(
  id: number,
  merchantId = loyaltyContext()?.merchantId
) {
  const db = await loyaltyDatabase();
  const result = await db
    .select()
    .from(loyaltyRewards)
    .where(
      and(
        eq(loyaltyRewards.id, id),
        merchantId === undefined
          ? undefined
          : eq(loyaltyRewards.merchantId, merchantId)
      )
    )
    .limit(2);
  if (result.length > 1) fail('duplicate_record');
  return result[0] || null;
}

export async function createLoyaltyReward(data: InsertLoyaltyReward) {
  const complete = validLoyaltyReward(data);
  await reference('products', complete.productId, data.merchantId);
  data = {
    ...data,
    ...complete,
    validFrom: complete.validFrom ? sqlDate(complete.validFrom) : null,
    validUntil: complete.validUntil ? sqlDate(complete.validUntil) : null,
  };
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltyRewards).values(data);
  return ack(result[0]);
}

export async function updateLoyaltyReward(
  id: number,
  data: Partial<InsertLoyaltyReward>
) {
  const merchantId = loyaltyContext()?.merchantId;
  if (!merchantId) fail('transaction_required');
  const existing = await getLoyaltyRewardById(id, merchantId);
  if (!existing) throw new TRPCError({ code: 'NOT_FOUND' });
  const complete = validLoyaltyReward({
    ...existing,
    validFrom: existing.validFrom
      ? new Date(existing.validFrom + 'Z').toISOString()
      : null,
    validUntil: existing.validUntil
      ? new Date(existing.validUntil + 'Z').toISOString()
      : null,
    ...data,
  });
  if (
    complete.maxRedemptions &&
    complete.maxRedemptions < existing.currentRedemptions
  )
    fail('redemption_limit');
  await reference('products', complete.productId, merchantId);
  data = {
    ...complete,
    validFrom: complete.validFrom ? sqlDate(complete.validFrom) : null,
    validUntil: complete.validUntil ? sqlDate(complete.validUntil) : null,
  };
  const db = await loyaltyDatabase();
  await db
    .update(loyaltyRewards)
    .set({ ...data, updatedAt: nowSql() })
    .where(
      and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.merchantId, merchantId))
    );
  return getLoyaltyRewardById(id);
}

export async function deleteLoyaltyReward(id: number) {
  const merchantId = loyaltyContext()?.merchantId;
  if (!merchantId) fail('transaction_required');
  await reference('loyalty_rewards', id, merchantId);
  const [history] = await loyaltyContext()!.tx.execute<any[]>(
    'SELECT id FROM loyalty_redemptions WHERE reward_id=? LIMIT 1',
    [id]
  );
  const [transactions] = await loyaltyContext()!.tx.execute<any[]>(
    'SELECT id FROM loyalty_transactions WHERE reward_id=? LIMIT 1',
    [id]
  );
  if (history.length || transactions.length) fail('reward_has_history');
  const db = await loyaltyDatabase();
  await db
    .delete(loyaltyRewards)
    .where(
      and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.merchantId, merchantId))
    );
}

export async function incrementRewardRedemption(id: number) {
  const db = await loyaltyDatabase();
  await db
    .update(loyaltyRewards)
    .set({
      currentRedemptions: sql`${loyaltyRewards.currentRedemptions} + 1`,
      updatedAt: nowSql(),
    })
    .where(eq(loyaltyRewards.id, id));
}

// ==================== Loyalty Redemptions ====================

export async function createLoyaltyRedemption(data: InsertLoyaltyRedemption) {
  const db = await loyaltyDatabase();
  const result = await db.insert(loyaltyRedemptions).values(data);
  return ack(result[0]);
}

export async function getLoyaltyRedemptionById(
  id: number,
  merchantId = loyaltyContext()?.merchantId
) {
  const db = await loyaltyDatabase();
  const result = await db
    .select()
    .from(loyaltyRedemptions)
    .where(
      and(
        eq(loyaltyRedemptions.id, id),
        merchantId === undefined
          ? undefined
          : eq(loyaltyRedemptions.merchantId, merchantId)
      )
    )
    .limit(2);
  if (result.length > 1) fail('duplicate_record');
  return result[0] || null;
}

export async function updateLoyaltyRedemption(
  id: number,
  data: Partial<InsertLoyaltyRedemption>
) {
  const merchantId = loyaltyContext()?.merchantId;
  if (!merchantId) fail('transaction_required');
  const db = await loyaltyDatabase();
  await db
    .update(loyaltyRedemptions)
    .set({ ...data, updatedAt: nowSql() })
    .where(
      and(
        eq(loyaltyRedemptions.id, id),
        eq(loyaltyRedemptions.merchantId, merchantId)
      )
    );
  return getLoyaltyRedemptionById(id);
}

export async function getCustomerRedemptions(
  merchantId: number,
  customerPhone: string,
  limit = 50,
  offset = 0
) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyRedemptions)
    .where(
      and(
        eq(loyaltyRedemptions.merchantId, merchantId),
        eq(loyaltyRedemptions.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(loyaltyRedemptions.createdAt), desc(loyaltyRedemptions.id))
    .limit(limit)
    .offset(offset);
}

export async function getAllRedemptions(
  merchantId: number,
  limit = 100,
  offset = 0
) {
  const db = await loyaltyDatabase();
  return db
    .select()
    .from(loyaltyRedemptions)
    .where(eq(loyaltyRedemptions.merchantId, merchantId))
    .orderBy(desc(loyaltyRedemptions.createdAt), desc(loyaltyRedemptions.id))
    .limit(limit)
    .offset(offset);
}

export async function redeemReward(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  rewardId: number
) {
  return atomic(merchantId, async () => {
    loyaltyPhone.parse(customerPhone);
    loyaltyId.parse(rewardId);
    const reward = await getLoyaltyRewardById(rewardId, merchantId);
    if (!reward) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'loyalty:reward_unavailable',
      });
    }

    const settings = await getLoyaltySettings(merchantId);
    if (settings?.isEnabled !== 1) fail('program_disabled');
    if (!rewardAvailable(reward)) fail('reward_unavailable');
    const customerPoints = await getCustomerPoints(merchantId, customerPhone);
    if (!customerPoints || customerPoints.totalPoints < reward.pointsCost) {
      fail('insufficient_points');
    }

    const expiresAt = sqlDate(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );
    const redemption = await createLoyaltyRedemption({
      merchantId,
      customerPhone,
      customerName,
      rewardId,
      pointsSpent: reward.pointsCost,
      status: 'approved',
      expiresAt,
    });

    await deductPointsFromCustomer(
      merchantId,
      customerPhone,
      reward.pointsCost,
      `Redeemed: ${reward.title}`.slice(0, 255),
      `استبدال: ${reward.titleAr}`.slice(0, 255),
      Number(redemption.insertId)
    );

    await incrementRewardRedemption(rewardId);

    return redemption;
  });
}

// ==================== Statistics ====================

export async function getLoyaltyStats(merchantId: number) {
  const db = await loyaltyDatabase();

  const totalCustomersResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.merchantId, merchantId));
  const totalCustomers = totalCustomersResult[0]?.count || 0;

  const totalPointsResult = await db
    .select({ sum: sql<number>`sum(${loyaltyPoints.lifetimePoints})` })
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.merchantId, merchantId));
  const totalPointsDistributed = totalPointsResult[0]?.sum || 0;

  const redeemedPointsResult = await db
    .select({ sum: sql<number>`sum(abs(${loyaltyTransactions.points}))` })
    .from(loyaltyTransactions)
    .where(
      and(
        eq(loyaltyTransactions.merchantId, merchantId),
        eq(loyaltyTransactions.type, 'redeem')
      )
    );
  const totalPointsRedeemed = redeemedPointsResult[0]?.sum || 0;

  const totalRedemptionsResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(loyaltyRedemptions)
    .where(eq(loyaltyRedemptions.merchantId, merchantId));
  const totalRedemptions = totalRedemptionsResult[0]?.count || 0;

  const tierDistribution = await db
    .select({
      tierId: loyaltyPoints.currentTierId,
      count: sql<number>`count(*)`,
    })
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.merchantId, merchantId))
    .groupBy(loyaltyPoints.currentTierId);

  return {
    totalCustomers,
    totalPointsDistributed,
    totalPointsRedeemed,
    totalRedemptions,
    tierDistribution,
  };
}
