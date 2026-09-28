import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createPaymentLink, enrollTrainee } from './byaan';

const transport = vi.hoisted(() => ({ request: vi.fn(), pin: vi.fn() }));
vi.mock('axios', () => ({ default: transport.request }));
vi.mock('./byaan-security', async importOriginal => ({
  ...await importOriginal<typeof import('./byaan-security')>(), createPinnedByaanHttpsAgent: transport.pin,
}));

describe.skipIf(!process.env.DATABASE_URL)('Byaan sales response boundary with real SQL', () => {
  let merchant: number, user: number, users: number[];
  const q = async (sql: string, values: any[] = []): Promise<any> => (await (await getPool())!.execute(sql, values))[0];
  const enrollment = { traineePhone: '0501234567', traineeName: 'متدرب اختبار', courseId: 'course-1', courseTitle: 'دورة اختبار' };
  const payment = { traineePhone: enrollment.traineePhone, courseId: 'course-1', amount: 125.5, description: enrollment.courseTitle };
  const link = 'https://checkout.example.com/synthetic';
  const conversions = () => q('SELECT * FROM sari_conversions WHERE merchant_id=?', [merchant]);
  const history = () => q('SELECT * FROM api_conversion_observations WHERE merchant_id=?', [merchant]);
  beforeEach(async () => {
    assertDisposableDatabase(); vi.restoreAllMocks(); vi.clearAllMocks(); users = [];
    const fixture = await createDisposableMerchant('byaan-sales'); merchant = fixture.merchantId; user = fixture.userId; users.push(user);
    const domain = `synthetic-${randomUUID()}.example.com`;
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,?,?,?,1,UTC_TIMESTAMP(),'active')`, [merchant, domain, `https://${domain}/api/sari`, 'synthetic-signing-secret-not-live-at-all']);
    transport.pin.mockResolvedValue({});
    transport.request.mockResolvedValue({ status: 200, data: { enrollment_id: 'enroll-1', invoice_id: 'invoice-1', payment_url: link } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants(users); });
  afterAll(closeDb);
  it.each(['enrollment', 'payment'] as const)('stores %s as internal reported history without any financial fact', async operation => {
    const result = operation === 'payment' ? await createPaymentLink(merchant, payment) : await enrollTrainee(merchant, enrollment);
    expect(result).toMatchObject({ success: true, outcome: 'reported', tracking: 'recorded', paymentEvidence: 'not_verified' });
    const rows = await conversions(), observations = await history();
    expect(rows).toHaveLength(1); expect(observations).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action_type: operation, status: operation === 'payment' ? 'pending' : 'completed', customer_phone: '+966501234567' });
    expect(observations[0]).toMatchObject({ conversion_id: rows[0].id, source_kind: 'internal_unverified', api_key_id: null });
    for (const table of ['ai_sales_payment_facts', 'ai_sales_order_facts']) expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`, [merchant])).toEqual([]);
    expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it.each(['inactive-connection', 'unverified', 'merchant', 'owner', 'missing'])('does not dispatch with %s authority', async mode => {
    if (mode === 'inactive-connection') await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?', [merchant]);
    if (mode === 'unverified') await q('UPDATE byaan_connections SET verified_at=NULL WHERE merchant_id=?', [merchant]);
    if (mode === 'merchant') await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]);
    if (mode === 'owner') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [user]);
    if (mode === 'missing') await q('DELETE FROM byaan_connections WHERE merchant_id=?', [merchant]);
    expect(await enrollTrainee(merchant, enrollment)).toMatchObject({ success: false, outcome: 'not_sent', retryable: false });
    expect(transport.request).not.toHaveBeenCalled(); expect(await conversions()).toEqual([]);
  });
  it.each(['key', 'owner', 'merchant', 'verification'])('rechecks %s changed while resolving the provider', async mode => {
    transport.pin.mockImplementation(async () => {
      if (mode === 'key') await q("UPDATE byaan_connections SET webhook_secret='replacement-secret-for-synthetic-use-only' WHERE merchant_id=?", [merchant]);
      if (mode === 'owner') await q("UPDATE users SET account_status='deletion_pending' WHERE id=?", [user]);
      if (mode === 'merchant') await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]);
      if (mode === 'verification') await q('UPDATE byaan_connections SET verified_at=NULL WHERE merchant_id=?', [merchant]);
      return {};
    });
    expect(await createPaymentLink(merchant, payment)).toMatchObject({ success: false, outcome: 'not_sent' });
    expect(transport.request).not.toHaveBeenCalled(); expect(await history()).toEqual([]);
  });
  it.each([null, { success: false, enrollment_id: 'false-success' }, { enrollment_id: {} }, { enrollment_id: 'e', payment_url: 'javascript:alert(1)' }])(
    'does not persist an invalid acknowledgement: %j', async data => {
      transport.request.mockResolvedValue({ status: 200, data });
      expect(await enrollTrainee(merchant, enrollment)).toMatchObject({ success: false, outcome: 'unknown', retryable: false });
      expect(await conversions()).toEqual([]); expect(await history()).toEqual([]); expect(transport.request).toHaveBeenCalledTimes(1);
    });
  it('keeps timeout unknown with no inferred conversion and no automatic second POST', async () => {
    transport.request.mockRejectedValue(Error('synthetic timeout'));
    expect(await createPaymentLink(merchant, payment)).toMatchObject({ success: false, outcome: 'unknown', retryable: false });
    expect(await conversions()).toEqual([]); expect(await history()).toEqual([]); expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('exposes local tracking failure after acknowledgement without misreporting an external rejection', async () => {
    transport.request.mockImplementation(async () => {
      await q("UPDATE merchants SET status='suspended' WHERE id=?", [merchant]);
      return { status: 200, data: { invoice_id: 'invoice-1', payment_url: link } };
    });
    expect(await createPaymentLink(merchant, payment)).toMatchObject({ success: true, outcome: 'reported', invoiceId: 'invoice-1', tracking: 'unavailable', paymentEvidence: 'not_verified' });
    expect(await conversions()).toEqual([]); expect(await history()).toEqual([]); expect(transport.request).toHaveBeenCalledTimes(1);
  });
  it('isolates matching provider references across merchants', async () => {
    await enrollTrainee(merchant, enrollment);
    const other = await createDisposableMerchant('byaan-other'); users.push(other.userId);
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,'other.example.com','https://other.example.com/api/sari','different-synthetic-secret-never-live',1,UTC_TIMESTAMP(),'active')`, [other.merchantId]);
    const result = await enrollTrainee(other.merchantId, enrollment);
    expect(result).toMatchObject({ success: true, tracking: 'recorded' });
    const a = await conversions(), b = await q('SELECT * FROM sari_conversions WHERE merchant_id=?', [other.merchantId]);
    expect(a).toHaveLength(1); expect(b).toHaveLength(1); expect(a[0].id).not.toBe(b[0].id);
  });
});
