import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { mediaUploadInput, mediaRemoveInput, mediaReceiptInput, mediaRequestResult, mediaFileName,
  type MediaUploadInput, type MediaRequestResult } from '../shared/media-actions';
import { mediaCategories, mediaMimes, mediaLibraryUrl } from '../shared/media-workspace';
import { assertRuntimeSchema } from './db/schema-readiness';
import { withMediaAuthority, mediaRows as rows, projectMediaRow, MediaWorkspaceError, type MediaAuthority } from './media-workspace';
import { hasPermission } from './_core/permissions';
import { decodeCanonicalBase64Upload, assertMediaSignature } from './security/upload-validation';
import { storagePut } from './storage';
import { policyArtifactDigest } from './ai/learning-policy-evaluation-bundle';

const MAX_FILE = 5 * 1024 * 1024, MAX_STORAGE = 50 * 1024 * 1024;
const fail = (reason: MediaWorkspaceError['reason']): never => { throw new MediaWorkspaceError(reason); };
const parse = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
const hash = policyArtifactDigest;
const uploadMetadata = z.object({ originalName: z.string().min(1).max(255), mimeType: z.enum(mediaMimes), category: z.enum(mediaCategories),
  fileSize: z.number().int().positive().max(MAX_FILE), sha256: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string().min(1).max(500) }).strict();
export const ensureMediaActionSchema = () => assertRuntimeSchema('media action receipts', [{ table: 'media_action_receipts',
  columns: ['merchant_id', 'actor_id', 'request_key', 'request_digest', 'kind', 'state', 'reserved_bytes', 'metadata_json', 'result_json'],
  uniqueIndexes: [{ name: 'uq_media_request', columns: ['merchant_id', 'request_key'] }] }], { cacheSuccess: false });
async function transaction<T>(actorId: number, merchantId: number, operation: (tx: PoolConnection, authority: MediaAuthority) => Promise<T>) {
  await ensureMediaActionSchema(); return withMediaAuthority(actorId, merchantId, operation, 'write');
}
const request = async (tx: PoolConnection, merchantId: number, requestKey: string) =>
  (await rows(tx, 'SELECT * FROM media_action_receipts WHERE merchant_id=? AND request_key=? FOR UPDATE', [merchantId, requestKey]))[0];
const base = (actorId: number, merchantId: number, requestKey: string): MediaRequestResult => ({ actorId, merchantId, requestKey,
  state: 'missing', kind: null, assetId: null, originalName: null, fileSize: null, category: null, url: null,
  checkedAt: new Date().toISOString(), closedBy: null, storageDeletion: 'not_attempted' });
function stored(row: any): MediaRequestResult {
  if (row.result_json != null) {
    const result = mediaRequestResult.parse(parse(row.result_json));
    if (result.actorId !== row.actor_id || result.merchantId !== row.merchant_id || result.requestKey !== row.request_key || result.state !== row.state) return fail('unavailable');
    return result;
  }
  if (row.kind !== 'upload' || row.state !== 'uploading') return fail('unavailable');
  const metadata = uploadMetadata.parse(parse(row.metadata_json));
  return mediaRequestResult.parse({ ...base(row.actor_id, row.merchant_id, row.request_key), state: 'uploading', kind: 'upload',
    originalName: metadata.originalName, fileSize: metadata.fileSize, category: metadata.category });
}
function existing(row: any, actorId: number, digest: string) {
  if (row.actor_id !== actorId) return fail('forbidden');
  if (row.state !== 'cancelled' && row.request_digest !== digest) return fail('reused');
  return stored(row);
}
function authorizeCategory(authority: MediaAuthority, category: typeof mediaCategories[number]) {
  if (!authority.active || !authority.allowedUploadCategories.includes(category)) return fail('forbidden');
}
export function inspectMediaUpload(input: MediaUploadInput, merchantId: number) {
  const value = mediaUploadInput.parse(input);
  let buffer: Buffer;
  try { buffer = decodeCanonicalBase64Upload(value.fileBase64, MAX_FILE); assertMediaSignature(buffer, value.mimeType); }
  catch { return fail('invalid'); }
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[value.mimeType];
  const metadata = uploadMetadata.parse({ originalName: mediaFileName(value.originalName), mimeType: value.mimeType, category: value.category,
    fileSize: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), fileName: `media/${merchantId}/${value.category}/${value.requestKey}.${extension}` });
  return { value, buffer, metadata, digest: hash({ version: 'media-upload.v1', merchantId, requestKey: value.requestKey, metadata }) };
}

