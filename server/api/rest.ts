/**
 * Sari REST API — Public Integration Layer
 * 
 * Exposes Sari's brain, products, conversations, and management
 * as a REST API for integration with external services (Byaan, Salla, Zid, etc.)
 * 
 * Authentication: API Key in Authorization header
 * Format: Authorization: Bearer sari_sk_xxxxxxxxxxxxx
 * 
 * Security:
 * - Per-merchant API keys stored in DB
 * - Rate limiting: 100 req/min per key
 * - HMAC signature validation (optional, for webhooks)
 * - All endpoints scoped to authenticated merchant
 */

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  createExtractedFaq,
  createProduct,
  deactivateInstancesByPhoneNumber,
  deleteAllExtractedFaqs,
  deleteAllProductsByMerchantId,
  deleteKnowledgeDocsByMerchantId,
  getActiveInstanceByPhoneNumber,
  getConversationCountByMerchantId,
  getConversationsByMerchantId,
  getExtractedFaqsByMerchantId,
  getKnowledgeDocByMerchantId,
  getMerchantById,
  getPool,
  getProductsByMerchantId,
  getWhatsAppInstanceById,
  getWhatsAppInstancesByMerchantId,
  setWhatsAppInstanceAsPrimary,
  updateProduct,
  updateWhatsAppInstance,
} from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface AuthenticatedRequest extends Request {
  merchant?: any;
  apiKeyId?: number;
}

interface PlatformRequest extends Request {
  platform?: string;
  tenantDomain?: string;
}

// ═══════════════════════════════════════════════════════════════
// API Key Management (DB-backed)
// ═══════════════════════════════════════════════════════════════

let _apiKeysTableCreated = false;

async function ensureApiKeysTable() {
  if (_apiKeysTableCreated) return;
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        key_hash VARCHAR(64) NOT NULL UNIQUE,
        key_prefix VARCHAR(12) NOT NULL,
        label VARCHAR(100) DEFAULT 'Default Key',
        permissions JSON DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        last_used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        INDEX idx_key_hash (key_hash),
        INDEX idx_merchant (merchant_id)
      )
    `);
    _apiKeysTableCreated = true;
  } catch (e) {
    console.error('[SariAPI] Failed to create api_keys table:', e);
  }
}

/** Generate a new API key for a merchant */
export async function generateApiKey(merchantId: number, label: string = 'Default Key'): Promise<{ key: string; prefix: string }> {
  await ensureApiKeysTable();
  const pool = await getPool();
  if (!pool) throw new Error('Database connection failed');

  // Generate: sari_sk_ + 32 random hex chars
  const rawKey = `sari_sk_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12); // sari_sk_xxxx

  await pool.execute(
    `INSERT INTO sari_api_keys (merchant_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?)`,
    [merchantId, keyHash, keyPrefix, label]
  );

  return { key: rawKey, prefix: keyPrefix };
}

/** Validate an API key and return the merchant */
async function validateApiKey(key: string): Promise<{ merchant: any; keyId: number } | null> {
  await ensureApiKeysTable();
  const pool = await getPool();
  if (!pool) return null;

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, permissions, is_active, expires_at FROM sari_api_keys WHERE key_hash = ? LIMIT 1`,
    [keyHash]
  );

  if (!rows || (rows as any[]).length === 0) return null;
  const apiKeyRow = (rows as any[])[0];

  // Check active
  if (!apiKeyRow.is_active) return null;

  // Check expiry
  if (apiKeyRow.expires_at && new Date(apiKeyRow.expires_at) < new Date()) return null;

  // Get merchant
  const merchant = await getMerchantById(apiKeyRow.merchant_id);
  if (!merchant) return null;

  // Update last_used_at (fire-and-forget)
  pool.execute(
    `UPDATE sari_api_keys SET last_used_at = NOW() WHERE id = ?`,
    [apiKeyRow.id]
  ).catch(() => {});

  return { merchant, keyId: apiKeyRow.id };
}

// ═══════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════

const rateLimitMap: Record<string, { count: number; resetAt: number }> = {};

function checkApiRateLimit(key: string, maxRequests: number = 100, windowMs: number = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap[key];

  if (!entry || now > entry.resetAt) {
    rateLimitMap[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// PEN-BYAAN-01: Separate rate limiters for sensitive operations
const provisionLimitMap: Record<string, { count: number; resetAt: number }> = {};
const syncLimitMap: Record<string, { count: number; resetAt: number }> = {};

function checkProvisionLimit(key: string): boolean {
  return checkSpecialLimit(provisionLimitMap, key, 5, 3600_000); // 5 per hour
}

function checkSyncLimit(key: string): boolean {
  return checkSpecialLimit(syncLimitMap, key, 10, 60_000); // 10 per minute
}

function checkSpecialLimit(map: Record<string, { count: number; resetAt: number }>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map[key];
  if (!entry || now > entry.resetAt) {
    map[key] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate domain format
function isValidDomain(domain: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain) && domain.length <= 255;
}

// PEN-SYNC-23: Strip HTML tags — handles unclosed tags to prevent XSS bypass
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>?/g, '').trim();
}

// Valid action types
const VALID_ACTION_TYPES = ['enrollment', 'payment', 'inquiry'] as const;

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimitMap)) {
    if (rateLimitMap[key].resetAt < now) delete rateLimitMap[key];
  }
  for (const key of Object.keys(provisionLimitMap)) {
    if (provisionLimitMap[key].resetAt < now) delete provisionLimitMap[key];
  }
  for (const key of Object.keys(syncLimitMap)) {
    if (syncLimitMap[key].resetAt < now) delete syncLimitMap[key];
  }
}, 300_000);

// ═══════════════════════════════════════════════════════════════
// Platform Key Validation (M2M — Byaan ↔ Sari)
// ═══════════════════════════════════════════════════════════════

/**
 * Platform keys are secrets shared between Sari and partner platforms.
 * Sources: 1) DB table (admin-managed), 2) env fallback
 * Format: sari_platform_{platformName}_{secret}
 */
const PLATFORM_KEYS: Record<string, string> = {};

// Load from env as fallback
if (process.env.BYAAN_PLATFORM_KEY) {
  PLATFORM_KEYS['byaan'] = process.env.BYAAN_PLATFORM_KEY;
}

let _platformKeysTableCreated = false;

async function ensurePlatformKeysTable() {
  if (_platformKeysTableCreated) return;
  try {
    const pool = await getPool();
    if (!pool) return;
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_platform_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        platform VARCHAR(50) NOT NULL UNIQUE,
        key_value VARCHAR(255) NOT NULL,
        label VARCHAR(100) DEFAULT '',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    _platformKeysTableCreated = true;
    // Load DB keys into memory
    await loadPlatformKeysFromDb();
  } catch (e) {
    console.error('[SariAPI] Failed to create platform_keys table:', e);
  }
}

async function loadPlatformKeysFromDb() {
  try {
    const pool = await getPool();
    if (!pool) return;
    const [rows] = await pool.execute(
      `SELECT platform, key_value FROM sari_platform_keys WHERE is_active = 1`
    );
    for (const row of rows as any[]) {
      PLATFORM_KEYS[row.platform] = row.key_value;
    }
  } catch (e) { /* table may not exist yet */ }
}

// Load DB keys on startup (deferred)
setTimeout(() => loadPlatformKeysFromDb(), 3000);

/** Admin: Set/update a platform key */
export async function setPlatformKey(platform: string, keyValue: string, label: string = ''): Promise<void> {
  await ensurePlatformKeysTable();
  const pool = await getPool();
  if (!pool) throw new Error('DB unavailable');

  try {
    // MySQL 8.0.20+ compatible — avoid deprecated VALUES() in ON DUPLICATE KEY UPDATE
    await pool.execute(
      `INSERT INTO sari_platform_keys (platform, key_value, label, is_active) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE key_value = ?, label = ?, is_active = 1, updated_at = NOW()`,
      [platform, keyValue, label, keyValue, label]
    );
  } catch (e: any) {
    console.error('[SariAPI] setPlatformKey failed:', e?.message || e);
    throw new Error('فشل حفظ مفتاح المنصة في قاعدة البيانات');
  }
  // Update in-memory cache
  PLATFORM_KEYS[platform] = keyValue;
}

/** Admin: Get all platform keys */
export async function getPlatformKeys(): Promise<Array<{ platform: string; keyPrefix: string; label: string; createdAt: string }>> {
  await ensurePlatformKeysTable();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT platform, key_value, label, created_at FROM sari_platform_keys WHERE is_active = 1`
  );
  // PEN-SYNC-24: Reduce key exposure — show only platform prefix, not secret chars
  return (rows as any[]).map(r => ({
    platform: r.platform,
    keyPrefix: r.key_value.substring(0, 12) + '••••••••••••',
    label: r.label || '',
    createdAt: r.created_at,
  }));
}

