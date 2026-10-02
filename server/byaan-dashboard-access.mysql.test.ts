import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { requireActiveByaanMerchant, toggleByaanDashboardFaq } from './integrations/byaan-dashboard-access';
import { byaanRouter } from './routers-byaan';
describe.skipIf(!process.env.DATABASE_URL)('Byaan selected dashboard authority MySQL', () => {
  let own: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof own, faqId: number;
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute<any>(sql, args))[0];
  const call = (actorId = own.userId) => byaanRouter.createCaller({ user: { id: actorId, role: 'user' }, req: { headers: { 'x-merchant-id': String(own.merchantId) } }, res: {} } as any);
  const toggle = (actorId = own.userId) => toggleByaanDashboardFaq(actorId, own.merchantId, { faqId, field: 'use_in_bot', value: false });
  const unchanged = async () => expect((await q('SELECT use_in_bot FROM byaan_faqs WHERE id=?', [faqId]))[0].use_in_bot).toBe(1);
  beforeEach(async () => {
    own = await createDisposableMerchant('by-dashboard'); other = await createDisposableMerchant('by-dashboard-foreign');
    await q("UPDATE merchants SET integration_source='byaan' WHERE id=?", [own.merchantId]);
    await q("INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,is_active,verified_at,sync_status,webhook_secret) VALUES (?,?,?,1,NOW(),'active','INVALID_ENCRYPTED_SECRET')", [own.merchantId, `dashboard-${own.merchantId}.example.test`, 'https://example.test/api']);
    faqId = (await q("INSERT INTO byaan_faqs(merchant_id,external_id,question,answer,is_active,use_in_bot) VALUES (?,'sample','Question','Answer',1,1)", [own.merchantId])).insertId;
  });
  afterEach(async () => { await cleanupDisposableMerchants([own.userId, other.userId]); }); afterAll(closeDb);
  it('reads selected tenant as manager without decrypting connection credentials', async () => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [own.merchantId, other.userId]);
    expect(await call(other.userId).getStatus()).toMatchObject({ actorId: other.userId, merchantId: own.merchantId, connected: true, stats: { faqs: 1 } });
    expect((await call(other.userId).getFaqs()).items[0].id).toBe(faqId);
    await call(other.userId).toggleFaq({ faqId, field: 'use_in_bot', value: false });
    expect((await q('SELECT use_in_bot FROM byaan_faqs WHERE id=?', [faqId]))[0].use_in_bot).toBe(0);
  });
  it('rejects a foreign FAQ even with authorized membership', async () => {
    const foreign = (await q("INSERT INTO byaan_faqs(merchant_id,external_id,question,answer) VALUES (?,'foreign','Foreign','Answer')", [other.merchantId])).insertId;
    await expect(call().toggleFaq({ faqId: foreign, field: 'is_active', value: false })).rejects.toMatchObject({ code: 'NOT_FOUND' }); await unchanged();
  });
  it.each(["is_active=0", "verified_at=NULL"] )('rejects data and writes when %s', async change => {
    await q('UPDATE byaan_connections SET ' + change + ' WHERE merchant_id=?', [own.merchantId]);
    await expect(requireActiveByaanMerchant(own.merchantId)).rejects.toMatchObject({ reason: 'inactive' });
    await expect(toggle()).rejects.toMatchObject({ reason: 'inactive' }); await unchanged();
  });
  it('rejects wrong integration source and keeps disabled counts honest', async () => {
    await q("UPDATE merchants SET integration_source='none' WHERE id=?", [own.merchantId]);
    await expect(toggle()).rejects.toMatchObject({ reason: 'inactive' });
    expect(await call().getStatus()).toMatchObject({ connected: false, stats: { faqs: 1 } }); await unchanged();
  });
  it.each(['viewer', 'sales_supervisor'])('rejects knowledge write by %s under lock', async role => {
    await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)', [own.merchantId, other.userId, role]);
    await expect(toggle(other.userId)).rejects.toMatchObject({ reason: 'forbidden' }); await unchanged();
  });
  it('never falls back to ownership for an explicitly revoked owner', async () => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)", [own.merchantId, own.userId]);
    await expect(toggle()).rejects.toMatchObject({ reason: 'forbidden' }); await unchanged();
  });
  it.each(['member', 'connection', 'account', 'merchant'])('rechecks %s after waiting on merchant lock', async change => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [own.merchantId, other.userId]);
    const lock = await (await getPool())!.getConnection(); let operation: Promise<any> | undefined;
    try {
      await lock.beginTransaction(); await lock.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [own.merchantId]);
      operation = toggle(other.userId).then(value => ({ value }), error => ({ error }));
      if (change === 'member') await lock.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [own.merchantId, other.userId]);
      if (change === 'connection') await lock.execute('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [own.merchantId]);
      if (change === 'account') await lock.execute("UPDATE users SET account_status='deletion_pending' WHERE id=?", [other.userId]);
      if (change === 'merchant') await lock.execute("UPDATE merchants SET status='suspended' WHERE id=?", [own.merchantId]);
      await lock.commit(); expect((await operation).error).toMatchObject({ reason: change === 'connection' ? 'inactive' : 'forbidden' }); await unchanged();
    } finally { await lock.rollback(); lock.release(); await operation; }
  });
});
