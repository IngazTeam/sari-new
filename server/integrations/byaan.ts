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

import { getPool, getProductCountByMerchantId } from '../db';
import { normalizeCustomerProfileCount } from '../db/customer-intelligence';
import { assertRuntimeSchema } from '../db/schema-readiness';
import crypto from 'crypto';
import { decryptSecret, encryptSecret } from '../security/secrets';
import {
  buildByaanCanonicalRequest,
  createPinnedByaanHttpsAgent,
  normalizeByaanApiBaseUrl,
  normalizeByaanTenantDomain,
  signByaanRequest,
} from './byaan-security';
import { enqueueByaanLifecycleEvent } from './byaan-outbox';
import { ByaanSyncValidationError } from './byaan-sync-errors';

export { ByaanSyncValidationError } from './byaan-sync-errors';

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
// Terminology — مسميات تتكيف حسب المنصة
// ═══════════════════════════════════════════════════════════════

export const PLATFORM_TERMINOLOGY: Record<string, Record<string, string>> = {
  none:  { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  salla: { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  zid:   { products: 'منتجات', customers: 'عملاء',   orders: 'طلبات',     category: 'قسم',    price: 'السعر',       item: 'منتج' },
  byaan: { products: 'دورات',  customers: 'متدربين', orders: 'تسجيلات',  category: 'تصنيف',  price: 'رسوم الدورة', item: 'دورة' },
};

// ═══════════════════════════════════════════════════════════════
// Byaan Connection Management (migration-backed schema)
// ═══════════════════════════════════════════════════════════════

async function ensureByaanTables() {
  await assertRuntimeSchema('Byaan integration', [
    { table: 'byaan_connections', columns: ['verified_at', 'verification_token_hash', 'webhook_secret'] },
    { table: 'byaan_trainees' },
    { table: 'byaan_faqs' },
    { table: 'byaan_site_content' },
    { table: 'byaan_outbox' },
    { table: 'byaan_webhook_receipts' },
    { table: 'sari_conversions' },
    { table: 'merchants', columns: ['integration_source'] },
  ]);
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
async function verifyByaanDomainOwnership(input: {
  merchantId: number;
  tenantDomain: string;
  challenge: string;
  signingSecret: string;
}): Promise<boolean> {
  const path = '/api/sari/verify-ownership';
  const tenantDomain = normalizeByaanTenantDomain(input.tenantDomain);
  const url = `https://${tenantDomain}${path}`;
  const rawBody = Buffer.from(JSON.stringify({
    merchant_id: String(input.merchantId),
    challenge: input.challenge,
  }), 'utf8');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const deliveryId = crypto.randomUUID();
  const canonical = buildByaanCanonicalRequest({
    timestamp,
    deliveryId,
    method: 'POST',
    path,
    tenantDomain,
    rawBody,
  });
  const httpsAgent = await createPinnedByaanHttpsAgent(url);
  const axios = (await import('axios')).default;
  const response = await axios.post(url, rawBody, {
    headers: {
      'Content-Type': 'application/json',
      'X-Sari-Timestamp': timestamp,
      'X-Sari-Delivery-Id': deliveryId,
      'X-Sari-Signature': signByaanRequest(canonical, input.signingSecret),
    },
    timeout: 8_000,
    maxRedirects: 0,
    httpsAgent,
    validateStatus: () => true,
  });
  const echoedChallenge = String(response.data?.challenge || '');
  const actual = Buffer.from(echoedChallenge, 'utf8');
  const expected = Buffer.from(input.challenge, 'utf8');
  return response.status >= 200 && response.status < 300 && actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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
  const connection = (rows as any[])?.[0] || null;
  return connection ? { ...connection, webhook_secret: decryptSecret(connection.webhook_secret) } : null;
}

function toPublicByaanConnection(connection: any) {
  if (!connection) return null;
  const {
    webhook_secret: webhookSecret,
    verification_token_hash: _verificationTokenHash,
    api_key_hash: _apiKeyHash,
    ...safe
  } = connection;
  return { ...safe, has_signing_secret: Boolean(webhookSecret) };
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

  const normalizedDomain = normalizeByaanTenantDomain(tenantDomain);
  const baseUrl = normalizeByaanApiBaseUrl(normalizedDomain, apiBaseUrl);
  const secret = webhookSecret?.trim() || '';
  if (secret && secret.length < 32) throw new Error('Byaan webhook secret must contain at least 32 characters');
  const challenge = crypto.randomBytes(32).toString('base64url');
  const challengeHash = crypto.createHash('sha256').update(challenge).digest('hex');
  const verificationExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 19).replace('T', ' ');

  try {
    const [domainOwners] = await (dbConn as any).execute(
      `SELECT merchant_id FROM byaan_connections WHERE tenant_domain = ? LIMIT 1`,
      [normalizedDomain]
    );
    const ownerId = Number((domainOwners as any[])?.[0]?.merchant_id || 0);
    if (ownerId && ownerId !== merchantId) throw new Error('Byaan tenant domain is already linked to another merchant');

    const [merchantConnections] = await (dbConn as any).execute(
      `SELECT id FROM byaan_connections WHERE merchant_id = ? LIMIT 1`,
      [merchantId]
    );
    const values = [
      normalizedDomain,
      baseUrl,
      secret ? encryptSecret(secret) : null,
      permissions ? JSON.stringify(permissions) : null,
      challengeHash,
      verificationExpiresAt,
    ];
    if ((merchantConnections as any[])?.length) {
      await (dbConn as any).execute(
        `UPDATE byaan_connections
         SET tenant_domain = ?, api_base_url = ?, webhook_secret = COALESCE(?, webhook_secret), permissions = ?,
             sync_status = 'pending_verification', verification_token_hash = ?, verification_expires_at = ?,
             verified_at = NULL, is_active = 0
         WHERE merchant_id = ?`,
        [...values, merchantId]
      );
    } else {
      await (dbConn as any).execute(
        `INSERT INTO byaan_connections
          (tenant_domain, api_base_url, webhook_secret, permissions, verification_token_hash,
           verification_expires_at, merchant_id, sync_status, verified_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_verification', NULL, 0)`,
        [...values, merchantId]
      );
    }
  } catch (error: any) {
    if (error?.message === 'Byaan tenant domain is already linked to another merchant') throw error;
    if (error?.code === 'ER_DUP_ENTRY') throw new Error('Byaan tenant domain is already linked to another merchant');
    throw error;
  }

  if (!secret) return toPublicByaanConnection(await getByaanConnection(merchantId));

  let verified = false;
  try {
    verified = await verifyByaanDomainOwnership({
      merchantId,
      tenantDomain: normalizedDomain,
      challenge,
      signingSecret: secret,
    });
  } catch (error: any) {
    console.warn(`[Byaan] ownership verification failed for merchant ${merchantId}:`, String(error?.message || 'verification failed').slice(0, 160));
  }
  if (!verified) return toPublicByaanConnection(await getByaanConnection(merchantId));

  // Make the verified state, merchant source, and durable lifecycle event one
  // transaction. No connection may become active without an outbox record.
  const activationTx = await (dbConn as any).getConnection();
  try {
    await activationTx.beginTransaction();
    const [activation] = await activationTx.execute(
      `UPDATE byaan_connections
       SET sync_status = 'active', verified_at = NOW(), is_active = 1, verification_token_hash = NULL,
           verification_expires_at = NULL, sync_errors = NULL
       WHERE merchant_id = ? AND tenant_domain = ? AND verification_token_hash = ?`,
      [merchantId, normalizedDomain, challengeHash]
    );
    if (Number((activation as any)?.affectedRows || 0) !== 1) {
      throw new Error('Byaan verification challenge is no longer valid');
    }
    await activationTx.execute(`UPDATE merchants SET integration_source = 'byaan' WHERE id = ?`, [merchantId]);
    await enqueueByaanLifecycleEvent({
      merchantId,
      tenantDomain: normalizedDomain,
      event: 'subscription.activated',
      signingSecret: secret,
      executor: activationTx,
    });
    await activationTx.commit();
  } catch (error) {
    await activationTx.rollback();
    throw error;
  } finally {
    activationTx.release();
  }
  return toPublicByaanConnection(await getByaanConnection(merchantId));
}

export async function deleteByaanConnection(merchantId: number) {
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return;

  // Get tenant domain before deleting (for webhook notification)
  const connection = await getByaanConnection(merchantId);
  const tenantDomain = connection?.tenant_domain;

  const deleteTx = await (dbConn as any).getConnection();
  try {
    await deleteTx.beginTransaction();
    // Persist deactivation atomically with disconnect. The outbox owns an
    // encrypted key copy, so deleting the connection cannot lose the event.
    if (tenantDomain && connection?.is_active && connection?.verified_at) {
      const secret = String(connection.webhook_secret || '');
      if (secret.length < 32) throw new Error('Cannot disconnect a verified Byaan tenant without a valid signing secret');
      await enqueueByaanLifecycleEvent({
        merchantId,
        tenantDomain,
        event: 'subscription.deactivated',
        signingSecret: secret,
        executor: deleteTx,
      });
    }

    await deleteTx.execute(`DELETE FROM byaan_connections WHERE merchant_id = ?`, [merchantId]);
    await deleteTx.execute(`UPDATE merchants SET integration_source = 'none' WHERE id = ?`, [merchantId]);
    await deleteTx.commit();
  } catch (error) {
    await deleteTx.rollback();
    throw error;
  } finally {
    deleteTx.release();
  }

}

export async function updateByaanSyncStatus(merchantId: number, status: string, errors?: string) {
  const dbConn = await getPool();
  if (!dbConn) return;

  // PEN-SYNC-14: Validate status enum to prevent invalid ENUM values
  const validStatuses = ['pending_verification', 'active', 'syncing', 'error', 'paused'];
  const safeStatus = validStatuses.includes(status) ? status : 'error';

  await (dbConn as any).execute(
    `UPDATE byaan_connections SET sync_status = ?, last_sync_at = NOW(), sync_errors = ? WHERE merchant_id = ?`,
    [safeStatus, errors ? String(errors).substring(0, 500) : null, merchantId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Trainee Sync — Smart 5-step mapping
// ═══════════════════════════════════════════════════════════════

export interface ByaanTraineeSyncResult {
  created: number;
  updated: number;
  archived: number;
  linked: number;
}

export async function syncTrainees(
  merchantId: number,
  trainees: ByaanTrainee[],
  mode: 'append' | 'replace' = 'append',
): Promise<ByaanTraineeSyncResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for Byaan trainee sync');
  }
  if (!Array.isArray(trainees) || trainees.length > 500 || !['append', 'replace'].includes(mode)) {
    throw new ByaanSyncValidationError('trainee');
  }

  const normalizedByExternalId = new Map<string, {
    externalId: string;
    name: string;
    phone: string | null;
    email: string | null;
    coursesJson: string | null;
  }>();
  for (const trainee of trainees) {
    if (
      !trainee || typeof trainee !== 'object'
      || (typeof trainee.id !== 'string' && typeof trainee.id !== 'number')
      || (typeof trainee.id === 'number' && !Number.isFinite(trainee.id))
      || typeof trainee.name !== 'string'
      || (trainee.phone !== undefined && trainee.phone !== null
        && typeof trainee.phone !== 'string' && typeof trainee.phone !== 'number')
      || (trainee.email !== undefined && trainee.email !== null && typeof trainee.email !== 'string')
    ) {
      throw new ByaanSyncValidationError('trainee');
    }
    const externalId = trainee.id === undefined || trainee.id === null
      ? ''
      : String(trainee.id).trim();
    const safeName = trainee.name.replace(/<[^>]*>/g, '').trim();
    const normalizedPhone = trainee.phone ? String(trainee.phone).replace(/\D/g, '') : '';
    const normalizedEmail = typeof trainee.email === 'string'
      ? trainee.email.replace(/<[^>]*>/g, '').trim()
      : '';
    if (
      !externalId || externalId.length > 100
      || !safeName || safeName.length > 255
      || normalizedPhone.length > 20
      || normalizedEmail.length > 320
      || (trainee.enrolledCourses !== undefined && !Array.isArray(trainee.enrolledCourses))
    ) {
      throw new ByaanSyncValidationError('trainee');
    }
    const phone = normalizedPhone
      ? normalizedPhone
      : null;
    const safeEmail = normalizedEmail || null;
    const courses = Array.isArray(trainee.enrolledCourses)
      ? trainee.enrolledCourses
        .map((course) => typeof course === 'string' ? course.replace(/<[^>]*>/g, '').trim() : '')
      : [];
    if (
      courses.length > 100
      || courses.some((course) => !course || course.length > 255)
      || JSON.stringify(courses).length > 12_000
    ) {
      throw new ByaanSyncValidationError('trainee');
    }
    normalizedByExternalId.set(externalId, {
      externalId,
      name: safeName,
      phone,
      email: safeEmail,
      coursesJson: courses.length > 0 ? JSON.stringify(courses) : null,
    });
  }

  // Reject the complete payload before touching the database. This keeps bad
  // batches cheap and guarantees that validation can never leave partial data.
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');

  const connection = await dbConn.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      `SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE`,
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) {
      throw new Error('Byaan merchant not found');
    }

    const externalIds = Array.from(normalizedByExternalId.keys());
    const existingExternalIds = new Set<string>();
    if (externalIds.length > 0) {
      const [existingRows] = await connection.execute(
        `SELECT external_id FROM byaan_trainees
         WHERE merchant_id = ? AND external_id IN (${externalIds.map(() => '?').join(', ')})`,
        [merchantId, ...externalIds],
      );
      for (const row of existingRows as Array<{ external_id: string }>) {
        existingExternalIds.add(row.external_id);
      }
    }

    let created = 0;
    let updated = 0;
    for (const trainee of Array.from(normalizedByExternalId.values())) {
      await connection.execute(
        `INSERT INTO byaan_trainees (merchant_id, external_id, name, phone, email, enrolled_courses, status, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), email = VALUES(email),
         enrolled_courses = VALUES(enrolled_courses), status = 'active', synced_at = NOW()`,
        [merchantId, trainee.externalId, trainee.name, trainee.phone, trainee.email, trainee.coursesJson],
      );
      if (existingExternalIds.has(trainee.externalId)) updated += 1;
      else created += 1;
    }

    let archived = 0;
    if (mode === 'replace') {
      const [result] = externalIds.length === 0
        ? await connection.execute(
          `UPDATE byaan_trainees SET status = 'archived', synced_at = NOW()
           WHERE merchant_id = ? AND status = 'active'`,
          [merchantId],
        )
        : await connection.execute(
          `UPDATE byaan_trainees SET status = 'archived', synced_at = NOW()
           WHERE merchant_id = ? AND status = 'active'
             AND external_id NOT IN (${externalIds.map(() => '?').join(', ')})`,
          [merchantId, ...externalIds],
        );
      archived = Number((result as any).affectedRows || 0);
    }

    await connection.commit();
    return { created, updated, archived, linked: 0 };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface ByaanTraineeListRow {
  id: number;
  external_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  enrolled_courses: string | null;
  status: string;
  synced_at: string | null;
  created_at: string;
}

export interface ByaanTraineePage {
  items: ByaanTraineeListRow[];
  nextCursor: number | null;
}

/** Get a bounded, keyset-paginated trainee page for a merchant. */
export async function getByaanTraineePage(
  merchantId: number,
  options: { search?: string; limit?: number; cursor?: number } = {},
): Promise<ByaanTraineePage> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    return { items: [], nextCursor: null };
  }
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');

  const limit = Math.min(Math.max(Math.floor(options.limit || 100), 1), 200);
  const cursor = Number.isSafeInteger(options.cursor) && Number(options.cursor) > 0
    ? Number(options.cursor)
    : null;
  const search = String(options.search || '').trim().substring(0, 100);
  const params: Array<string | number> = [merchantId];
  let cursorClause = '';
  if (cursor) {
    cursorClause = ' AND id > ?';
    params.push(cursor);
  }
  let searchClause = '';
  if (search) {
    searchClause = ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }
  params.push(limit + 1);

  const [rows] = await (dbConn as any).execute(
    `SELECT id, external_id, name, phone, email, enrolled_courses, status, synced_at, created_at
     FROM byaan_trainees
     WHERE merchant_id = ? AND status = 'active'${cursorClause}${searchClause}
     ORDER BY id ASC
     LIMIT ?`,
    params,
  );
  const candidates = rows as ByaanTraineeListRow[];
  const hasMore = candidates.length > limit;
  const items = hasMore ? candidates.slice(0, limit) : candidates;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
  };
}

