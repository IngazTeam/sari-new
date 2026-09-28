import { describe, expect, it } from 'vitest';
import { buildByaanCanonicalRequest, signByaanRequest, verifyByaanSignedRequest } from './integrations/byaan-security';

describe('Byaan v2 request target integrity', () => {
  const input = { timestamp: '1790596800', deliveryId: '9b05c146-2fcf-49fd-8fd8-de7d276f452e', method: 'GET',
    path: '/api/v1/platform/merchant/conversations?limit=15', tenantDomain: 'academy.example.com', rawBody: Buffer.alloc(0), version: '2' as const };
  const secret = 'synthetic-wire-contract-fixture-only-2026';
  const headers = { timestamp: input.timestamp, deliveryId: input.deliveryId, version: input.version,
    signature: signByaanRequest(buildByaanCanonicalRequest(input), secret) };
  it('authenticates the complete target, including query parameters', () => {
    expect(verifyByaanSignedRequest({ ...input, headers, secret, nowSeconds: Number(input.timestamp) }).ok).toBe(true);
    expect(verifyByaanSignedRequest({ ...input, path: input.path.replace('15', '99'), headers, secret, nowSeconds: Number(input.timestamp) }).ok).toBe(false);
  });
  it.each(['1', '3', '', '2, 1'])('cannot downgrade or invent signature version %s', version => {
    expect(verifyByaanSignedRequest({ ...input, headers: { ...headers, version }, secret, nowSeconds: Number(input.timestamp) }).ok).toBe(false);
  });
  it('rejects a valid legacy signature when a query was added', () => {
    const signature = signByaanRequest(buildByaanCanonicalRequest({ ...input, version: '1' }), secret);
    expect(verifyByaanSignedRequest({ ...input, headers: { ...headers, signature, version: '1' }, secret, nowSeconds: Number(input.timestamp) }).ok).toBe(false);
  });
  it.each(['1.7905968e9', ' 1790596800', '+1790596800'])('rejects noncanonical timestamp %s even when signed', timestamp => {
    const signature = signByaanRequest(buildByaanCanonicalRequest({ ...input, timestamp }), secret);
    expect(verifyByaanSignedRequest({ ...input, headers: { ...headers, timestamp, signature }, secret, nowSeconds: Number(input.timestamp) }).ok).toBe(false);
  });
});
