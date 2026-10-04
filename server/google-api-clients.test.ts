import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { google } from './_core/google-api-clients';

describe('bounded Google API clients', () => {
  it('loads only Calendar and Sheets instead of the aggregate API catalogue', () => {
    const require = createRequire(import.meta.url);
    const apis = Object.keys(require.cache).flatMap(file => {
      const match = file.replaceAll('\\', '/').match(/\/googleapis\/build\/src\/apis\/([^/]+)\//);
      return match ? [match[1]] : [];
    });
    expect([...new Set(apis)].sort()).toEqual(['calendar', 'sheets']);
    expect(require.cache[require.resolve('googleapis')]).toBeUndefined();
  });

  it('keeps OAuth bearer authorization and Sheets request/response behavior', async () => {
    const auth = new google.auth.OAuth2('synthetic-client', 'synthetic-secret');
    auth.setCredentials({ access_token: 'synthetic-access', token_type: 'Bearer' });
    const wire = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      range: 'Products!A1:B2', values: [['Name', 'Price'], ['Fixture', '25']],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    auth.transporter.defaults.fetchImplementation = wire;
    const client = google.sheets({ version: 'v4', auth });
    const result = await client.spreadsheets.values.get({
      spreadsheetId: 'synthetic-sheet', range: 'Products!A1:B2',
    });
    expect(result.data.values).toEqual([['Name', 'Price'], ['Fixture', '25']]);
    expect(wire).toHaveBeenCalledOnce();
    const [url, options] = wire.mock.calls[0];
    expect(String(url)).toContain('/v4/spreadsheets/synthetic-sheet/values/Products');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer synthetic-access');
  });
});
