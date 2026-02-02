/**
 * WhatsApp Module
 * Handles WhatsApp connection management
 * 
 * This is a standalone module - db.ts still has its own implementations.
 * This follows the "Parallel Coexistence" pattern for safe modularization.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./_shared";
import {
    whatsappConnections,
    WhatsAppConnection,
    InsertWhatsAppConnection,
} from "../../drizzle/schema";

// ============================================
// WhatsApp Connection Management
// ============================================

export async function createWhatsappConnection(
    connection: InsertWhatsAppConnection
): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(whatsappConnections).values(connection);
    const insertedId = Number(result[0].insertId);

    return getWhatsappConnectionById(insertedId);
}

export async function getWhatsappConnectionById(id: number): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getWhatsappConnectionByMerchantId(merchantId: number): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.merchantId, merchantId))
        .limit(1);

    return result.length > 0 ? result[0] : undefined;
}

export async function updateWhatsappConnection(id: number, data: Partial<InsertWhatsAppConnection>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(whatsappConnections).set(data).where(eq(whatsappConnections.id, id));
}