/** Admin: Delete a platform key */
export async function deletePlatformKey(platform: string): Promise<void> {
  await ensurePlatformKeysTable();
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE sari_platform_keys SET is_active = 0 WHERE platform = ?`,
    [platform]
  );
  delete PLATFORM_KEYS[platform];
}

/** Generate a new platform key value */
export function generatePlatformKeyValue(platform: string): string {
  return `sari_platform_${platform}_${crypto.randomBytes(32).toString('hex')}`;
}

function validatePlatformKey(key: string): { platform: string } | null {
  for (const [platform, secret] of Object.entries(PLATFORM_KEYS)) {
    // PEN-R3-04: Use timing-safe comparison to prevent timing attacks
    if (key.length === secret.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
      return { platform };
    }
  }
  return null;
}

/** Platform auth middleware — validates X-Platform-Key header */
function platformAuthMiddleware(req: PlatformRequest, res: Response, next: NextFunction) {
  const platformKey = req.headers['x-platform-key'] as string;
  if (!platformKey) {
    return res.status(401).json({
      error: 'Platform key required',
      errorAr: 'مفتاح المنصة مطلوب',
      hint: 'Add header: X-Platform-Key: sari_platform_byaan_xxxxx',
    });
  }

  // Rate limit by platform key prefix
  const keyPrefix = platformKey.substring(0, 20);
  if (!checkApiRateLimit(`platform_${keyPrefix}`, 30, 60_000)) {
    return res.status(429).json({ error: 'Platform rate limit exceeded', errorAr: 'تجاوزت حد طلبات المنصة' });
  }

  const result = validatePlatformKey(platformKey);
  if (!result) {
    return res.status(401).json({ error: 'Invalid platform key', errorAr: 'مفتاح المنصة غير صالح' });
  }

  req.platform = result.platform;
  req.tenantDomain = req.body?.tenantDomain || req.headers['x-tenant-domain'] as string;
  next();
}

// ═══════════════════════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════════════════════

/** Auth middleware — validates API key from Authorization header */
async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      errorAr: 'مفتاح API مطلوب',
      hint: 'Add header: Authorization: Bearer sari_sk_xxxxx',
    });
  }

  const key = authHeader.substring(7);
  if (!key.startsWith('sari_sk_')) {
    return res.status(401).json({ error: 'Invalid API key format', errorAr: 'تنسيق مفتاح API غير صالح' });
  }

  // Rate limit by key prefix
  if (!checkApiRateLimit(key.substring(0, 12))) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      errorAr: 'تجاوزت الحد الأقصى للطلبات (100/دقيقة)',
      retryAfter: 60,
    });
  }

  const result = await validateApiKey(key);
  if (!result) {
    return res.status(401).json({ error: 'Invalid or expired API key', errorAr: 'مفتاح API غير صالح أو منتهي' });
  }

  req.merchant = result.merchant;
  req.apiKeyId = result.keyId;
  next();
}

// ═══════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════

export const sariApiRouter = express.Router();
export const sariPlatformRouter = express.Router();

// PEN-SYNC-13: Body size limit on platform sync endpoints (prevents OOM via oversized payloads)
sariPlatformRouter.use(express.json({ limit: '2mb' }));

// Apply auth to merchant routes
sariApiRouter.use(authMiddleware);

// Apply platform auth to platform routes
sariPlatformRouter.use(platformAuthMiddleware);

// ── GET /api/v1/me — Merchant info ──────────────────────────
sariApiRouter.get('/me', (req: AuthenticatedRequest, res: Response) => {
  const m = req.merchant;
  res.json({
    id: m.id,
    businessName: m.businessName,
    industry: m.industry,
    city: m.city,
    website: m.website,
    phone: m.phone,
    currency: m.currency,
    autoReplyEnabled: m.autoReplyEnabled,
    createdAt: m.createdAt,
  });
});

// ── GET /api/v1/brain/sources — Knowledge sources overview ──
sariApiRouter.get('/brain/sources', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant.id;
    const sources: any[] = [];

    // Document
    const doc = await getKnowledgeDocByMerchantId(merchantId);
    if (doc) sources.push({ type: 'document', name: doc.fileName, status: doc.extractionStatus, textLength: doc.extractedText?.length || 0 });

    // Products
    const products = await (getProductsByMerchantId as any)(merchantId);
    if (products.length > 0) sources.push({ type: 'products', count: products.length });

    // FAQs
    const faqs = await getExtractedFaqsByMerchantId(merchantId);
    if (faqs.length > 0) sources.push({ type: 'faqs', count: faqs.length, activeCount: faqs.filter((f: any) => f.isActive).length });

    res.json({ sources });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sources', errorAr: 'فشل جلب مصادر المعرفة' });
  }
});

// ── POST /api/v1/brain/test — Test Sari with a question ─────
sariApiRouter.post('/brain/test', async (req: AuthenticatedRequest, res: Response) => {
  const { question } = req.body;
  if (!question || typeof question !== 'string' || question.length < 1 || question.length > 500) {
    return res.status(400).json({ error: 'question is required (1-500 chars)', errorAr: 'السؤال مطلوب (1-500 حرف)' });
  }

  try {
    const { chatWithSari } = await import('../ai/sari-personality');
    const answer = await chatWithSari({
      merchantId: req.merchant.id,
      customerPhone: 'api-test',
      customerName: 'API Test',
      message: question,
    });
    res.json({ question, answer });
  } catch (e) {
    res.status(500).json({ error: 'Test failed', errorAr: 'فشل الاختبار' });
  }
});

// ── GET /api/v1/products — List products ────────────────────
sariApiRouter.get('/products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await (getProductsByMerchantId as any)(req.merchant.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    res.json({
      total: products.length,
      data: products.slice(offset, offset + limit).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        imageUrl: p.imageUrl,
        inStock: p.inStock,
        createdAt: p.createdAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch products', errorAr: 'فشل جلب المنتجات' });
  }
});

// ── POST /api/v1/sync/products — Bulk sync products ─────────
sariApiRouter.post('/sync/products', async (req: AuthenticatedRequest, res: Response) => {
  // PEN-R2-02: Sync-specific rate limit for products
  const keyPrefix = req.headers.authorization?.substring(7, 19) || 'unknown';
  if (!checkSyncLimit(`sync_p_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const { products, mode: rawMode } = req.body;
  // PEN-SYNC-21: Whitelist mode parameter (same as platform endpoint)
  const mode = rawMode === 'replace' ? 'replace' : 'append';
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'products array is required', errorAr: 'مصفوفة المنتجات مطلوبة' });
  }
  if (products.length > 500) {
    return res.status(400).json({ error: 'Max 500 products per sync', errorAr: 'الحد الأقصى 500 منتج' });
  }

  try {
    const merchantId = req.merchant.id;

    // If mode is 'replace', delete existing products first
    if (mode === 'replace') {
      await deleteAllProductsByMerchantId(merchantId);
    }

    // Load existing products for upsert matching (by name)
    const existingProducts = mode !== 'replace'
      ? await (getProductsByMerchantId as any)(merchantId, { limit: 9999 })
      : [];
    const existingMap = new Map<string, number>();
    for (const ep of existingProducts) {
      existingMap.set((ep.name || '').trim().toLowerCase(), ep.id);
    }

    let created = 0;
    let updated = 0;
    let errors = 0;
    for (const p of products) {
      if (!p.name) continue;
      try {
        const sanitizedName = String(p.name).substring(0, 255);
        const productData: any = {
          merchantId,
          name: sanitizedName,
          description: p.description ? String(p.description).substring(0, 2000) : undefined,
          price: Number(p.price) || 0,
          category: p.category ? String(p.category).substring(0, 100) : undefined,
          imageUrl: p.imageUrl ? String(p.imageUrl).substring(0, 500) : undefined,
          isActive: p.inStock !== undefined ? Boolean(p.inStock) : (p.isActive !== undefined ? Boolean(p.isActive) : true),
        };

        // Upsert: check if product with same name already exists
        const existingId = existingMap.get(sanitizedName.trim().toLowerCase());
        if (existingId) {
          const { merchantId: _, ...updateData } = productData;
          await updateProduct(existingId, updateData);
          updated++;
        } else {
          await createProduct(productData);
          created++;
          existingMap.set(sanitizedName.trim().toLowerCase(), -1);
        }
      } catch (insertErr: any) {
        errors++;
        console.error(`[SariAPI] Product sync failed for "${String(p.name).substring(0, 50)}":`, insertErr?.message);
      }
    }

    // Log activity
    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'products_imported', `API Sync: ${created} جديد، ${updated} محدّث (${mode || 'upsert'})`, { created, updated, mode, source: 'api' });

    res.json({ success: true, created, updated, mode: mode || 'upsert' });
  } catch (e) {
    console.error('[SariAPI] Product sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت المزامنة' });
  }
});

// ── GET /api/v1/faqs — List FAQs ────────────────────────────
sariApiRouter.get('/faqs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faqs = await getExtractedFaqsByMerchantId(req.merchant.id);
    res.json({
      total: faqs.length,
      data: faqs.map((f: any) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        category: f.category,
        isActive: f.isActive,
        useInBot: f.useInBot,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch FAQs', errorAr: 'فشل جلب الأسئلة الشائعة' });
  }
});

// ── POST /api/v1/sync/faqs — Bulk sync FAQs ─────────────────
sariApiRouter.post('/sync/faqs', async (req: AuthenticatedRequest, res: Response) => {
  const { faqs, mode } = req.body;
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'faqs array is required', errorAr: 'مصفوفة الأسئلة مطلوبة' });
  }
  if (faqs.length > 50) {
    return res.status(400).json({ error: 'Max 50 FAQs per sync', errorAr: 'الحد الأقصى 50 سؤال' });
  }

  try {
    const merchantId = req.merchant.id;

    if (mode === 'replace') {
      await deleteAllExtractedFaqs(merchantId);
    }

    let created = 0;
    for (const f of faqs) {
      if (!f.question || !f.answer) continue;
      await createExtractedFaq({
        merchantId,
        question: String(f.question).substring(0, 500),
        answer: String(f.answer).substring(0, 2000),
        category: f.category ? String(f.category).substring(0, 100) : 'عام',
        isActive: true,
        useInBot: true,
      });
      created++;
    }

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'faq_created', `API Sync: ${created} سؤال شائع (${mode || 'append'})`, { count: created, source: 'api' });

    res.json({ success: true, created, mode: mode || 'append' });
  } catch (e) {
    console.error('[SariAPI] FAQ sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت المزامنة' });
  }
});

