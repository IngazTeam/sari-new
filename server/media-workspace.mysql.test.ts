import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readMediaWorkspace } from './media-workspace';
import { mediaWorkspaceInput } from '../shared/media-workspace';
describe.skipIf(!process.env.DATABASE_URL)('media library complete scoped source', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const read = (input: object = {}, actor = owner.userId, merchant = owner.merchantId) => readMediaWorkspace(actor, merchant, mediaWorkspaceInput.parse(input));
  const create = async (name = 'image.png', merchant = owner.merchantId, category = 'product', mime = 'image/png') => Number((await q(
    "INSERT INTO media_library (merchant_id,file_name,original_name,mime_type,file_size,url,category) VALUES (?,'synthetic/key',?,?,10,'https://cdn.example.com/image.png',?)",
    [merchant, name, mime, category])).insertId);
  beforeEach(async () => { owner = await createDisposableMerchant('media-source'); other = await createDisposableMerchant('media-other'); });
  afterEach(() => cleanupDisposableMerchants([owner.userId, other.userId])); afterAll(closeDb);
  it('finds all 105 files, including the oldest beyond the previous 100-file cap, without foreign metadata', async () => {
    const first = await create('oldest-target.png'); for (let i = 0; i < 104; i++) await create('later-' + i + '.png');
    await create('PRIVATE-FILE.png', other.merchantId);
    const pages = await Promise.all([1, 2, 3, 4, 5].map(page => read({ page })));
    expect(pages[0]).toMatchObject({ total: 105, matched: 105, pages: 5, totalSizeBytes: 1050, storageEvidence: 'registered_metadata', referenceEvidence: 'not_scanned' });
    expect(new Set(pages.flatMap(p => p.rows.map(r => r.id))).size).toBe(105);
    expect(pages[4].rows).toHaveLength(9); expect(pages[4].rows[8].id).toBe(first);
    expect((await read({ query: 'oldest-target' })).rows.map(r => r.id)).toEqual([first]);
    expect(JSON.stringify(pages)).not.toContain('PRIVATE-FILE');
    expect(await read({ page: 900 })).toMatchObject({ selection: { page: 900 }, currentPage: 5 });
  });
  it('treats search wildcards as literal data and composes category, type and deterministic order', async () => {
    const wildcard = await create('literal_%_file.pdf', owner.merchantId, 'promotion', 'application/pdf');
    const plain = await create('plain.png');
    expect((await read({ query: '%' })).rows.map(r => r.id)).toEqual([wildcard]);
    expect((await read({ query: String(plain) })).rows.map(r => r.id)).toEqual([plain]);
    expect(await read({ kind: 'pdf', category: 'promotion' })).toMatchObject({ matched: 1, counts: { product: 1, promotion: 1 } });
    expect((await read({ kind: 'pdf', category: 'product' })).rows).toHaveLength(0);
    expect((await read({ sort: 'oldest' })).rows.map(r => r.id)).toEqual([wildcard, plain]);
    expect((await read({ sort: 'name' })).rows.map(r => r.id)).toEqual([wildcard, plain]);
  });
  it('exposes invalid bytes and unsupported MIME without presenting zero usage or a verified asset', async () => {
    const id = await create('bad.html', owner.merchantId, 'general', 'text/html');
    await q("UPDATE media_library SET file_size=-9,url='javascript:alert(1)' WHERE id=?", [id]);
    const data = await read({ kind: 'other' });
    expect(data).toMatchObject({ totalSizeBytes: null, invalidSizeCount: 1, matched: 1 });
    expect(data.rows[0]).toMatchObject({ fileSize: null, kind: 'other', previewUrl: null });
    expect(data.rows[0].issues).toEqual(expect.arrayContaining(['size', 'mime', 'url']));
  });
  it('uses the explicitly selected membership and category-specific management capabilities', async () => {
    await create('selected.pdf', other.merchantId, 'promotion', 'application/pdf');
    await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [other.merchantId, owner.userId]);
    const viewer = await read({}, owner.userId, other.merchantId);
    expect(viewer).toMatchObject({ total: 1, allowedUploadCategories: [] }); expect(viewer.rows[0].canDelete).toBe(false);
    await q("UPDATE merchant_members SET role='sales_supervisor' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]);
    expect((await read({}, owner.userId, other.merchantId)).allowedUploadCategories).toEqual(['product', 'general']);
    await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?", [other.merchantId, owner.userId]);
    expect((await read({}, owner.userId, other.merchantId)).rows[0].canDelete).toBe(true);
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [other.merchantId, owner.userId]);
    await expect(read({}, owner.userId, other.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
  });
  it('honors owner membership revocation, account deletion and suspended tenants', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [owner.merchantId, owner.userId]);
    await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?', [owner.merchantId, owner.userId]);
    await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [owner.userId]);
    await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE users SET account_status='active' WHERE id=?", [owner.userId]);
    await q("UPDATE merchants SET status='suspended' WHERE id=?", [owner.merchantId]);
    await expect(read()).rejects.toMatchObject({ reason: 'forbidden' });
  });
});
