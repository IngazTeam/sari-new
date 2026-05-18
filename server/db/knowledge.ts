/**
 * Knowledge Engine — Database Module
 * 
 * Manages knowledge_sections, knowledge_changelog, sari_response_cache,
 * sales_quotations, sales_targets, and quotation_templates tables.
 * 
 * Pattern: Lazy table creation (same as integrations/byaan.ts)
 */

import { getPool } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type SectionType =
  | 'identity' | 'services' | 'policies' | 'faq' | 'contact'
  | 'team' | 'achievements' | 'sales_intel' | 'opportunities' | 'custom';

export type SectionSource = 'website' | 'document' | 'manual' | 'ai_evolved' | 'byaan_sync';
export type SectionStatus = 'auto_approved' | 'approved' | 'pending_review';
export type InjectAs = 'fact' | 'behavior' | 'none';
export type ChangeAction = 'add' | 'merge' | 'evolve' | 'conflict' | 'delete' | 'manual_edit';

export interface KnowledgeSection {
  id: number;
  merchantId: number;
  parentId: number | null;
  sectionType: SectionType;
  title: string;
  content: string;
  summary: string | null;
  source: SectionSource;
  sourceUrl: string | null;
  confidence: number;
  status: SectionStatus;
  useInBot: boolean;
  injectAs: InjectAs;
  sortOrder: number;
  merchantEdited: boolean;
  embedding: Buffer | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertKnowledgeSection {
  merchantId: number;
  parentId?: number | null;
  sectionType: SectionType;
  title: string;
  content: string;
  summary?: string | null;
  source: SectionSource;
  sourceUrl?: string | null;
  confidence?: number;
  status?: SectionStatus;
  useInBot?: boolean;
  injectAs?: InjectAs;
  sortOrder?: number;
  merchantEdited?: boolean;
  embedding?: Buffer | null;
}

export interface KnowledgeChangelogEntry {
  id: number;
  merchantId: number;
  sectionId: number | null;
  action: ChangeAction;
  reason: string | null;
  oldContent: string | null;
  newContent: string | null;
  source: string | null;
  resolved: boolean;
  createdAt: Date;
}

export interface CachedResponse {
  id: number;
  merchantId: number;
  questionText: string;
  questionEmbedding: Buffer | null;
  responseText: string;
  hitCount: number;
  isValid: boolean;
  createdAt: Date;
  lastUsedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Lazy Table Creation
// ═══════════════════════════════════════════════════════════════

let _tablesCreated = false;

export async function ensureKnowledgeTables(): Promise<void> {
  if (_tablesCreated) return;
  
  const pool = await getPool();
  if (!pool) return;

  try {
    // 1. knowledge_sections — hierarchical content
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_sections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        parent_id INT DEFAULT NULL,
        section_type ENUM(
          'identity','services','policies','faq','contact',
          'team','achievements','sales_intel','opportunities','custom'
        ) NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        summary VARCHAR(1000) DEFAULT NULL,
        source ENUM('website','document','manual','ai_evolved','byaan_sync') NOT NULL,
        source_url VARCHAR(2000) DEFAULT NULL,
        confidence DECIMAL(3,2) DEFAULT 0.90,
        status ENUM('auto_approved','approved','pending_review') DEFAULT 'auto_approved',
        use_in_bot TINYINT(1) DEFAULT 1,
        inject_as ENUM('fact','behavior','none') DEFAULT 'fact',
        sort_order INT DEFAULT 0,
        merchant_edited TINYINT(1) DEFAULT 0,
        embedding BLOB DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_merchant_type (merchant_id, section_type),
        INDEX idx_parent (parent_id),
        INDEX idx_merchant_status (merchant_id, status),
        INDEX idx_merchant_bot (merchant_id, use_in_bot, inject_as)
      )
    `);

    // Add FK separately (safe if already exists)
    try {
      await pool.execute(`
        ALTER TABLE knowledge_sections 
        ADD CONSTRAINT fk_ks_parent 
        FOREIGN KEY (parent_id) REFERENCES knowledge_sections(id) ON DELETE CASCADE
      `);
    } catch { /* FK already exists */ }

    // 2. knowledge_changelog — evolution history
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS knowledge_changelog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        section_id INT DEFAULT NULL,
        action ENUM('add','merge','evolve','conflict','delete','manual_edit') NOT NULL,
        reason TEXT DEFAULT NULL,
        old_content TEXT DEFAULT NULL,
        new_content TEXT DEFAULT NULL,
        source VARCHAR(50) DEFAULT NULL,
        resolved TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant (merchant_id, created_at DESC),
        INDEX idx_unresolved (merchant_id, resolved, action)
      )
    `);

