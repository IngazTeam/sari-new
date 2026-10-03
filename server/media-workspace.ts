import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from './db/connection';
import { databaseTimeEpoch } from './db/time';
import { ALL_ROLES, hasPermission, type MerchantRole, type Permission } from './_core/permissions';
import { mediaCategories, mediaMimes, mediaId, mediaWorkspaceInput, mediaWorkspaceSchema, mediaWorkspaceRow,
  mediaLibraryUrl, type MediaSelection } from '../shared/media-workspace';

export class MediaWorkspaceError extends Error {
  constructor(readonly reason: 'forbidden' | 'unavailable' | 'invalid' | 'limit' | 'stale' | 'missing' | 'reused' | 'unknown') { super(`media_workspace:${reason}`); }
}
export const mediaRows = async (tx: PoolConnection, sql: string, args: any[] = []) => {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw new MediaWorkspaceError('unavailable');
  return result as any[];
};
const categoryPermission: Record<typeof mediaCategories[number], Permission> = {
  product: 'products.manage', promotion: 'campaigns.manage', template: 'bot_settings.manage', general: 'products.manage',
};
export type MediaAuthority = { role: MerchantRole; active: boolean; allowedUploadCategories: typeof mediaCategories[number][] };
export async function withMediaAuthority<T>(actorId: number, merchantId: number, read: (tx: PoolConnection, authority: MediaAuthority) => Promise<T>, mode: 'read' | 'write' = 'read') {
  let tx: PoolConnection | undefined, committing = false, reusable = true;
  try {
    if (!mediaId.safeParse(actorId).success || !mediaId.safeParse(merchantId).success) throw new MediaWorkspaceError('forbidden');
    const pool = await getPool(); if (!pool) throw new MediaWorkspaceError('unavailable');
    tx = await pool.getConnection(); await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'); await tx.beginTransaction();
    const [merchant] = await mediaRows(tx, `SELECT userId,status FROM merchants WHERE id=? FOR ${mode === 'write' ? 'UPDATE' : 'SHARE'}`, [merchantId]);
    const [user] = await mediaRows(tx, 'SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
    const members = await mediaRows(tx, 'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId, actorId]);
    const role = members.length === 1 && members[0].is_active === 1 ? members[0].role : !members.length && merchant?.userId === actorId ? 'owner' : null;
    if (!merchant || merchant.status === 'suspended' || user?.account_status !== 'active' || !ALL_ROLES.includes(role)
        || !hasPermission(role, 'analytics.read')) throw new MediaWorkspaceError('forbidden');
    const active = merchant.status === 'active';
    const authority = { role, active, allowedUploadCategories: mediaCategories.filter(c => active && hasPermission(role, categoryPermission[c])) };
    const result = await read(tx, authority); committing = true; await tx.commit(); return result;
  } catch (error) {
    if (committing) reusable = false; else if (tx) try { await tx.rollback(); } catch { reusable = false; }
    if (error instanceof MediaWorkspaceError) throw error;
    throw new MediaWorkspaceError('unavailable');
  } finally { if (tx) { if (reusable) tx.release(); else tx.destroy(); } }
}
export const withMediaRead = <T>(actorId: number, merchantId: number, read: (tx: PoolConnection, authority: MediaAuthority) => Promise<T>) => withMediaAuthority(actorId, merchantId, read);

export function projectMediaRow(raw: any, authority: MediaAuthority) {
  const issues: any[] = [];
  const text = (v: unknown, key: string, max: number) => {
    if (typeof v !== 'string' || !v.trim() || v.length > max) { issues.push(key); return null; } return v;
  };
  const originalName = text(raw.original_name, 'name', 500), fileName = text(raw.file_name, 'storage_key', 500);
  const mimeType = text(raw.mime_type, 'mime', 100), url = text(raw.url, 'url', 8192);
  const kind = mediaMimes.includes(raw.mime_type) ? raw.mime_type === 'application/pdf' ? 'pdf' : 'image' : 'other';
  if (kind === 'other') issues.push('mime');
  const fileSize = Number.isSafeInteger(raw.file_size) && raw.file_size >= 0 ? raw.file_size : null;
  if (fileSize === null) issues.push('size');
  const category = mediaCategories.includes(raw.category) ? raw.category : null;
  if (category === null) issues.push('category');
  const epoch = databaseTimeEpoch(raw.created_at), createdAt = Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
  if (!createdAt) issues.push('created');
  const previewUrl = mediaLibraryUrl(url); if (!previewUrl) issues.push('url');
  const canDelete = authority.active && (category ? authority.allowedUploadCategories.includes(category) : hasPermission(authority.role, 'settings.manage'));
  const revision = createHash('sha256').update(JSON.stringify([raw.id, raw.merchant_id, raw.file_name, raw.original_name,
    raw.mime_type, raw.file_size, raw.url, raw.category, createdAt])).digest('hex');
  return mediaWorkspaceRow.parse({ id: raw.id, revision, originalName, fileName, mimeType, fileSize, category, kind, url,
    previewUrl, createdAt, canDelete, issues: Array.from(new Set(issues)) });
}

export async function readMediaWorkspace(actorId: number, merchantId: number, input: MediaSelection) {
  const selection = mediaWorkspaceInput.parse(input);
  // Schema readiness uses the pool: inspect before checkout, so concurrent pages cannot exhaust it while holding transactions.
  const { ensureMediaActionSchema } = await import('./media-actions'); await ensureMediaActionSchema();
  return withMediaRead(actorId, merchantId, async (tx, authority) => {
    const [stats] = await mediaRows(tx, `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN file_size>=0 THEN file_size ELSE 0 END),0) AS bytes,
      COALESCE(SUM(file_size<0),0) AS invalid FROM media_library WHERE merchant_id=?`, [merchantId]);
    const grouped = await mediaRows(tx, 'SELECT category,COUNT(*) AS total FROM media_library WHERE merchant_id=? GROUP BY category', [merchantId]);
    const [pending] = await mediaRows(tx, "SELECT COUNT(*) AS total,COALESCE(SUM(reserved_bytes),0) AS bytes,COALESCE(SUM(reserved_bytes<0),0) AS invalid FROM media_action_receipts WHERE merchant_id=? AND state='uploading'", [merchantId]);
    const pendingUploadCount = Number(pending.total), pendingPages = Math.ceil(pendingUploadCount / 10), currentRequestPage = Math.min(selection.requestPage, Math.max(1, pendingPages));
    const pendingRows = await mediaRows(tx, `SELECT * FROM media_action_receipts WHERE merchant_id=? AND state='uploading' ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET ${(currentRequestPage - 1) * 10}`, [merchantId]);
    const pendingUploads = pendingRows.map(row => {
      const metadata = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json;
      return { requestKey: row.request_key, actorId: row.actor_id, originalName: metadata.originalName, category: metadata.category,
        fileSize: row.reserved_bytes, createdAt: new Date(databaseTimeEpoch(row.created_at)).toISOString(),
        canRead: row.actor_id === actorId || hasPermission(authority.role, 'settings.manage'),
        canClose: authority.active && authority.allowedUploadCategories.length > 0 && (row.actor_id === actorId || hasPermission(authority.role, 'settings.manage')) };
    });
    const counts = { product: 0, promotion: 0, template: 0, general: 0, other: 0 };
    for (const group of grouped) counts[mediaCategories.includes(group.category) ? group.category as typeof mediaCategories[number] : 'other'] += Number(group.total);
    const predicates = ['merchant_id=?'], args: Array<string | number> = [merchantId];
    if (selection.category !== 'all') { predicates.push('category=?'); args.push(selection.category); }
    if (selection.kind === 'image') predicates.push("mime_type IN ('image/jpeg','image/png','image/webp','image/gif')");
    if (selection.kind === 'pdf') predicates.push("mime_type='application/pdf'");
    if (selection.kind === 'other') predicates.push("mime_type NOT IN ('image/jpeg','image/png','image/webp','image/gif','application/pdf')");
    if (selection.query) { predicates.push('(INSTR(LOWER(original_name),LOWER(?))>0 OR INSTR(LOWER(file_name),LOWER(?))>0 OR CAST(id AS CHAR)=?)'); args.push(selection.query, selection.query, selection.query); }
    const where = predicates.join(' AND ');
    const [matching] = await mediaRows(tx, `SELECT COUNT(*) AS total FROM media_library WHERE ${where}`, args);
    const matched = Number(matching.total), pages = Math.ceil(matched / 24), currentPage = Math.min(selection.page, Math.max(1, pages));
    const order = { newest: 'created_at DESC,id DESC', oldest: 'created_at ASC,id ASC', name: 'original_name ASC,id ASC', largest: 'file_size DESC,id DESC' }[selection.sort];
    const records = await mediaRows(tx, `SELECT * FROM media_library WHERE ${where} ORDER BY ${order} LIMIT 24 OFFSET ${(currentPage - 1) * 24}`, args);
    const bytes = Number(stats.bytes), invalidSizeCount = Number(stats.invalid);
    return mediaWorkspaceSchema.parse({ actorId, merchantId, checkedAt: new Date().toISOString(), selection, currentPage,
      pageSize: 24, total: Number(stats.total), matched, pages, counts, totalSizeBytes: invalidSizeCount || !Number.isSafeInteger(bytes) ? null : bytes,
      invalidSizeCount, maxFileBytes: 5242880, maxStorageBytes: 52428800, storageEvidence: 'registered_metadata', referenceEvidence: 'not_scanned',
      pendingUploadCount, pendingUploadBytes: Number(pending.invalid) || !Number.isSafeInteger(Number(pending.bytes)) ? null : Number(pending.bytes), pendingPages, currentRequestPage, pendingUploads,
      allowedUploadCategories: authority.allowedUploadCategories, rows: records.map(row => projectMediaRow(row, authority)) });
  });
}
