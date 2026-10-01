import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCampaignAudience, requireCompleteCampaignAudience, CampaignAudienceLimitError } from './campaign-audience';
import { filterCampaignAudience } from '../shared/campaign-audience';
import { normalizeCampaignPhone } from './automation/campaign-guard';

describe.skipIf(!process.env.DATABASE_URL)('campaign audience snapshot on disposable local tenants', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const now = new Date('2026-10-01T12:00:00Z');
  const q = async (sql: string, params: any[] = []) => (await (await getPool())!.execute<any>(sql, params))[0];
  const insert = async (phone: string, purchases = 0, activity = '2026-10-01 10:00:00', merchant = owner.merchantId) => Number((await q(
    'INSERT INTO conversations (merchantId, customerPhone, purchaseCount, lastActivityAt) VALUES (?, ?, ?, ?)', [merchant, phone, purchases, activity])).insertId);
  const audience = (filters = {}) => readCampaignAudience(owner.merchantId, JSON.stringify(filters), now);
  beforeEach(async () => { owner = await createDisposableMerchant('campaign-audience'); other = await createDisposableMerchant('campaign-foreign'); });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);

  it('counts and selects beyond the old 500-conversation ceiling', async () => {
    const args = Array.from({ length: 620 }, (_, i) => [owner.merchantId, String(99900000000 + i), i === 0 ? 7 : 0]);
    await q(`INSERT INTO conversations (merchantId, customerPhone, purchaseCount) VALUES ${args.map(() => '(?,?,?)').join(',')}`, args.flat());
    const all = await audience(); expect(all.count).toBe(620); expect(requireCompleteCampaignAudience(all)).toHaveLength(620);
    const olderMatch = await audience({ purchaseCountMin: 7 }); expect(olderMatch).toMatchObject({ count: 1, recipientCount: 1 });
    expect(olderMatch.customers[0].customerPhone).toBe('99900000000');
  });
  it('reports the full count above dispatch capacity and refuses a partial campaign', async () => {
    const args = Array.from({ length: 2010 }, (_, i) => [owner.merchantId, String(99900000000 + i)]);
    await q(`INSERT INTO conversations (merchantId,customerPhone) VALUES ${args.map(() => '(?,?)').join(',')}`, args.flat());
    const result = await audience(); expect(result).toMatchObject({ count: 2010, recipientCount: 2010, customersTruncated: true, recipientLimit: 2000 });
    expect(result.customers).toHaveLength(2000); expect(() => requireCompleteCampaignAudience(result)).toThrow(CampaignAudienceLimitError);
  });
  it('normalizes exactly like the delivery guard and does not count duplicate aliases as distinct recipients', async () => {
    const phones = ['+966 50 000 0001', '00966500000001', '0500000001', '500000001', '00500000001', '+447700900123', '00447700900123', 'abc', '0123', '0000000000', '9999999999999999', '12345678'];
    for (const phone of phones) await insert(phone);
    const result = await audience(), valid = phones.map(normalizeCampaignPhone).filter(Boolean);
    expect(result.count).toBe(phones.length); expect(result.recipientCount).toBe(new Set(valid).size);
    expect(result.invalidPhoneCount).toBe(phones.length - valid.length); expect(result.duplicateCount).toBe(valid.length - new Set(valid).size);
    expect(result.customers.map(c => c.customerPhone).sort()).toEqual([...new Set(valid)].sort());
  });
  it('deduplicates only within the requested tenant and never exposes another tenant identity', async () => {
    const mine = await insert('0500000001'), theirs = await insert('0500000001', 0, undefined, other.merchantId);
    await insert('0500000002', 0, undefined, other.merchantId);
    expect(await audience()).toMatchObject({ count: 1, recipientCount: 1, customers: [{ id: mine, customerPhone: '966500000001' }] });
    expect((await audience()).customers.some(c => c.id === theirs)).toBe(false);
  });
  it.each([{ lastActivityDays: 1 }, { purchaseCountMin: 1 }, { purchaseCountMax: 5 }, { purchaseCountMin: 2, purchaseCountMax: 5, lastActivityDays: 1 }, {}])('matches the canonical filter for %j at UTC boundaries', async filters => {
    const rows = [
      { lastActivityAt: '2026-09-30 12:00:00', purchaseCount: 2 },
      { lastActivityAt: '2026-09-30 11:59:59', purchaseCount: 3 },
      { lastActivityAt: '2026-10-01 12:00:00', purchaseCount: 5 },
      { lastActivityAt: '2026-10-01 12:00:01', purchaseCount: 10 },
      { lastActivityAt: '2026-01-01 00:00:00', purchaseCount: 0 },
    ];
    const saved = [];
    for (const [i, row] of rows.entries()) saved.push({ ...row, id: await insert(String(99900000000 + i), row.purchaseCount, row.lastActivityAt) });
    const result = await audience(filters), expected = filterCampaignAudience(saved, JSON.stringify(filters), now);
    expect(result.count).toBe(expected.length); expect(result.customers.map(c => c.id).sort()).toEqual(expected.map(c => c.id).sort());
    expect(result.asOf).toBe(now.toISOString());
  });
  it('retains the same snapshot if a matching conversation is removed and another added between aggregate and identities', async () => {
    const original = await insert('0500000001');
    const pool = (await getPool())!, connection = await pool.getConnection(), native = connection.execute.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'execute').mockImplementation((async (...args: any[]) => {
      const result = await native(...args as [any, any]);
      if (String(args[0]).includes('COUNT(DISTINCT phone)')) { await q('DELETE FROM conversations WHERE id=? AND merchantId=?', [original, owner.merchantId]); await insert('0500000002'); }
      return result;
    }) as any);
    expect(await audience()).toMatchObject({ count: 1, recipientCount: 1, customers: [{ id: original, customerPhone: '966500000001' }] });
    vi.restoreAllMocks(); expect((await audience()).customers[0].customerPhone).toBe('966500000002');
  });
  it('rolls back and releases a failed projection instead of returning a misleading empty audience', async () => {
    await insert('0500000001');
    const pool = (await getPool())!, connection = await pool.getConnection(), native = connection.execute.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    const rollback = vi.spyOn(connection, 'rollback'), release = vi.spyOn(connection, 'release');
    vi.spyOn(connection, 'execute').mockImplementation((async (...args: any[]) => {
      if (String(args[0]).includes('GROUP BY phone')) throw Error('Injected audience failure'); return native(...args as [any, any]);
    }) as any);
    await expect(audience()).rejects.toThrow('Injected audience failure'); expect(rollback).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce();
    vi.restoreAllMocks(); expect((await audience()).recipientCount).toBe(1);
  });
  it('returns an explicit empty snapshot for an empty tenant', async () => { expect(await audience()).toMatchObject({ count: 0, recipientCount: 0, invalidPhoneCount: 0, duplicateCount: 0, customers: [], customersTruncated: false }); });
});
