import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock('./db/connection', () => db);
import { mediaLibraryUrl, mediaWorkspaceInput } from '../shared/media-workspace';
import { projectMediaRow, withMediaRead, type MediaAuthority } from './media-workspace';
const authority: MediaAuthority = { role: 'owner', active: true, allowedUploadCategories: ['product', 'promotion', 'template', 'general'] };
const row = () => ({ id: 1, merchant_id: 2, file_name: 'media/2/one.png', original_name: 'اسم طويل.png', mime_type: 'image/png',
  file_size: 200, url: 'https://cdn.example.com/one.png', category: 'product', created_at: '2026-10-03 00:00:00' });
describe('complete media source contract', () => {
  it('keeps the original metadata, revision and UTC date without inventing file availability', () => {
    const data = projectMediaRow(row(), authority);
    expect(data).toMatchObject({ originalName: 'اسم طويل.png', fileSize: 200, kind: 'image', createdAt: '2026-10-03T00:00:00.000Z', canDelete: true, issues: [] });
    expect(projectMediaRow({ ...row(), file_size: 201 }, authority).revision).not.toBe(data.revision);
  });
  it('exposes malformed legacy metadata as unknown and never a safe preview', () => {
    const data = projectMediaRow({ ...row(), file_name: '', original_name: '', mime_type: 'text/html', file_size: -1,
      url: 'javascript:alert(1)', category: '', created_at: 'invalid' }, authority);
    expect(data).toMatchObject({ originalName: null, fileName: null, kind: 'other', fileSize: null, category: null, createdAt: null, previewUrl: null });
    expect(data.issues.sort()).toEqual(['name', 'storage_key', 'mime', 'size', 'category', 'url', 'created'].sort());
  });
  it.each(['product', 'general', 'promotion', 'template'])('applies category-level capability to %s', category => {
    const sales: MediaAuthority = { role: 'sales_supervisor', active: true, allowedUploadCategories: ['product', 'general'] };
    expect(projectMediaRow({ ...row(), category }, sales).canDelete).toBe(['product', 'general'].includes(category));
    expect(projectMediaRow({ ...row(), category }, { ...authority, active: false }).canDelete).toBe(false);
  });
  it.each(['javascript:alert(1)', 'data:image/png;base64,aA==', 'file:///image.png', 'http://example.com/a',
    'https://user:secret@example.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://machine.local/a',
    'https://example.com:444/a', 'https://example.com/a\nb', '//example.com/a', 'https://2130706433/a'])('refuses unsafe browser URL %s', url => {
    expect(mediaLibraryUrl(url)).toBeNull();
  });
  it('allows normal external HTTPS URLs without claiming DNS or bytes have been inspected', () => {
    expect(mediaLibraryUrl('https://cdn.example.com/a.png?token=a')).toBe('https://cdn.example.com/a.png?token=a');
  });
  it.each([{ page: 0 }, { page: 1.5 }, { page: 1000001 }, { query: 'x'.repeat(101) }, { category: 'foreign' }, { merchantId: 99 }, { sort: 'id;DELETE' }])('rejects malformed selection %j', input => {
    expect(mediaWorkspaceInput.safeParse(input).success).toBe(false);
  });
});
describe('media authority transaction failures', () => {
  let tx: any;
  beforeEach(() => {
    tx = { query: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn(),
      execute: vi.fn(async (sql: string) => [sql.includes('FROM merchants') ? [{ userId: 1, status: 'active' }]
        : sql.includes('FROM users') ? [{ account_status: 'active' }] : []]) };
    db.getPool.mockResolvedValue({ getConnection: async () => tx });
  });
  it('fails instead of returning an empty success when the database is unavailable', async () => {
    db.getPool.mockResolvedValue(null);
    await expect(withMediaRead(1, 2, async () => [])).rejects.toMatchObject({ reason: 'unavailable' });
  });
  it('does not expose read results if ending the snapshot is uncertain', async () => {
    tx.commit.mockRejectedValue(Error('ack lost'));
    await expect(withMediaRead(1, 2, async () => ['private data'])).rejects.toMatchObject({ reason: 'unavailable' });
    expect(tx.destroy).toHaveBeenCalledOnce(); expect(tx.release).not.toHaveBeenCalled();
  });
  it('destroys the connection if rollback fails', async () => {
    tx.rollback.mockRejectedValue(Error('rollback lost'));
    await expect(withMediaRead(1, 2, async () => { throw Error('source read failed'); })).rejects.toMatchObject({ reason: 'unavailable' });
    expect(tx.destroy).toHaveBeenCalledOnce();
  });
});