    // 3. sari_response_cache — smart response caching
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sari_response_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        question_text TEXT NOT NULL,
        question_embedding BLOB DEFAULT NULL,
        response_text TEXT NOT NULL,
        hit_count INT DEFAULT 0,
        is_valid TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant_valid (merchant_id, is_valid)
      )
    `);

    // 4. sales_quotations
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sales_quotations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        customer_phone VARCHAR(20) DEFAULT NULL,
        customer_name VARCHAR(255) DEFAULT NULL,
        quotation_number VARCHAR(50) NOT NULL,
        items JSON NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'SAR',
        status ENUM('sent','viewed','accepted','rejected','expired') DEFAULT 'sent',
        valid_until DATE DEFAULT NULL,
        pdf_url VARCHAR(500) DEFAULT NULL,
        conversation_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant (merchant_id, created_at DESC),
        INDEX idx_status (merchant_id, status)
      )
    `);

    // 5. sales_targets
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sales_targets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        period_type ENUM('monthly','quarterly','yearly') DEFAULT 'monthly',
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        target_amount DECIMAL(12,2) NOT NULL,
        achieved_amount DECIMAL(12,2) DEFAULT 0,
        quotations_sent INT DEFAULT 0,
        quotations_won INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE INDEX idx_merchant_period (merchant_id, period_type, period_start)
      )
    `);

    // 6. quotation_templates
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS quotation_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        merchant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        header_image_url VARCHAR(500) DEFAULT NULL,
        footer_text TEXT DEFAULT NULL,
        terms_text TEXT DEFAULT NULL,
        is_default TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_merchant (merchant_id)
      )
    `);

    _tablesCreated = true;
    console.log('[KnowledgeEngine] ✅ All tables initialized (6 tables)');
  } catch (e) {
    console.error('[KnowledgeEngine] Failed to create tables:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// Knowledge Sections — CRUD
// ═══════════════════════════════════════════════════════════════

/** Get all sections for a merchant (with children nested) */
export async function getSectionsByMerchantId(merchantId: number): Promise<KnowledgeSection[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, parent_id, section_type, title, content, summary, source, source_url, confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, created_at, updated_at
     FROM knowledge_sections WHERE merchant_id = ? ORDER BY sort_order, created_at`,
    [merchantId]
  );
  return rows as KnowledgeSection[];
}

/** Get sections for bot injection (approved + use_in_bot) — NO embedding */
export async function getBotSections(merchantId: number): Promise<KnowledgeSection[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, parent_id, section_type, title, content, summary, source, source_url, confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, created_at, updated_at
     FROM knowledge_sections 
     WHERE merchant_id = ? AND use_in_bot = 1 AND status IN ('auto_approved', 'approved')
     ORDER BY inject_as, sort_order`,
    [merchantId]
  );
  return rows as KnowledgeSection[];
}

/** Get sections WITH embedding for RAG semantic search — NOT for tRPC serialization! */
export async function getBotSectionsWithEmbedding(merchantId: number): Promise<KnowledgeSection[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, parent_id, section_type, title, content, summary, source, source_url, confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, embedding, created_at, updated_at
     FROM knowledge_sections 
     WHERE merchant_id = ? AND use_in_bot = 1 AND status IN ('auto_approved', 'approved')
     ORDER BY inject_as, sort_order`,
    [merchantId]
  );
  return rows as KnowledgeSection[];
}

/** Get pending review sections (conflicts) */
export async function getPendingReviewSections(merchantId: number): Promise<KnowledgeSection[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, parent_id, section_type, title, content, summary, source, source_url, confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, created_at, updated_at
     FROM knowledge_sections WHERE merchant_id = ? AND status = 'pending_review' ORDER BY created_at DESC`,
    [merchantId]
  );
  return rows as KnowledgeSection[];
}

/** Get a single section by ID (with ownership check) */
export async function getSectionById(sectionId: number, merchantId: number): Promise<KnowledgeSection | null> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT id, merchant_id, parent_id, section_type, title, content, summary, source, source_url, confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, created_at, updated_at
     FROM knowledge_sections WHERE id = ? AND merchant_id = ? LIMIT 1`,
    [sectionId, merchantId]
  );
  const results = rows as KnowledgeSection[];
  return results.length > 0 ? results[0] : null;
}

/** Create a new section */
export async function createSection(data: InsertKnowledgeSection): Promise<number> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) throw new Error('DB unavailable');

  const [result] = await pool.execute(
    `INSERT INTO knowledge_sections 
     (merchant_id, parent_id, section_type, title, content, summary, source, source_url, 
      confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, embedding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.merchantId,
      data.parentId ?? null,
      data.sectionType,
      data.title.substring(0, 500),
      data.content,
      data.summary?.substring(0, 1000) ?? null,
      data.source,
      data.sourceUrl ?? null,
      data.confidence ?? 0.90,
      data.status ?? 'auto_approved',
      data.useInBot !== false ? 1 : 0,
      data.injectAs ?? 'fact',
      data.sortOrder ?? 0,
      data.merchantEdited ? 1 : 0,
      data.embedding ?? null,
    ]
  );
  return (result as any).insertId;
}