// ── POST /api/v1/brain/reset — Full brain reset ─────────────
sariApiRouter.post('/brain/reset', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant.id;
    const { types } = req.body; // optional: ['products', 'faqs', 'document']

    const deleted: string[] = [];

    const typesToReset = types && Array.isArray(types) ? types : ['products', 'faqs', 'document'];

    if (typesToReset.includes('document')) {
      try { await deleteKnowledgeDocsByMerchantId(merchantId); deleted.push('document'); } catch (e) { /* skip */ }
    }
    if (typesToReset.includes('products')) {
      try { await deleteAllProductsByMerchantId(merchantId); deleted.push('products'); } catch (e) { /* skip */ }
    }
    if (typesToReset.includes('faqs')) {
      try { await deleteAllExtractedFaqs(merchantId); deleted.push('faqs'); } catch (e) { /* skip */ }
    }

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'brain_reset', `API Reset: ${deleted.join(', ')}`, { deleted, source: 'api' });

    res.json({ success: true, deleted });
  } catch (e) {
    console.error('[SariAPI] Reset failed:', e);
    res.status(500).json({ error: 'Reset failed', errorAr: 'فشل إعادة الضبط' });
  }
});

// ── GET /api/v1/conversations — Conversation summaries ──────
sariApiRouter.get('/conversations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conversations = await getConversationsByMerchantId(req.merchant.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    res.json({
      total: conversations.length,
      data: conversations.slice(0, limit).map((c: any) => ({
        id: c.id,
        customerPhone: c.customerPhone,
        customerName: c.customerName,
        lastMessage: c.lastMessage,
        messageCount: c.messageCount,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch conversations', errorAr: 'فشل جلب المحادثات' });
  }
});

// ── GET /api/v1/stats — Dashboard statistics ────────────────
sariApiRouter.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const merchantId = req.merchant.id;

    const products = await (getProductsByMerchantId as any)(merchantId);
    const conversations = await getConversationsByMerchantId(merchantId);
    const faqs = await getExtractedFaqsByMerchantId(merchantId);
    const doc = await getKnowledgeDocByMerchantId(merchantId);

    res.json({
      products: products.length,
      conversations: conversations.length,
      faqs: faqs.length,
      hasDocument: !!doc,
      documentStatus: doc?.extractionStatus || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch stats', errorAr: 'فشل جلب الإحصائيات' });
  }
});

// ════════════════════════════════════════════════════════════════
// Byaan Integration — Platform-Authenticated Endpoints
// (Uses X-Platform-Key, NOT merchant API key)
// ════════════════════════════════════════════════════════════════

