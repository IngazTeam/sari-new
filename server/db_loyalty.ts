import { getDb } from "./db";
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
} from "../drizzle/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

// ==================== Loyalty Settings ====================

export async function getLoyaltySettings(merchantId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(loyaltySettings)
    .where(eq(loyaltySettings.merchantId, merchantId))
    .limit(1);
  return result[0] || null;
}

export async function createLoyaltySettings(data: InsertLoyaltySettings) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltySettings).values(data);
  return result[0];
}

export async function updateLoyaltySettings(merchantId: number, data: Partial<InsertLoyaltySettings>) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(loyaltySettings)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(loyaltySettings.merchantId, merchantId));
  return getLoyaltySettings(merchantId);
}

export async function getOrCreateLoyaltySettings(merchantId: number) {
  const existing = await getLoyaltySettings(merchantId);
  if (existing) return existing;

  // إنشاء إعدادات افتراضية
  await createLoyaltySettings({
    merchantId,
    isEnabled: 1,
    pointsPerCurrency: 1,
    currencyPerPoint: 10,
    enableReferralBonus: 1,
    referralBonusPoints: 50,
    enableReviewBonus: 1,
    reviewBonusPoints: 10,
    enableBirthdayBonus: 0,
    birthdayBonusPoints: 20,
    pointsExpiryDays: 365,
  });

  // إنشاء المستويات الافتراضية
  await createLoyaltyTier({
    merchantId,
    name: "Bronze",
    nameAr: "برونزي",
    minPoints: 0,
    discountPercentage: 5,
    freeShipping: 0,
    priority: 1,
    color: "#CD7F32",
    icon: "🥉",
  });

  await createLoyaltyTier({
    merchantId,
    name: "Silver",
    nameAr: "فضي",
    minPoints: 500,
    discountPercentage: 10,
    freeShipping: 1,
    priority: 2,
    color: "#C0C0C0",
    icon: "🥈",
  });

  await createLoyaltyTier({
    merchantId,
    name: "Gold",
    nameAr: "ذهبي",
    minPoints: 1500,
    discountPercentage: 15,
    freeShipping: 1,
    priority: 3,
    color: "#FFD700",
    icon: "🥇",
  });

  return getLoyaltySettings(merchantId);
}

// ==================== Loyalty Tiers ====================

export async function getLoyaltyTiers(merchantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyTiers)
    .where(eq(loyaltyTiers.merchantId, merchantId))
    .orderBy(loyaltyTiers.minPoints);
}

export async function getLoyaltyTierById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(loyaltyTiers)
    .where(eq(loyaltyTiers.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createLoyaltyTier(data: InsertLoyaltyTier) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltyTiers).values(data);
  return result[0];
}

export async function updateLoyaltyTier(id: number, data: Partial<InsertLoyaltyTier>) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(loyaltyTiers)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(loyaltyTiers.id, id));
  return getLoyaltyTierById(id);
}

export async function deleteLoyaltyTier(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(loyaltyTiers).where(eq(loyaltyTiers.id, id));
}

export async function calculateCustomerTier(merchantId: number, lifetimePoints: number) {
  const tiers = await getLoyaltyTiers(merchantId);
  
  const sortedTiers = tiers.sort((a, b) => b.minPoints - a.minPoints);
  
  for (const tier of sortedTiers) {
    if (lifetimePoints >= tier.minPoints) {
      return tier;
    }
  }
  
  return sortedTiers[sortedTiers.length - 1] || null;
}

// ==================== Loyalty Points ====================

export async function getCustomerPoints(merchantId: number, customerPhone: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(loyaltyPoints)
    .where(
      and(
        eq(loyaltyPoints.merchantId, merchantId),
        eq(loyaltyPoints.customerPhone, customerPhone)
      )
    )
    .limit(1);
  return result[0] || null;
}

export async function createCustomerPoints(data: InsertLoyaltyPoints) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltyPoints).values(data);
  return result[0];
}

export async function updateCustomerPoints(
  merchantId: number,
  customerPhone: string,
  data: Partial<InsertLoyaltyPoints>
) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(loyaltyPoints)
    .set({ ...data, updatedAt: new Date().toISOString() })
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
  const existing = await getCustomerPoints(merchantId, customerPhone);
  if (existing) return existing;

  await createCustomerPoints({
    merchantId,
    customerPhone,
    customerName: customerName || null,
    totalPoints: 0,
    lifetimePoints: 0,
  });

  return getCustomerPoints(merchantId, customerPhone);
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
  let customerPoints = await getCustomerPoints(merchantId, customerPhone);
  if (!customerPoints) {
    customerPoints = await initializeCustomerPoints(merchantId, customerPhone);
  }

  const balanceBefore = customerPoints!.totalPoints;
  const balanceAfter = balanceBefore + points;
  const newLifetimePoints = customerPoints!.lifetimePoints + points;

  const newTier = await calculateCustomerTier(merchantId, newLifetimePoints);

  await updateCustomerPoints(merchantId, customerPhone, {
    totalPoints: balanceAfter,
    lifetimePoints: newLifetimePoints,
    currentTierId: newTier?.id || null,
    lastPointsEarnedAt: new Date().toISOString(),
  });

  const settings = await getLoyaltySettings(merchantId);
  const expiresAt = settings?.pointsExpiryDays
    ? new Date(Date.now() + settings.pointsExpiryDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await createLoyaltyTransaction({
    merchantId,
    customerPhone,
    type: "earn",
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
    tierUpgraded: newTier?.id !== customerPoints!.currentTierId,
  };
}

export async function deductPointsFromCustomer(
  merchantId: number,
  customerPhone: string,
  points: number,
  reason: string,
  reasonAr: string,
  redemptionId?: number
) {
  const customerPoints = await getCustomerPoints(merchantId, customerPhone);
  if (!customerPoints) {
    throw new Error("Customer points not found");
  }

  if (customerPoints.totalPoints < points) {
    throw new Error("Insufficient points");
  }

  const balanceBefore = customerPoints.totalPoints;
  const balanceAfter = balanceBefore - points;

  await updateCustomerPoints(merchantId, customerPhone, {
    totalPoints: balanceAfter,
    lastPointsRedeemedAt: new Date().toISOString(),
  });

  await createLoyaltyTransaction({
    merchantId,
    customerPhone,
    type: "redeem",
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
}

export async function getAllCustomersPoints(merchantId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyPoints)
    .where(eq(loyaltyPoints.merchantId, merchantId))
    .orderBy(desc(loyaltyPoints.lifetimePoints))
    .limit(limit)
    .offset(offset);
}

// ==================== Loyalty Transactions ====================

export async function createLoyaltyTransaction(data: InsertLoyaltyTransaction) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltyTransactions).values(data);
  return result[0];
}

