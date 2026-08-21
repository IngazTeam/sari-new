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
import { decryptSecret, encryptSecret } from "../security/secrets";

function decryptConnection(record: WhatsAppConnection | undefined): WhatsAppConnection | undefined {
    return record ? { ...record, apiToken: decryptSecret(record.apiToken) } : undefined;
}

// ============================================
// WhatsApp Connection Management
// ============================================

export async function createWhatsappConnection(
    connection: InsertWhatsAppConnection
): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(whatsappConnections).values({
        ...connection,
        apiToken: encryptSecret(connection.apiToken),
    });
    const insertedId = Number(result[0].insertId);

    return getWhatsappConnectionById(insertedId);
}

export async function getWhatsappConnectionById(id: number): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id)).limit(1);
    return decryptConnection(result[0]);
}

export async function getWhatsappConnectionByMerchantId(merchantId: number): Promise<WhatsAppConnection | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.merchantId, merchantId))
        .limit(1);

    return decryptConnection(result[0]);
}

export async function updateWhatsappConnection(id: number, data: Partial<InsertWhatsAppConnection>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(whatsappConnections).set({
        ...data,
        ...(data.apiToken !== undefined && { apiToken: encryptSecret(data.apiToken) }),
    }).where(eq(whatsappConnections.id, id));
}
