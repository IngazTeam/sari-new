import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
const storage = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('./storage', () => ({ storagePut: storage.put }));
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { uploadMediaReviewed, removeMediaReviewed, readMediaReceipt, closeMediaRequest } from './media-actions';
import { readMediaWorkspace } from './media-workspace';
import { mediaWorkspaceInput } from '../shared/media-workspace';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6bUEAAAAASUVORK5CYII=';
describe.skipIf(!process.env.DATABASE_URL)('reviewed media requests on MySQL with bounded mocked storage', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const q = async (sql: string, args: any[] = []) => (await (await getPool())!.execute<any>(sql, args))[0];
  const input = () => ({ requestKey: randomUUID(), originalName: 'صورة.png', mimeType: 'image/png' as const, category: 'product' as const, fileBase64: png });
  const upload = (value = input(), actor = owner.userId, merchant = owner.merchantId) => uploadMediaReviewed(actor, merchant, value);
  const workspace = () => readMediaWorkspace(owner.userId, owner.merchantId, mediaWorkspaceInput.parse({}));
  const receipt = (requestKey: string) => readMediaReceipt(owner.userId, owner.merchantId, { requestKey });
  beforeEach(async () => {
    owner = await createDisposableMerchant('media-actions'); other = await createDisposableMerchant('media-other');
    storage.put.mockReset().mockImplementation(async (key: string, _data: Buffer, _mime: string, options: any) => {
      expect(options.signal).toBeInstanceOf(AbortSignal); return { key, url: 'https://cdn.example.com/' + key };
    });
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); }); afterAll(closeDb);
  it('uploads once and recovers the exact receipt after a lost client response', async () => {
    const value = input(), first = await upload(value); expect(first).toMatchObject({ state: 'uploaded', originalName: value.originalName });
    expect(await upload(value)).toEqual(first); expect(await receipt(value.requestKey)).toEqual(first);
    expect(storage.put).toHaveBeenCalledOnce(); expect((await workspace()).rows).toHaveLength(1);
    expect((await q('SELECT reserved_bytes FROM media_action_receipts WHERE merchant_id=?', [owner.merchantId]))[0].reserved_bytes).toBe(0);
    expect(JSON.stringify(await q('SELECT * FROM media_action_receipts WHERE merchant_id=?', [owner.merchantId]))).not.toContain(png);
  });
  it('binds the request to its original bytes and metadata', async () => {
    const value = input(); await upload(value);
    await expect(upload({ ...value, originalName: 'Changed.png' })).rejects.toMatchObject({ reason: 'reused' });
    await expect(upload({ ...value, fileBase64: Buffer.concat([Buffer.from(png, 'base64'), Buffer.from('changed')]).toString('base64') })).rejects.toMatchObject({ reason: 'reused' });
    expect(storage.put).toHaveBeenCalledOnce();
  });
  it('counts unsettled reservations and prevents concurrent uploads from exceeding the registered quota', async () => {
    const bytes = Buffer.from(png, 'base64').length;
    await q("INSERT INTO media_library (merchant_id,file_name,original_name,mime_type,file_size,url,category) VALUES (?,'fixture','existing.png','image/png',?,'https://cdn.example.com/x','product')", [owner.merchantId, 52428800 - bytes]);
    const results = await Promise.allSettled([upload(), upload()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(storage.put).toHaveBeenCalledOnce(); expect((await workspace()).totalSizeBytes).toBe(52428800);
  });
  it('keeps uncertain uploads reserved and never sends them again; explicit closure releases only the reservation', async () => {
    storage.put.mockRejectedValue(Error('Storage acknowledgement lost')); const value = input();
    await expect(upload(value)).rejects.toMatchObject({ reason: 'unknown' });
    expect(await upload(value)).toMatchObject({ state: 'uploading' }); expect(storage.put).toHaveBeenCalledOnce();
    expect(await workspace()).toMatchObject({ total: 0, pendingUploadCount: 1, pendingUploadBytes: Buffer.from(png, 'base64').length });
    expect((await workspace()).pendingUploads[0]).toMatchObject({ requestKey: value.requestKey, canClose: true });
    expect(await closeMediaRequest(owner.userId, owner.merchantId, { requestKey: value.requestKey })).toMatchObject({ state: 'cancelled', storageDeletion: 'not_attempted' });
    expect(await upload(value)).toMatchObject({ state: 'cancelled' });
    expect(await workspace()).toMatchObject({ pendingUploadCount: 0, pendingUploadBytes: 0 }); expect(storage.put).toHaveBeenCalledOnce();
  });
  it('closes an absent request before a delayed upload can start', async () => {
    const value = input(); expect(await receipt(value.requestKey)).toMatchObject({ state: 'missing' });
    await closeMediaRequest(owner.userId, owner.merchantId, { requestKey: value.requestKey });
    expect(await upload(value)).toMatchObject({ state: 'cancelled' }); expect(storage.put).not.toHaveBeenCalled();
  });
  it.each(['wrong-key', 'unsafe-url'] as const)('holds %s storage evidence for review without registering a usable file', async kind => {
    storage.put.mockImplementation(async key => ({ key: kind === 'wrong-key' ? 'other/key' : key, url: kind === 'unsafe-url' ? 'javascript:alert(1)' : 'https://cdn.example.com/x' }));
    const value = input(); await expect(upload(value)).rejects.toMatchObject({ reason: 'unknown' });
    expect(await workspace()).toMatchObject({ total: 0, pendingUploadCount: 1 }); expect(await receipt(value.requestKey)).toMatchObject({ state: 'uploading' });
  });
  it('removes the exact registration and preserves the receipt and file link without storage deletion', async () => {
    const value = input(), uploaded = await upload(value), row = (await workspace()).rows[0];
    const remove = { requestKey: randomUUID(), id: row.id, revision: row.revision };
    const result = await removeMediaReviewed(owner.userId, owner.merchantId, remove);
    expect(result).toMatchObject({ state: 'removed', assetId: uploaded.assetId, url: uploaded.url, storageDeletion: 'not_attempted' });
    expect(await removeMediaReviewed(owner.userId, owner.merchantId, remove)).toEqual(result);
    expect((await workspace()).total).toBe(0); expect(storage.put).toHaveBeenCalledOnce();
  });
  it('rejects a changed or foreign removal target and does not disclose foreign receipts', async () => {
    await upload(); const row = (await workspace()).rows[0], remove = { requestKey: randomUUID(), id: row.id, revision: row.revision };
    await q("UPDATE media_library SET original_name='Changed.png' WHERE id=?", [row.id]);
    await expect(removeMediaReviewed(owner.userId, owner.merchantId, remove)).rejects.toMatchObject({ reason: 'stale' });
    await expect(removeMediaReviewed(other.userId, other.merchantId, remove)).rejects.toMatchObject({ reason: 'missing' });
    expect(await readMediaReceipt(other.userId, other.merchantId, { requestKey: remove.requestKey })).toMatchObject({ state: 'missing' });
    expect((await workspace()).total).toBe(1);
  });
  it('enforces selected membership and category permissions without calling storage', async () => {
    await expect(upload(input(), other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)", [owner.merchantId, other.userId]);
    await expect(upload(input(), other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    await q("UPDATE merchant_members SET role='sales_supervisor' WHERE merchant_id=? AND user_id=?", [owner.merchantId, other.userId]);
    await expect(uploadMediaReviewed(other.userId, owner.merchantId, { ...input(), category: 'promotion' })).rejects.toMatchObject({ reason: 'forbidden' });
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, other.userId]);
    await expect(upload(input(), other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'forbidden' });
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('lets the owner close a revoked uploader reservation while refusing unrelated members', async () => {
    await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [owner.merchantId, other.userId]);
    storage.put.mockRejectedValue(Error('unknown')); const value = input();
    await expect(upload(value, other.userId, owner.merchantId)).rejects.toMatchObject({ reason: 'unknown' });
    await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [owner.merchantId, other.userId]);
    expect(await closeMediaRequest(owner.userId, owner.merchantId, { requestKey: value.requestKey })).toMatchObject({ state: 'cancelled', actorId: other.userId, closedBy: owner.userId });
  });
  it('holds authority through storage I/O so closure waits and recovers a completed upload', async () => {
    let entered!: () => void, release!: () => void;
    const inStorage = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
    storage.put.mockImplementation(async key => { entered(); await gate; return { key, url: 'https://cdn.example.com/' + key }; });
    const value = input(), pending = upload(value); await inStorage;
    let closed = false; const closing = closeMediaRequest(owner.userId, owner.merchantId, { requestKey: value.requestKey }).then(r => { closed = true; return r; });
    try { await new Promise(r => setTimeout(r, 60)); expect(closed).toBe(false); } finally { release(); }
    const completed = await pending; expect(await closing).toEqual(completed); expect(storage.put).toHaveBeenCalledOnce();
  });
  it('keeps all pending requests reachable across pages and lets an owner release an uncertain reservation', async () => {
    storage.put.mockRejectedValue(Error('unknown'));
    for (let i = 0; i < 11; i++) await expect(upload({ ...input(), originalName: `pending-${i}.png` })).rejects.toMatchObject({ reason: 'unknown' });
    const first = await workspace(), second = await readMediaWorkspace(owner.userId, owner.merchantId, mediaWorkspaceInput.parse({ requestPage: 2 }));
    expect(first).toMatchObject({ pendingUploadCount: 11, pendingPages: 2 }); expect(first.pendingUploads).toHaveLength(10);
    expect(second.pendingUploads).toHaveLength(1);
    expect(new Set([...first.pendingUploads, ...second.pendingUploads].map(r => r.requestKey)).size).toBe(11);
  });
  it('blocks a late removal after its request was closed and preserves the file registration', async () => {
    await upload(); const row = (await workspace()).rows[0], requestKey = randomUUID();
    await closeMediaRequest(owner.userId, owner.merchantId, { requestKey });
    expect(await removeMediaReviewed(owner.userId, owner.merchantId, { requestKey, id: row.id, revision: row.revision })).toMatchObject({ state: 'cancelled' });
    expect((await workspace()).total).toBe(1);
  });
});
