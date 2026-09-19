import { describe, it, expect, vi } from 'vitest';
import { postTapCharge, testTapCredentials } from './payment/tap-client';

// Ordinary tests exercise the production adapter with a controlled transport,
// without reading live payment credentials or contacting a payment account.
describe('Tap payment transport contracts', () => {
  it('rejects missing credentials before touching the transport', async () => {
    const fetchImpl = vi.fn();
    await expect(testTapCredentials('', { fetchImpl })).rejects.toMatchObject({ failure: 'invalid_credentials' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])('preserves an HTTP %s rejection without reporting a verified key', async status => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(testTapCredentials('sk_test_fixture', { fetchImpl })).resolves.toEqual({ ok: false, status });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('preserves amount and currency in the actual charge adapter', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"chg_fixture","status":"INITIATED"}', { status: 200 }));
    const payload = { amount: 125.75, currency: 'SAR', reference: { order: 'fixture_order' } };
    const result = await postTapCharge('sk_test_fixture', payload, { fetchImpl });
    expect(result).toMatchObject({ ok: true, body: { id: 'chg_fixture', status: 'INITIATED' } });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.tap.company/v2/charges');
    expect(JSON.parse(options.body)).toEqual(payload);
  });
  it('sanitizes transport failures without retrying an ambiguous charge', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('secret fixture response'));
    await expect(postTapCharge('sk_test_fixture', {}, { fetchImpl })).rejects.toMatchObject({ failure: 'network', message: 'Tap request failed: network' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
