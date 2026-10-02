import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readByaanConnectionWorkspace } from './integrations/byaan-connection-workspace';
import { requestReviewedByaanResync, readByaanResyncAttempt } from './integrations/byaan-resync';
import { encryptSecret } from './security/secrets';
const m = vi.hoisted(() => ({ dispatch: vi.fn(), before: vi.fn(), after: vi.fn(), outcome: 'queued' }));
vi.mock('./integrations/byaan', () => ({ dispatchByaanResync: m.dispatch }));
describe.skipIf(!process.env.DATABASE_URL)('Byaan durable resync MySQL', () => {
  let own: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof own;
  const secret = 'SYNTHETIC_PHASE294_'.repeat(3);
  const q = async (sql: string, args: any[] = []): Promise<any> => (await (await getPool())!.execute<any>(sql, args))[0];
  const intent = async () => ({ requestId: randomUUID(), revision: (await readByaanConnectionWorkspace(own.userId, own.merchantId)).revision });
  const run = async (input?: Awaited<ReturnType<typeof intent>>, actorId = own.userId) => requestReviewedByaanResync(actorId, own.merchantId, input ?? await intent());
  beforeEach(async () => {
    vi.resetAllMocks(); vi.stubEnv('FIELD_ENCRYPTION_KEY', 'synthetic-phase294-encryption-test-only'); m.outcome = 'queued';
    own = await createDisposableMerchant('by-resync'); other = await createDisposableMerchant('by-resync-foreign');
    await q("UPDATE merchants SET integration_source='byaan' WHERE id=?", [own.merchantId]);
    await q("INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,is_active,verified_at,sync_status,webhook_secret) VALUES (?,?,?,1,NOW(),'active',?)", [own.merchantId, `resync-${own.merchantId}.example.test`, `https://resync-${own.merchantId}.example.test/api/sari`, encryptSecret(secret)]);
    m.dispatch.mockImplementation(async (merchantId: number, requestId: string, guard: (row: unknown) => Promise<void>) => {
      const [connection] = await q('SELECT * FROM byaan_connections WHERE merchant_id=?', [merchantId]);
      await m.before(); if (m.outcome === 'not_sent') return { outcome: 'not_sent' };
      await guard({ ...connection, webhook_secret: secret }); await m.after(); return { outcome: m.outcome };
    });
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([own.userId, other.userId]); vi.unstubAllEnvs(); }); afterAll(closeDb);
  it('persists queued acknowledgement without claiming completion or changing last sync', async () => {
    const input = await intent(), before = await readByaanConnectionWorkspace(own.userId, own.merchantId);
    expect(await run(input)).toMatchObject({ actorId: own.userId, merchantId: own.merchantId, ...input, outcome: 'queued', replayed: false });
    expect(await readByaanResyncAttempt(own.userId, own.merchantId, { requestId: input.requestId })).toMatchObject({ outcome: 'queued', replayed: true });
    expect(await readByaanConnectionWorkspace(own.userId, own.merchantId)).toMatchObject({ revision: before.revision, state: 'configured', lastSyncAt: before.lastSyncAt });
    expect(m.dispatch).toHaveBeenCalledWith(own.merchantId, input.requestId, expect.any(Function));
  });
  it.each(['queued','unknown','not_sent'])('never sends a second POST when replaying %s', async outcome => {
    m.outcome = outcome; const input = await intent(); expect((await run(input)).outcome).toBe(outcome); expect(await run(input)).toMatchObject({ outcome, replayed: true }); expect(m.dispatch).toHaveBeenCalledOnce();
  });
  it('deduplicates two concurrent requests with the same id', async () => {
    const input = await intent(); const results = await Promise.all([run(input), run(input)]); expect(results.some(row => row.outcome === 'queued')).toBe(true);
    expect(m.dispatch).toHaveBeenCalledOnce(); expect(await run(input)).toMatchObject({ outcome: 'queued', replayed: true });
  });
  it('limits requests durably across distinct callers to three per five minutes', async () => {
    for (let i = 0; i < 3; i++) expect((await run()).outcome).toBe('queued'); await expect(run()).rejects.toMatchObject({ reason: 'rate_limited' }); expect(m.dispatch).toHaveBeenCalledTimes(3);
  });
  it.each(['domain','secret','source'])('rejects changed %s before reserving a dispatch', async change => {
    const input = await intent();
    if (change === 'domain') await q("UPDATE byaan_connections SET tenant_domain='changed.example.test' WHERE merchant_id=?", [own.merchantId]);
    if (change === 'secret') await q('UPDATE byaan_connections SET webhook_secret=? WHERE merchant_id=?', [encryptSecret('CHANGED_'.repeat(8)), own.merchantId]);
    if (change === 'source') await q("UPDATE merchants SET integration_source='none' WHERE id=?", [own.merchantId]);
    await expect(run(input)).rejects.toMatchObject({ reason: change === 'source' ? 'inactive' : 'stale' }); expect(m.dispatch).not.toHaveBeenCalled();
  });
  it.each(['membership','connection','transport'])('rechecks %s immediately before dispatch', async change => {
    await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [own.merchantId, other.userId]);
    m.before.mockImplementation(async () => {
      if (change === 'membership') await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?', [own.merchantId, other.userId]);
      if (change === 'connection') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [own.merchantId]);
      if (change === 'transport') await q('UPDATE byaan_connections SET webhook_secret=? WHERE merchant_id=?', [encryptSecret('CHANGED_'.repeat(8)), own.merchantId]);
    });
    expect(await run(await intent(), other.userId)).toMatchObject({ outcome: 'not_sent' }); expect(m.after).not.toHaveBeenCalled();
  });
  it('keeps a late provider acknowledgement associated with the old revision and does not update a replacement', async () => {
    const input = await intent(); m.after.mockImplementation(() => q("UPDATE byaan_connections SET tenant_domain='replacement.example.test',sync_status='pending_verification',is_active=0,verified_at=NULL WHERE merchant_id=?", [own.merchantId]));
    expect(await run(input)).toMatchObject({ revision: input.revision, outcome: 'queued' });
    const current = await readByaanConnectionWorkspace(own.userId, own.merchantId); expect(current).toMatchObject({ state: 'pending_verification', tenantDomain: 'replacement.example.test' }); expect(current.revision).not.toBe(input.revision);
  });
  it('does not expose another account or tenant receipt', async () => {
    const input = await intent(); await run(input);
    await expect(readByaanResyncAttempt(other.userId, own.merchantId, { requestId: input.requestId })).rejects.toMatchObject({ reason: 'missing' });
    await expect(readByaanResyncAttempt(own.userId, other.merchantId, { requestId: input.requestId })).rejects.toMatchObject({ reason: 'missing' });
  });
  it('rejects same id with another actor or review even for a manager', async () => {
    const input = await intent(); await run(input); await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)", [own.merchantId, other.userId]);
    await expect(run(input, other.userId)).rejects.toMatchObject({ reason: 'stale' }); await expect(run({ ...input, revision: 'a'.repeat(64) })).rejects.toMatchObject({ reason: 'stale' }); expect(m.dispatch).toHaveBeenCalledOnce();
  });
  it.each(['reserve','dispatch','settle'])('recovers receipt after an uncertain %s commit without resending', async phase => {
    const input = await intent(), pool = (await getPool())!, getConnection = pool.getConnection.bind(pool); let fired = false;
    vi.spyOn(pool, 'getConnection').mockImplementation(async () => {
      const tx = await getConnection(), execute = tx.execute.bind(tx), commit = tx.commit.bind(tx); let match = false;
      vi.spyOn(tx, 'execute').mockImplementation((async (sql: any, args: any) => {
        const text = String(sql);
        if (phase === 'reserve' && text.startsWith('INSERT INTO byaan_resync_requests') || phase === 'dispatch' && text.includes("SET state='dispatching'") || phase === 'settle' && text.includes('SET state=?')) match = true;
        return execute(sql, args);
      }) as any);
      vi.spyOn(tx, 'commit').mockImplementation(async () => { await commit(); if (match && !fired) { fired = true; throw Error('PRIVATE lost commit reply'); } }); return tx;
    });
    if (phase === 'reserve') await expect(run(input)).rejects.toMatchObject({ reason: 'unavailable' }); else expect((await run(input)).outcome).toBe('unknown');
    expect(fired).toBe(true); vi.restoreAllMocks();
    const recovered = await readByaanResyncAttempt(own.userId, own.merchantId, { requestId: input.requestId }); expect(recovered.outcome).toBe(phase === 'settle' ? 'queued' : 'unknown');
    const calls = m.dispatch.mock.calls.length; await run(input); expect(m.dispatch).toHaveBeenCalledTimes(calls);
  });
});
