import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ state: vi.fn(), metadata: vi.fn(), runtime: vi.fn(), query: vi.fn() }));
vi.mock('./budget-admin', () => ({ readAiBudgetAdmin: mocks.state }));
vi.mock('../db_ai_settings', () => ({ getZahyPiRuntimeMetadata: mocks.metadata, getActiveModel: async () => 'gpt-4o' }));
vi.mock('./zahypi-client', () => ({ resolveZahyPiRuntimeConfig: mocks.runtime }));
vi.mock('../db/connection', () => ({ getPool: async () => ({ execute: mocks.query }) }));
import { inspectAiBudget } from './deployment-preflight';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.mockResolvedValue({ configured: true, enabled: true, configuredLimitUsd: 100, prices: [], unknownCount: 0 });
  mocks.metadata.mockResolvedValue({ enabled: true, provider: 'zahypi', model: 'qwen-local' });
  mocks.runtime.mockRejectedValue(new Error('Unable to decrypt stored credential'));
  mocks.query.mockResolvedValue([[{ count: 0 }]]);
});

describe('deployment and AI readiness', () => {
  it('allows the admin UI to deploy without price cards or decryptable provider credentials', async () => {
    const result = await inspectAiBudget(true);
    expect(result).toMatchObject({ passed: true, mode: 'deployment', credentials: 'managed-in-super-admin' });
    expect(result.missingPriceCards).toContainEqual(['zahypi', 'qwen-local']);
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it('preserves strict AI readiness for unreadable credentials', async () => {
    await expect(inspectAiBudget()).rejects.toThrow('Unable to decrypt');
  });
  it('preserves strict AI readiness for missing prices', async () => {
    mocks.runtime.mockResolvedValue({ enabled: true, provider: 'openai' });
    expect(await inspectAiBudget()).toMatchObject({ passed: false });
  });
  it.each([
    { configured: false }, { enabled: false }, { configuredLimitUsd: 101 },
  ])('still refuses unsafe budget infrastructure: %j', async override => {
    mocks.state.mockResolvedValue({ configured: true, enabled: true, configuredLimitUsd: 100, prices: [], ...override });
    expect(await inspectAiBudget(true)).toMatchObject({ passed: false });
  });
  it('does not downgrade database or schema failures to configuration warnings', async () => {
    mocks.state.mockRejectedValue(new Error('schema unavailable'));
    await expect(inspectAiBudget(true)).rejects.toThrow('schema unavailable');
  });
});