// ── POST /api/v1/platform/provision — Auto-create merchant account ──
sariPlatformRouter.post('/provision', async (req: PlatformRequest, res: Response) => {
  // PEN-BYAAN-01: Separate rate limit for provision
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkProvisionLimit(keyPrefix)) {
    return res.status(429).json({ error: 'Provision rate limit exceeded (5/hour)', errorAr: 'تجاوزت حد إنشاء الحسابات (5/ساعة)' });
  }

  const { name, email, password, businessName, phone, tenantDomain, callbackUrl, webhookSecret } = req.body;
  const source = req.platform || 'external';

  if (!email || !password || !businessName || !phone) {
    return res.status(400).json({
      error: 'email, password, businessName, and phone are required',
      errorAr: 'الإيميل وكلمة المرور واسم النشاط ورقم الجوال مطلوبة',
    });
  }

  // PEN-BYAAN-03: Email validation
  if (!isValidEmail(String(email))) {
    return res.status(400).json({ error: 'Invalid email format', errorAr: 'تنسيق الإيميل غير صالح' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters', errorAr: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  // Validate tenantDomain if provided
  if (tenantDomain && !isValidDomain(stripHtml(String(tenantDomain)))) {
    return res.status(400).json({ error: 'Invalid tenantDomain format', errorAr: 'تنسيق نطاق التيننت غير صالح' });
  }

  try {
    const pool = await getPool();
    if (!pool) throw new Error('DB unavailable');

    // Check if email already exists
    const [existingUsers] = await pool.execute(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [String(email).toLowerCase().trim()]
    );

    if ((existingUsers as any[])?.length > 0) {
      // PEN-BYAAN-02 + PEN-R2-05 + PEN-SYNC-28: Fully uniform response (same loginUrl to prevent enumeration)
      return res.json({
        success: true,
        created: true,
        email: String(email).toLowerCase().trim(),
        loginUrl: 'https://sary.live/login',
        dashboardUrl: 'https://sary.live/merchant/whatsapp-setup',
        message: 'Account provisioned successfully',
        messageAr: 'تم تجهيز الحساب بنجاح',
      });
    }

    // Create new user
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);
    const openId = `provision_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // PEN-R3-02: Sanitize name to prevent stored XSS
    const safeName = stripHtml(String(name || businessName)).substring(0, 100);
    const safeBusinessName = stripHtml(String(businessName)).substring(0, 255);
    const safePhone = phone ? stripHtml(String(phone)).replace(/[^0-9+\-\s()]/g, '').substring(0, 20) : null;

    const [userResult] = await pool.execute(
      `INSERT INTO users (openId, name, email, password, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, 'credentials', 'user', NOW(), NOW(), NOW())`,
      [openId, safeName, String(email).toLowerCase().trim(), hashedPassword]
    );

    const userId = (userResult as any).insertId;

    // Create merchant with platform source
    const [merchantResult] = await pool.execute(
      `INSERT INTO merchants (userId, businessName, phone, status, platform_type, createdAt, updatedAt) VALUES (?, ?, ?, 'active', ?, NOW(), NOW())`,
      [userId, safeBusinessName, safePhone, source === 'byaan' ? 'byaan' : null]
    );

    const merchantId = (merchantResult as any).insertId;

    // Generate API key
    const apiKeyResult = await generateApiKey(merchantId, `${source} auto-key`);

    // Auto-connect if Byaan with tenantDomain
    if (source === 'byaan' && tenantDomain) {
      try {
        const cleanDomain = stripHtml(String(tenantDomain));
        const apiBaseUrl = callbackUrl ? stripHtml(String(callbackUrl)) : undefined;
        const secret = webhookSecret ? String(webhookSecret) : undefined;
        const { createByaanConnection } = await import('../integrations/byaan');
        await createByaanConnection(merchantId, cleanDomain, {}, apiBaseUrl, secret);
        console.log(`[SariAPI] Byaan auto-connected: merchant=${merchantId}, tenant=${cleanDomain}, api=${apiBaseUrl || 'auto'}`);
      } catch (e) {
        console.error('[SariAPI] Byaan auto-connect failed (non-blocking):', e);
      }
    }

    // Log activity
    try {
      const { logBrainActivity } = await import('../routers-sari-brain');
      await logBrainActivity(merchantId, 'settings_changed', `حساب جديد عبر ${source} — ${email}`, { source, email, tenantDomain });
    } catch (e) { /* skip */ }

    // PEN-SYNC-09: Log apiKey securely, but don't return merchantId/apiKey in response
    // to match the existing-account response shape and prevent email enumeration
    console.log(`[SariAPI] Provision success: merchant=${merchantId}, key_prefix=${apiKeyResult.prefix}`);
    res.json({
      success: true,
      created: true,
      email: String(email).toLowerCase().trim(),
      loginUrl: 'https://sary.live/login',
      dashboardUrl: 'https://sary.live/merchant/whatsapp-setup',
      message: 'Account provisioned successfully',
      messageAr: 'تم تجهيز الحساب بنجاح',
      platform: source,
    });
  } catch (e: any) {
    console.error('[SariAPI] Provision failed:', e);
    res.status(500).json({ error: 'Provision failed', errorAr: 'فشل إنشاء الحساب' });
  }
});

// ── POST /api/v1/platform/verify — Verify tenant connection ──
sariPlatformRouter.post('/verify', async (req: PlatformRequest, res: Response) => {
  const { tenantDomain, email } = req.body;
  if (!tenantDomain && !email) {
    return res.status(400).json({ error: 'tenantDomain or email required', errorAr: 'نطاق التيننت أو الإيميل مطلوب' });
  }

  try {
    const pool = await getPool();
    if (!pool) throw new Error('DB unavailable');

    let merchant = null;

    if (tenantDomain) {
      const [rows] = await pool.execute(
        `SELECT m.id, m.businessName, m.status, m.integration_source FROM merchants m 
         INNER JOIN byaan_connections bc ON bc.merchant_id = m.id 
         WHERE bc.tenant_domain = ? AND bc.is_active = 1 LIMIT 1`,
        [stripHtml(String(tenantDomain))]
      );
      merchant = (rows as any[])?.[0];
    } else if (email) {
      // @ts-ignore
      const [rows] = await pool.execute(
        `SELECT m.id, m.businessName, m.status, m.integration_source FROM merchants m 
         INNER JOIN users u ON u.id = m.userId 
         WHERE u.email = ? AND m.integration_source = ? LIMIT 1`,
        [String(email).toLowerCase().trim(), req.platform]
      );
      merchant = (rows as any[])?.[0];
    }

    res.json({
      connected: !!merchant,
      merchant: merchant ? {
        id: merchant.id,
        businessName: merchant.businessName,
        status: merchant.status,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Verification failed', errorAr: 'فشل التحقق' });
  }
});

// ════════════════════════════════════════════════════════════════
// Platform Helper — Resolve merchant from X-Tenant-Domain
// ════════════════════════════════════════════════════════════════

/**
 * Resolve a merchant from the tenantDomain header.
 * Used by all platform/merchant/* and platform/sync/* endpoints.
 * Returns merchant object or null if not found.
 */
async function resolveMerchantByDomain(tenantDomain: string | undefined): Promise<any | null> {
  if (!tenantDomain) return null;

  const cleanDomain = stripHtml(String(tenantDomain));
  if (!isValidDomain(cleanDomain)) return null;

  try {
    const pool = await getPool();
    if (!pool) return null;

    const [rows] = await pool.execute(
      `SELECT m.* FROM merchants m
       INNER JOIN byaan_connections bc ON bc.merchant_id = m.id
       WHERE bc.tenant_domain = ? AND bc.is_active = 1 LIMIT 1`,
      [cleanDomain]
    );

    return (rows as any[])?.[0] || null;
  } catch (e) {
    console.error('[SariAPI] resolveMerchantByDomain failed:', e);
    return null;
  }
}

/** Standard 404 response when merchant not found for a domain */
function merchantNotFound(res: Response) {
  return res.status(404).json({
    error: 'Merchant not found for this domain',
    errorAr: 'لا يوجد تاجر مرتبط بهذا الدومين',
    hint: 'Ensure the merchant registered on sary.live and linked to this tenant domain',
  });
}

// ════════════════════════════════════════════════════════════════
// Platform Sync Endpoints — X-Platform-Key authenticated
// (Byaan sends data → Sari stores locally)
// ════════════════════════════════════════════════════════════════

// ── POST /api/v1/platform/sync/products — Sync products via Platform Key ──
sariPlatformRouter.post('/sync/products', async (req: PlatformRequest, res: Response) => {
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSyncLimit(`platform_sync_p_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  const { products, mode: rawMode } = req.body;
  // SEC-2: Whitelist mode parameter
  const mode = rawMode === 'replace' ? 'replace' : 'append';
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'products array is required', errorAr: 'مصفوفة المنتجات مطلوبة' });
  }
  if (products.length > 500) {
    return res.status(400).json({ error: 'Max 500 products per sync', errorAr: 'الحد الأقصى 500 منتج' });
  }

  try {
    const merchantId = merchant.id;

    if (mode === 'replace') {
      await deleteAllProductsByMerchantId(merchantId);
    }

    // Load existing products for upsert matching (by name)
    const existingProducts = mode !== 'replace' 
      ? await (getProductsByMerchantId as any)(merchantId, { limit: 9999 })
      : [];
    // Build lookup map: normalized name → product id
    const existingMap = new Map<string, number>();
    for (const ep of existingProducts) {
      existingMap.set((ep.name || '').trim().toLowerCase(), ep.id);
    }

    let created = 0;
    let updated = 0;
    let errors = 0;
    for (const p of products) {
      if (!p.name) continue;
      try {
        // SEC-3: Sanitize all text fields to prevent stored XSS
        // Byaan courses: save course dates + enrollment for availability checks
        const stockValue = p.maxStudents ? Number(p.maxStudents) : (p.stock ? Number(p.stock) : null);
        const sanitizedName = stripHtml(String(p.name)).substring(0, 255);

        // Course date validation: auto-deactivate expired courses
        const courseEndDate = p.endDate || p.courseEndDate || null;
        const courseStartDate = p.startDate || p.courseStartDate || null;
        const enrolledCount = p.enrolledCount ? Number(p.enrolledCount) : 0;
        const maxStudents = p.maxStudents ? Number(p.maxStudents) : null;
        const isExpired = courseEndDate ? new Date(courseEndDate) < new Date() : false;
        const isFull = maxStudents !== null && enrolledCount >= maxStudents;
        const registrationOpen = p.registrationOpen !== undefined 
          ? Boolean(p.registrationOpen) 
          : (!isExpired && !isFull);

        const productData: any = {
          merchantId,
          name: sanitizedName,
          nameAr: p.nameAr ? stripHtml(String(p.nameAr)).substring(0, 255) : undefined,
          description: p.description ? stripHtml(String(p.description)).substring(0, 2000) : undefined,
          descriptionAr: p.descriptionAr ? stripHtml(String(p.descriptionAr)).substring(0, 2000) : undefined,
          price: Number(p.price) || 0,
          category: p.category ? stripHtml(String(p.category)).substring(0, 100) : undefined,
          imageUrl: p.imageUrl ? stripHtml(String(p.imageUrl)).substring(0, 500) : undefined,
          productUrl: p.productUrl ? stripHtml(String(p.productUrl)).substring(0, 500) : undefined,
          // Auto-deactivate expired courses
          isActive: isExpired ? false : (p.inStock !== undefined ? Boolean(p.inStock) : (p.isActive !== undefined ? Boolean(p.isActive) : true)),
          stock: stockValue,
          trackInventory: stockValue !== null ? 1 : 0,
          // Course-specific fields
          courseStartDate: courseStartDate || undefined,
          courseEndDate: courseEndDate || undefined,
          maxStudents: maxStudents,
          enrolledCount: enrolledCount,
          registrationOpen: registrationOpen ? 1 : 0,
        };

        // Upsert: check if product with same name already exists
        const existingId = existingMap.get(sanitizedName.trim().toLowerCase());
        if (existingId) {
          // Update existing product (don't duplicate)
          const { merchantId: _, ...updateData } = productData;
          await updateProduct(existingId, updateData);
          updated++;
        } else {
          // Create new product
          await createProduct(productData);
          created++;
          // Add to map so subsequent duplicates in same batch are caught
          existingMap.set(sanitizedName.trim().toLowerCase(), -1);
        }
      } catch (insertErr: any) {
        errors++;
        console.error(`[SariAPI] Platform product sync failed for "${stripHtml(String(p.name)).substring(0, 50)}":`, insertErr?.message);
      }
    }

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'products_imported', `Platform Sync: ${created} جديد، ${updated} محدّث (${mode || 'upsert'})`, { created, updated, mode, source: 'platform' });

    // Update last_sync_at timestamp
    const { updateByaanSyncStatus } = await import('../integrations/byaan');
    await updateByaanSyncStatus(merchantId, 'active');

    res.json({ success: true, created, updated, mode: mode || 'upsert' });
  } catch (e) {
    console.error('[SariAPI] Platform product sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت المزامنة' });
  }
});

// ── POST /api/v1/platform/sync/trainees — Sync trainees via Platform Key ──
sariPlatformRouter.post('/sync/trainees', async (req: PlatformRequest, res: Response) => {
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSyncLimit(`platform_sync_t_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  const { trainees, mode } = req.body;
  if (!Array.isArray(trainees)) {
    return res.status(400).json({ error: 'trainees array is required', errorAr: 'مصفوفة المتدربين مطلوبة' });
  }
  if (trainees.length > 500) {
    return res.status(400).json({ error: 'Max 500 trainees per sync', errorAr: 'الحد الأقصى 500 متدرب' });
  }

  try {
    const { syncTrainees } = await import('../integrations/byaan');
    const result = await syncTrainees(merchant.id, trainees);

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchant.id, 'settings_changed',
      `Platform Sync متدربين: ${result.created} جديد، ${result.updated} محدث، ${result.linked} مربوط`,
      { ...result, source: 'platform' }
    );

    // Update last_sync_at timestamp
    const { updateByaanSyncStatus } = await import('../integrations/byaan');
    await updateByaanSyncStatus(merchant.id, 'active');

    res.json({ success: true, ...result, mode: mode || 'upsert' });
  } catch (e) {
    console.error('[SariAPI] Platform trainee sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت مزامنة المتدربين' });
  }
});

// ── POST /api/v1/platform/sync/settings — Sync settings via Platform Key ──
sariPlatformRouter.post('/sync/settings', async (req: PlatformRequest, res: Response) => {
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSyncLimit(`platform_sync_s_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object is required', errorAr: 'كائن الإعدادات مطلوب' });
  }

  try {
    const { syncSettings } = await import('../integrations/byaan');
    const result = await syncSettings(merchant.id, settings);

    if (result.updated.length > 0) {
      const { logBrainActivity } = await import('../routers-sari-brain');
      await logBrainActivity(merchant.id, 'settings_changed',
        `Platform Settings Sync: ${result.updated.join(', ')}`,
        { updated: result.updated, source: 'platform' }
      );
    }

    // Update last_sync_at timestamp
    const { updateByaanSyncStatus } = await import('../integrations/byaan');
    await updateByaanSyncStatus(merchant.id, 'active');

    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[SariAPI] Platform settings sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت مزامنة الإعدادات' });
  }
});