/** Sync FAQs atomically while preserving merchant activation choices on updates. */
export async function syncByaanFaqs(
  merchantId: number,
  faqs: { id?: string; question: string; answer: string; category?: string }[],
  mode: 'append' | 'replace' = 'append',
): Promise<{ created: number; updated: number; removed: number }> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for Byaan FAQ sync');
  }
  if (!Array.isArray(faqs) || faqs.length > 500) {
    throw new Error('Invalid Byaan FAQ sync batch');
  }
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');

  const normalizedByExternalId = new Map<string, {
    externalId: string;
    question: string;
    answer: string;
    category: string;
  }>();
  for (const f of faqs) {
    if (!f || typeof f !== 'object' || typeof f.question !== 'string' || typeof f.answer !== 'string') {
      throw new ByaanSyncValidationError('faq');
    }
    const question = String(f.question).replace(/<[^>]*>/g, '').trim();
    const answer = String(f.answer).replace(/<[^>]*>/g, '').trim();
    const suppliedExternalId = f.id === undefined || f.id === null ? '' : String(f.id).trim();
    const category = typeof f.category === 'string'
      ? String(f.category).replace(/<[^>]*>/g, '').trim()
      : 'عام';
    if (
      !question || question.length > 2000
      || !answer || answer.length > 5000
      || suppliedExternalId.length > 100
      || !category || category.length > 100
    ) {
      throw new ByaanSyncValidationError('faq');
    }
    const externalId = suppliedExternalId
      ? suppliedExternalId
      : `content:${crypto.createHash('sha256').update(`${question}\0${answer}`, 'utf8').digest('hex')}`;
    normalizedByExternalId.set(externalId, {
      externalId,
      question,
      answer,
      category,
    });
  }

  const connection = await dbConn.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      `SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE`,
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) {
      throw new Error('Byaan merchant not found');
    }

    const externalIds = Array.from(normalizedByExternalId.keys());
    const existingExternalIds = new Set<string>();
    if (externalIds.length > 0) {
      const [existingRows] = await connection.execute(
        `SELECT external_id FROM byaan_faqs
         WHERE merchant_id = ? AND external_id IN (${externalIds.map(() => '?').join(', ')})`,
        [merchantId, ...externalIds],
      );
      for (const row of existingRows as Array<{ external_id: string }>) {
        existingExternalIds.add(row.external_id);
      }
    }

    let created = 0;
    let updated = 0;
    for (const faq of Array.from(normalizedByExternalId.values())) {
      await connection.execute(
        `INSERT INTO byaan_faqs (merchant_id, external_id, question, answer, category, synced_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           question = VALUES(question), answer = VALUES(answer),
           category = VALUES(category), synced_at = NOW()`,
        [merchantId, faq.externalId, faq.question, faq.answer, faq.category],
      );
      if (existingExternalIds.has(faq.externalId)) updated += 1;
      else created += 1;
    }

    let removed = 0;
    if (mode === 'replace') {
      const [result] = externalIds.length === 0
        ? await connection.execute(`DELETE FROM byaan_faqs WHERE merchant_id = ?`, [merchantId])
        : await connection.execute(
          `DELETE FROM byaan_faqs
           WHERE merchant_id = ? AND external_id NOT IN (${externalIds.map(() => '?').join(', ')})`,
          [merchantId, ...externalIds],
        );
      removed = Number((result as any).affectedRows || 0);
    }

    await connection.commit();
    return { created, updated, removed };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface ByaanFaqListRow {
  id: number;
  external_id: string | null;
  question: string;
  answer: string;
  category: string | null;
  is_active: number;
  use_in_bot: number;
  synced_at: string | null;
}

