import { afterEach, describe, expect, it, vi } from 'vitest';
const config = vi.hoisted(() => vi.fn());
vi.mock('../db_ai_settings', () => ({ getZahyPiRuntimeConfig: config }));
import { clearZahyPiRuntimeConfigCache, resolveZahyPiRuntimeConfig, runWithZahyPiContext } from './zahypi-client';
const context = { merchantId: 1, conversationId: 10, taskType: 'sari.reply' };
const runtime = (provider: 'openai' | 'zahypi', generation: number, enabled = true) => ({
  provider, enabled, generation, apiKey: 'synthetic', baseUrl: 'https://api.zahypi.test/v1', projectId: 'fixture', model: 'fixture', source: 'database' as const,
});
afterEach(() => { config.mockReset(); clearZahyPiRuntimeConfigCache(); });
describe('one provider configuration per sales interaction', () => {
  it('observes a stop saved by another process without waiting for the runtime cache', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      await resolveZahyPiRuntimeConfig();
      config.mockResolvedValue(runtime('openai', 2, false));
      expect((await resolveZahyPiRuntimeConfig()).enabled).toBe(true);
      expect(await resolveZahyPiRuntimeConfig(undefined, { refresh: true })).toMatchObject({ enabled: false, provider: 'zahypi', generation: 1 });
    });
  });
  it('fresh checks keep an active interaction on its original text provider', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      await resolveZahyPiRuntimeConfig(); config.mockResolvedValue(runtime('openai', 2));
      expect(await resolveZahyPiRuntimeConfig(undefined, { refresh: true })).toMatchObject({ provider: 'zahypi', generation: 1 });
    });
    expect(await resolveZahyPiRuntimeConfig()).toMatchObject({ provider: 'openai', generation: 2 });
  });
  it('keeps the selected provider throughout nested reply, critique and extraction after an admin switch', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      const first = await resolveZahyPiRuntimeConfig();
      config.mockResolvedValue(runtime('openai', 2)); clearZahyPiRuntimeConfigCache();
      expect(await resolveZahyPiRuntimeConfig()).toBe(first);
      await runWithZahyPiContext({ ...context, taskType: 'sari.response.validation' }, async () => {
        expect((await resolveZahyPiRuntimeConfig()).generation).toBe(1);
      });
    });
    await runWithZahyPiContext(context, async () => {
      expect(await resolveZahyPiRuntimeConfig()).toMatchObject({ provider: 'openai', generation: 2 });
    });
  });
  it('does not inherit the frozen credentials across another conversation or merchant', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      await resolveZahyPiRuntimeConfig(); config.mockResolvedValue(runtime('openai', 2)); clearZahyPiRuntimeConfigCache();
      for (const next of [{ ...context, merchantId: 2 }, { ...context, conversationId: 11 }]) {
        await runWithZahyPiContext(next, async () => { expect((await resolveZahyPiRuntimeConfig()).generation).toBe(2); });
      }
      expect((await resolveZahyPiRuntimeConfig()).generation).toBe(1);
    });
  });
  it('respects an explicit administrator stop even inside an older active interaction', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      await resolveZahyPiRuntimeConfig(); config.mockResolvedValue(runtime('openai', 2, false)); clearZahyPiRuntimeConfigCache();
      expect(await resolveZahyPiRuntimeConfig()).toMatchObject({ enabled: false, provider: 'zahypi', generation: 1 });
    });
  });
  it('does not mutate the frozen configuration through a returned reference', async () => {
    config.mockResolvedValue(runtime('zahypi', 1));
    await runWithZahyPiContext(context, async () => {
      const current = await resolveZahyPiRuntimeConfig(); expect(Object.isFrozen(current)).toBe(true);
      expect(() => { current.provider = 'openai'; }).toThrow();
      expect((await resolveZahyPiRuntimeConfig()).provider).toBe('zahypi');
    });
  });
});
