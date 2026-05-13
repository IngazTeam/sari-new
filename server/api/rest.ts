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
import * as db from '../db';

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
    const dbConn = await db.getDb();
    if (!dbConn) return;
    await (dbConn as any).execute(`
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
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error('Database connection failed');

  // Generate: sari_sk_ + 32 random hex chars
  const rawKey = `sari_sk_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12); // sari_sk_xxxx

  await (dbConn as any).execute(
    `INSERT INTO sari_api_keys (merchant_id, key_hash, key_prefix, label) VALUES (?, ?, ?, ?)`,
    [merchantId, keyHash, keyPrefix, label]
  );

  return { key: rawKey, prefix: keyPrefix };
}

/** Validate an API key and return the merchant */
async function validateApiKey(key: string): Promise<{ merchant: any; keyId: number } | null> {
  await ensureApiKeysTable();
  const dbConn = await db.getDb();
  if (!dbConn) return null;

  const keyHash = crypto.createHash('sha256').update(key).digest('hex');

  const [rows] = await (dbConn as any).execute(
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
  const merchant = await db.getMerchantById(apiKeyRow.merchant_id);
  if (!merchant) return null;

  // Update last_used_at (fire-and-forget)
  (dbConn as any).execute(
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

// Strip HTML tags
function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '').trim();
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
    const dbConn = await db.getDb();
    if (!dbConn) return;
    await (dbConn as any).execute(`
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
    const dbConn = await db.getDb();
    if (!dbConn) return;
    const [rows] = await (dbConn as any).execute(
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
  const dbConn = await db.getDb();
  if (!dbConn) throw new Error('DB unavailable');

  await (dbConn as any).execute(
    `INSERT INTO sari_platform_keys (platform, key_value, label) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE key_value = VALUES(key_value), label = VALUES(label), is_active = 1, updated_at = NOW()`,
    [platform, keyValue, label]
  );
  // Update in-memory cache
  PLATFORM_KEYS[platform] = keyValue;
}

/** Admin: Get all platform keys */
export async function getPlatformKeys(): Promise<Array<{ platform: string; keyPrefix: string; label: string; createdAt: string }>> {
  await ensurePlatformKeysTable();
  const dbConn = await db.getDb();
  if (!dbConn) return [];

  const [rows] = await (dbConn as any).execute(
    `SELECT platform, key_value, label, created_at FROM sari_platform_keys WHERE is_active = 1`
  );
  return (rows as any[]).map(r => ({
    platform: r.platform,
    keyPrefix: r.key_value.substring(0, 24) + '••••••••',
    label: r.label || '',
    createdAt: r.created_at,
  }));
}

/** Admin: Delete a platform key */
export async function deletePlatformKey(platform: string): Promise<void> {
  await ensurePlatformKeysTable();
  const dbConn = await db.getDb();
  if (!dbConn) return;

  await (dbConn as any).execute(
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
    const doc = await db.getKnowledgeDocByMerchantId(merchantId);
    if (doc) sources.push({ type: 'document', name: doc.fileName, status: doc.extractionStatus, textLength: doc.extractedText?.length || 0 });

    // Products
    const products = await db.getProductsByMerchantId(merchantId);
    if (products.length > 0) sources.push({ type: 'products', count: products.length });

    // FAQs
    const faqs = await db.getExtractedFaqsByMerchantId(merchantId);
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
    const products = await db.getProductsByMerchantId(req.merchant.id);
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

  const { products, mode } = req.body;
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
      await db.deleteAllProductsByMerchantId(merchantId);
    }

    let created = 0;
    for (const p of products) {
      if (!p.name) continue;
      await db.createProduct({
        merchantId,
        name: String(p.name).substring(0, 255),
        description: p.description ? String(p.description).substring(0, 2000) : undefined,
        price: p.price ? Number(p.price) : undefined,
        category: p.category ? String(p.category).substring(0, 100) : undefined,
        imageUrl: p.imageUrl ? String(p.imageUrl).substring(0, 500) : undefined,
        inStock: p.inStock !== undefined ? Boolean(p.inStock) : true,
      });
      created++;
    }

    // Log activity
    const { logBrainActivity } = await import('../routers-sari-brain');
    await logBrainActivity(merchantId, 'products_imported', `API Sync: ${created} منتج (${mode || 'append'})`, { count: created, mode, source: 'api' });

    res.json({ success: true, created, mode: mode || 'append' });
  } catch (e) {
    console.error('[SariAPI] Product sync failed:', e);
    res.status(500).json({ error: 'Sync failed', errorAr: 'فشلت المزامنة' });
  }
});

// ── GET /api/v1/faqs — List FAQs ────────────────────────────
sariApiRouter.get('/faqs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faqs = await db.getExtractedFaqsByMerchantId(req.merchant.id);
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
      await db.deleteAllExtractedFaqs(merchantId);
    }

    let created = 0;
    for (const f of faqs) {
      if (!f.question || !f.answer) continue;
      await db.createExtractedFaq({
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
      try { await db.deleteKnowledgeDocsByMerchantId(merchantId); deleted.push('document'); } catch (e) { /* skip */ }
    }
    if (typesToReset.includes('products')) {
      try { await db.deleteAllProductsByMerchantId(merchantId); deleted.push('products'); } catch (e) { /* skip */ }
    }
    if (typesToReset.includes('faqs')) {
      try { await db.deleteAllExtractedFaqs(merchantId); deleted.push('faqs'); } catch (e) { /* skip */ }
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
    const conversations = await db.getConversationsByMerchantId(req.merchant.id);
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

    const products = await db.getProductsByMerchantId(merchantId);
    const conversations = await db.getConversationsByMerchantId(merchantId);
    const faqs = await db.getExtractedFaqsByMerchantId(merchantId);
    const doc = await db.getKnowledgeDocByMerchantId(merchantId);

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

  if (!email || !password || !businessName) {
    return res.status(400).json({
      error: 'email, password, and businessName are required',
      errorAr: 'الإيميل وكلمة المرور واسم النشاط مطلوبة',
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
    const dbConn = await db.getDb();
    if (!dbConn) throw new Error('DB unavailable');

    // Check if email already exists
    const [existingUsers] = await (dbConn as any).execute(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [String(email).toLowerCase().trim()]
    );

    if ((existingUsers as any[])?.length > 0) {
      // PEN-BYAAN-02 + PEN-R2-05: Uniform response
      return res.json({
        success: true,
        created: true,
        email: String(email).toLowerCase().trim(),
        loginUrl: 'https://sari.app/login',
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

    const [userResult] = await (dbConn as any).execute(
      `INSERT INTO users (open_id, name, email, password, login_method, role, created_at, updated_at, last_signed_in) VALUES (?, ?, ?, ?, 'credentials', 'user', NOW(), NOW(), NOW())`,
      [openId, safeName, String(email).toLowerCase().trim(), hashedPassword]
    );

    const userId = (userResult as any).insertId;

    // Create merchant with platform source
    const [merchantResult] = await (dbConn as any).execute(
      `INSERT INTO merchants (user_id, business_name, phone, status, integration_source, platform_type, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, NOW(), NOW())`,
      [userId, safeBusinessName, safePhone, source, source === 'byaan' ? 'byaan' : 'none']
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

    res.json({
      success: true,
      created: true,
      merchantId,
      email: String(email).toLowerCase().trim(),
      loginUrl: 'https://sari.app/login',
      apiKey: apiKeyResult.key,
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
    const dbConn = await db.getDb();
    if (!dbConn) throw new Error('DB unavailable');

    let merchant = null;

    if (tenantDomain) {
      const [rows] = await (dbConn as any).execute(
        `SELECT m.id, m.business_name, m.status, m.integration_source FROM merchants m 
         INNER JOIN byaan_connections bc ON bc.merchant_id = m.id 
         WHERE bc.tenant_domain = ? AND bc.is_active = 1 LIMIT 1`,
        [stripHtml(String(tenantDomain))]
      );
      merchant = (rows as any[])?.[0];
    } else if (email) {
      const [rows] = await (dbConn as any).execute(
        `SELECT m.id, m.business_name, m.status, m.integration_source FROM merchants m 
         INNER JOIN users u ON u.id = m.user_id 
         WHERE u.email = ? AND m.integration_source = ? LIMIT 1`,
        [String(email).toLowerCase().trim(), req.platform]
      );
      merchant = (rows as any[])?.[0];
    }

    res.json({
      connected: !!merchant,
      merchant: merchant ? {
        id: merchant.id,
        businessName: merchant.business_name,
        status: merchant.status,
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Verification failed', errorAr: 'فشل التحقق' });
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
    if (existing.salla || existing.zid || existing.woocommerce) {
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
    const instances = await db.getWhatsAppInstancesByMerchantId(req.merchant.id);
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
    const instance = await db.getWhatsAppInstanceById(instanceId);
    if (!instance || (instance as any).merchantId !== req.merchant.id) {
      return res.status(404).json({ error: 'Instance not found', errorAr: 'الرقم غير موجود' });
    }

    const { isActive, isPrimary } = req.body;

    if (isPrimary === true) {
      await db.setWhatsAppInstanceAsPrimary(instanceId, req.merchant.id);
    }

    if (typeof isActive === 'boolean') {
      const newStatus = isActive ? 'active' : 'inactive';

      // VULN-3 FIX: Check phone conflict when activating
      if (newStatus === 'active' && (instance as any).phoneNumber) {
        const conflicting = await db.getActiveInstanceByPhoneNumber(
          (instance as any).phoneNumber, req.merchant.id
        );
        if (conflicting) {
          await db.deactivateInstancesByPhoneNumber(
            (instance as any).phoneNumber, req.merchant.id
          );
        }
      }

      await db.updateWhatsAppInstance(instanceId, { status: newStatus });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update instance', errorAr: 'فشل تحديث الرقم' });
  }
});
