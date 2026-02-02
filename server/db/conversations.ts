/**
 * Conversations Module
 * Handles conversation and message management for WhatsApp chats
 * 
 * This is a standalone module - db.ts still has its own implementations.
 * This follows the "Parallel Coexistence" pattern for safe modularization.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./_shared";
import {
    conversations,
    Conversation,
    InsertConversation,
    messages,
    Message,
    InsertMessage,
} from "../../drizzle/schema";

// ============================================
// Conversation Management
// ============================================

export async function createConversation(conversation: InsertConversation): Promise<Conversation | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    // Check if conversation already exists for this customer
    const existingConversation = await getConversationByMerchantAndPhone(
        conversation.merchantId,
        conversation.customerPhone
    );

    // If new customer, check subscription limits
    if (!existingConversation) {
        const { checkCustomerLimit } = await import('../helpers/subscriptionGuard');
        await checkCustomerLimit(conversation.merchantId, conversation.customerPhone);

        // Check and notify if approaching limit (80%)
        const { checkAndNotifyLimits } = await import('../helpers/notificationHelper');
        await checkAndNotifyLimits(conversation.merchantId);
    }

    const result = await db.insert(conversations).values(conversation);
    const insertedId = Number(result[0].insertId);

    return getConversationById(insertedId);
}

export async function getConversationById(id: number): Promise<Conversation | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getConversationByMerchantAndPhone(
    merchantId: number,
    customerPhone: string
): Promise<Conversation | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.merchantId, merchantId), eq(conversations.customerPhone, customerPhone)))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(1);

    return result.length > 0 ? result[0] : undefined;
}

export async function getConversationsByMerchantId(merchantId: number): Promise<Conversation[]> {
    const db = await getDb();
    if (!db) return [];

    return db
        .select()
        .from(conversations)
        .where(eq(conversations.merchantId, merchantId))
        .orderBy(desc(conversations.lastMessageAt));
}

export async function updateConversation(id: number, data: Partial<InsertConversation>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(conversations).set(data).where(eq(conversations.id, id));
}

// ============================================
// Message Management
// ============================================

export async function createMessage(message: InsertMessage): Promise<Message | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(messages).values(message);
    const insertedId = Number(result[0].insertId);

    // Update conversation's lastMessageAt
    const msg = await getMessageById(insertedId);
    if (msg) {
        const conversation = await getConversationById(msg.conversationId);
        if (conversation) {
            await updateConversation(conversation.id, { lastMessageAt: new Date() });
        }
    }

    return msg;
}

export async function getMessageById(id: number): Promise<Message | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getMessagesByConversationId(conversationId: number): Promise<Message[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
}

export async function updateMessage(id: number, data: Partial<InsertMessage>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(messages).set(data).where(eq(messages.id, id));
}
