/**
 * Product Management Database Functions
 * Extracted from db.ts for better maintainability
 */
import { eq, and, desc, lte, gt, sql } from "drizzle-orm";
import {
    products,
    Product,
    InsertProduct,
    productCategories,
    ProductCategory,
    InsertProductCategory,
    productOptions,
    ProductOption,
    InsertProductOption,
    productVariants,
    ProductVariant,
    InsertProductVariant,
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
        // @ts-ignore
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

export async function deleteAllProductsByMerchantId(merchantId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;

    await db.delete(products).where(eq(products.merchantId, merchantId));
}

// ============================================
// Product Categories
// ============================================

export async function getCategoriesByMerchantId(merchantId: number): Promise<ProductCategory[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(productCategories)
        .where(eq(productCategories.merchantId, merchantId))
        .orderBy(productCategories.sortOrder);
}

export async function createCategory(data: InsertProductCategory): Promise<ProductCategory | undefined> {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db.insert(productCategories).values(data);
    const id = Number(result[0].insertId);
    const rows = await db.select().from(productCategories).where(eq(productCategories.id, id)).limit(1);
    return rows[0];
}

export async function updateCategory(id: number, data: Partial<InsertProductCategory>): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.update(productCategories).set(data).where(eq(productCategories.id, id));
}

export async function deleteCategory(id: number): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.delete(productCategories).where(eq(productCategories.id, id));
}

// ============================================
// Product Options (e.g. Color, Size)
// ============================================

export async function getOptionsByProductId(productId: number): Promise<ProductOption[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(productOptions)
        .where(eq(productOptions.productId, productId))
        .orderBy(productOptions.sortOrder);
}

export async function createOption(data: InsertProductOption): Promise<ProductOption | undefined> {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db.insert(productOptions).values(data);
    const id = Number(result[0].insertId);
    const rows = await db.select().from(productOptions).where(eq(productOptions.id, id)).limit(1);
    return rows[0];
}

export async function updateOption(id: number, data: Partial<InsertProductOption>): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.update(productOptions).set(data).where(eq(productOptions.id, id));
}

export async function deleteOption(id: number): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.delete(productOptions).where(eq(productOptions.id, id));
}

// ============================================
// Product Variants
// ============================================

export async function getVariantsByProductId(productId: number): Promise<ProductVariant[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(productVariants)
        .where(eq(productVariants.productId, productId))
        .orderBy(productVariants.sortOrder);
}

export async function createVariant(data: InsertProductVariant): Promise<ProductVariant | undefined> {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db.insert(productVariants).values(data);
    const id = Number(result[0].insertId);
    const rows = await db.select().from(productVariants).where(eq(productVariants.id, id)).limit(1);
    return rows[0];
}

export async function updateVariant(id: number, data: Partial<InsertProductVariant>): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.update(productVariants).set(data).where(eq(productVariants.id, id));
}

export async function deleteVariant(id: number): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.delete(productVariants).where(eq(productVariants.id, id));
}

export async function bulkCreateVariants(variantList: InsertProductVariant[]): Promise<void> {
    const db = await getDb();
    if (!db) return;
    if (variantList.length === 0) return;
    await db.insert(productVariants).values(variantList);
}

export async function deleteVariantsByProductId(productId: number): Promise<void> {
    const db = await getDb();
    if (!db) return;
    await db.delete(productVariants).where(eq(productVariants.productId, productId));
}

// ============================================
// Low Stock Alerts
// ============================================

export async function getLowStockProducts(merchantId: number): Promise<Product[]> {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(products)
        .where(and(
            eq(products.merchantId, merchantId),
            eq(products.trackInventory, 1),
            // @ts-ignore
            eq(products.isActive, true),
            sql`${products.stock} <= ${products.lowStockAlert}`,
            gt(products.lowStockAlert, 0)
        ))
        .orderBy(products.stock);
}

export async function getLowStockVariants(merchantId: number): Promise<ProductVariant[]> {
    const db = await getDb();
    if (!db) return [];
    // Get variants where stock <= 5 (global threshold for variants)
    return db.select().from(productVariants)
        .where(and(
            eq(productVariants.merchantId, merchantId),
            eq(productVariants.isActive, 1),
            lte(productVariants.stock, 5)
        ))
        .orderBy(productVariants.stock);
}