// ── POST /api/v1/platform/sync/faqs — Sync FAQs via Platform Key ──
sariPlatformRouter.post('/sync/faqs', async (req: PlatformRequest, res: Response) => {
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSyncLimit(`platform_sync_f_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  const { faqs, mode: rawFaqMode } = req.body;
  // SEC-2: Whitelist mode parameter
  const mode = rawFaqMode === 'replace' ? 'replace' : 'append';
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'faqs array is required', errorAr: 'مصفوفة الأسئلة مطلوبة' });
  }
  if (faqs.length > 50) {
    return res.status(400).json({ error: 'Max 50 FAQs per sync', errorAr: 'الحد الأقصى 50 سؤال' });
  }

  try {
    const merchantId = merchant.id;

    if (mode === 'replace') {
      await deleteAllExtractedFaqs(merchantId);
    }

    let created = 0;
    for (const f of faqs) {
      if (!f.question || !f.answer) continue;
      // SEC-5: Sanitize all text fields to prevent stored XSS
      await createExtractedFaq({
        merchantId,
        question: stripHtml(String(f.question)).substring(0, 500),
        answer: stripHtml(String(f.answer)).substring(0, 2000),
        category: f.category ? stripHtml(String(f.category)).substring(0, 100) : 'عام',
        isActive: true,
        useInBot: true,
      });
      created++;
    }

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'faq_created', `Platform Sync: ${created} سؤال شائع (${mode || 'append'})`, { count: created, source: 'platform' });

    // Update last_sync_at timestamp
    const { updateByaanSyncStatus } = await import('../integrations/byaan');
    await updateByaanSyncStatus(merchantId, 'active');

    res.json({ success: true, created, mode: mode || 'append' });
  } catch (e) {
    console.error('[SariAPI] Platform FAQ sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت المزامنة' });
  }
});

// ── POST /api/v1/platform/sync/knowledge — Feed synced data into Knowledge Engine ──
// Called AFTER all other syncs complete. Reads merchant's products + FAQs + settings,
// composes rich text, and runs it through ingestContent + embedAllSections.
// This makes Byaan data searchable by Sari's RAG-powered AI brain.
// The text is designed to be GPT-analyzable: sections, headings, structured content
// so that Knowledge Engine extracts sales_intel + opportunities (same as website analysis).
sariPlatformRouter.post('/sync/knowledge', async (req: PlatformRequest, res: Response) => {
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSpecialLimit(syncLimitMap, `platform_sync_k_${keyPrefix}`, 3, 60_000)) {
    return res.status(429).json({ error: 'Knowledge sync rate limit exceeded (3/min)', errorAr: 'تجاوزت حد مزامنة المعرفة' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const merchantId = merchant.id;
    const parts: string[] = [];

    // Accept optional siteContent from Byaan (vision, mission, about, policies)
    const { siteContent } = req.body || {};

    // 1. Merchant profile — rich context for GPT industry detection
    parts.push(`--- معلومات النشاط التجاري ---`);
    const bizName = merchant.business_name || merchant.businessName || '';
    if (bizName) parts.push(`اسم النشاط: ${bizName}`);
    if ((merchant as any).description) parts.push(`وصف النشاط: ${(merchant as any).description}`);
    if ((merchant as any).phone) parts.push(`هاتف التواصل: ${(merchant as any).phone}`);
    if ((merchant as any).website_url || (merchant as any).websiteUrl) parts.push(`الموقع الإلكتروني: ${(merchant as any).website_url || (merchant as any).websiteUrl}`);
    if ((merchant as any).industry) parts.push(`القطاع: ${(merchant as any).industry}`);

    // 2. Site content — academy identity (about, vision, mission, policies)
    if (siteContent && typeof siteContent === 'string' && siteContent.trim().length > 20) {
      // PEN-BYAAN-01: Clean CMS content (may contain HTML/JSON-LD artifacts from Byaan pages)
      const { cleanScrapedText } = await import('../_core/websiteAnalyzer');
      const cleanSiteContent = cleanScrapedText(stripHtml(siteContent));
      parts.push(`\n--- هوية الأكاديمية ---`);
      parts.push(cleanSiteContent.substring(0, 5000));
    }

    // 3. Products (courses) — FULL descriptions for deep understanding
    // Filter active only + non-expired to prevent stale knowledge
    const allProducts = await (getProductsByMerchantId as any)(merchantId);
    const now = new Date();
    const products = allProducts.filter((p: any) => {
      if (!p.isActive && p.isActive !== undefined) return false;
      // Filter out expired courses
      const endDate = p.courseEndDate || p.course_end_date;
      if (endDate && new Date(endDate) < now) return false;
      return true;
    });
    if (products.length > 0) {
      parts.push(`\n--- الدورات والمنتجات المتاحة (${products.length}) ---`);
      for (const p of products) {
        const name = p.name || p.nameAr || 'بدون اسم';
        let line = `\n• ${name}`;
        if (p.price) line += `\nالسعر: ${p.price} ر.س`;
        if (p.category) line += `\nالتصنيف: ${p.category}`;
        
        // Course dates
        const startDate = p.courseStartDate || p.course_start_date;
        const endDate = p.courseEndDate || p.course_end_date;
        if (startDate) line += `\nتاريخ البداية: ${new Date(startDate).toLocaleDateString('ar-SA')}`;
        if (endDate) line += `\nتاريخ النهاية: ${new Date(endDate).toLocaleDateString('ar-SA')}`;
        
        // Seats
        const maxStudents = p.maxStudents || p.max_students;
        const enrolled = p.enrolledCount || p.enrolled_count || 0;
        if (maxStudents) {
          const remaining = Math.max(0, maxStudents - enrolled);
          line += `\nالمقاعد: ${remaining} متبقي من ${maxStudents}`;
          if (remaining === 0) line += ` ⛔ مكتملة`;
        }
        
        // Registration
        const regOpen = p.registrationOpen ?? p.registration_open;
        if (regOpen === 0 || regOpen === false) line += `\nالتسجيل: مغلق`;
        
        if (p.description) line += `\nالوصف: ${(p.description as string).substring(0, 2000)}`;
        parts.push(line);
      }
    }

    // 4. FAQs — full content for knowledge enrichment
    const faqs = await getExtractedFaqsByMerchantId(merchantId);
    if (faqs.length > 0) {
      parts.push(`\n--- الأسئلة الشائعة والمعلومات (${faqs.length}) ---`);
      for (const f of faqs) {
        parts.push(`س: ${f.question}\nج: ${f.answer}`);
      }
    }

    // 5. Discovered pages content (from previous website analysis)
    const pool = await getPool();
    if (pool) {
      try {
        const [pages] = await pool.execute(
          `SELECT page_type, title, content FROM discovered_pages WHERE merchant_id = ? AND is_active = 1 AND content IS NOT NULL AND LENGTH(content) > 50 ORDER BY page_type LIMIT 20`,
          [merchantId]
        );
        if (Array.isArray(pages) && pages.length > 0) {
          // PEN-BYAAN-02: Clean legacy page content at read-time
          const { cleanScrapedText: cleanPage } = await import('../_core/websiteAnalyzer');
          parts.push(`\n--- صفحات الموقع المكتشفة ---`);
          for (const page of pages as any[]) {
            parts.push(`\n[${page.title || page.page_type}]\n${cleanPage((page.content || '')).substring(0, 3000)}`);
          }
        }
      } catch { /* skip — table might not exist */ }
    }

    // 6. Statistics — social proof for sales intel
    let customerCount = 0;
    if (pool) {
      try {
        const [rows] = await pool.execute(`SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = ?`, [merchantId]);
        customerCount = (rows as any[])?.[0]?.cnt || 0;
      } catch { /* skip */ }
    }
    if (customerCount > 0 || products.length > 0) {
      parts.push(`\n--- إحصائيات ---`);
      if (customerCount > 0) parts.push(`عدد العملاء/المتدربين: ${customerCount}`);
      parts.push(`عدد المنتجات/الدورات: ${products.length}`);
      if (faqs.length > 0) parts.push(`عدد الأسئلة الشائعة: ${faqs.length}`);
    }

    const fullText = parts.join('\n');

    if (fullText.trim().length < 50) {
      return res.json({ success: true, ingested: false, reason: 'insufficient_content', sectionsCount: 0 });
    }

    // Run through Knowledge Engine — same GPT pipeline as website analysis:
    // classifyContent → analyzeSalesIntelligence → evolveKnowledge
    const { ingestContent } = await import('../ai/knowledge-engine');
    const ingestionResult = await ingestContent(
      merchantId, fullText, 'byaan_sync',
      { businessName: bizName, industry: (merchant as any).industry },
      `byaan-sync://${req.tenantDomain || 'unknown'}`
    );

    // Run RAG embeddings
    let embeddedCount = 0;
    try {
      const { embedAllSections } = await import('../ai/rag-engine');
      embeddedCount = await embedAllSections(merchantId, true);
    } catch { /* non-blocking */ }

    // Invalidate knowledge cache
    try {
      const knowledgeDb = await import('../db/knowledge');
      await knowledgeDb.invalidateCache(merchantId);
    } catch { /* non-blocking */ }

    const { logBrainActivity } = await import('../routers-sari-brain');
    const evolve = ingestionResult?.evolveResult;
    const salesIntel = ingestionResult?.salesIntel;
    await logBrainActivity(merchantId, 'knowledge_synced',
      `بيان → عقل ساري: ${products.length} منتج + ${faqs.length} FAQ → ${evolve?.added || 0} section جديد, ${evolve?.evolved || 0} محدّث | ${salesIntel?.usps?.length || 0} USP, ${salesIntel?.sellingTips?.length || 0} tip`,
      { products: products.length, faqs: faqs.length, embedded: embeddedCount, source: 'byaan_sync', evolve, salesIntel: { usps: salesIntel?.usps?.length || 0, tips: salesIntel?.sellingTips?.length || 0, opportunities: salesIntel?.opportunities?.length || 0 } }
    );

    res.json({
      success: true,
      ingested: true,
      inputLength: fullText.length,
      sections: evolve?.added || 0,
      evolved: evolve?.evolved || 0,
      embedded: embeddedCount,
      salesIntel: {
        usps: salesIntel?.usps?.length || 0,
        sellingTips: salesIntel?.sellingTips?.length || 0,
        opportunities: salesIntel?.opportunities?.length || 0,
      },
    });
  } catch (e) {
    console.error('[SariAPI] Platform knowledge sync failed:', e);
    res.status(500).json({ error: 'Knowledge sync failed', errorAr: 'فشلت مزامنة المعرفة' });
  }
});

