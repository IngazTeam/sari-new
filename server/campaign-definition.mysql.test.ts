import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { getCampaignById, updateEditableCampaign } from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { campaignDefinitionKey } from './campaign-definition';
import { enqueueCampaignDeliveries, completeCampaignWithoutRecipients, CampaignDispatchConflictError } from './automation/campaign-delivery-outbox';

describe.skipIf(!process.env.DATABASE_URL)('campaign definition admission race in local MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number, expectedDefinition: string;
  const q = async (sql: string, params: any[] = []) => (await (await getPool())!.execute<any>(sql, params))[0];
  const queued = () => q('SELECT * FROM campaign_delivery_outbox WHERE campaign_id=?', [id]);
  const enqueue = (merchantId = owner.merchantId, definition = expectedDefinition) => enqueueCampaignDeliveries({ campaignId: id, merchantId, expectedDefinition: definition, recipients: [{ phone: '99900000001' }] });
  beforeEach(async () => {
    owner = await createDisposableMerchant('campaign-definition'); other = await createDisposableMerchant('campaign-definition-other');
    id = Number((await q("INSERT INTO campaigns (merchantId,name,message,imageUrl,targetAudience,scheduledAt,status) VALUES (?,'Original name','Original message',NULL,'{}','2027-01-01 12:00:00','scheduled')", [owner.merchantId])).insertId);
    expectedDefinition = campaignDefinitionKey((await getCampaignById(id))!);
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);

  it('admits exactly the unchanged definition and makes it uneditable', async () => {
    expect(await enqueue()).toEqual({ queued: 1 }); expect(await queued()).toHaveLength(1);
    expect(await getCampaignById(id)).toMatchObject({ status: 'sending', totalRecipients: 1, message: 'Original message' });
    expect(await updateEditableCampaign(id, owner.merchantId, { message: 'Late edit' })).toBe(false);
    expect((await getCampaignById(id))!.message).toBe('Original message');
  });
  it.each([
    ['name', 'Renamed'], ['message', 'Changed message'], ['imageUrl', 'https://example.test/changed.png'],
    ['targetAudience', '{"purchaseCountMin":3}'], ['scheduledAt', '2027-02-01 12:00:00'], ['status', 'draft'],
  ])('rejects an intervening %s change even within the same timestamp second', async (field, value) => {
    const before = (await getCampaignById(id))!;
    // Column comes from the fixed test table, never user data. Keep updatedAt exactly unchanged.
    await q(`UPDATE campaigns SET ${field}=?,updatedAt=? WHERE id=? AND merchantId=?`, [value, before.updatedAt, id, owner.merchantId]);
    await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError); expect(await queued()).toEqual([]);
    expect((await getCampaignById(id))!.updatedAt).toBe(before.updatedAt);
  });
  it('cannot complete an empty audience using a stale definition', async () => {
    await updateEditableCampaign(id, owner.merchantId, { targetAudience: '{"purchaseCountMin":1}' });
    expect(await completeCampaignWithoutRecipients(id, owner.merchantId, expectedDefinition)).toBe(false);
    expect((await getCampaignById(id))!.status).toBe('scheduled'); expect(await queued()).toEqual([]);
  });
  it('completes an unchanged empty audience and cannot complete twice', async () => {
    expect(await completeCampaignWithoutRecipients(id, owner.merchantId, expectedDefinition)).toBe(true);
    expect(await completeCampaignWithoutRecipients(id, owner.merchantId, expectedDefinition)).toBe(false);
    expect(await getCampaignById(id)).toMatchObject({ status: 'completed', totalRecipients: 0 });
  });
  it('rejects another tenant and an already deleted campaign', async () => {
    await expect(enqueue(other.merchantId)).rejects.toBeInstanceOf(CampaignDispatchConflictError); expect(await queued()).toEqual([]);
    expect(await completeCampaignWithoutRecipients(id, other.merchantId, expectedDefinition)).toBe(false);
    await q('DELETE FROM campaigns WHERE id=? AND merchantId=?', [id, owner.merchantId]);
    await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError);
  });
  it('waits for an editor holding the campaign lock, then detects its committed content change', async () => {
    const connection = await (await getPool())!.getConnection(); let sending: Promise<unknown> | undefined;
    try {
      await connection.beginTransaction(); await connection.execute('SELECT id FROM campaigns WHERE id=? FOR UPDATE', [id]);
      let settled = false;
      sending = enqueue().then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 60)); expect(settled).toBe(false);
      await connection.execute("UPDATE campaigns SET message='Concurrent edit' WHERE id=?", [id]); await connection.commit();
      expect(await sending).toMatchObject({ error: expect.any(CampaignDispatchConflictError) }); expect(await queued()).toEqual([]);
    } finally { await connection.rollback(); connection.release(); await sending; }
  });
  it('admits only one simultaneous sender for a definition', async () => {
    const results = await Promise.allSettled([enqueue(), enqueue()]); expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1); expect(await queued()).toHaveLength(1);
  });
  it('rolls back recipient insertions if claiming the campaign fails', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection(), native = connection.execute.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'execute').mockImplementation((async (...args: any[]) => {
      if (String(args[0]).includes('UPDATE campaigns')) throw Error('Injected claim failure'); return native(...args as [any, any]);
    }) as any);
    await expect(enqueue()).rejects.toThrow('Injected claim failure'); vi.restoreAllMocks();
    expect(await queued()).toEqual([]); expect((await getCampaignById(id))!.status).toBe('scheduled');
  });
});
