/**
 * Subscriptions Module
 * Handles subscription management and usage tracking
 * 
 * This is a standalone module - db.ts still has its own implementations.
 * This follows the "Parallel Coexistence" pattern for safe modularization.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./_shared";
import {
    subscriptions,
    Subscription,
    InsertSubscription,
} from "../../drizzle/schema";

// ============================================
// Subscription Management
// ============================================

export async function createSubscription(subscription: InsertSubscription): Promise<Subscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(subscriptions).values(subscription);
    const insertedId = Number(result[0].insertId);

    return getSubscriptionById(insertedId);
}

export async function getSubscriptionById(id: number): Promise<Subscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getActiveSubscriptionByMerchantId(merchantId: number): Promise<Subscription | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.merchantId, merchantId), eq(subscriptions.status, "active")))
        .limit(1);

    return result.length > 0 ? result[0] : undefined;
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

export async function incrementSubscriptionUsage(
    subscriptionId: number,
    conversationIncrement: number = 0,
    voiceMessageIncrement: number = 0
): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db
        .update(subscriptions)
        .set({
            conversationsUsed: sql`${subscriptions.conversationsUsed} + ${conversationIncrement}`,
            voiceMessagesUsed: sql`${subscriptions.voiceMessagesUsed} + ${voiceMessageIncrement}`,
        })
        .where(eq(subscriptions.id, subscriptionId));
}
