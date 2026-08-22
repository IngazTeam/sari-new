/**
 * Knowledge Engine — Database Module
 * 
 * Manages knowledge_sections, knowledge_changelog, sari_response_cache,
 * sales_quotations, sales_targets, and quotation_templates tables.
 * 
 * Schema is provisioned by tracked migrations and verified by a read-only readiness gate.
 */

import { getPool } from '../db';
import { assertRuntimeSchema } from './schema-readiness';

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

export async function ensureKnowledgeTables(): Promise<void> {
  await assertRuntimeSchema('knowledge engine', [
    { table: 'knowledge_sections' },
    { table: 'knowledge_changelog' },
    { table: 'sari_response_cache' },
    { table: 'sales_quotations' },
    { table: 'sales_targets' },
    { table: 'quotation_templates' },
  ]);
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

/**
 * Atomically publish the exact Byaan snapshot used for bot answers.
 *
 * AI classification remains useful for organization and sales intelligence, but
 * it is evolutionary and cannot prove that removed FAQs disappeared. These
 * bounded snapshot chunks are therefore the canonical Byaan facts. New chunks
 * are inserted before older autogenerated Byaan sections are disabled, all in a
 * single transaction. Merchant-edited sections remain under merchant control.
 */
export async function replaceByaanKnowledgeSnapshot(
  merchantId: number,
  chunks: string[],
  snapshotId: string,
): Promise<{ inserted: number; disabled: number; pruned: number }> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for Byaan knowledge snapshot');
  }
  if (!/^[a-f0-9-]{36}$/i.test(snapshotId)) {
    throw new Error('Invalid Byaan knowledge snapshot identifier');
  }
  if (chunks.length < 1 || chunks.length > 10) {
    throw new Error('Invalid Byaan knowledge snapshot chunk count');
  }
  const normalizedChunks = chunks.map((chunk) => String(chunk || ''));
  if (normalizedChunks.some((chunk) => chunk.length < 1 || chunk.length > 12_000)) {
    throw new Error('Invalid Byaan knowledge snapshot chunk size');
  }

  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) throw new Error('DB unavailable');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      `SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE`,
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) {
      throw new Error('Byaan merchant not found');
    }
    const insertedIds: number[] = [];

    for (let index = 0; index < normalizedChunks.length; index += 1) {
      const title = normalizedChunks.length === 1
        ? 'بيان — لقطة المعرفة المعتمدة'
        : `بيان — لقطة المعرفة المعتمدة (${index + 1}/${normalizedChunks.length})`;
      const [result] = await connection.execute(
        `INSERT INTO knowledge_sections
         (merchant_id, parent_id, section_type, title, content, summary, source, source_url,
          confidence, status, use_in_bot, inject_as, sort_order, merchant_edited, embedding)
         VALUES (?, NULL, 'custom', ?, ?, ?, 'byaan_sync', ?, 1.00, 'auto_approved', 1, 'fact', ?, 0, NULL)`,
        [
          merchantId,
          title,
          normalizedChunks[index],
          `جزء ${index + 1} من لقطة بيان الحالية`,
          `byaan-snapshot://${snapshotId}/${index + 1}`,
          index,
        ],
      );
      const sectionId = Number((result as any).insertId);
      if (!Number.isSafeInteger(sectionId) || sectionId <= 0) {
        throw new Error('Failed to persist Byaan knowledge snapshot');
      }
      insertedIds.push(sectionId);
      await connection.execute(
        `INSERT INTO knowledge_changelog
         (merchant_id, section_id, action, reason, old_content, new_content, source, resolved)
         VALUES (?, ?, 'add', ?, NULL, NULL, 'byaan_sync', 1)`,
        [merchantId, sectionId, `نشر لقطة بيان ${snapshotId} — الجزء ${index + 1}`],
      );
    }

    const placeholders = insertedIds.map(() => '?').join(', ');
    const [disabledResult] = await connection.execute(
      `UPDATE knowledge_sections
       SET use_in_bot = 0
       WHERE merchant_id = ? AND source = 'byaan_sync' AND merchant_edited = 0
         AND id NOT IN (${placeholders})`,
      [merchantId, ...insertedIds],
    );
    await connection.execute(
      `UPDATE sari_response_cache SET is_valid = 0 WHERE merchant_id = ?`,
      [merchantId],
    );
    const [prunedResult] = await connection.execute(
      `DELETE FROM knowledge_sections
       WHERE merchant_id = ? AND source = 'byaan_sync' AND use_in_bot = 0
         AND merchant_edited = 0 AND source_url LIKE 'byaan-snapshot://%'
         AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [merchantId],
    );
    await connection.commit();

    return {
      inserted: insertedIds.length,
      disabled: Number((disabledResult as any).affectedRows || 0),
      pruned: Number((prunedResult as any).affectedRows || 0),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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

  // 1. Invalidate response cache in DB
  await pool.execute(
    `UPDATE sari_response_cache SET is_valid = 0 WHERE merchant_id = ?`,
    [merchantId]
  );

  // 2. GAP-4 FIX: Evict in-memory session contexts so stale knowledge is purged
  try {
    const { destroyMerchantSessions } = await import('../ai/session-context');
    destroyMerchantSessions(merchantId);
  } catch { /* session-context module may not be loaded yet */ }
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
        `SELECT COUNT(*) as cnt FROM extracted_faqs
         WHERE merchant_id = ? AND source_status = 'active' AND is_active = 1`, [merchantId]
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