// ── GET /api/v1/platform/status — Check connection status + sync stats ──
sariPlatformRouter.get('/status', async (req: PlatformRequest, res: Response) => {
  // PEN-SYNC-03: Dedicated rate limit for status reads (DB-heavy)
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkApiRateLimit(`platform_status_${keyPrefix}`, 15, 60_000)) {
    return res.status(429).json({ error: 'Status rate limit exceeded (15/min)', errorAr: 'تجاوزت حد فحص الحالة' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) {
    return res.json({
      connected: false,
      platform: req.platform || 'unknown',
      tenantDomain: req.tenantDomain || null,
      message: 'No merchant linked to this domain',
      messageAr: 'لا يوجد تاجر مربوط بهذا الدومين',
    });
  }

  try {
    const { getByaanConnection } = await import('../integrations/byaan');
    const connection = await getByaanConnection(merchant.id);

    // Get product + customer counts
    const products = await (getProductsByMerchantId as any)(merchant.id);
    const pool = await getPool();
    let customerCount = 0;
    let faqCount = 0;
    let faqCategories: string[] = [];
    let knowledgeSectionCount = 0;
    let discoveredPageCount = 0;
    let discoveredPageTitles: string[] = [];

    if (pool) {
      try {
        const [rows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM customers WHERE merchant_id = ?`,
          [merchant.id]
        );
        customerCount = (rows as any[])?.[0]?.cnt || 0;
      } catch (e) { /* skip */ }

      // FAQs count + categories
      try {
        const [faqRows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM extracted_faqs WHERE merchant_id = ?`,
          [merchant.id]
        );
        faqCount = (faqRows as any[])?.[0]?.cnt || 0;

        const [catRows] = await pool.execute(
          `SELECT DISTINCT category FROM extracted_faqs WHERE merchant_id = ? AND category IS NOT NULL`,
          [merchant.id]
        );
        faqCategories = (catRows as any[])?.map((r: any) => r.category).filter(Boolean) || [];
      } catch (e) { /* skip */ }

      // Knowledge sections count
      try {
        const [ksRows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM knowledge_sections WHERE merchant_id = ?`,
          [merchant.id]
        );
        knowledgeSectionCount = (ksRows as any[])?.[0]?.cnt || 0;
      } catch (e) { /* skip */ }

      // Discovered pages — PEN-SYNC-05: separate COUNT for accuracy
      try {
        const [countRows] = await pool.execute(
          `SELECT COUNT(*) as cnt FROM discovered_pages WHERE merchant_id = ? AND is_active = 1`,
          [merchant.id]
        );
        discoveredPageCount = (countRows as any[])?.[0]?.cnt || 0;

        const [dpRows] = await pool.execute(
          `SELECT title, page_type FROM discovered_pages WHERE merchant_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 20`,
          [merchant.id]
        );
        discoveredPageTitles = (dpRows as any[])?.map((r: any) => r.title || r.page_type).filter(Boolean) || [];
      } catch (e) { /* skip */ }
    }

    res.json({
      connected: true,
      platform: req.platform || 'byaan',
      merchantId: merchant.id,
      businessName: merchant.business_name || merchant.businessName,
      tenantDomain: connection?.tenant_domain || req.tenantDomain,
      syncStatus: connection?.sync_status || 'unknown',
      lastSyncAt: connection?.last_sync_at || null,
      // PEN-SYNC-02: Don't expose raw error messages — only boolean flag
      hasSyncErrors: !!connection?.sync_errors,
      stats: {
        products: products.length,
        productNames: products.slice(0, 20).map((p: any) => p.name),
        customers: customerCount,
        faqs: faqCount,
        faqCategories,
        knowledgeSections: knowledgeSectionCount,
        discoveredPages: discoveredPageCount,
        discoveredPageTitles,
      },
    });
  } catch (e) {
    console.error('[SariAPI] Platform status failed:', e);
    res.status(500).json({ error: 'Status check failed', errorAr: 'فشل فحص الحالة' });
  }
});

// ── POST /api/v1/platform/request-resync — Request Byaan to push data again ──
sariPlatformRouter.post('/request-resync', async (req: PlatformRequest, res: Response) => {
  // PEN-SYNC-05: Tight rate limit for resync (outbound HTTP trigger)
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkSpecialLimit(syncLimitMap, `platform_resync_${keyPrefix}`, 3, 60_000)) {
    return res.status(429).json({ error: 'Resync rate limit exceeded (3/min)', errorAr: 'تجاوزت حد إعادة المزامنة (3/دقيقة)' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const { getByaanConnection, updateByaanSyncStatus } = await import('../integrations/byaan');
    const connection = await getByaanConnection(merchant.id);

    if (!connection || !connection.api_base_url) {
      return res.status(400).json({
        error: 'No Byaan connection configured for this merchant',
        errorAr: 'لا يوجد ربط مع بيان لهذا التاجر',
      });
    }

    // Mark sync status as 'syncing'
    await updateByaanSyncStatus(merchant.id, 'syncing');

    // Try to call Byaan's resync endpoint
    try {
      const axios = (await import('axios')).default;
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({ merchant_id: merchant.id, timestamp });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Sari-Timestamp': String(timestamp),
      };

      // Sign with webhook_secret if available
      if (connection.webhook_secret) {
        const signature = crypto.createHmac('sha256', connection.webhook_secret)
          .update(`${timestamp}.${body}`)
          .digest('hex');
        headers['X-Sari-Signature'] = `sha256=${signature}`;
      }

      // PEN-SYNC-01: SSRF Protection — validate URL is safe before making outbound request
      const resyncUrl = `${connection.api_base_url}/request-resync`;
      try {
        const parsedUrl = new URL(resyncUrl);
        // Block non-HTTPS, internal IPs, and metadata endpoints
        if (parsedUrl.protocol !== 'https:') {
          return res.status(400).json({ error: 'api_base_url must use HTTPS', errorAr: 'يجب أن يستخدم رابط API بروتوكول HTTPS' });
        }
        const hostname = parsedUrl.hostname;
        // PEN-SYNC-12: Extended SSRF blocklist including IPv6
        // PEN-SYNC-25: Fixed 172.x range — only block private 172.16-31, not all 172.x (e.g. Cloudflare 172.67)
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' || hostname === '[::1]' ||
          hostname === '0.0.0.0' || hostname === '[::]' ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
          hostname.startsWith('169.254.') ||
          hostname.startsWith('fe80:') ||
          hostname.startsWith('fc00:') || hostname.startsWith('fd') ||
          hostname.includes('::ffff:127.') ||
          hostname.endsWith('.internal') ||
          hostname.endsWith('.local')
        ) {
          console.warn(`[SariAPI] PEN-SYNC-01 SSRF blocked: ${hostname}`);
          return res.status(400).json({ error: 'Internal URLs are not allowed', errorAr: 'روابط الشبكة الداخلية غير مسموحة' });
        }
      } catch (urlErr) {
        return res.status(400).json({ error: 'Invalid api_base_url format', errorAr: 'تنسيق رابط API غير صالح' });
      }

      const response = await axios.post(resyncUrl, JSON.parse(body), {
        headers,
        timeout: 15000,
        validateStatus: () => true,
      });

      if (response.status >= 200 && response.status < 300) {
        await updateByaanSyncStatus(merchant.id, 'active');

        const { logBrainActivity } = await import('../routers-sari-brain');
        await logBrainActivity(merchant.id, 'settings_changed',
          'طلب إعادة مزامنة من بيان — تم بنجاح',
          { source: 'platform', status: response.status }
        );

        return res.json({
          success: true,
          message: 'Resync request sent to Byaan successfully',
          messageAr: 'تم إرسال طلب إعادة المزامنة لبيان بنجاح',
          byaanStatus: response.status,
        });
      } else {
        await updateByaanSyncStatus(merchant.id, 'error', `Byaan returned ${response.status}`);
        return res.json({
          success: false,
          message: `Byaan responded with status ${response.status}`,
          messageAr: `بيان أرجع حالة ${response.status} — تأكد من إعداد endpoint إعادة المزامنة في بيان`,
          byaanStatus: response.status,
        });
      }
    } catch (callErr: any) {
      await updateByaanSyncStatus(merchant.id, 'error', callErr?.message || 'Connection failed');
      console.error('[SariAPI] Resync call to Byaan failed:', callErr?.message);
      // PEN-SYNC-20: Don't leak internal error details (IPs, paths, DNS)
      return res.json({
        success: false,
        message: 'Failed to reach Byaan API',
        messageAr: 'فشل الاتصال بـ API بيان — تأكد من صحة api_base_url',
      });
    }
  } catch (e) {
    console.error('[SariAPI] Request resync failed:', e);
    res.status(500).json({ error: 'Resync request failed', errorAr: 'فشل طلب إعادة المزامنة' });
  }
});

// ════════════════════════════════════════════════════════════════
// Platform Dashboard Endpoints — /api/v1/platform/merchant/*
// (Byaan dashboard reads Sari data for a specific tenant)
// ════════════════════════════════════════════════════════════════

// ── GET /api/v1/platform/merchant/stats — Dashboard statistics ──
sariPlatformRouter.get('/merchant/stats', async (req: PlatformRequest, res: Response) => {
  // SEC-1: Rate limit dashboard reads
  const keyPrefix = (req.headers['x-platform-key'] as string)?.substring(0, 20) || 'unknown';
  if (!checkApiRateLimit(`platform_dash_${keyPrefix}`, 60, 60_000)) {
    return res.status(429).json({ error: 'Dashboard rate limit exceeded', errorAr: 'تجاوزت حد طلبات لوحة التحكم' });
  }

  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const merchantId = merchant.id;

    const [conversations, products, faqs] = await Promise.all([
      getConversationsByMerchantId(merchantId),
      (getProductsByMerchantId as any)(merchantId),
      getExtractedFaqsByMerchantId(merchantId),
    ]);

    // Calculate enrollments from sari_conversions
    let totalEnrollments = 0;
    let totalRevenue = 0;
    try {
      const { getConversions } = await import('../integrations/byaan');
      const conversions = await getConversions(merchantId, 200);
      totalEnrollments = conversions.filter((c: any) => c.action_type === 'enrollment').length;
      totalRevenue = conversions.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
    } catch (e) { /* sari_conversions table may not exist yet */ }

    // Calculate response rate: conversations with at least one bot reply / total
    const totalConversations = conversations.length;
    const respondedConversations = conversations.filter((c: any) =>
      c.messageCount > 1 || c.status === 'completed'
    ).length;
    const responseRate = totalConversations > 0
      ? Math.round((respondedConversations / totalConversations) * 100)
      : 0;

    res.json({
      totalConversations,
      totalEnrollments,
      totalRevenue,
      responseRate,
      // Extra fields for richer dashboards
      totalProducts: products.length,
      totalFaqs: faqs.length,
    });
  } catch (e) {
    console.error('[SariAPI] Platform merchant stats failed:', e);
    res.status(500).json({ error: 'Failed to fetch stats', errorAr: 'فشل جلب الإحصائيات' });
  }
});

// ── GET /api/v1/platform/merchant/conversations — Paginated conversations ──
sariPlatformRouter.get('/merchant/conversations', async (req: PlatformRequest, res: Response) => {
  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 15, 1), 100);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    // SEC-4: Whitelist status filter values
    const rawStatus = req.query.status as string;
    const validStatuses = ['all', 'active', 'completed', 'expired', 'pending'];
    const statusFilter = rawStatus && validStatuses.includes(rawStatus) ? rawStatus : undefined;
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const totalCount = await getConversationCountByMerchantId(merchant.id);

    // Get paginated conversations
    const conversations = await getConversationsByMerchantId(merchant.id, { limit: limit + 1, offset });

    // Check if there's a next page
    const hasNext = conversations.length > limit;
    const paginatedConversations = conversations.slice(0, limit);

    // Filter by status if requested
    const filtered = statusFilter && statusFilter !== 'all'
      ? paginatedConversations.filter((c: any) => c.status === statusFilter)
      : paginatedConversations;

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      conversations: filtered.map((c: any) => ({
        id: `conv_${c.id}`,
        customerName: c.customerName || 'غير معروف',
        phone: c.customerPhone,
        lastMessage: c.lastMessage || '',
        messageCount: c.messageCount || 0,
        date: c.lastMessageAt ? new Date(c.lastMessageAt).toISOString().split('T')[0] : c.createdAt ? new Date(c.createdAt).toISOString().split('T')[0] : null,
        status: c.status || 'active',
      })),
      pagination: {
        from: offset + 1,
        to: Math.min(offset + filtered.length, totalCount),
        total: totalCount,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: hasNext ? page + 1 : null,
        currentPage: page,
        totalPages,
      },
    });
  } catch (e) {
    console.error('[SariAPI] Platform merchant conversations failed:', e);
    res.status(500).json({ error: 'Failed to fetch conversations', errorAr: 'فشل جلب المحادثات' });
  }
});

// ── GET /api/v1/platform/merchant/instances — WhatsApp instances ──
sariPlatformRouter.get('/merchant/instances', async (req: PlatformRequest, res: Response) => {
  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const instances = await getWhatsAppInstancesByMerchantId(merchant.id);

    res.json({
      total: instances.length,
      instances: instances.map((i: any) => ({
        id: i.id,
        instanceId: i.instanceId,
        phoneNumber: i.phoneNumber,
        displayName: i.displayName,
        status: i.status,
        isPrimary: i.isPrimary,
        isActive: i.isActive,
        createdAt: i.createdAt,
      })),
    });
  } catch (e) {
    console.error('[SariAPI] Platform merchant instances failed:', e);
    res.status(500).json({ error: 'Failed to fetch instances', errorAr: 'فشل جلب الأرقام' });
  }
});

// ── GET /api/v1/platform/merchant/enrollments — Enrollment report ──
sariPlatformRouter.get('/merchant/enrollments', async (req: PlatformRequest, res: Response) => {
  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    // SEC-4: Whitelist period values
    const rawPeriod = req.query.period as string;
    const validPeriods = ['week', 'month', 'year'];
    const period = rawPeriod && validPeriods.includes(rawPeriod) ? rawPeriod : 'month';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);

    // Get conversions filtered by period
    const { getConversions } = await import('../integrations/byaan');
    const allConversions = await getConversions(merchant.id, limit);

    // Filter by period
    const now = new Date();
    let periodStart: Date;
    switch (period) {
      case 'week':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const filtered = allConversions.filter((c: any) =>
      new Date(c.created_at) >= periodStart
    );

    const enrollments = filtered.filter((c: any) => c.action_type === 'enrollment');
    const payments = filtered.filter((c: any) => c.action_type === 'payment');

    res.json({
      period,
      totalEnrollments: enrollments.length,
      totalPayments: payments.length,
      totalRevenue: filtered.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0),
      enrollments: enrollments.map((c: any) => ({
        id: c.id,
        customerName: c.customer_name,
        phone: c.customer_phone,
        productName: c.product_name,
        amount: Number(c.amount) || 0,
        status: c.status,
        date: c.created_at,
      })),
    });
  } catch (e) {
    console.error('[SariAPI] Platform merchant enrollments failed:', e);
    res.status(500).json({ error: 'Failed to fetch enrollments', errorAr: 'فشل جلب التسجيلات' });
  }
});

// ── GET /api/v1/platform/merchant/status — Connection status ──
sariPlatformRouter.get('/merchant/status', async (req: PlatformRequest, res: Response) => {
  const merchant = await resolveMerchantByDomain(req.tenantDomain);

  if (!merchant) {
    return res.json({ connected: false, merchant: null });
  }

  try {
    // Get Byaan connection details
    const { getByaanConnection } = await import('../integrations/byaan');
    const connection = await getByaanConnection(merchant.id);

    // Get WhatsApp instances count
    const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
    const activeInstances = instances.filter((i: any) => i.status === 'active');

    res.json({
      connected: true,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        status: merchant.status,
      },
      whatsapp: {
        totalInstances: instances.length,
        activeInstances: activeInstances.length,
        hasActiveNumber: activeInstances.length > 0,
      },
      sync: connection ? {
        status: connection.sync_status,
        lastSyncAt: connection.last_sync_at,
        // PEN-SYNC-07: Don't expose raw error messages — only boolean flag
        hasErrors: !!connection.sync_errors,
      } : null,
    });
  } catch (e) {
    console.error('[SariAPI] Platform merchant status failed:', e);
    res.status(500).json({ error: 'Failed to fetch status', errorAr: 'فشل جلب الحالة' });
  }
});

// ── PUT /api/v1/platform/merchant/instances/:id — Toggle WhatsApp instance ──
sariPlatformRouter.put('/merchant/instances/:id', async (req: PlatformRequest, res: Response) => {
  const merchant = await resolveMerchantByDomain(req.tenantDomain);
  if (!merchant) return merchantNotFound(res);

  try {
    const instanceId = parseInt(req.params.id);
    if (isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID', errorAr: 'معرف الرقم غير صالح' });
    }

    // Verify ownership — instance must belong to this merchant
    const instance = await getWhatsAppInstanceById(instanceId);
    if (!instance || (instance as any).merchantId !== merchant.id) {
      return res.status(404).json({ error: 'Instance not found', errorAr: 'الرقم غير موجود' });
    }

    const { isActive, isPrimary } = req.body;

    if (isPrimary === true) {
      await setWhatsAppInstanceAsPrimary(instanceId, merchant.id);
    }

    if (typeof isActive === 'boolean') {
      const newStatus = isActive ? 'active' : 'inactive';

      // Check phone conflict when activating
      if (newStatus === 'active' && (instance as any).phoneNumber) {
        const conflicting = await getActiveInstanceByPhoneNumber(
          (instance as any).phoneNumber, merchant.id
        );
        if (conflicting) {
          await deactivateInstancesByPhoneNumber(
            (instance as any).phoneNumber, merchant.id
          );
        }
      }

      await updateWhatsAppInstance(instanceId, { status: newStatus });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[SariAPI] Platform merchant instance toggle failed:', e);
    res.status(500).json({ error: 'Failed to update instance', errorAr: 'فشل تحديث الرقم' });
  }
});

// ════════════════════════════════════════════════════════════════
// Byaan Integration — Merchant-Authenticated Endpoints  
// (Uses Bearer API key, scoped to merchant)
// ════════════════════════════════════════════════════════════════

// ── POST /api/v1/sync/trainees — Sync trainees from Byaan ───
sariApiRouter.post('/sync/trainees', async (req: AuthenticatedRequest, res: Response) => {
  // PEN-BYAAN-05: Sync-specific rate limit
  const keyPrefix = req.headers.authorization?.substring(7, 19) || 'unknown';
  if (!checkSyncLimit(`sync_t_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const { trainees, mode } = req.body;
  if (!Array.isArray(trainees)) {
    return res.status(400).json({ error: 'trainees array is required', errorAr: 'مصفوفة المتدربين مطلوبة' });
  }
  if (trainees.length > 500) {
    return res.status(400).json({ error: 'Max 500 trainees per sync', errorAr: 'الحد الأقصى 500 متدرب' });
  }

  try {
    const { syncTrainees } = await import('../integrations/byaan');
    const result = await syncTrainees(req.merchant.id, trainees);

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(req.merchant.id, 'settings_changed',
      `API Sync متدربين: ${result.created} جديد، ${result.updated} محدث، ${result.linked} مربوط`,
      { ...result, source: 'api' }
    );

    res.json({ success: true, ...result, mode: mode || 'upsert' });
  } catch (e) {
    console.error('[SariAPI] Trainee sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت مزامنة المتدربين' });
  }
});

// ── POST /api/v1/sync/settings — Sync settings (whitelist) ──
sariApiRouter.post('/sync/settings', async (req: AuthenticatedRequest, res: Response) => {
  // PEN-R2-02: Sync-specific rate limit for settings
  const keyPrefix = req.headers.authorization?.substring(7, 19) || 'unknown';
  if (!checkSyncLimit(`sync_s_${keyPrefix}`)) {
    return res.status(429).json({ error: 'Sync rate limit exceeded (10/min)', errorAr: 'تجاوزت حد المزامنة (10/دقيقة)' });
  }

  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object is required', errorAr: 'كائن الإعدادات مطلوب' });
  }

  try {
    const { syncSettings } = await import('../integrations/byaan');
    const result = await syncSettings(req.merchant.id, settings);

    if (result.updated.length > 0) {
      const { logBrainActivity } = await import('../routers-sari-brain');
      await logBrainActivity(req.merchant.id, 'settings_changed',
        `API Settings Sync: ${result.updated.join(', ')}`,
        { updated: result.updated, source: 'api' }
      );
    }

    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[SariAPI] Settings sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت مزامنة الإعدادات' });
  }
});

// ── POST /api/v1/connect/byaan — Activate Byaan integration ─
sariApiRouter.post('/connect/byaan', async (req: AuthenticatedRequest, res: Response) => {
  const { tenantDomain, permissions } = req.body;
  if (!tenantDomain) {
    return res.status(400).json({ error: 'tenantDomain is required', errorAr: 'نطاق التيننت مطلوب' });
  }
  // PEN-BYAAN-04: Validate domain format
  const cleanDomain = stripHtml(String(tenantDomain));
  if (!isValidDomain(cleanDomain)) {
    return res.status(400).json({ error: 'Invalid domain format', errorAr: 'تنسيق النطاق غير صالح' });
  }

  try {
    // PEN-R2-04: Check if merchant is already connected to another platform
    const { checkExistingIntegrations } = await import('../integrations/platform-checker');
    const existing = await checkExistingIntegrations(req.merchant.id);
    // @ts-ignore
    if (existing.salla || existing.zid || existing.woocommerce) {
      // @ts-ignore
      const connectedTo = existing.salla ? 'سلة' : existing.zid ? 'زد' : 'ووكومرس';
      return res.status(409).json({
        error: `Already connected to ${connectedTo}. Disconnect first.`,
        errorAr: `التاجر مربوط بـ${connectedTo} بالفعل. افصل المنصة الحالية أولاً.`,
      });
    }

    const { createByaanConnection } = await import('../integrations/byaan');
    const connection = await createByaanConnection(req.merchant.id, cleanDomain, permissions);

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(req.merchant.id, 'settings_changed', `تم ربط بيان: ${cleanDomain}`, { tenantDomain: cleanDomain });

    res.json({ success: true, connection });
  } catch (e) {
    console.error('[SariAPI] Byaan connect failed:', e);
    res.status(500).json({ error: 'Connection failed', errorAr: 'فشل الربط' });
  }
});

// ── DELETE /api/v1/connect/byaan — Disconnect Byaan ─────────
sariApiRouter.delete('/connect/byaan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deleteByaanConnection } = await import('../integrations/byaan');
    await deleteByaanConnection(req.merchant.id);

    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(req.merchant.id, 'settings_changed', 'تم فصل ربط بيان');

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Disconnect failed', errorAr: 'فشل فصل الربط' });
  }
});

// ── GET /api/v1/conversions — Enrollment/payment log ────────
sariApiRouter.get('/conversions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getConversions } = await import('../integrations/byaan');
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
    const actionType = req.query.type as string | undefined;

    const data = await getConversions(req.merchant.id, limit, actionType);
    res.json({ total: data.length, data });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch conversions', errorAr: 'فشل جلب التسجيلات' });
  }
});

