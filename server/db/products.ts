/**
 * Product Management Database Functions
 * Extracted from db.ts for better maintainability
 */
import { eq, and, desc } from "drizzle-orm";
import {
    products,
    Product,
    InsertProduct
} from "../../drizzle/schema";

// Import getDb directly from main db file
import { getDb } from "../db";

// ============================================
// Product Management
// ============================================

export async function createProduct(product: InsertProduct): Promise<Product | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(products).values(product);
    const insertedId = Number(result[0].insertId);

    return getProductById(insertedId);
}

export async function getProductById(id: number): Promise<Product | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
    return result.length > 0 ? result[0] : undefined;
}

export async function getProductsByMerchantId(merchantId: number): Promise<Product[]> {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(products).where(eq(products.merchantId, merchantId)).orderBy(desc(products.createdAt));
}

export async function getActiveProductsByMerchantId(merchantId: number): Promise<Product[]> {
    const db = await getDb();
    if (!db) return [];

    return db
        .select()
        .from(products)
        .where(and(eq(products.merchantId, merchantId), eq(products.isActive, true)))
        .orderBy(desc(products.createdAt));
}

export async function updateProduct(id: number, data: Partial<InsertProduct>): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.delete(products).where(eq(products.id, id));
}

export async function bulkCreateProducts(productList: InsertProduct[]): Promise<void> {
    const db = await getDb();
    if (!db) return;

    if (productList.length === 0) return;

    await db.insert(products).values(productList);
}
