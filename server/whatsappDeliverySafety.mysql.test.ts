import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('./channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mocks.send }) }));
import { getPool, closeDb } from './db/connection';
import { sendMerchantWhatsApp } from './channels/whatsapp/service';
import { whatsAppEffectKey } from './channels/whatsapp/effect-key';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('delivery claims under real MySQL contention', () => {
  const users: number[] = [];
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => { await cleanupDisposableMerchants(users); await closeDb(); });
  async function fixture() {
    const account = await createDisposableMerchant('delivery');
    users.push(account.userId);
    const pool = (await getPool())!;
    const instance = `fixture-${randomUUID()}`;
    const [result] = await pool.execute<any>(
      "INSERT INTO whatsapp_instances (merchant_id, instance_id, token, provider, status, is_primary) VALUES (?, ?, 'test-token', 'mock', 'active', 1)",
      [account.merchantId, instance],
    );
    return { merchantId: account.merchantId, instanceRecordId: Number(result.insertId), to: '966500000001',
      kind: 'text' as const, text: 'fixture', idempotencyKey: whatsAppEffectKey(account.merchantId, instance, 1, 'reply') };
  }
  it('admits only one provider call for sixteen simultaneous attempts, including later retries', async () => {
    const input = await fixture();
    mocks.send.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return { accepted: true, status: 'sent', providerMessageId: randomUUID() };
    });
    const results = await Promise.all(Array.from({ length: 16 }, () => sendMerchantWhatsApp(input)));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(results.filter(result => !result.duplicate)).toHaveLength(1);
    expect(await sendMerchantWhatsApp({ ...input, retryFailed: true })).toMatchObject({ accepted: true, duplicate: true });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('survives a process connection restart without resending an unknown outcome', async () => {
    const input = await fixture();
    mocks.send.mockRejectedValue(new Error('provider accepted; TCP response lost'));
    expect(await sendMerchantWhatsApp(input)).toMatchObject({ accepted: false, status: 'queued' });
    await closeDb();
    expect(await sendMerchantWhatsApp({ ...input, retryFailed: true })).toMatchObject({ accepted: false, duplicate: true, status: 'queued' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const [rows] = await (await getPool())!.execute('SELECT status, error_code FROM whatsapp_message_deliveries WHERE merchant_id = ?', [input.merchantId]);
    expect(rows).toEqual([{ status: 'queued', error_code: 'provider_unreachable' }]);
  });
});