/** Update a section */
export async function updateSection(
  sectionId: number, 
  merchantId: number, 
  data: Partial<InsertKnowledgeSection>
): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return;

  const updates: string[] = [];
  const values: any[] = [];

  const fieldMap: Record<string, string> = {
    parentId: 'parent_id',
    sectionType: 'section_type',
    title: 'title',
    content: 'content',
    summary: 'summary',
    source: 'source',
    sourceUrl: 'source_url',
    confidence: 'confidence',
    status: 'status',
    useInBot: 'use_in_bot',
    injectAs: 'inject_as',
    sortOrder: 'sort_order',
    merchantEdited: 'merchant_edited',
    embedding: 'embedding',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as any)[key] !== undefined) {
      updates.push(`${col} = ?`);
      const val = (data as any)[key];
      // Convert booleans to 0/1
      if (typeof val === 'boolean') {
        values.push(val ? 1 : 0);
      } else {
        values.push(val);
      }
    }
  }

  if (updates.length === 0) return;

  values.push(sectionId, merchantId);
  await pool.execute(
    `UPDATE knowledge_sections SET ${updates.join(', ')} WHERE id = ? AND merchant_id = ?`,
    values
  );
}

/** Delete a section (cascades to children) */
export async function deleteSection(sectionId: number, merchantId: number): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `DELETE FROM knowledge_sections WHERE id = ? AND merchant_id = ?`,
    [sectionId, merchantId]
  );
}

/** Delete all sections for a merchant */
export async function deleteAllSections(merchantId: number): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return;

  // Delete children first (no FK cascade issues)
  await pool.execute(
    `DELETE FROM knowledge_sections WHERE merchant_id = ? AND parent_id IS NOT NULL`,
    [merchantId]
  );
  await pool.execute(
    `DELETE FROM knowledge_sections WHERE merchant_id = ?`,
    [merchantId]
  );
  // Also clear changelog
  await pool.execute(
    `DELETE FROM knowledge_changelog WHERE merchant_id = ?`,
    [merchantId]
  );
}

/** Delete sections by source type (website, document, etc.) */
export async function deleteSectionsBySource(merchantId: number, source: SectionSource): Promise<number> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return 0;

  // Delete children of matching sections first
  await pool.execute(
    `DELETE cs FROM knowledge_sections cs 
     INNER JOIN knowledge_sections ps ON cs.parent_id = ps.id 
     WHERE ps.merchant_id = ? AND ps.source = ?`,
    [merchantId, source]
  );
  // Then delete parent sections
  const [result] = await pool.execute(
    `DELETE FROM knowledge_sections WHERE merchant_id = ? AND source = ?`,
    [merchantId, source]
  );
  const deleted = (result as any).affectedRows || 0;
  console.log(`[KnowledgeEngine] Deleted ${deleted} sections with source '${source}' for merchant ${merchantId}`);
  return deleted;
}

// ═══════════════════════════════════════════════════════════════
// Knowledge Changelog
// ═══════════════════════════════════════════════════════════════

/** Log a knowledge change */
export async function logChange(data: {
  merchantId: number;
  sectionId?: number | null;
  action: ChangeAction;
  reason?: string;
  oldContent?: string;
  newContent?: string;
  source?: string;
}): Promise<number> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return 0;

  const [result] = await pool.execute(
    `INSERT INTO knowledge_changelog (merchant_id, section_id, action, reason, old_content, new_content, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.merchantId,
      data.sectionId ?? null,
      data.action,
      data.reason ?? null,
      data.oldContent ?? null,
      data.newContent ?? null,
      data.source ?? null,
    ]
  );
  return (result as any).insertId;
}

/** Get changelog for a merchant */
export async function getChangelog(merchantId: number, limit: number = 50): Promise<KnowledgeChangelogEntry[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const [rows] = await pool.execute(
    `SELECT * FROM knowledge_changelog WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [merchantId]
  );
  return rows as KnowledgeChangelogEntry[];
}