/** Reserve quota durably before storage I/O. A duplicate can observe but never restart an upload. */
export async function uploadMediaReviewed(actorId: number, merchantId: number, input: MediaUploadInput) {
  const { value, buffer, metadata, digest } = inspectMediaUpload(input, merchantId);
  const admission = await transaction(actorId, merchantId, async (tx, authority) => {
    const prior = await request(tx, merchantId, value.requestKey);
    if (prior) return { created: false as const, result: existing(prior, actorId, digest) };
    authorizeCategory(authority, value.category);
    const [files] = await rows(tx, 'SELECT COALESCE(SUM(file_size),0) AS bytes,COALESCE(SUM(file_size<0),0) AS invalid FROM media_library WHERE merchant_id=? FOR UPDATE', [merchantId]);
    const [pending] = await rows(tx, "SELECT COALESCE(SUM(reserved_bytes),0) AS bytes,COALESCE(SUM(reserved_bytes<0),0) AS invalid FROM media_action_receipts WHERE merchant_id=? AND state='uploading' FOR UPDATE", [merchantId]);
    if (Number(files.invalid) || Number(pending.invalid) || !Number.isSafeInteger(Number(files.bytes)) || !Number.isSafeInteger(Number(pending.bytes))) return fail('unavailable');
    if (Number(files.bytes) + Number(pending.bytes) + buffer.length > MAX_STORAGE) return fail('limit');
    const [rate] = await rows(tx, "SELECT COUNT(*) AS total FROM media_action_receipts WHERE merchant_id=? AND kind='upload' AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)", [merchantId]);
    if (Number(rate.total) >= 20) return fail('limit');
    await tx.execute(`INSERT INTO media_action_receipts (merchant_id,actor_id,request_key,request_digest,kind,state,reserved_bytes,metadata_json)
      VALUES (?,?,?,?,'upload','uploading',?,?)`, [merchantId, actorId, value.requestKey, digest, buffer.length, JSON.stringify(metadata)]);
    return { created: true as const, result: null };
  });
  if (!admission.created) return admission.result;
  // Parent + actor/membership locks fence revocation/closure through the bounded upload and final receipt commit.
  try {
    return await transaction(actorId, merchantId, async (tx, authority) => {
      const record = await request(tx, merchantId, value.requestKey);
      if (!record) return fail('unavailable');
      const current = existing(record, actorId, digest);
      if (current.state !== 'uploading') return current;
      authorizeCategory(authority, value.category);
      if (record.reserved_bytes !== buffer.length || hash(parse(record.metadata_json)) !== hash(metadata)) return fail('unavailable');
      const saved = await storagePut(metadata.fileName, buffer, value.mimeType, { signal: AbortSignal.timeout(20000) });
      const url = mediaLibraryUrl(saved.url);
      if (saved.key !== metadata.fileName || !url) return fail('unknown');
      const [inserted] = await tx.execute<any>(`INSERT INTO media_library (merchant_id,file_name,original_name,mime_type,file_size,url,category)
        VALUES (?,?,?,?,?,?,?)`, [merchantId, metadata.fileName, metadata.originalName, value.mimeType, buffer.length, url, value.category]);
      const result = mediaRequestResult.parse({ ...base(actorId, merchantId, value.requestKey), state: 'uploaded', kind: 'upload',
        assetId: Number(inserted.insertId), originalName: metadata.originalName, fileSize: buffer.length, category: value.category, url });
      const [updated] = await tx.execute<any>(`UPDATE media_action_receipts SET state='uploaded',reserved_bytes=0,result_json=?
        WHERE merchant_id=? AND request_key=? AND request_digest=? AND state='uploading'`, [JSON.stringify(result), merchantId, value.requestKey, digest]);
      if (Number(updated.affectedRows) !== 1) return fail('unknown');
      return result;
    });
  } catch { return fail('unknown'); } // The committed admission stays recoverable; never repeat storage I/O.
}