export async function getCustomerTransactions(
  merchantId: number,
  customerPhone: string,
  limit = 50,
  offset = 0
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyTransactions)
    .where(
      and(
        eq(loyaltyTransactions.merchantId, merchantId),
        eq(loyaltyTransactions.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllTransactions(merchantId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.merchantId, merchantId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(limit)
    .offset(offset);
}

// ==================== Loyalty Rewards ====================

export async function getLoyaltyRewards(merchantId: number, activeOnly = false) {
  const db = await getDb();
  if (!db) return [];
  let query = db
    .select()
    .from(loyaltyRewards)
    .where(eq(loyaltyRewards.merchantId, merchantId));

  if (activeOnly) {
    query = query.where(eq(loyaltyRewards.isActive, 1)) as any;
  }

  return query.orderBy(loyaltyRewards.pointsCost);
}

export async function getLoyaltyRewardById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(loyaltyRewards)
    .where(eq(loyaltyRewards.id, id))
    .limit(1);
  return result[0] || null;
}

export async function createLoyaltyReward(data: InsertLoyaltyReward) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltyRewards).values(data);
  return result[0];
}

export async function updateLoyaltyReward(id: number, data: Partial<InsertLoyaltyReward>) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(loyaltyRewards)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(loyaltyRewards.id, id));
  return getLoyaltyRewardById(id);
}

export async function deleteLoyaltyReward(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(loyaltyRewards).where(eq(loyaltyRewards.id, id));
}

export async function incrementRewardRedemption(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(loyaltyRewards)
    .set({
      currentRedemptions: sql`${loyaltyRewards.currentRedemptions} + 1`,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(loyaltyRewards.id, id));
}

// ==================== Loyalty Redemptions ====================

export async function createLoyaltyRedemption(data: InsertLoyaltyRedemption) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(loyaltyRedemptions).values(data);
  return result[0];
}

export async function getLoyaltyRedemptionById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(loyaltyRedemptions)
    .where(eq(loyaltyRedemptions.id, id))
    .limit(1);
  return result[0] || null;
}

export async function updateLoyaltyRedemption(id: number, data: Partial<InsertLoyaltyRedemption>) {
  const db = await getDb();
  if (!db) return null;
  await db
    .update(loyaltyRedemptions)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(loyaltyRedemptions.id, id));
  return getLoyaltyRedemptionById(id);
}

export async function getCustomerRedemptions(
  merchantId: number,
  customerPhone: string,
  limit = 50,
  offset = 0
) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyRedemptions)
    .where(
      and(
        eq(loyaltyRedemptions.merchantId, merchantId),
        eq(loyaltyRedemptions.customerPhone, customerPhone)
      )
    )
    .orderBy(desc(loyaltyRedemptions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllRedemptions(merchantId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(loyaltyRedemptions)
    .where(eq(loyaltyRedemptions.merchantId, merchantId))
    .orderBy(desc(loyaltyRedemptions.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function redeemReward(
  merchantId: number,
  customerPhone: string,
  customerName: string,
  rewardId: number
) {
  const reward = await getLoyaltyRewardById(rewardId);
  if (!reward) {
    throw new Error("Reward not found");
  }

  if (!reward.isActive) {
    throw new Error("Reward is not active");
  }

  if (reward.maxRedemptions && reward.currentRedemptions >= reward.maxRedemptions) {
    throw new Error("Reward redemption limit reached");
  }

  const now = new Date();
  if (reward.validFrom && new Date(reward.validFrom) > now) {
    throw new Error("Reward is not yet valid");
  }
  if (reward.validUntil && new Date(reward.validUntil) < now) {
    throw new Error("Reward has expired");
  }

  const customerPoints = await getCustomerPoints(merchantId, customerPhone);
  if (!customerPoints || customerPoints.totalPoints < reward.pointsCost) {
    throw new Error("Insufficient points");
  }

  await deductPointsFromCustomer(
    merchantId,
    customerPhone,
    reward.pointsCost,
    `Redeemed: ${reward.title}`,
    `استبدال: ${reward.titleAr}`
  );

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const redemption = await createLoyaltyRedemption({
    merchantId,
    customerPhone,
    customerName,
    rewardId,
    pointsSpent: reward.pointsCost,
    status: "approved",
    expiresAt,
  });

  await incrementRewardRedemption(rewardId);

  return redemption;
}

// ==================== Statistics ====================

export async function getLoyaltyStats(merchantId: number) {
  const db = await getDb();
  if (!db) return {
    totalCustomers: 0,
    totalPointsDistributed: 0,
    totalPointsRedeemed: 0,
    totalRedemptions: 0,
    tierDistribution: [],
  };
  
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
        eq(loyaltyTransactions.type, "redeem")
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
