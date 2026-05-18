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

import { getPool, getMerchantByUserId, getProductsByMerchantId } from '../db';
import crypto from 'crypto';

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

// PEN-R2-03: Removed 'industry' — mapping was removed in PEN-07, no corresponding DB column
const ALLOWED_SETTINGS_FIELDS = [
  'businessName', 'website', 'city', 'description'
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
    const dbConn = await getPool();
    if (!dbConn) return;

    // Byaan connections table (mirrors salla_connections pattern)
    await (dbConn as any).execute(`
      CREATE TABLE IF NOT EXISTS byaan_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        tenant_domain VARCHAR(255) NOT NULL,
        api_base_url VARCHAR(500) DEFAULT NULL,
        webhook_secret VARCHAR(128) DEFAULT NULL,
        api_key_hash VARCHAR(64),
        sync_status ENUM('active','syncing','error','paused') DEFAULT 'active',
        last_sync_at TIMESTAMP NULL,
        sync_errors TEXT,
        permissions JSON DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_merchant (merchant_id),
        INDEX idx_domain (tenant_domain)
      )
    `);

    // Add columns if table already existed before this update
    try { await (dbConn as any).execute(`ALTER TABLE byaan_connections ADD COLUMN api_base_url VARCHAR(500) DEFAULT NULL AFTER tenant_domain`); } catch(e) {}
    try { await (dbConn as any).execute(`ALTER TABLE byaan_connections ADD COLUMN webhook_secret VARCHAR(128) DEFAULT NULL AFTER api_base_url`); } catch(e) {}
    try { await (dbConn as any).execute(`ALTER TABLE byaan_connections ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER permissions`); } catch(e) {}

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
// Byaan Webhook — Notify Byaan of subscription changes
// ═══════════════════════════════════════════════════════════════

/**
 * Send a signed webhook to Byaan to activate/deactivate sari feature
 * This eliminates the need for Byaan SuperAdmin to manually enable the feature
 * 
 * Events:
 * - subscription.activated → Byaan adds sari_starter to tenant_services
 * - subscription.deactivated → Byaan removes sari_* from tenant_services
 */
async function notifyByaanPlatform(
  tenantDomain: string,
  event: 'subscription.activated' | 'subscription.deactivated',
  merchantId: number,
  plan: string = 'sari_starter'
): Promise<void> {
  try {
    // Build webhook URL from tenant domain
    const webhookUrl = `https://${tenantDomain}/api/sari/webhook`;

    // PEN-SYNC-01: Validate hostname is not internal
    if (
      tenantDomain === 'localhost' || tenantDomain.startsWith('127.') ||
      tenantDomain.startsWith('10.') || tenantDomain.startsWith('192.168.') ||
      tenantDomain.startsWith('169.254.') || tenantDomain.endsWith('.local')
    ) {
      console.warn(`[Byaan Webhook] SSRF blocked: ${tenantDomain}`);
      return;
    }
    
    const body = JSON.stringify({
      event,
      merchant_id: String(merchantId),
      data: {
        tenant_domain: tenantDomain,
        plan,
        activated_at: new Date().toISOString(),
      },
    });

    // Sign with platform key (same key Byaan verifies against)
    const platformKey = process.env.BYAAN_PLATFORM_KEY || '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (platformKey) {
      const signature = crypto.createHmac('sha256', platformKey).update(body).digest('hex');
      headers['X-Sari-Signature'] = signature;
    }

    const axios = (await import('axios')).default;
    const response = await axios.post(webhookUrl, body, {
      headers,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on non-2xx
    });

    console.log(`[Byaan Webhook] ${event} → ${tenantDomain} (${response.status})`);
  } catch (e: any) {
    // Non-blocking — connection still works even if webhook fails
    console.warn(`[Byaan Webhook] ${event} failed for ${tenantDomain}:`, e?.message || e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Connection CRUD
// ═══════════════════════════════════════════════════════════════

export async function getByaanConnection(merchantId: number) {
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return null;

  const [rows] = await (dbConn as any).execute(
    `SELECT * FROM byaan_connections WHERE merchant_id = ? LIMIT 1`,
    [merchantId]
  );
  return (rows as any[])?.[0] || null;
}

export async function createByaanConnection(
  merchantId: number,
  tenantDomain: string,
  permissions?: Record<string, boolean>,
  apiBaseUrl?: string,
  webhookSecret?: string
) {
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return null;

  // Derive api_base_url from tenant domain if not provided
  const baseUrl = apiBaseUrl || `https://${tenantDomain}/api/sari`;

  await (dbConn as any).execute(
    `INSERT INTO byaan_connections (merchant_id, tenant_domain, api_base_url, webhook_secret, permissions, is_active) 
     VALUES (?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE tenant_domain = VALUES(tenant_domain), api_base_url = VALUES(api_base_url), 
     webhook_secret = COALESCE(VALUES(webhook_secret), webhook_secret), permissions = VALUES(permissions), 
     sync_status = 'active', is_active = 1`,
    [merchantId, tenantDomain, baseUrl, webhookSecret || null, permissions ? JSON.stringify(permissions) : null]
  );

  // Set merchant integration_source = 'byaan'
  await (dbConn as any).execute(
    `UPDATE merchants SET integration_source = 'byaan' WHERE id = ?`,
    [merchantId]
  );

  // Notify Byaan to activate sari feature for this tenant (non-blocking)
  notifyByaanPlatform(tenantDomain, 'subscription.activated', merchantId);

  return getByaanConnection(merchantId);
}

export async function deleteByaanConnection(merchantId: number) {
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return;

  // Get tenant domain before deleting (for webhook notification)
  const connection = await getByaanConnection(merchantId);
  const tenantDomain = connection?.tenant_domain;

  await (dbConn as any).execute(
    `DELETE FROM byaan_connections WHERE merchant_id = ?`,
    [merchantId]
  );

  // Reset integration_source
  await (dbConn as any).execute(
    `UPDATE merchants SET integration_source = 'none' WHERE id = ?`,
    [merchantId]
  );

  // Notify Byaan to deactivate sari feature (non-blocking)
  if (tenantDomain) {
    notifyByaanPlatform(tenantDomain, 'subscription.deactivated', merchantId);
  }
}

export async function updateByaanSyncStatus(merchantId: number, status: string, errors?: string) {
  const dbConn = await getPool();
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
  const dbConn = await getPool();
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
      // PEN-BYAAN-09: Strip HTML from names
      await (dbConn as any).execute(
        `UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?`,
        [trainee.name.replace(/<[^>]*>/g, '').substring(0, 255), phone, trainee.email || null, (existing as any[])[0].id]
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
      await (dbConn as any).execute(
        `UPDATE customers SET external_id = ?, external_source = 'byaan', name = ? WHERE id = ?`,
        [externalId, trainee.name.replace(/<[^>]*>/g, '').substring(0, 255), (byPhone as any[])[0].id]
      );
      linked++;
      continue;
    }

    // Step 5: Brand new → INSERT
    try {
      await (dbConn as any).execute(
        `INSERT INTO customers (merchant_id, name, phone, email, external_id, external_source, created_at) VALUES (?, ?, ?, ?, ?, 'byaan', NOW())`,
        [merchantId, trainee.name.replace(/<[^>]*>/g, '').substring(0, 255), phone, trainee.email || null, externalId]
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
  const dbConn = await getPool();
  if (!dbConn) return { updated: [] };

  const updatedFields: string[] = [];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of ALLOWED_SETTINGS_FIELDS) {
    if (settings[field] !== undefined && settings[field] !== null) {
      const sanitized = String(settings[field]).substring(0, field === 'description' ? 2000 : 500);
      // PEN-BYAAN-07 FIX: Removed industry→platform_type mapping to prevent overwrite
      const colMap: Record<string, string> = {
        businessName: 'business_name',
        website: 'website_url',
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
  const dbConn = await getPool();
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
  const dbConn = await getPool();
  if (!dbConn) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (actionType) {
    // PEN-BYAAN-11: Validate actionType
    const validTypes = ['enrollment', 'payment', 'inquiry'];
    if (!validTypes.includes(actionType)) return [];

    const [rows] = await (dbConn as any).execute(
      `SELECT * FROM sari_conversions WHERE merchant_id = ? AND action_type = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [merchantId, actionType]
    );
    return rows as any[];
  }

  const [rows] = await (dbConn as any).execute(
    `SELECT * FROM sari_conversions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [merchantId]
  );
  return rows as any[];
}

// ═══════════════════════════════════════════════════════════════
// Integration Source Helpers
// ═══════════════════════════════════════════════════════════════

export async function getIntegrationSource(merchantId: number): Promise<string> {
  await ensureByaanTables();
  const dbConn = await getPool();
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

// ═══════════════════════════════════════════════════════════════
// Byaan Live Client — Operations API (ساري → بيان)
// Used for real-time operations: enroll, payment, results, etc.
// ═══════════════════════════════════════════════════════════════

/**
 * Sign a request body with HMAC-SHA256 for webhook security
 */
function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Make an authenticated call to Byaan's Live API
 * Uses the connection's api_base_url + webhook_secret for HMAC signing
 */
async function callByaanApi(
  merchantId: number,
  method: 'GET' | 'POST',
  endpoint: string,
  data?: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  const connection = await getByaanConnection(merchantId);
  if (!connection || !connection.api_base_url) {
    return { success: false, error: 'Byaan connection not configured or missing api_base_url' };
  }
  if (!connection.is_active) {
    return { success: false, error: 'Byaan connection is inactive' };
  }

  const url = `${connection.api_base_url}${endpoint}`;

  // PEN-SYNC-01: SSRF Protection — block internal/dangerous URLs
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      return { success: false, error: 'api_base_url must use HTTPS' };
    }
    const hostname = parsedUrl.hostname;
    if (
      hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
      hostname.startsWith('172.') || hostname.startsWith('169.254.') ||
      hostname === '0.0.0.0' || hostname.endsWith('.internal') || hostname.endsWith('.local')
    ) {
      console.warn(`[Byaan Live] PEN-SYNC-01 SSRF blocked: ${hostname}`);
      return { success: false, error: 'Internal URLs are not allowed' };
    }
  } catch {
    return { success: false, error: 'Invalid api_base_url format' };
  }

  const bodyStr = data ? JSON.stringify(data) : '';
  const timestamp = Math.floor(Date.now() / 1000);
  const deliveryId = crypto.randomUUID();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Sari-Timestamp': String(timestamp),
    'X-Sari-Delivery-Id': deliveryId,
  };

  // Sign with HMAC if webhook_secret is configured
  if (connection.webhook_secret) {
    const signature = signPayload(`${timestamp}.${bodyStr}`, connection.webhook_secret);
    headers['X-Sari-Signature'] = `sha256=${signature}`;
  }

  try {
    const axios = (await import('axios')).default;
    const response = await axios({
      method,
      url,
      data: method === 'POST' ? data : undefined,
      params: method === 'GET' ? data : undefined,
      headers,
      timeout: 15000, // 15s timeout for live operations
    });

    return { success: true, data: response.data };
  } catch (e: any) {
    const status = e?.response?.status;
    const errMsg = e?.response?.data?.message || e?.message || 'Unknown error';
    console.error(`[Byaan Live] ${method} ${endpoint} failed (${status}):`, errMsg);
    return { success: false, error: `Byaan API error (${status}): ${errMsg}` };
  }
}

// ─── Live Operations ───────────────────────────────────────

/**
 * Enroll a trainee in a course via Byaan
 * Called when the AI bot completes a sale
 */
export async function enrollTrainee(
  merchantId: number,
  data: { traineePhone: string; traineeName: string; courseId: string | number; courseTitle?: string }
): Promise<{ success: boolean; enrollmentId?: string; paymentUrl?: string; error?: string }> {
  const result = await callByaanApi(merchantId, 'POST', '/enroll', {
    phone: data.traineePhone,
    name: data.traineeName,
    course_id: data.courseId,
  });

  if (result.success && result.data) {
    // Record conversion for tracking
    try {
      await recordConversion(merchantId, {
        customerPhone: data.traineePhone,
        customerName: data.traineeName,
        actionType: 'enrollment',
        productName: data.courseTitle || `Course #${data.courseId}`,
        externalRef: result.data.enrollment_id || result.data.enrollmentId,
        status: 'completed',
      });
    } catch (e) { /* non-blocking */ }
  }

  return {
    success: result.success,
    enrollmentId: result.data?.enrollment_id || result.data?.enrollmentId,
    paymentUrl: result.data?.payment_url || result.data?.paymentUrl,
    error: result.error,
  };
}

/**
 * Create a payment link via Byaan's payment gateway (Tap/Moyasar)
 * The trainee pays on the academy's own gateway, not Sari's
 */
export async function createPaymentLink(
  merchantId: number,
  data: { traineePhone: string; courseId: string | number; amount: number; description?: string }
): Promise<{ success: boolean; paymentUrl?: string; invoiceId?: string; error?: string }> {
  const result = await callByaanApi(merchantId, 'POST', '/create-payment-link', {
    phone: data.traineePhone,
    course_id: data.courseId,
    amount: data.amount,
    description: data.description,
  });

  if (result.success && result.data) {
    try {
      await recordConversion(merchantId, {
        customerPhone: data.traineePhone,
        customerName: '',
        actionType: 'payment',
        productName: data.description || `Course #${data.courseId}`,
        amount: data.amount,
        externalRef: result.data.invoice_id || result.data.invoiceId,
        status: 'pending',
      });
    } catch (e) { /* non-blocking */ }
  }

  return {
    success: result.success,
    paymentUrl: result.data?.payment_url || result.data?.paymentUrl,
    invoiceId: result.data?.invoice_id || result.data?.invoiceId,
    error: result.error,
  };
}

/**
 * Get trainee results/grades from Byaan (live — not cached)
 */
export async function getTraineeResults(
  merchantId: number,
  traineeId: string | number
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${traineeId}/results`);
  return {
    success: result.success,
    results: result.data?.results || result.data,
    error: result.error,
  };
}

/**
 * Get trainee certificates from Byaan (live)
 */
export async function getTraineeCertificates(
  merchantId: number,
  traineeId: string | number
): Promise<{ success: boolean; certificates?: any[]; error?: string }> {
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${traineeId}/certificates`);
  return {
    success: result.success,
    certificates: result.data?.certificates || result.data,
    error: result.error,
  };
}

/**
 * Get trainee attendance records from Byaan (live)
 */
export async function getTraineeAttendance(
  merchantId: number,
  traineeId: string | number
): Promise<{ success: boolean; attendance?: any[]; error?: string }> {
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${traineeId}/attendance`);
  return {
    success: result.success,
    attendance: result.data?.attendance || result.data,
    error: result.error,
  };
}

/**
 * Identify a trainee by their WhatsApp phone number
 * Returns the Byaan trainee profile if found
 */
export async function identifyTrainee(
  merchantId: number,
  phone: string
): Promise<{ success: boolean; found: boolean; trainee?: any; error?: string }> {
  const result = await callByaanApi(merchantId, 'POST', '/identify', { phone });
  return {
    success: result.success,
    found: result.data?.found || false,
    trainee: result.data?.trainee,
    error: result.error,
  };
}
