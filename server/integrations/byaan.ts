/**
 * Byaan Integration — ربط بيان كمنصة تدريبية
 * 
 * نفس نمط SallaIntegration لكن للمحتوى التعليمي:
 * - الدورات → products
 * - المتدربين → customers
 * - التسجيلات → sari_conversions
 * 
 * Data Sync: بيان يدفع البيانات → ساري يخزن محلياً
 * Live API: ساري يطلب عمليات حية (تسجيل، دفع، نتائج)
 */

import * as db from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface ByaanCourse {
  id: string | number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  imageUrl?: string;
  instructorName?: string;
  duration?: string;
  isActive?: boolean;
  enrollmentCount?: number;
}

export interface ByaanTrainee {
  id: string | number;
  name: string;
  phone: string;
  email?: string;
  enrolledCourses?: string[];
}

export interface ByaanSettings {
  businessName?: string;
  website?: string;
  industry?: string;
  city?: string;
  description?: string;
}

export interface ByaanConversion {
  customerPhone: string;
  customerName: string;
  actionType: 'enrollment' | 'payment' | 'inquiry';
  productName: string;
  amount?: number;
  externalRef?: string;
  status?: 'pending' | 'completed' | 'cancelled';
}

// ═══════════════════════════════════════════════════════════════
// Settings Whitelist — ما يمكن لبيان تعديله
// ═══════════════════════════════════════════════════════════════

const ALLOWED_SETTINGS_FIELDS = [
  'businessName', 'website', 'industry', 'city', 'description'
] as const;

// ═══════════════════════════════════════════════════════════════
// Terminology — مسميات تتكيف حسب المنصة
// ═══════════════════════════════════════════════════════════════

