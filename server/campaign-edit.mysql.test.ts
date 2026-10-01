import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./channels/whatsapp/service', () => ({ sendMerchantWhatsApp: vi.fn(), WhatsAppDeliveryStateError: class extends Error {} }));
import { sendMerchantWhatsApp } from './channels/whatsapp/service';
import { getPool, closeDb } from './db/connection';
import { createCampaign, getCampaignById, updateEditableCampaign } from './db';
import { editTenantCampaign } from './campaign-edit';
import { campaignDefinitionKey } from './campaign-definition';
import { CampaignContentError } from './campaign-content';
import { enqueueCampaignDeliveries } from './automation/campaign-delivery-outbox';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('campaign edit and content admission in local MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, id: number, definition: string;
  const q = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const current = async () => (await getCampaignById(id))!;
  beforeEach(async () => {
    owner = await createDisposableMerchant('campaign-edit'); other = await createDisposableMerchant('campaign-edit-other');
    id = Number((await q("INSERT INTO campaigns (merchantId,name,message,imageUrl,targetAudience,scheduledAt,status) VALUES (?,'Original','Hello',NULL,'{}',NULL,'draft')", [owner.merchantId])).insertId);
    definition = campaignDefinitionKey(await current());
  });
  afterEach(async () => { expect(sendMerchantWhatsApp).not.toHaveBeenCalled(); vi.restoreAllMocks(); await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);

  it('saves a reviewed edit and recognizes idempotent unchanged content', async () => {
    expect(await updateEditableCampaign(id, owner.merchantId, { message: 'Hello' }, definition)).toBe(true);
    expect(await updateEditableCampaign(id, owner.merchantId, { message: 'New message' }, definition)).toBe(true);
    expect(await current()).toMatchObject({ message: 'New message', status: 'draft' });
  });
  it('rejects missing and foreign campaigns without modifying either tenant', async () => {
    expect(await updateEditableCampaign(id, other.merchantId, { name: 'Wrong' }, definition)).toBe(false);
    await q('DELETE FROM campaigns WHERE id=?', [id]);
    expect(await updateEditableCampaign(id, owner.merchantId, { name: 'Missing' }, definition)).toBe(false);
  });
  it.each(['sending', 'completed', 'failed'])('refuses a %s campaign', async status => {
    await q('UPDATE campaigns SET status=? WHERE id=?', [status, id]);
    expect(await updateEditableCampaign(id, owner.merchantId, { name: 'Wrong' })).toBe(false);
    expect((await current()).name).toBe('Original');
  });
  it('rejects attaching an image to a long persisted message without truncation', async () => {
    await q('UPDATE campaigns SET message=? WHERE id=?', ['x'.repeat(1000), id]);
    await expect(updateEditableCampaign(id, owner.merchantId, { imageUrl: 'https://example.test/image.png' })).rejects.toBeInstanceOf(CampaignContentError);
    expect(await current()).toMatchObject({ message: 'x'.repeat(1000), imageUrl: null });
  });
  it('validates the merged image when only text changes and permits repairing both together', async () => {
    await q('UPDATE campaigns SET imageUrl=? WHERE id=?', ['https://example.test/image.png', id]);
    await expect(updateEditableCampaign(id, owner.merchantId, { message: 'x'.repeat(1000) })).rejects.toBeInstanceOf(CampaignContentError);
    expect(await updateEditableCampaign(id, owner.merchantId, { message: 'x'.repeat(1000), imageUrl: null })).toBe(true);
    expect(await current()).toMatchObject({ message: 'x'.repeat(1000), imageUrl: null });
  });
  it('does not insert an invalid campaign through direct creation', async () => {
    await expect(createCampaign({ merchantId: owner.merchantId, name: 'Invalid', message: 'x'.repeat(1000), imageUrl: 'https://example.test/image.png' })).rejects.toBeInstanceOf(CampaignContentError);
    expect(await q('SELECT id FROM campaigns WHERE merchantId=?', [owner.merchantId])).toHaveLength(1);
  });
  it.each(['name', 'message', 'imageUrl', 'targetAudience', 'scheduledAt'])('refuses a stale reviewed edit after %s changes', async field => {
    const values: Record<string, string> = { name: 'Changed', message: 'Changed', imageUrl: 'https://example.test/image.png', targetAudience: '{"purchaseCountMin":2}', scheduledAt: '2027-01-01 00:00:00' };
    await q(`UPDATE campaigns SET ${field}=? WHERE id=?`, [values[field], id]);
    const before = await current();
    expect(await updateEditableCampaign(id, owner.merchantId, { name: 'Stale write' }, definition)).toBe(false);
    expect(await current()).toEqual(before);
  });
  it('allows one of two different edits reviewed from the same definition', async () => {
    const results = await Promise.all(['First', 'Second'].map(name => updateEditableCampaign(id, owner.merchantId, { name }, definition)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(['First', 'Second']).toContain((await current()).name);
  });
  it('validates the latest combined fields when legacy partial edits race', async () => {
    const results = await Promise.allSettled([
      updateEditableCampaign(id, owner.merchantId, { message: 'x'.repeat(1000) }),
      updateEditableCampaign(id, owner.merchantId, { imageUrl: 'https://example.test/image.png' }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const row = await current(); expect(row.imageUrl === null || row.message === 'Hello').toBe(true);
  });
  it('waits for a concurrent editor then refuses the stale reviewed version', async () => {
    const connection = await (await getPool())!.getConnection(); let editing: Promise<boolean> | undefined;
    try {
      await connection.beginTransaction(); await connection.execute('SELECT id FROM campaigns WHERE id=? FOR UPDATE', [id]);
      let settled = false; editing = updateEditableCampaign(id, owner.merchantId, { name: 'Stale' }, definition).finally(() => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 60)); expect(settled).toBe(false);
      await connection.execute("UPDATE campaigns SET message='Concurrent message' WHERE id=?", [id]); await connection.commit();
      expect(await editing).toBe(false); expect((await current()).name).toBe('Original');
    } finally { await connection.rollback(); connection.release(); await editing; }
  });
  it('rolls back if the atomic write fails', async () => {
    const pool = (await getPool())!, connection = await pool.getConnection(), native = connection.execute.bind(connection);
    vi.spyOn(pool, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'execute').mockImplementation((async (...args: any[]) => { if (String(args[0]).startsWith('UPDATE campaigns')) throw Error('Injected failure'); return native(...args as [any, any]); }) as any);
    await expect(updateEditableCampaign(id, owner.merchantId, { name: 'Never saved' }, definition)).rejects.toThrow('Injected failure');
    vi.restoreAllMocks(); expect((await current()).name).toBe('Original');
  });
  it.each([{ merchantId: 999 }, { sentCount: 999 }, { status: 'sending' }, {}])('rejects forbidden direct edit fields %j', async patch => {
    await expect(editTenantCampaign(id, owner.merchantId, patch as any)).rejects.toThrow('Invalid campaign edit fields');
    expect(await current()).toMatchObject({ name: 'Original', merchantId: owner.merchantId, sentCount: 0 });
  });
  it.each([{message:'x'.repeat(1000),imageUrl:'https://example.test/image.png'}, {message:'x'.repeat(4096),imageUrl:null}, {message:' ',imageUrl:null}, {message:'Hello',imageUrl:'http://example.test/image.png'}])('rejects invalid legacy payload during locked admission ($imageUrl)', async content => {
    await q('UPDATE campaigns SET message=?,imageUrl=? WHERE id=?', [content.message, content.imageUrl, id]);
    await expect(enqueueCampaignDeliveries({ campaignId: id, merchantId: owner.merchantId, expectedDefinition: campaignDefinitionKey(await current()), recipients: [{ phone: '99900000001' }] })).rejects.toBeInstanceOf(CampaignContentError);
    expect(await q('SELECT id FROM campaign_delivery_outbox WHERE campaign_id=?', [id])).toEqual([]);
    expect(await current()).toMatchObject({ status: 'draft', totalRecipients: 0 });
  });
});