export interface ByaanFaqPage {
  items: ByaanFaqListRow[];
  nextCursor: number | null;
}

export interface ByaanKnowledgeFaqResult {
  items: Array<Pick<ByaanFaqListRow, 'id' | 'question' | 'answer' | 'category'>>;
  exceedsLimit: boolean;
  hasManagedFaqs: boolean;
}

export const BYAAN_KNOWLEDGE_FAQ_LIMIT = 500;

/** Get a bounded management page, including disabled FAQs so they can be re-enabled. */
export async function getByaanFaqPage(
  merchantId: number,
  options: { limit?: number; cursor?: number } = {},
): Promise<ByaanFaqPage> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    return { items: [], nextCursor: null };
  }
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');

  const limit = Math.min(Math.max(Math.floor(options.limit || 50), 1), 200);
  const cursor = Number.isSafeInteger(options.cursor) && Number(options.cursor) > 0
    ? Number(options.cursor)
    : null;
  const params: number[] = [merchantId];
  const cursorClause = cursor ? ' AND id > ?' : '';
  if (cursor) params.push(cursor);
  params.push(limit + 1);

  const [rows] = await (dbConn as any).execute(
    `SELECT id, external_id, question, answer, category, is_active, use_in_bot, synced_at
     FROM byaan_faqs
     WHERE merchant_id = ?${cursorClause}
     ORDER BY id ASC
     LIMIT ?`,
    params,
  );
  const candidates = rows as ByaanFaqListRow[];
  const hasMore = candidates.length > limit;
  const items = hasMore ? candidates.slice(0, limit) : candidates;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
  };
}