export const PLATFORM_TERMINOLOGY: Record<string, Record<string, string>> = {
  none:  { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  salla: { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  zid:   { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  byaan: { products: 'دورات',  customers: 'متدربين', orders: 'تسجيلات',  category: 'تصنيف',  price: 'رسوم الدورة', item: 'دورة' },
};

// ═══════════════════════════════════════════════════════════════
// Byaan Connection Management (lazy table creation)
// ═══════════════════════════════════════════════════════════════

let _byaanTableCreated = false;

async function ensureByaanTables() {
  if (_byaanTableCreated) return;
  try {
    const dbConn = await db.getDb();
    if (!dbConn) return;

    // Byaan connections table (mirrors salla_connections pattern)
    await (dbConn as any).execute(`
      CREATE TABLE IF NOT EXISTS byaan_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        tenant_domain VARCHAR(255) NOT NULL,
        api_key_hash VARCHAR(64),
        sync_status ENUM('active','syncing','error','paused') DEFAULT 'active',
        last_sync_at TIMESTAMP NULL,
        sync_errors TEXT,
        permissions JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_merchant (merchant_id),
        INDEX idx_domain (tenant_domain)
      )
    `);

    // Sari conversions table — tracks enrollments/payments made through the bot
    await (dbConn as any).execute(`
      CREATE TABLE IF NOT EXISTS sari_conversions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        customer_phone VARCHAR(20),
        customer_name VARCHAR(255),
        action_type ENUM('enrollment','payment','inquiry') NOT NULL,
        product_name VARCHAR(255),
        amount DECIMAL(10,2),
        external_ref VARCHAR(100),
        source VARCHAR(50) DEFAULT 'whatsapp',
        status ENUM('pending','completed','cancelled') DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant (merchant_id, created_at DESC)
      )
    `);

    // Add external_id and external_source columns to customers (if not exists)
    try {
      await (dbConn as any).execute(`ALTER TABLE customers ADD COLUMN external_id VARCHAR(100) NULL`);
    } catch (e) { /* column already exists */ }
    try {
      await (dbConn as any).execute(`ALTER TABLE customers ADD COLUMN external_source VARCHAR(50) NULL`);
    } catch (e) { /* column already exists */ }
    try {
      await (dbConn as any).execute(`ALTER TABLE customers ADD UNIQUE INDEX idx_ext_source (merchant_id, external_source, external_id)`);
    } catch (e) { /* index already exists */ }

    // Add integration_source to merchants (if not exists)
    try {
      await (dbConn as any).execute(`ALTER TABLE merchants ADD COLUMN integration_source VARCHAR(20) DEFAULT 'none'`);
    } catch (e) { /* column already exists */ }

    _byaanTableCreated = true;
    console.log('[Byaan] ✅ Tables initialized');
  } catch (e) {
    console.error('[Byaan] Failed to create tables:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Connection CRUD
// ═══════════════════════════════════════════════════════════════

export async function getByaanConnection(merchantId: number) {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return null;

  const [rows] = await (dbConn as any).execute(
    `SELECT * FROM byaan_connections WHERE merchant_id = ? LIMIT 1`,
    [merchantId]
  );
  return (rows as any[])?.[0] || null;
}

export async function createByaanConnection(merchantId: number, tenantDomain: string, permissions?: Record<string, boolean>) {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return null;

  await (dbConn as any).execute(
    `INSERT INTO byaan_connections (merchant_id, tenant_domain, permissions) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE tenant_domain = VALUES(tenant_domain), permissions = VALUES(permissions), sync_status = 'active'`,
    [merchantId, tenantDomain, permissions ? JSON.stringify(permissions) : null]
  );

  // Set merchant integration_source = 'byaan'
  await (dbConn as any).execute(
    `UPDATE merchants SET integration_source = 'byaan' WHERE id = ?`,
    [merchantId]
  );

  return getByaanConnection(merchantId);
}

export async function deleteByaanConnection(merchantId: number) {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return;

  await (dbConn as any).execute(
    `DELETE FROM byaan_connections WHERE merchant_id = ?`,
    [merchantId]
  );

  // Reset integration_source
  await (dbConn as any).execute(
    `UPDATE merchants SET integration_source = 'none' WHERE id = ?`,
    [merchantId]
  );
}

export async function updateByaanSyncStatus(merchantId: number, status: string, errors?: string) {
  const dbConn = await db.getDb();
  if (!dbConn) return;

  await (dbConn as any).execute(
    `UPDATE byaan_connections SET sync_status = ?, last_sync_at = NOW(), sync_errors = ? WHERE merchant_id = ?`,
    [status, errors || null, merchantId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Trainee Sync — Smart 5-step mapping
// ═══════════════════════════════════════════════════════════════

export async function syncTrainees(merchantId: number, trainees: ByaanTrainee[]): Promise<{ created: number; updated: number; linked: number }> {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return { created: 0, updated: 0, linked: 0 };

  let created = 0, updated = 0, linked = 0;

  for (const trainee of trainees) {
    if (!trainee.name || !trainee.phone) continue;

    const externalId = String(trainee.id);
    const phone = String(trainee.phone).replace(/\D/g, '');

    // Step 1: Search by external_id + external_source + merchant_id
    const [existing] = await (dbConn as any).execute(
      `SELECT id FROM customers WHERE merchant_id = ? AND external_source = 'byaan' AND external_id = ? LIMIT 1`,
      [merchantId, externalId]
    );

    if ((existing as any[])?.length > 0) {
      // Step 2: Found → UPDATE
      await (dbConn as any).execute(
        `UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?`,
        [trainee.name.substring(0, 255), phone, trainee.email || null, (existing as any[])[0].id]
      );
      updated++;
      continue;
    }

    // Step 3: Search by phone number
    const [byPhone] = await (dbConn as any).execute(
      `SELECT id FROM customers WHERE merchant_id = ? AND phone = ? LIMIT 1`,
      [merchantId, phone]
    );

    if ((byPhone as any[])?.length > 0) {
      // Step 4: Phone exists → Link external_id
      await (dbConn as any).execute(
        `UPDATE customers SET external_id = ?, external_source = 'byaan', name = ? WHERE id = ?`,
        [externalId, trainee.name.substring(0, 255), (byPhone as any[])[0].id]
      );
      linked++;
      continue;
    }

    // Step 5: Brand new → INSERT
    try {
      await (dbConn as any).execute(
        `INSERT INTO customers (merchant_id, name, phone, email, external_id, external_source, created_at) VALUES (?, ?, ?, ?, ?, 'byaan', NOW())`,
        [merchantId, trainee.name.substring(0, 255), phone, trainee.email || null, externalId]
      );
      created++;
    } catch (e) {
      // Duplicate key — skip
    }
  }

  return { created, updated, linked };
}

// ═══════════════════════════════════════════════════════════════
// Settings Sync — Whitelist-guarded
// ═══════════════════════════════════════════════════════════════

export async function syncSettings(merchantId: number, settings: ByaanSettings): Promise<{ updated: string[] }> {
  const dbConn = await db.getDb();
  if (!dbConn) return { updated: [] };

  const updatedFields: string[] = [];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of ALLOWED_SETTINGS_FIELDS) {
    if (settings[field] !== undefined && settings[field] !== null) {
      const sanitized = String(settings[field]).substring(0, field === 'description' ? 2000 : 500);
      // Map field names to DB column names
      const colMap: Record<string, string> = {
        businessName: 'business_name',
        website: 'website_url',
        industry: 'platform_type',
        city: 'address',
        description: 'description',
      };
      const col = colMap[field] || field;
      updates.push(`${col} = ?`);
      values.push(sanitized);
      updatedFields.push(field);
    }
  }

  if (updates.length > 0) {
    values.push(merchantId);
    await (dbConn as any).execute(
      `UPDATE merchants SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  return { updated: updatedFields };
}

// ═══════════════════════════════════════════════════════════════
// Conversions — Track enrollments/payments via Sari
// ═══════════════════════════════════════════════════════════════

export async function recordConversion(merchantId: number, data: ByaanConversion): Promise<number> {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return 0;

  const [result] = await (dbConn as any).execute(
    `INSERT INTO sari_conversions (merchant_id, customer_phone, customer_name, action_type, product_name, amount, external_ref, source, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, 'whatsapp', ?)`,
    [
      merchantId,
      data.customerPhone,
      data.customerName?.substring(0, 255),
      data.actionType,
      data.productName?.substring(0, 255),
      data.amount || null,
      data.externalRef || null,
      data.status || 'completed',
    ]
  );

  return (result as any).insertId;
}

export async function getConversions(merchantId: number, limit: number = 20, actionType?: string) {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (actionType) {
    const [rows] = await (dbConn as any).execute(
      `SELECT * FROM sari_conversions WHERE merchant_id = ? AND action_type = ? ORDER BY created_at DESC LIMIT ?`,
      [merchantId, actionType, safeLimit]
    );
    return rows as any[];
  }

  const [rows] = await (dbConn as any).execute(
    `SELECT * FROM sari_conversions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [merchantId, safeLimit]
  );
  return rows as any[];
}

// ═══════════════════════════════════════════════════════════════
// Integration Source Helpers
// ═══════════════════════════════════════════════════════════════

export async function getIntegrationSource(merchantId: number): Promise<string> {
  await ensureByaanTables();
  const dbConn = await db.getDb();
  if (!dbConn) return 'none';

  try {
    const [rows] = await (dbConn as any).execute(
      `SELECT integration_source FROM merchants WHERE id = ? LIMIT 1`,
      [merchantId]
    );
    return (rows as any[])?.[0]?.integration_source || 'none';
  } catch (e) {
    return 'none';
  }
}

export function getTerminology(source: string): Record<string, string> {
  return PLATFORM_TERMINOLOGY[source] || PLATFORM_TERMINOLOGY.none;
}
