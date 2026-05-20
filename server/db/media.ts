/**
 * Media Library — Database & Logic
 * 
 * Centralized media asset management for merchants.
 * Supports products, promotions, templates, and general assets.
 */

import { getPool } from '../db';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type MediaCategory = 'product' | 'promotion' | 'template' | 'general';

export interface MediaItem {
  id: number;
  merchantId: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  category: MediaCategory;
  createdAt: Date;
}

export interface MediaStats {
  totalFiles: number;
  totalSizeBytes: number;
  byCategory: Record<MediaCategory, number>;
}

// ═══════════════════════════════════════════════════════════════
// Table Auto-Creation
// ═══════════════════════════════════════════════════════════════

let tableEnsured = false;

export async function ensureMediaTables(): Promise<void> {
  if (tableEnsured) return;
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS media_library (
      id INT AUTO_INCREMENT PRIMARY KEY,
      merchant_id INT NOT NULL,
      file_name VARCHAR(500) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INT NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      category ENUM('product', 'promotion', 'template', 'general') NOT NULL DEFAULT 'general',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_merchant (merchant_id),
      INDEX idx_category (merchant_id, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  tableEnsured = true;
}

// ═══════════════════════════════════════════════════════════════
// CRUD Operations
// ═══════════════════════════════════════════════════════════════

/** Create a media item */
export async function createMediaItem(data: {
  merchantId: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  category: MediaCategory;
}): Promise<MediaItem> {
  await ensureMediaTables();
  const pool = await getPool();
  if (!pool) throw new Error('DB unavailable');

  const [result] = await pool.execute(
    `INSERT INTO media_library (merchant_id, file_name, original_name, mime_type, file_size, url, category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.merchantId,
      data.fileName.substring(0, 500),
      data.originalName.substring(0, 500),
      data.mimeType.substring(0, 100),
      data.fileSize,
      data.url,
      data.category,
    ]
  );

  const id = (result as any).insertId;
  return {
    id,
    merchantId: data.merchantId,
    fileName: data.fileName,
    originalName: data.originalName,
    mimeType: data.mimeType,
    fileSize: data.fileSize,
    url: data.url,
    category: data.category,
    createdAt: new Date(),
  };
}

/** Get all media for a merchant (with optional category filter) */
export async function getMediaByMerchant(
  merchantId: number,
  category?: MediaCategory,
  limit: number = 100
): Promise<MediaItem[]> {
  await ensureMediaTables();
  const pool = await getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  
  if (category) {
    const [rows] = await pool.execute(
      `SELECT * FROM media_library WHERE merchant_id = ? AND category = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [merchantId, category]
    );
    return mapRows(rows as any[]);
  }

  const [rows] = await pool.execute(
    `SELECT * FROM media_library WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [merchantId]
  );
  return mapRows(rows as any[]);
}

/** Get a single media item (with ownership check) */
export async function getMediaById(id: number, merchantId: number): Promise<MediaItem | null> {
  await ensureMediaTables();
  const pool = await getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM media_library WHERE id = ? AND merchant_id = ? LIMIT 1`,
    [id, merchantId]
  );
  const results = rows as any[];
  return results.length > 0 ? mapRow(results[0]) : null;
}

/** Delete a media item */
export async function deleteMediaItem(id: number, merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `DELETE FROM media_library WHERE id = ? AND merchant_id = ?`,
    [id, merchantId]
  );
}

/** Get storage stats for a merchant */
export async function getMediaStats(merchantId: number): Promise<MediaStats> {
  await ensureMediaTables();
  const pool = await getPool();
  if (!pool) return { totalFiles: 0, totalSizeBytes: 0, byCategory: { product: 0, promotion: 0, template: 0, general: 0 } };

  const [totalRows] = await pool.execute(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(file_size), 0) as total_size FROM media_library WHERE merchant_id = ?`,
    [merchantId]
  );
  const total = (totalRows as any[])[0] || {};

  const [catRows] = await pool.execute(
    `SELECT category, COUNT(*) as cnt FROM media_library WHERE merchant_id = ? GROUP BY category`,
    [merchantId]
  );

  const byCategory: Record<MediaCategory, number> = { product: 0, promotion: 0, template: 0, general: 0 };
  for (const row of catRows as any[]) {
    if (row.category in byCategory) {
      byCategory[row.category as MediaCategory] = Number(row.cnt) || 0;
    }
  }

  return {
    totalFiles: Number(total.cnt) || 0,
    totalSizeBytes: Number(total.total_size) || 0,
    byCategory,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function mapRow(row: any): MediaItem {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    url: row.url,
    category: row.category,
    createdAt: row.created_at,
  };
}

function mapRows(rows: any[]): MediaItem[] {
  return rows.map(mapRow);
}
