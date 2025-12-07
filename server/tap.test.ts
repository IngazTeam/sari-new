import { describe, it, expect } from 'vitest';
import { ENV } from './_core/env';

describe('Tap Payments API Keys Validation', () => {
  it('should have TAP_SECRET_KEY configured', () => {
    expect(ENV.tapSecretKey).toBeDefined();
    expect(ENV.tapSecretKey).not.toBe('');
    expect(ENV.tapSecretKey).toMatch(/^sk_(test|live)_/);
  });

  it('should validate Tap API by calling retrieve endpoint', async () => {
    const response = await fetch('https://api.tap.company/v2/charges', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ENV.tapSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    // If API key is valid, we should get 200 or 404 (no charges yet)
    // If invalid, we get 401
    expect(response.status).not.toBe(401);
    expect([200, 404]).toContain(response.status);
  });
});