/** Removes the library registration only. Existing links and physical storage are retained. */
export async function removeMediaReviewed(actorId: number, merchantId: number, input: z.infer<typeof mediaRemoveInput>) {
  const value = mediaRemoveInput.parse(input), digest = hash({ version: 'media-remove.v1', merchantId, value });
  return transaction(actorId, merchantId, async (tx, authority) => {
    const prior = await request(tx, merchantId, value.requestKey);
    if (prior) return existing(prior, actorId, digest);
    const [record] = await rows(tx, 'SELECT * FROM media_library WHERE merchant_id=? AND id=? FOR UPDATE', [merchantId, value.id]);
    if (!record) return fail('missing');
    const row = projectMediaRow(record, authority);
    if (!row.canDelete) return fail('forbidden');
    if (row.revision !== value.revision) return fail('stale');
    const result = mediaRequestResult.parse({ ...base(actorId, merchantId, value.requestKey), state: 'removed', kind: 'remove',
      assetId: row.id, originalName: row.originalName, fileSize: row.fileSize, category: row.category, url: row.url });
    await tx.execute('DELETE FROM media_library WHERE merchant_id=? AND id=?', [merchantId, value.id]);
    await tx.execute(`INSERT INTO media_action_receipts (merchant_id,actor_id,request_key,request_digest,kind,state,result_json)
      VALUES (?,?,?,?,'remove','removed',?)`, [merchantId, actorId, value.requestKey, digest, JSON.stringify(result)]);
    return result;
  });
}

export async function readMediaReceipt(actorId: number, merchantId: number, input: z.infer<typeof mediaReceiptInput>) {
  const { requestKey } = mediaReceiptInput.parse(input);
  return transaction(actorId, merchantId, async (tx, authority) => {
    const row = await request(tx, merchantId, requestKey);
    if (!row) return base(actorId, merchantId, requestKey);
    if (row.actor_id !== actorId && !hasPermission(authority.role, 'settings.manage')) return fail('forbidden');
    return stored(row);
  });
}

/** Tombstone absent requests too: a delayed request cannot start after the user closes it. */
export async function closeMediaRequest(actorId: number, merchantId: number, input: z.infer<typeof mediaReceiptInput>) {
  const { requestKey } = mediaReceiptInput.parse(input);
  return transaction(actorId, merchantId, async (tx, authority) => {
    if (!authority.active || !authority.allowedUploadCategories.length) return fail('forbidden');
    const row = await request(tx, merchantId, requestKey);
    if (row && row.actor_id !== actorId && !hasPermission(authority.role, 'settings.manage')) return fail('forbidden');
    if (row && row.state !== 'uploading') return stored(row);
    const result = mediaRequestResult.parse({ ...(row ? stored(row) : base(actorId, merchantId, requestKey)),
      state: 'cancelled', checkedAt: new Date().toISOString(), closedBy: actorId });
    if (row) await tx.execute("UPDATE media_action_receipts SET state='cancelled',reserved_bytes=0,result_json=? WHERE merchant_id=? AND request_key=? AND state='uploading'", [JSON.stringify(result), merchantId, requestKey]);
    else await tx.execute("INSERT INTO media_action_receipts (merchant_id,actor_id,request_key,state,result_json) VALUES (?,?,?,'cancelled',?)", [merchantId, actorId, requestKey, JSON.stringify(result)]);
    return result;
  });
}