/**
 * Read only FAQs explicitly enabled for Sari's next knowledge synchronization.
 * The limit+1 contract makes oversized tenants fail visibly instead of ingesting
 * an arbitrary prefix and reporting a false success.
 */
export async function getByaanFaqsForKnowledge(merchantId: number): Promise<ByaanKnowledgeFaqResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    return { items: [], exceedsLimit: false, hasManagedFaqs: false };
  }
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');
  const connection = await dbConn.getConnection();

  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, question, answer, category
       FROM byaan_faqs
       WHERE merchant_id = ? AND is_active = 1 AND use_in_bot = 1
       ORDER BY id ASC
       LIMIT ?`,
      [merchantId, BYAAN_KNOWLEDGE_FAQ_LIMIT + 1],
    );
    const [managedRows] = await connection.execute(
      `SELECT id FROM byaan_faqs WHERE merchant_id = ? ORDER BY id ASC LIMIT 1`,
      [merchantId],
    );
    const candidates = rows as ByaanKnowledgeFaqResult['items'];
    const result = {
      items: candidates.slice(0, BYAAN_KNOWLEDGE_FAQ_LIMIT),
      exceedsLimit: candidates.length > BYAAN_KNOWLEDGE_FAQ_LIMIT,
      hasManagedFaqs: (managedRows as Array<{ id: number }>).length > 0,
    };
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Save Byaan site content */
export async function syncByaanSiteContent(merchantId: number, pageType: string, title: string, content: string): Promise<void> {
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return;
  await (dbConn as any).execute(
    `INSERT INTO byaan_site_content (merchant_id, page_type, title, content, synced_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), synced_at = NOW()`,
    [merchantId, pageType, title?.substring(0, 500), content?.substring(0, 50000)]
  );
}

/** Count the active audience synced from a Byaan tenant. */
export async function getActiveByaanTraineeCount(merchantId: number): Promise<number> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) return 0;
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) return 0;
  const [rows] = await (dbConn as any).execute(
    `SELECT COUNT(*) AS cnt FROM byaan_trainees WHERE merchant_id = ? AND status = 'active'`,
    [merchantId],
  );
  return normalizeCustomerProfileCount((rows as Array<{ cnt?: unknown }>)?.[0]?.cnt);
}

/** Get sync stats for a merchant */
export async function getByaanSyncStats(merchantId: number): Promise<{ trainees: number; faqs: number; courses: number; sitePages: number }> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    return { trainees: 0, faqs: 0, courses: 0, sitePages: 0 };
  }
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan data unavailable');
  const [[t], [f], courses, [s]] = await Promise.all([
    (dbConn as any).execute(`SELECT COUNT(*) as cnt FROM byaan_trainees WHERE merchant_id = ? AND status = 'active'`, [merchantId]),
    (dbConn as any).execute(`SELECT COUNT(*) as cnt FROM byaan_faqs WHERE merchant_id = ? AND is_active = 1`, [merchantId]),
    getProductCountByMerchantId(merchantId),
    (dbConn as any).execute(`SELECT COUNT(*) as cnt FROM byaan_site_content WHERE merchant_id = ?`, [merchantId]),
  ]);
  return {
    trainees: normalizeCustomerProfileCount((t as any[])?.[0]?.cnt),
    faqs: normalizeCustomerProfileCount((f as any[])?.[0]?.cnt),
    courses: normalizeCustomerProfileCount(courses),
    sitePages: normalizeCustomerProfileCount((s as any[])?.[0]?.cnt),
  };
}

// ═══════════════════════════════════════════════════════════════
// Settings Sync — Whitelist-guarded
// ═══════════════════════════════════════════════════════════════

export async function syncSettings(merchantId: number, settings: ByaanSettings): Promise<{ updated: string[] }> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for Byaan settings sync');
  }
  const { normalizeByaanSettings } = await import('./byaan-settings-sync-core');
  const normalized = normalizeByaanSettings(settings);
  await ensureByaanTables();
  const dbConn = await getPool();
  if (!dbConn) throw new Error('Byaan settings unavailable');
  if (normalized.length === 0) return { updated: [] };

  const values: Array<string | number | null> = normalized.map((entry) => entry.value);
  values.push(merchantId);
  const [result] = await (dbConn as any).execute(
    `UPDATE merchants SET ${normalized.map((entry) => `\`${entry.column}\` = ?`).join(', ')} WHERE id = ?`,
    values,
  );
  if (Number((result as any).affectedRows || 0) !== 1) {
    throw new Error('Byaan settings merchant not found');
  }
  return { updated: normalized.map((entry) => entry.field) };
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
  if (!connection.is_active || !connection.verified_at) {
    return { success: false, error: 'Byaan connection ownership is not verified' };
  }

  if (!endpoint.startsWith('/') || endpoint.includes('..') || endpoint.includes('?') || endpoint.includes('#')) {
    return { success: false, error: 'Invalid Byaan API endpoint' };
  }
  let tenantDomain: string;
  let apiBaseUrl: string;
  try {
    tenantDomain = normalizeByaanTenantDomain(connection.tenant_domain);
    apiBaseUrl = normalizeByaanApiBaseUrl(tenantDomain, connection.api_base_url);
  } catch {
    return { success: false, error: 'Invalid or unverified Byaan API base URL' };
  }
  const url = `${apiBaseUrl}${endpoint}`;
  const secret = String(connection.webhook_secret || '');
  if (secret.length < 32) return { success: false, error: 'Byaan request signing is not configured' };

  const bodyStr = method === 'POST' && data ? JSON.stringify(data) : '';
  const rawBody = Buffer.from(bodyStr, 'utf8');
  const timestamp = Math.floor(Date.now() / 1000);
  const deliveryId = crypto.randomUUID();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Sari-Timestamp': String(timestamp),
    'X-Sari-Delivery-Id': deliveryId,
  };

  const canonical = buildByaanCanonicalRequest({
    timestamp: String(timestamp),
    deliveryId,
    method,
    path: `/api/sari${endpoint}`,
    tenantDomain,
    rawBody,
  });
  headers['X-Sari-Signature'] = signByaanRequest(canonical, secret);

  try {
    const httpsAgent = await createPinnedByaanHttpsAgent(url);
    const axios = (await import('axios')).default;
    const response = await axios({
      method,
      url,
      // Send the exact bytes covered by the HMAC. Current GET operations encode
      // their identifier in the validated path and carry no unsigned query data.
      data: method === 'POST' ? rawBody : undefined,
      headers,
      timeout: 15000, // 15s timeout for live operations
      maxRedirects: 0,
      httpsAgent,
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

export async function requestByaanResync(merchantId: number): Promise<{ success: boolean; error?: string }> {
  const result = await callByaanApi(merchantId, 'POST', '/request-resync', {
    merchant_id: String(merchantId),
  });
  return { success: result.success, error: result.error };
}

/**
 * Get trainee results/grades from Byaan (live — not cached)
 */
export async function getTraineeResults(
  merchantId: number,
  traineeId: string | number
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${encodeURIComponent(String(traineeId))}/results`);
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
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${encodeURIComponent(String(traineeId))}/certificates`);
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
  const result = await callByaanApi(merchantId, 'GET', `/trainee/${encodeURIComponent(String(traineeId))}/attendance`);
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
