import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), execute: vi.fn(), instance: vi.fn() }));
vi.mock('axios', () => ({ default: { post: mocks.post } }));
vi.mock('./db', () => ({
  getPool: async () => ({ execute: mocks.execute }),
  getPrimaryWhatsAppInstance: mocks.instance,
  getWhatsAppInstanceById: mocks.instance,
  getWhatsAppInstanceByInstanceId: mocks.instance,
}));
vi.mock('./db/schema-readiness', () => ({ assertRuntimeSchema: vi.fn() }));
import { GreenApiWhatsAppProvider, MetaCloudWhatsAppProvider } from './channels/whatsapp/providers';
import { sendMerchantWhatsApp } from './channels/whatsapp/service';
import { whatsAppEffectKey } from './channels/whatsapp/effect-key';
import { sendMessageWithCredentials } from './whatsapp';

const config = { provider: 'green_api' as const, instanceId: '1234567890', phoneNumberId: '1234567890',
  token: 'test-token', apiUrl: 'https://api.green-api.com' };
const input = { merchantId: 20, instanceRecordId: 3, to: '966500000001', kind: 'text' as const,
  text: 'fixture', idempotencyKey: whatsAppEffectKey(20, config.instanceId, 40, 'reply') };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.instance.mockResolvedValue({ ...config, id: 3, merchantId: 20, status: 'active' });
  mocks.execute.mockResolvedValue([{ affectedRows: 1 }]);
});
describe('provider outcome classification', () => {
  for (const Provider of [GreenApiWhatsAppProvider, MetaCloudWhatsAppProvider]) {
    it.each([200, 408, 500, 503])(`${Provider.name}: keeps ambiguous HTTP %i out of automatic retry`, async status => {
      mocks.post.mockResolvedValue({ status, data: {} });
      expect(await new Provider().send(config, input)).toMatchObject({ accepted: false, outcome: 'unknown', errorCode: 'provider_unreachable' });
    });
    it(`${Provider.name}: distinguishes explicit rejection, success and transport loss`, async () => {
      const provider = new Provider();
      mocks.post.mockResolvedValueOnce({ status: 400, data: {} });
      expect(await provider.send(config, input)).toMatchObject({ outcome: 'rejected' });
      mocks.post.mockResolvedValueOnce({ status: 200, data: { idMessage: 'receipt-1', messages: [{ id: 'receipt-1' }] } });
      expect(await provider.send(config, input)).toMatchObject({ accepted: true, providerMessageId: 'receipt-1' });
      mocks.post.mockRejectedValueOnce(new Error('socket closed with private-token in URL'));
      const unknown = await provider.send(config, input);
      expect(unknown).toMatchObject({ outcome: 'unknown' });
      expect(JSON.stringify(unknown)).not.toContain('private-token');
    });
  }
});
describe('durable delivery boundaries', () => {
  it('rechecks a sales follow-up after reserving delivery and never calls the provider when its context changed', async () => {
    mocks.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await sendMerchantWhatsApp({ ...input, idempotencyKey: 'sales_followup:20:42', followUpGuard: { id: 42, token: 'claim_fixture' } });
    expect(result).toMatchObject({ accepted: false, errorCode: 'followup_suppressed' }); expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls[1][0]).toContain('campaign_consent_state');
    expect(mocks.execute.mock.calls[2][0]).toContain('followup_suppressed');
  });
  it('refuses sales follow-up keys that omit the internal claim guard', async () => {
    expect(await sendMerchantWhatsApp({ ...input, idempotencyKey: 'sales_followup:20:42' })).toMatchObject({ accepted: false, errorCode: 'followup_suppressed' });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('persists network ambiguity as queued and prevents retries even when retryFailed is requested', async () => {
    mocks.post.mockRejectedValueOnce(new Error('accepted remotely, response lost'));
    await expect(sendMerchantWhatsApp(input)).resolves.toMatchObject({ accepted: false, status: 'queued' });
    expect(mocks.execute.mock.calls[1][1][1]).toBe('queued');
    mocks.execute.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([[{ status: 'queued', error_code: 'provider_unreachable' }]]);
    await expect(sendMerchantWhatsApp({ ...input, retryFailed: true })).resolves.toMatchObject({ duplicate: true, accepted: false });
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('does not resend after provider acceptance followed by a database write failure', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { idMessage: 'receipt-1' } });
    mocks.execute.mockResolvedValueOnce([{ affectedRows: 1 }]).mockRejectedValueOnce(new Error('DB lost'));
    await expect(sendMerchantWhatsApp(input)).rejects.toMatchObject({ code: 'delivery_outcome_unknown' });
    mocks.execute.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce([[{ status: 'queued', error_code: null }]]);
    await expect(sendMerchantWhatsApp({ ...input, retryFailed: true })).resolves.toMatchObject({ duplicate: true, status: 'queued' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('also protects older rows that incorrectly recorded unknown outcomes as failed', async () => {
    for (const code of ['provider_unreachable', 'http_500', 'http_200', 'http_408']) {
      mocks.execute.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
        .mockResolvedValueOnce([[{ status: 'failed', error_code: code }]]);
      expect((await sendMerchantWhatsApp({ ...input, retryFailed: true })).duplicate).toBe(true);
    }
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('carries the incoming-effect key through credential wrappers and refuses unregistered fallbacks', async () => {
    mocks.post.mockResolvedValue({ status: 200, data: { idMessage: 'receipt-1' } });
    expect(await sendMessageWithCredentials(config.instanceId, config.token, config.apiUrl, input.to, input.text,
      { idempotencyKey: input.idempotencyKey })).toMatchObject({ success: true });
    expect(mocks.execute.mock.calls[0][1]).toContain(input.idempotencyKey);
    mocks.instance.mockResolvedValue(null);
    expect(await sendMessageWithCredentials(config.instanceId, config.token, config.apiUrl, input.to, input.text,
      { idempotencyKey: input.idempotencyKey })).toMatchObject({ success: false, error: 'instance_unavailable' });
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });
  it('separates tenant, provider instance, incoming message and effect without using customer text', () => {
    const key = whatsAppEffectKey(20, 'instance', 40, 'reply');
    expect(whatsAppEffectKey(20, 'instance', 40, 'reply')).toBe(key);
    expect(new Set([key, whatsAppEffectKey(21, 'instance', 40, 'reply'), whatsAppEffectKey(20, 'other', 40, 'reply'),
      whatsAppEffectKey(20, 'instance', 41, 'reply'), whatsAppEffectKey(20, 'instance', 40, 'welcome')]).size).toBe(5);
  });
});