// ── POST /api/v1/conversions — Record a conversion ──────────
sariApiRouter.post('/conversions', async (req: AuthenticatedRequest, res: Response) => {
  const { customerPhone, customerName, actionType, productName, amount, externalRef } = req.body;
  if (!actionType || !productName) {
    return res.status(400).json({ error: 'actionType and productName required', errorAr: 'نوع العملية واسم المنتج مطلوبان' });
  }
  // PEN-BYAAN-06: Validate actionType enum
  if (!VALID_ACTION_TYPES.includes(actionType)) {
    return res.status(400).json({ error: 'Invalid actionType. Must be: enrollment, payment, inquiry', errorAr: 'نوع العملية غير صالح' });
  }
  // PEN-BYAAN-08: Amount bounds check
  const safeAmount = amount ? Math.max(0, Math.min(Number(amount) || 0, 999999)) : undefined;

  try {
    const { recordConversion } = await import('../integrations/byaan');
    const id = await recordConversion(req.merchant.id, {
      customerPhone: stripHtml(String(customerPhone || '')),
      customerName: stripHtml(String(customerName || '')),
      actionType,
      productName: stripHtml(String(productName)),
      amount: safeAmount,
      externalRef: externalRef ? stripHtml(String(externalRef)) : undefined,
    });
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ error: 'Failed to record conversion', errorAr: 'فشل تسجيل العملية' });
  }
});