/** Get unresolved conflicts */
export async function getUnresolvedConflicts(merchantId: number): Promise<KnowledgeChangelogEntry[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM knowledge_changelog 
     WHERE merchant_id = ? AND action = 'conflict' AND resolved = 0 
     ORDER BY created_at DESC`,
    [merchantId]
  );
  return rows as KnowledgeChangelogEntry[];
}

/** Resolve a conflict */
export async function resolveConflict(changelogId: number, merchantId: number): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE knowledge_changelog SET resolved = 1 WHERE id = ? AND merchant_id = ?`,
    [changelogId, merchantId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Response Cache
// ═══════════════════════════════════════════════════════════════

/** Save a response to cache */
export async function cacheResponse(
  merchantId: number,
  questionText: string,
  responseText: string,
  questionEmbedding?: Buffer
): Promise<number> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return 0;

  const [result] = await pool.execute(
    `INSERT INTO sari_response_cache (merchant_id, question_text, question_embedding, response_text)
     VALUES (?, ?, ?, ?)`,
    [merchantId, questionText, questionEmbedding ?? null, responseText]
  );
  return (result as any).insertId;
}

/** Get valid cached responses for a merchant (capped for memory safety) */
export async function getValidCachedResponses(merchantId: number): Promise<CachedResponse[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  // SEC-V4-04 FIX: LIMIT 200 — prevent unbounded memory load for embedding comparison
  const [rows] = await pool.execute(
    `SELECT * FROM sari_response_cache WHERE merchant_id = ? AND is_valid = 1 ORDER BY hit_count DESC LIMIT 200`,
    [merchantId]
  );
  return rows as CachedResponse[];
}

/** Record a cache hit */
export async function recordCacheHit(cacheId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE sari_response_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = ?`,
    [cacheId]
  );
}

/** Invalidate all cache for a merchant */
export async function invalidateCache(merchantId: number): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE sari_response_cache SET is_valid = 0 WHERE merchant_id = ?`,
    [merchantId]
  );
}

// ═══════════════════════════════════════════════════════════════
// Knowledge Health Score
// ═══════════════════════════════════════════════════════════════

export interface KnowledgeHealthScore {
  total: number;
  breakdown: { label: string; weight: number; filled: boolean; tip?: string }[];
}

/** Calculate knowledge health score for a merchant */
export async function calculateHealthScore(merchantId: number): Promise<KnowledgeHealthScore> {
  const sections = await getSectionsByMerchantId(merchantId);
  const types = new Set(sections.map(s => (s as any).section_type || (s as any).sectionType));

  const pool = await getPool();
  let hasProducts = false;
  let hasFaqs = false;
  let hasWebsiteAnalysis = false;
  let hasDocument = false;

  if (pool) {
    try {
      const [prodRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM products WHERE merchantId = ?`, [merchantId]
      );
      hasProducts = (prodRows as any[])[0]?.cnt >= 3;

      const [faqRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM extracted_faqs WHERE merchant_id = ? AND is_active = 1`, [merchantId]
      );
      hasFaqs = (faqRows as any[])[0]?.cnt >= 3;

      const [waRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM website_analyses WHERE merchant_id = ? AND status = 'completed' 
         AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`, [merchantId]
      );
      hasWebsiteAnalysis = (waRows as any[])[0]?.cnt > 0;

      const [docRows] = await pool.execute(
        `SELECT COUNT(*) as cnt FROM merchant_knowledge_docs WHERE merchant_id = ? AND extraction_status = 'completed'`,
        [merchantId]
      );
      hasDocument = (docRows as any[])[0]?.cnt > 0;
    } catch { /* tables may not exist yet */ }
  }

  const breakdown = [
    { label: 'هوية النشاط', weight: 15, filled: types.has('identity'), tip: 'أضف معلومات عن نشاطك التجاري' },
    { label: 'الخدمات/المنتجات', weight: 25, filled: types.has('services') || hasProducts, tip: 'أضف خدماتك أو منتجاتك' },
    { label: 'بيانات التواصل', weight: 10, filled: types.has('contact'), tip: 'أضف أرقام التواصل والعناوين' },
    { label: 'السياسات', weight: 10, filled: types.has('policies'), tip: 'أضف سياسات الشحن والاسترجاع' },
    { label: 'أسئلة شائعة', weight: 10, filled: types.has('faq') || hasFaqs, tip: 'أضف أسئلة شائعة مع إجاباتها' },
    { label: 'ذكاء المبيعات', weight: 15, filled: types.has('sales_intel'), tip: 'حلّل موقعك لاستخراج ذكاء المبيعات' },
    { label: 'تحليل الموقع', weight: 10, filled: hasWebsiteAnalysis, tip: 'أضف رابط موقعك وحلّله' },
    { label: 'ملف تعريفي', weight: 5, filled: hasDocument, tip: 'ارفع ملف تعريفي عن نشاطك' },
  ];

  const total = breakdown.reduce((sum, item) => sum + (item.filled ? item.weight : 0), 0);

  return { total, breakdown };
}
