import { mediaCategories, mediaWorkspaceInput, mediaWorkspaceRow, mediaWorkspaceSchema, type MediaWorkspaceRow } from '../../../shared/media-workspace';
import { mediaFileName, mediaUploadInput, mediaRemoveInput, mediaReceiptInput, mediaRequestResult, type MediaRequestResult } from '../../../shared/media-actions';
import type { ServiceMode } from './service-preview-model';

export const mediaPreviewQueries = ['media.workspace', 'media.requestReceipt'] as const;
export const mediaPreviewMutations = ['media.uploadReviewed', 'media.removeReviewed', 'media.closeRequest'] as const;
const fault = (reason: string, code = 'BAD_REQUEST') => ({ message: 'media_workspace:' + reason, data: { code } });

/** Disposable memory simulation. No database, storage provider, upload or HTTP request. */
export class MediaPreviewStore {
  writes = 0;
  private version = 0;
  private nextId = 33;
  private admitted = 0;
  private rows: MediaWorkspaceRow[] = [];
  private receipts = new Map<string, { signature: string; result: MediaRequestResult }>();
  constructor(readonly actorId: number, readonly merchantId: number, readonly now: string, private mode: () => ServiceMode) {
    if (mode() === 'empty') return;
    for (let id = 1; id <= 32; id++) {
      const legacy = mode() === 'legacy' && id === 32;
      this.rows.push(mediaWorkspaceRow.parse({ id, revision: this.marker(id),
        originalName: id === 1 ? this.storeName + ' · oldest_%_file.pdf' : id === 32 ? (this.storeName + ' · دليل_المنتجات_والعروض_على_الهاتف_').repeat(5) + '.pdf' : this.storeName + ' · File ملف ' + id + '.pdf',
        fileName: 'media/' + merchantId + '/sample/' + id + '.pdf', mimeType: 'application/pdf',
        fileSize: legacy ? null : id * 1024, category: mediaCategories[(id - 1) % 4], kind: 'pdf',
        url: legacy ? 'javascript:local-invalid-sample' : 'https://example.com/sari-media-preview/' + merchantId + '/' + id + '.pdf',
        previewUrl: legacy ? null : 'https://example.com/sari-media-preview/' + merchantId + '/' + id + '.pdf',
        createdAt: new Date(Date.parse(now) - (33 - id) * 60000).toISOString(), canDelete: true, issues: legacy ? ['size', 'url'] : [] }));
    }
    if (['destination-missing', 'readonly'].includes(mode())) for (let i = 0; i < 12; i++) {
      const requestKey = '00000000-0000-4000-8000-' + String(merchantId * 100 + i).padStart(12, '0');
      const result = this.base(requestKey);
      this.receipts.set(requestKey, { signature: 'synthetic-reservation', result: { ...result, state: 'uploading', kind: 'upload',
        actorId: i === 0 ? actorId + 1 : actorId, originalName: this.storeName + ' · Pending طلب ' + i + '.png', fileSize: 1024, category: 'general' } });
    }
  }
  private get storeName() { return this.merchantId === 269 ? 'نواة · Nawa' : 'مدار · Madar'; }
  private marker(id: number) { return [this.actorId, this.merchantId, id, this.version, 0, 0, 0, 0].map(n => n.toString(16).padStart(8, '0')).join(''); }
  private base(requestKey: string): MediaRequestResult {
    return { actorId: this.actorId, merchantId: this.merchantId, requestKey, state: 'missing', kind: null, assetId: null,
      originalName: null, fileSize: null, category: null, url: null, checkedAt: this.now, closedBy: null, storageDeletion: 'not_attempted' };
  }
  private get canManage() { return this.mode() !== 'readonly'; }
  private pending() { return Array.from(this.receipts.values()).map(r => r.result).filter(r => r.state === 'uploading'); }
  read(name: string, input: unknown = {}) {
    if (name === 'media.requestReceipt') {
      const { requestKey } = mediaReceiptInput.parse(input), result = this.receipts.get(requestKey)?.result ?? this.base(requestKey);
      if (result.actorId !== this.actorId && !this.canManage) throw fault('forbidden', 'FORBIDDEN');
      return structuredClone(mediaRequestResult.parse(result));
    }
    if (name !== 'media.workspace') throw fault('missing', 'NOT_FOUND');
    const selection = mediaWorkspaceInput.parse(input), q = selection.query.toLowerCase();
    const counts = { product: 0, promotion: 0, template: 0, general: 0, other: 0 };
    for (const row of this.rows) counts[row.category ?? 'other']++;
    const matched = this.rows.filter(r => (selection.category === 'all' || selection.category === r.category)
      && (selection.kind === 'all' || selection.kind === r.kind)
      && (!q || [r.originalName, r.fileName].some(s => s?.toLowerCase().includes(q)) || String(r.id) === q));
    matched.sort((a, b) => selection.sort === 'name' ? (a.originalName ?? '').localeCompare(b.originalName ?? '') || a.id - b.id
      : selection.sort === 'largest' ? (b.fileSize ?? -1) - (a.fileSize ?? -1) || b.id - a.id
      : selection.sort === 'oldest' ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id - b.id
      : (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id - a.id);
    const pages = Math.ceil(matched.length / 24), currentPage = Math.min(selection.page, Math.max(1, pages));
    const pending = this.pending().reverse(), pendingPages = Math.ceil(pending.length / 10), currentRequestPage = Math.min(selection.requestPage, Math.max(1, pendingPages));
    const invalidSizeCount = this.rows.filter(r => r.fileSize === null).length;
    return mediaWorkspaceSchema.parse({ actorId: this.actorId, merchantId: this.merchantId, checkedAt: this.now, selection, currentPage,
      pageSize: 24, pages, total: this.rows.length, matched: matched.length, counts, totalSizeBytes: invalidSizeCount ? null : this.rows.reduce((n, r) => n + r.fileSize!, 0),
      invalidSizeCount, maxFileBytes: 5242880, maxStorageBytes: 52428800, storageEvidence: 'registered_metadata', referenceEvidence: 'not_scanned',
      allowedUploadCategories: this.canManage ? [...mediaCategories] : [], pendingUploadCount: pending.length,
      pendingUploadBytes: pending.reduce((n, r) => n + r.fileSize!, 0), pendingPages, currentRequestPage,
      pendingUploads: pending.slice((currentRequestPage - 1) * 10, currentRequestPage * 10).map(r => ({ requestKey: r.requestKey, actorId: r.actorId,
        originalName: r.originalName, fileSize: r.fileSize, category: r.category, createdAt: r.checkedAt,
        canRead: r.actorId === this.actorId || this.canManage, canClose: this.canManage })),
      rows: matched.slice((currentPage - 1) * 24, currentPage * 24).map(r => ({ ...r, canDelete: this.canManage })) });
  }
  mutate(name: string, input: unknown): MediaRequestResult {
    if (!this.canManage) throw fault('forbidden', 'FORBIDDEN');
    if (name === 'media.closeRequest') {
      const { requestKey } = mediaReceiptInput.parse(input), saved = this.receipts.get(requestKey);
      if (saved && saved.result.state !== 'uploading') return structuredClone(saved.result);
      const result = mediaRequestResult.parse({ ...saved?.result ?? this.base(requestKey), state: 'cancelled', closedBy: this.actorId });
      this.receipts.set(requestKey, { signature: saved?.signature ?? 'closed-before-arrival', result }); this.writes++; return structuredClone(result);
    }
    if (name !== 'media.uploadReviewed' && name !== 'media.removeReviewed') throw fault('missing', 'NOT_FOUND');
    const value = name === 'media.uploadReviewed' ? mediaUploadInput.parse(input) : mediaRemoveInput.parse(input);
    const signature = JSON.stringify(value), saved = this.receipts.get(value.requestKey);
    if (saved) {
      if (saved.result.actorId !== this.actorId) throw fault('reused', 'CONFLICT');
      if (saved.result.state === 'cancelled') return structuredClone(saved.result);
      if (saved.signature !== signature) throw fault('reused', 'CONFLICT');
      return structuredClone(saved.result);
    }
    let result = this.base(value.requestKey);
    if ('fileBase64' in value) {
      let bytes: string;
      try { bytes = atob(value.fileBase64); if (btoa(bytes) !== value.fileBase64) throw Error(); } catch { throw fault('invalid'); }
      const prefix = Array.from(bytes.slice(0, 12), c => c.charCodeAt(0));
      const valid = value.mimeType === 'image/png' ? prefix.slice(0, 8).join() === '137,80,78,71,13,10,26,10'
        : value.mimeType === 'image/jpeg' ? prefix.slice(0, 3).join() === '255,216,255'
        : value.mimeType === 'image/gif' ? /^GIF8[79]a/.test(bytes)
        : value.mimeType === 'image/webp' ? bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP' : bytes.startsWith('%PDF-');
      if (!bytes.length || bytes.length > 5242880 || !valid) throw fault('invalid');
      if (this.admitted >= 20 || this.rows.some(r => r.fileSize === null)
        || this.rows.reduce((n, r) => n + r.fileSize!, 0) + this.pending().reduce((n, r) => n + r.fileSize!, 0) + bytes.length > 52428800) throw fault('limit');
      this.admitted++;
      result = { ...result, state: 'uploading', kind: 'upload', fileSize: bytes.length, originalName: mediaFileName(value.originalName), category: value.category };
      if (this.mode() !== 'destination-missing') {
        const id = this.nextId++, url = 'https://example.com/sari-media-preview/' + this.merchantId + '/' + id;
        this.version++;
        this.rows.push(mediaWorkspaceRow.parse({ id, revision: this.marker(id), originalName: result.originalName,
          fileName: 'media/' + this.merchantId + '/' + value.category + '/' + value.requestKey, mimeType: value.mimeType,
          fileSize: bytes.length, category: value.category, kind: value.mimeType === 'application/pdf' ? 'pdf' : 'image',
          url, previewUrl: url, createdAt: this.now, canDelete: true, issues: [] }));
        result = { ...result, state: 'uploaded', assetId: id, url };
      }
    } else {
      const row = this.rows.find(r => r.id === value.id); if (!row) throw fault('missing', 'NOT_FOUND');
      if (row.revision !== value.revision) throw fault('stale', 'CONFLICT');
      result = { ...result, state: 'removed', kind: 'remove', assetId: row.id, originalName: row.originalName, fileSize: row.fileSize, category: row.category, url: row.url };
      this.rows = this.rows.filter(r => r.id !== row.id);
    }
    result = mediaRequestResult.parse(result); this.receipts.set(value.requestKey, { signature, result }); this.writes++;
    return structuredClone(result);
  }
}
