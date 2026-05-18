/**
 * AI Directives — Phase 5 of Adaptive Sales Engine (SuperAdmin Training Center)
 * 
 * Allows SuperAdmin to feed GPT with sales playbooks, cultural rules,
 * and persuasion strategies — no code changes needed.
 * 
 * Loaded ONCE at server start + cached globally. Refreshed when modified.
 */

import { getPool } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type DirectiveCategory = 'sales' | 'culture' | 'persuasion' | 'examples' | 'limits';

export interface AIDirective {
  id?: number;
  category: DirectiveCategory;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ═══════════════════════════════════════════════════════════════
// Table Management
// ═══════════════════════════════════════════════════════════════

let _tableCreated = false;

async function ensureTable(): Promise<void> {
  if (_tableCreated) return;
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS sari_ai_directives (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category ENUM('sales', 'culture', 'persuasion', 'examples', 'limits') NOT NULL,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      priority INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active (is_active, category, priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  _tableCreated = true;
}

// ═══════════════════════════════════════════════════════════════
// Global Cache (loaded once, refreshed on write)
// ═══════════════════════════════════════════════════════════════

let _cachedDirectives: AIDirective[] | null = null;
let _cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // Refresh every 5 minutes max

/**
 * Get all active directives — from cache (no DB call after first load).
 */
export async function getActiveDirectives(): Promise<AIDirective[]> {
  // Return from cache if fresh
  if (_cachedDirectives && (Date.now() - _cacheLoadedAt) < CACHE_TTL_MS) {
    return _cachedDirectives;
  }

  await ensureTable();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM sari_ai_directives WHERE is_active = 1 ORDER BY category, priority DESC`
  );

  _cachedDirectives = (rows as any[]).map(mapRow);
  _cacheLoadedAt = Date.now();
  console.log(`[AI Directives] Loaded ${_cachedDirectives.length} active directives`);
  return _cachedDirectives;
}

/**
 * Invalidate cache — called after any write operation.
 */
function invalidateCache(): void {
  _cachedDirectives = null;
  _cacheLoadedAt = 0;
}

// ═══════════════════════════════════════════════════════════════
// CRUD (SuperAdmin only)
// ═══════════════════════════════════════════════════════════════

export async function createDirective(data: Omit<AIDirective, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  await ensureTable();
  // SEC-06 FIX: Cap at 50 directives to prevent DB flood
  const pool = await getPool();
  if (!pool) return 0;

  const [countRows] = await pool.execute(`SELECT COUNT(*) as cnt FROM sari_ai_directives`);
  if ((countRows as any[])[0]?.cnt >= 50) {
    throw new Error('الحد الأقصى للتوجيهات 50. احذف توجيهات قديمة أولاً.');
  }

  const [result] = await pool.execute(
    `INSERT INTO sari_ai_directives (category, title, content, is_active, priority) VALUES (?, ?, ?, ?, ?)`,
    [data.category, data.title, data.content, data.isActive ? 1 : 0, data.priority || 0]
  );
  invalidateCache();
  return (result as any).insertId;
}

export async function updateDirective(id: number, data: Partial<AIDirective>): Promise<void> {
  await ensureTable();
  const pool = await getPool();
  if (!pool) return;

  const setClauses: string[] = [];
  const values: any[] = [];

  if (data.category !== undefined) { setClauses.push('category = ?'); values.push(data.category); }
  if (data.title !== undefined) { setClauses.push('title = ?'); values.push(data.title); }
  if (data.content !== undefined) { setClauses.push('content = ?'); values.push(data.content); }
  if (data.isActive !== undefined) { setClauses.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
  if (data.priority !== undefined) { setClauses.push('priority = ?'); values.push(data.priority); }

  if (setClauses.length === 0) return;
  values.push(id);

  await pool.execute(`UPDATE sari_ai_directives SET ${setClauses.join(', ')} WHERE id = ?`, values);
  invalidateCache();
}

export async function deleteDirective(id: number): Promise<void> {
  await ensureTable();
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(`DELETE FROM sari_ai_directives WHERE id = ?`, [id]);
  invalidateCache();
}

export async function getAllDirectives(): Promise<AIDirective[]> {
  await ensureTable();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM sari_ai_directives ORDER BY category, priority DESC, created_at DESC`
  );
  return (rows as any[]).map(mapRow);
}

// ═══════════════════════════════════════════════════════════════
// Build Prompt from Directives
// ═══════════════════════════════════════════════════════════════

const CATEGORY_LABELS: Record<DirectiveCategory, string> = {
  sales: '📚 أساليب البيع',
  culture: '🌍 الذكاء الثقافي',
  persuasion: '🎯 استراتيجيات الإقناع',
  examples: '🗣 أمثلة محادثات ناجحة',
  limits: '⛔ حدود صارمة',
};

/**
 * Build the directives section of the system prompt.
 * Called once at session creation, injected into GPT context.
 */
export async function buildDirectivesPrompt(): Promise<string> {
  const directives = await getActiveDirectives();
  if (directives.length === 0) return '';

  let prompt = '\n\n## تعليمات متقدمة من الإدارة (اتبعها بدقة):\n';

  // Group by category
  const grouped: Record<string, AIDirective[]> = {};
  for (const d of directives) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  }

  for (const [category, items] of Object.entries(grouped)) {
    prompt += `\n### ${CATEGORY_LABELS[category as DirectiveCategory] || category}:\n`;
    for (const item of items) {
      // SEC-01 FIX: Sanitize directive content to prevent prompt injection
      const safeTitle = sanitizeDirectiveContent(item.title);
      const safeContent = sanitizeDirectiveContent(item.content);
      prompt += `**${safeTitle}**: ${safeContent}\n`;
    }
  }

  return prompt;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function mapRow(row: any): AIDirective {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    isActive: Boolean(row.is_active),
    priority: Number(row.priority || 0),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * SEC-01 FIX: Sanitize directive content to prevent prompt injection.
 * Strips role impersonation and system override attempts from admin-provided text.
 */
function sanitizeDirectiveContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/gi, '[filtered]')
    .replace(/\b(system|assistant|user)\s*:/gi, '[role]:')
    .replace(/you\s+are\s+now\s+/gi, '[filtered] ')
    .replace(/forget\s+(everything|all|your)/gi, '[filtered]')
    .replace(/new\s+instructions?\s*:/gi, '[filtered]:')
    .replace(/override\s+(system|all|your)/gi, '[filtered]')
    .replace(/act\s+as\s+(a|an)?/gi, '[filtered]')
    .replace(/pretend\s+(to\s+be|you\s+are)/gi, '[filtered]')
    .replace(/تجاهل\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]')
    .replace(/انس[َى]?\s*(كل|جميع)?\s*(التعليمات|الأوامر|القواعد)/gi, '[filtered]');
}
