import { describe, it, expect } from 'vitest';
import { mediaNavigation, mediaFileIssue, mediaSelectionKey, scopedMediaWorkspace, scopedMediaReceipt, mediaReceiptStorageKey } from '../client/src/lib/media-workspace';
import { mediaWorkspaceInput } from '../shared/media-workspace';
import { mediaWorkspaceAr, mediaWorkspaceEn } from '../client/src/locales/media-workspace';
const selection = mediaWorkspaceInput.parse({});
const data = () => ({ actorId: 1, merchantId: 2, checkedAt: '2026-10-03T12:00:00Z', selection, currentPage: 1, pageSize: 24,
  pages: 0, total: 0, matched: 0, totalSizeBytes: 0, invalidSizeCount: 0, maxFileBytes: 5242880, maxStorageBytes: 52428800,
  storageEvidence: 'registered_metadata', referenceEvidence: 'not_scanned', allowedUploadCategories: ['product'],
  counts: { product: 0, promotion: 0, template: 0, general: 0, other: 0 }, pendingUploadCount: 0, pendingUploadBytes: 0,
  pendingPages: 0, currentRequestPage: 1, pendingUploads: [], rows: [] });
describe('media client identity, navigation and file validation', () => {
  it('keeps full selection in navigation while neutralizing invalid routes', () => {
    expect(mediaNavigation('?q=%20file%20&category=promotion&kind=pdf&sort=name&page=3&requests=2')).toEqual({ query: 'file', category: 'promotion', kind: 'pdf', sort: 'name', page: 3, requestPage: 2 });
    expect(mediaNavigation('?page=Infinity&requests=-1&kind=javascript&category=private&sort=sql')).toEqual(selection);
    expect(mediaSelectionKey(selection)).not.toBe(mediaSelectionKey({ ...selection, requestPage: 2 }));
  });
  it.each(['actor', 'tenant', 'selection', 'count', 'pages', 'rows', 'pending', 'request-page'])('hides mismatched %s responses', change => {
    const value: any = data(); expect(scopedMediaWorkspace(value, 1, 2, selection)).not.toBeNull();
    if (change === 'actor') value.actorId++; if (change === 'tenant') value.merchantId++;
    if (change === 'selection') value.selection = { ...selection, query: 'other' };
    if (change === 'count') value.counts.product = 1; if (change === 'pages') value.pages = 1;
    if (change === 'rows') value.matched = 1; if (change === 'pending') value.pendingUploadCount = 1;
    if (change === 'request-page') value.currentRequestPage = 2;
    expect(scopedMediaWorkspace(value, 1, 2, selection)).toBeNull();
  });
  it('keeps pending browser receipt IDs scoped to the actor and selected store', () => {
    expect(mediaReceiptStorageKey(1, 2)).not.toBe(mediaReceiptStorageKey(1, 3));
    const requestKey = 'a3ea393a-36a4-418c-9a10-a8b46a0a18c9';
    const receipt = { actorId: 1, merchantId: 2, requestKey, state: 'cancelled', kind: null, assetId: null,
      originalName: null, fileSize: null, category: null, url: null, checkedAt: '2026-10-03T12:00:00Z', closedBy: 1, storageDeletion: 'not_attempted' };
    expect(scopedMediaReceipt(receipt, 1, 2, requestKey)).not.toBeNull();
    expect(scopedMediaReceipt(receipt, 3, 2, requestKey)).toBeNull(); expect(scopedMediaReceipt(receipt, 1, 3, requestKey)).toBeNull();
  });
  it('reports each upload field issue before preparing bytes', () => {
    const file = { name: 'photo.png', size: 5242880, type: 'image/png' }; expect(mediaFileIssue(file)).toBeNull();
    expect(mediaFileIssue(null)).toBe('selectFile'); expect(mediaFileIssue(file, 2)).toBe('oneFile');
    expect(mediaFileIssue({ ...file, size: 5242881 })).toBe('fileSizeError');
    expect(mediaFileIssue({ ...file, size: 0 })).toBe('fileSizeError');
    expect(mediaFileIssue({ ...file, name: 'a'.repeat(256) })).toBe('fileNameError');
    expect(mediaFileIssue({ ...file, type: 'image/heic' })).toBe('fileTypeError');
  });
  it('supplies matching Arabic and English copy for every media state and action', () => {
    expect(Object.keys(mediaWorkspaceAr).sort()).toEqual(Object.keys(mediaWorkspaceEn).sort());
    expect(Object.values(mediaWorkspaceAr).every(s => s.trim())).toBe(true); expect(Object.values(mediaWorkspaceEn).every(s => s.trim())).toBe(true);
  });
});
