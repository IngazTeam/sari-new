/**
 * Subscriptions Module
 * Handles subscription management and usage tracking
 * 
 * Thin canonical module over merchant_subscriptions.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./_shared";
import {
    merchantSubscriptions,
    MerchantSubscription,
    NewMerchantSubscription,
} from "../../drizzle/schema";

// ============================================
// Subscription Management
// ============================================

export async function createSubscription(subscription: NewMerchantSubscription): Promise<MerchantSubscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(merchantSubscriptions).values(subscription);
    const insertedId = Number(result[0].insertId);

    return getSubscriptionById(insertedId);
}

export async function getSubscriptionById(id: number): Promise<MerchantSubscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(merchantSubscriptions).where(eq(merchantSubscriptions.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getActiveSubscriptionByMerchantId(merchantId: number): Promise<MerchantSubscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db
        .select()
        .from(merchantSubscriptions)
        .where(and(
            eq(merchantSubscriptions.merchantId, merchantId),
            sql`${merchantSubscriptions.status} IN ('active', 'trial')`,
        ))
        .limit(1);

    return result.length > 0 ? result[0] : undefined;
}

export async function updateSubscription(id: number, data: Partial<NewMerchantSubscription>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(merchantSubscriptions).set(data).where(eq(merchantSubscriptions.id, id));
}

export async function incrementSubscriptionUsage(
    subscriptionId: number,
    conversationIncrement: number = 0,
    voiceMessageIncrement: number = 0
): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db
        .update(merchantSubscriptions)
        .set({
            conversationsUsed: sql`${merchantSubscriptions.conversationsUsed} + ${conversationIncrement}`,
            voiceMessagesUsed: sql`${merchantSubscriptions.voiceMessagesUsed} + ${voiceMessageIncrement}`,
        })
        .where(eq(merchantSubscriptions.id, subscriptionId));
}
