import { describe, expect, it } from 'vitest';
import { buildPublicUrl, getPublicAppUrl, publicPaymentUrls } from './utils/public-url';
import {
  getPaymentLinkAvailability,
  halalasToTapAmount,
  normalizeSaudiPhone,
  readPaymentLinkId,
  maskSecret,
  tapKeyMatchesMode,
} from './payment/payment-link-policy';

describe('payment public URL truth', () => {
  it('falls back to the production domain instead of emitting undefined', () => {
    expect(publicPaymentUrls.link('link_123', {})).toBe('https://sary.live/pay/link_123');
  });

  it('uses the canonical origin and strips accidental path/query fragments', () => {
    const env = { PUBLIC_APP_URL: 'https://example.com/base?secret=value' };
    expect(getPublicAppUrl(env)).toBe('https://example.com');
    expect(buildPublicUrl('/api/webhooks/tap', env)).toBe('https://example.com/api/webhooks/tap');
  });

  it('rejects malformed and non-http public origins', () => {
    expect(getPublicAppUrl({ APP_URL: 'undefined' })).toBe('https://sary.live');
    expect(getPublicAppUrl({ APP_URL: 'javascript:alert(1)' })).toBe('https://sary.live');
  });
});

describe('payment-link policy', () => {
  const active = { isActive: 1, status: 'active', usageCount: 0 };

  it('allows an active link and blocks disabled, expired, and exhausted links', () => {
    expect(getPaymentLinkAvailability(active).available).toBe(true);
    expect(getPaymentLinkAvailability({ ...active, isActive: 0 })).toEqual({ available: false, reason: 'disabled' });
    expect(getPaymentLinkAvailability({ ...active, expiresAt: '2024-01-01T00:00:00Z' }, new Date('2024-01-02')))
      .toEqual({ available: false, reason: 'expired' });
    expect(getPaymentLinkAvailability({ ...active, maxUsageCount: 2, usageCount: 2 }))
      .toEqual({ available: false, reason: 'exhausted' });
  });

  it('converts persisted halalas to Tap major currency units exactly', () => {
    expect(halalasToTapAmount(10000)).toBe(100);
    expect(halalasToTapAmount(12345)).toBe(123.45);
    expect(() => halalasToTapAmount(99)).toThrow();
  });

  it('normalizes Saudi mobile numbers and rejects ambiguous input', () => {
    expect(normalizeSaudiPhone('+966 50 123 4567')).toBe('501234567');
    expect(normalizeSaudiPhone('0501234567')).toBe('501234567');
    expect(() => normalizeSaudiPhone('123')).toThrow();
  });

  it('reads only valid payment-link identifiers from payment metadata', () => {
    expect(readPaymentLinkId('{"paymentLinkId":42}')).toBe(42);
    expect(readPaymentLinkId('{"paymentLinkId":"7"}')).toBe(7);
    expect(readPaymentLinkId('broken')).toBeNull();
  });

  it('does not allow test/live mode labels to disagree with the secret key', () => {
    expect(tapKeyMatchesMode('sk_test_example', true)).toBe(true);
    expect(tapKeyMatchesMode('sk_live_example', false)).toBe(true);
    expect(tapKeyMatchesMode('sk_live_example', true)).toBe(false);
    expect(tapKeyMatchesMode('sk_test_example', false)).toBe(false);
  });

  it('never reveals short secrets while masking', () => {
    expect(maskSecret('short')).toBe('********');
    expect(maskSecret('sk_test_123456')).toBe('sk_t****3456');
  });
});
