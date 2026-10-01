import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCampaignEditor, readCampaignAudiencePreview, CampaignEditorMissingError } from './campaign-editor';
import { readCampaignAudience } from './campaign-audience';

describe.skipIf(!process.env.DATABASE_URL)('campaign editor and count-only preview on local MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number;
  const now = new Date('2026-10-01T12:00:00Z');
  const q = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const read = (campaignId = id, merchantId = owner.merchantId) => readCampaignEditor(owner.userId, merchantId, { id: campaignId }, now);
  beforeEach(async () => {
    owner = await createDisposableMerchant('campaign-editor'); other = await createDisposableMerchant('campaign-editor-other');
    await q('UPDATE merchants SET timezone=? WHERE id=?', ['Asia/Kathmandu', owner.merchantId]);
    id = Number((await q("INSERT INTO campaigns (merchantId,name,message,imageUrl,targetAudience,scheduledAt,status) VALUES (?,'Fixture','Text',NULL,?,?,'scheduled')", [owner.merchantId, '{"lastActivityDays":45,"purchaseCountMin":0,"purchaseCountMax":2}', '2027-01-01 10:00:27'])).insertId);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('reads new and saved editor context with exact schedule and audience', async () => {
    expect(await readCampaignEditor(owner.userId, owner.merchantId, {}, now)).toMatchObject({ actorId: owner.userId, merchantId: owner.merchantId, timezone: 'Asia/Kathmandu', campaign: null, canManage: false });
    expect(await read()).toMatchObject({ campaign: { id, scheduledAt: '2027-01-01T10:00:27.000Z', audience: { status: 'valid', filters: { lastActivityDays: 45, purchaseCountMin: 0, purchaseCountMax: 2 } } } });
  });
  it('makes foreign and missing campaign identifiers indistinguishable', async () => {
    await expect(read(id, other.merchantId)).rejects.toBeInstanceOf(CampaignEditorMissingError);
    await q('DELETE FROM campaigns WHERE id=?', [id]); await expect(read()).rejects.toBeInstanceOf(CampaignEditorMissingError);
  });
  it('returns invalid saved targeting and timezone explicitly', async () => {
    await q('UPDATE campaigns SET targetAudience=? WHERE id=?', ['{broken private targeting', id]); await q('UPDATE merchants SET timezone=? WHERE id=?', ['Invalid/Zone', owner.merchantId]);
    const data = await read(); expect(data.timezone).toBeNull(); expect(data.campaign?.audience).toEqual({ status: 'invalid' }); expect(JSON.stringify(data)).not.toContain('private');
  });
  it('returns a complete count above dispatch capacity without selecting customer identities', async () => {
    const values = Array.from({ length: 2010 }, (_, i) => [owner.merchantId, String(99900000000 + i), 0, '2026-10-01 10:00:00']);
    await q(`INSERT INTO conversations (merchantId,customerPhone,purchaseCount,lastActivityAt) VALUES ${values.map(() => '(?,?,?,?)').join(',')}`, values.flat());
    await q("INSERT INTO conversations (merchantId,customerPhone,purchaseCount,lastActivityAt) VALUES (?,'99900099999',0,'2026-10-01 10:00:00')", [other.merchantId]);
    const pool = (await getPool())!, connection = await pool.getConnection(), native = connection.execute.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    const calls: string[] = []; vi.spyOn(connection, 'execute').mockImplementation((async (...args: any[]) => { calls.push(String(args[0])); return native(...args as [any, any]); }) as any);
    const data = await readCampaignAudiencePreview(owner.userId, owner.merchantId, { purchaseCountMin: 0, lastActivityDays: 45 }, now);
    expect(data).toMatchObject({ count: 2010, recipientCount: 2010, exceedsLimit: true, recipientLimit: 2000, actorId: owner.userId, merchantId: owner.merchantId });
    expect(data).not.toHaveProperty('customers'); expect(calls).toHaveLength(1); expect(calls[0]).not.toContain('GROUP BY phone');
  });
  it('matches dispatch counts for duplicates, invalid numbers and exact targeting without exposing numbers', async () => {
    const values = [['0500000001', 0], ['966500000001', 0], ['invalid', 0], ['0500000002', 5]];
    for (const [phone, count] of values) await q("INSERT INTO conversations (merchantId,customerPhone,purchaseCount,lastActivityAt) VALUES (?,?,?,'2026-10-01 10:00:00')", [owner.merchantId, phone, count]);
    const filters = { purchaseCountMax: 0 }, preview = await readCampaignAudiencePreview(owner.userId, owner.merchantId, filters, now), dispatch = await readCampaignAudience(owner.merchantId, JSON.stringify(filters), now);
    expect(preview).toMatchObject({ count: 3, recipientCount: 1, invalidPhoneCount: 1, duplicateCount: 1, filters });
    for (const key of ['count', 'recipientCount', 'invalidPhoneCount', 'duplicateCount'] as const) expect(preview[key]).toBe(dispatch[key]);
    expect(JSON.stringify(preview)).not.toContain('500000001');
  });
  it('returns explicit zero evidence for a valid empty tenant', async () => {
    expect(await readCampaignAudiencePreview(owner.userId, owner.merchantId, {}, now)).toMatchObject({ count: 0, recipientCount: 0, invalidPhoneCount: 0, duplicateCount: 0, exceedsLimit: false });
  });
  it('rolls back a failed count read and returns only a sanitized error', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection(); vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    const rollback = vi.spyOn(connection, 'rollback'), release = vi.spyOn(connection, 'release'); vi.spyOn(connection, 'execute').mockRejectedValueOnce(Error('PRIVATE SQL'));
    await expect(readCampaignAudiencePreview(owner.userId, owner.merchantId, {}, now)).rejects.toThrow('Campaign editor unavailable'); expect(rollback).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
  });
});
