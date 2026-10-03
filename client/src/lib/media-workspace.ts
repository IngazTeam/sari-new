import { mediaWorkspaceInput, mediaWorkspaceSchema, mediaCategories, mediaMimes, type MediaSelection } from '@shared/media-workspace';
import { mediaRequestResult } from '@shared/media-actions';
export const mediaSelectionKey = (s: MediaSelection) => JSON.stringify([s.query, s.category, s.kind, s.sort, s.page, s.requestPage]);
export function mediaNavigation(search: string) {
  const p = new URLSearchParams(search), page = (key: string) => /^[1-9]\d*$/.test(p.get(key) || '') && Number(p.get(key)) <= 1000000 ? Number(p.get(key)) : 1;
  return mediaWorkspaceInput.parse({ query: (p.get('q') || '').trim().slice(0, 100),
    category: mediaCategories.includes(p.get('category') as any) ? p.get('category') : 'all',
    kind: ['image', 'pdf', 'other'].includes(p.get('kind') || '') ? p.get('kind') : 'all',
    sort: ['oldest', 'name', 'largest'].includes(p.get('sort') || '') ? p.get('sort') : 'newest', page: page('page'), requestPage: page('requests') });
}
export function scopedMediaWorkspace(raw: unknown, actorId: number, merchantId: number, selection: MediaSelection) {
  const p = mediaWorkspaceSchema.safeParse(raw); if (!p.success) return null; const d = p.data;
  if (d.actorId !== actorId || d.merchantId !== merchantId || mediaSelectionKey(d.selection) !== mediaSelectionKey(selection)
      || d.matched > d.total || d.pages !== Math.ceil(d.matched / 24) || d.currentPage !== Math.min(selection.page, Math.max(1, d.pages))
      || d.rows.length !== Math.min(24, Math.max(0, d.matched - (d.currentPage - 1) * 24)) || new Set(d.rows.map(r => r.id)).size !== d.rows.length
      || Object.values(d.counts).reduce((a, b) => a + b, 0) !== d.total || d.pendingPages !== Math.ceil(d.pendingUploadCount / 10)
      || d.currentRequestPage !== Math.min(selection.requestPage, Math.max(1, d.pendingPages))
      || d.pendingUploads.length !== Math.min(10, Math.max(0, d.pendingUploadCount - (d.currentRequestPage - 1) * 10))
      || new Set(d.pendingUploads.map(r => r.requestKey)).size !== d.pendingUploads.length) return null;
  return d;
}
export function scopedMediaReceipt(raw: unknown, actorId: number, merchantId: number, requestKey: string) {
  const p = mediaRequestResult.safeParse(raw);
  return p.success && p.data.actorId === actorId && p.data.merchantId === merchantId && p.data.requestKey === requestKey ? p.data : null;
}
export const mediaReceiptStorageKey = (actorId: number, merchantId: number) => `sari.media.request.v1:${actorId}:${merchantId}`;
export function mediaFileIssue(file: { name: string; size: number; type: string } | null, count = 1) {
  if (count !== 1) return 'oneFile';
  if (!file) return 'selectFile';
  if (!file.name.trim() || file.name.length > 255) return 'fileNameError';
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 5242880) return 'fileSizeError';
  if (!mediaMimes.includes(file.type as any)) return 'fileTypeError';
  return null;
}
export const mediaErrorReason = (error: unknown) => {
  const message = (error as any)?.message || '';
  const reason = message.startsWith('media_workspace:') ? message.slice('media_workspace:'.length) : '';
  return ['forbidden', 'invalid', 'limit', 'stale', 'missing', 'reused', 'unknown'].includes(reason) ? reason : 'unavailable';
};