// ── GET /api/v1/integration — Get integration info + terminology ──
sariApiRouter.get('/integration', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getIntegrationSource, getTerminology, getByaanConnection } = await import('../integrations/byaan');
    const source = await getIntegrationSource(req.merchant.id);
    const terminology = getTerminology(source);
    const byaanConnection = source === 'byaan' ? await getByaanConnection(req.merchant.id) : null;

    res.json({
      source,
      isLocked: source !== 'none',
      terminology,
      byaan: byaanConnection ? {
        tenantDomain: byaanConnection.tenant_domain,
        syncStatus: byaanConnection.sync_status,
        lastSyncAt: byaanConnection.last_sync_at,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch integration info', errorAr: 'فشل جلب معلومات الربط' });
  }
});

// ── GET /api/v1/instances — WhatsApp instances ──────────────
sariApiRouter.get('/instances', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const instances = await getWhatsAppInstancesByMerchantId(req.merchant.id);
    res.json({
      total: instances.length,
      data: instances.map((i: any) => ({
        id: i.id,
        instanceId: i.instanceId,
        phoneNumber: i.phoneNumber,
        displayName: i.displayName,
        status: i.status,
        isPrimary: i.isPrimary,
        isActive: i.isActive,
        createdAt: i.createdAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch instances', errorAr: 'فشل جلب الأرقام' });
  }
});

// ── PUT /api/v1/instances/:id — Toggle instance ─────────────
sariApiRouter.put('/instances/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const instanceId = parseInt(req.params.id);
    if (isNaN(instanceId)) {
      return res.status(400).json({ error: 'Invalid instance ID' });
    }

    // Verify ownership
    const instance = await getWhatsAppInstanceById(instanceId);
    if (!instance || (instance as any).merchantId !== req.merchant.id) {
      return res.status(404).json({ error: 'Instance not found', errorAr: 'الرقم غير موجود' });
    }

    const { isActive, isPrimary } = req.body;

    if (isPrimary === true) {
      await setWhatsAppInstanceAsPrimary(instanceId, req.merchant.id);
    }

    if (typeof isActive === 'boolean') {
      const newStatus = isActive ? 'active' : 'inactive';

      // VULN-3 FIX: Check phone conflict when activating
      if (newStatus === 'active' && (instance as any).phoneNumber) {
        const conflicting = await getActiveInstanceByPhoneNumber(
          (instance as any).phoneNumber, req.merchant.id
        );
        if (conflicting) {
          await deactivateInstancesByPhoneNumber(
            (instance as any).phoneNumber, req.merchant.id
          );
        }
      }

      await updateWhatsAppInstance(instanceId, { status: newStatus });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update instance', errorAr: 'فشل تحديث الرقم' });
  }
});