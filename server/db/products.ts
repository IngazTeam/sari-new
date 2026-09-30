import { catalogVisibleSql } from '../integrations/catalog-scope';
import { zidCatalogVisibleSql } from '../integrations/zid-catalog-scope';
import { normalizeProductMoneyWrite } from '../../shared/product-money';
/**
 * Product Management Database Functions
 * Extracted from db.ts for better maintainability
 */
import { eq, and, desc, sql } from "drizzle-orm";
import {
    products,
    Product,
    InsertProduct,
} from "../../drizzle/schema";

// Import getDb directly from main db file
import { getDb } from "../db";

// ============================================
// Product Management
// ============================================

export async function createProduct(product: InsertProduct, inputUnit: 'major' | 'minor' = 'minor'): Promise<Product | undefined> {
    const db = await getDb();
    if (!db) return undefined;

    const result = await db.insert(products).values(normalizeProductMoneyWrite(product, inputUnit));
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

    return db.select().from(products).where(and(eq(products.merchantId, merchantId),sql.raw(catalogVisibleSql()))).orderBy(desc(products.createdAt));
}

export async function getActiveProductsByMerchantId(merchantId: number): Promise<Product[]> {
    const db = await getDb();
    if (!db) return [];

    return db
        .select()
        .from(products)
        // @ts-ignore
        .where(and(eq(products.merchantId, merchantId), eq(products.isActive, true),sql.raw(catalogVisibleSql())))
        .orderBy(desc(products.createdAt));
}

export async function updateProduct(id: number, data: Partial<InsertProduct>, inputUnit: 'major' | 'minor' = 'minor'): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.update(products).set(normalizeProductMoneyWrite(data, inputUnit)).where(eq(products.id, id));
}

export async function bulkCreateProducts(productList: InsertProduct[]): Promise<void> {
    const db = await getDb();
    if (!db) return;

    if (productList.length === 0) return;

    await db.insert(products).values(productList.map(product => normalizeProductMoneyWrite(product)));
}

export async function deleteAllProductsByMerchantId(merchantId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.delete(products).where(and(eq(products.merchantId, merchantId),sql.raw(zidCatalogVisibleSql())));
}
