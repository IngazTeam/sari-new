import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { enqueueByaanLifecycleEvent, runByaanOutboxBatch } from './byaan-outbox';
const transport = vi.hoisted(() => ({ post: vi.fn(), pin: vi.fn() }));
vi.mock('axios', () => ({ default: { post: transport.post } }));
vi.mock('./byaan-security', async original => ({ ...await original<typeof import('./byaan-security')>(), createPinnedByaanHttpsAgent: transport.pin }));

describe.skipIf(!process.env.DATABASE_URL)('Byaan lifecycle delivery SQL ordering and acknowledgement', () => {
  let merchantId: number, userId: number;
  const q = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  const enqueue = (event: 'subscription.activated' | 'subscription.deactivated') => enqueueByaanLifecycleEvent({
    merchantId, event, tenantDomain: 'synthetic.example.com', signingSecret: 'synthetic-lifecycle-contract-secret-only',
  });
  const rows = () => q('SELECT * FROM byaan_outbox WHERE merchant_id=? ORDER BY id', [merchantId]);
  beforeEach(async () => {
    assertDisposableDatabase(); vi.clearAllMocks();
    ({ merchantId, userId } = await createDisposableMerchant('by-lifecycle'));
    transport.pin.mockResolvedValue({});
    transport.post.mockImplementation(async (_url, body) => ({ status: 200,
      data: { status: JSON.parse(body.toString()).event === 'subscription.activated' ? 'activated' : 'deactivated' } }));
  });
  afterEach(async () => { await cleanupDisposableMerchants([userId]); });
  afterAll(closeDb);
  it('delivers activation before deactivation, never both from one batch', async () => {
    await enqueue('subscription.activated'); await enqueue('subscription.deactivated');
    await runByaanOutboxBatch();
    expect((await rows()).map((r: any) => r.status)).toEqual(['delivered', 'pending']);
    await runByaanOutboxBatch();
    expect((await rows()).map((r: any) => r.status)).toEqual(['delivered', 'delivered']);
    expect(transport.post).toHaveBeenCalledTimes(2);
  });
  it('requires a matching semantic acknowledgement, preserving the successor on 200 HTML', async () => {
    transport.post.mockResolvedValue({ status: 200, data: '<html>login</html>' });
    await enqueue('subscription.activated'); await enqueue('subscription.deactivated');
    await runByaanOutboxBatch(); await runByaanOutboxBatch();
    expect((await rows()).map((r: any) => r.status)).toEqual(['failed', 'pending']);
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
  it('a permanently failed predecessor blocks later lifecycle events', async () => {
    await enqueue('subscription.activated'); await enqueue('subscription.deactivated');
    await q("UPDATE byaan_outbox SET status='failed',attempts=8 WHERE merchant_id=? ORDER BY id LIMIT 1", [merchantId]);
    await runByaanOutboxBatch();
    expect(transport.post).not.toHaveBeenCalled();
    expect((await rows()).map((r: any) => r.status)).toEqual(['failed', 'pending']);
  });
  it('an old worker cannot acknowledge a newer delivery attempt', async () => {
    await enqueue('subscription.activated');
    transport.post.mockImplementation(async () => {
      await q('UPDATE byaan_outbox SET attempts=attempts+1 WHERE merchant_id=?', [merchantId]);
      return { status: 200, data: { status: 'activated' } };
    });
    await runByaanOutboxBatch();
    expect((await rows())[0]).toMatchObject({ status: 'processing', attempts: 2 });
  });
});
