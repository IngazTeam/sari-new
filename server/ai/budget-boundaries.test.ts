import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ budget: vi.fn(), enabled: true, provider: 'openai' }));
vi.mock('./budget-ledger', async importOriginal => ({
  ...await importOriginal<typeof import('./budget-ledger')>(), withAiBudget: mocks.budget,
}));
vi.mock('./zahypi-client', async importOriginal => ({
  ...await importOriginal<typeof import('./zahypi-client')>(),
  getOptionalZahyPiRequestContext: () => ({ merchantId: 77, taskType: 'sari.reply' }),
  resolveZahyPiRuntimeConfig: async () => ({ enabled: mocks.enabled, provider: mocks.provider, model: 'gpt-4o-mini' }),
}));
vi.mock('../db_ai_settings', () => ({
  getOpenAiApiKey: async () => 'sk-test-key', getActiveModel: async () => 'gpt-4o-mini',
  getAiSettings: async () => ({ model: 'gpt-4o-mini', isActive: true }),
  logAiUsage: vi.fn(), estimateCost: () => 0,
}));
import { AiBudgetError } from './budget-ledger';
import { callGPT4, transcribeAudio } from './openai';
import { invokeLLM, _clearCache } from '../_core/llm';
import { generateEmbedding } from './rag-engine';
import { aiPriceCardInput } from './budget-admin';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.provider = 'openai';
  mocks.budget.mockRejectedValue(new AiBudgetError('budget_exceeded'));
  vi.stubGlobal('fetch', vi.fn());
  _clearCache();
});
describe('paid request boundaries', () => {
  it('stops the chat retry and cheaper-model fallback chain at the budget boundary', async () => {
    await expect(callGPT4([{ role: 'user', content: 'fixture' }], { merchantId: 77 })).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(mocks.budget).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves explicit merchant identity and output bounds in the shared LLM path', async () => {
    await expect(invokeLLM({ messages: [{ role: 'user', content: 'fixture' }], merchantId: 88, maxTokens: 23 })).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 88, maxOutputTokens: 23, provider: 'openai' }), expect.any(Function), expect.any(Function));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks embedding spend while allowing callers to use their non-AI fallback', async () => {
    expect(await generateEmbedding('fixture', 88)).toBeNull();
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({ merchantId: 88, model: 'text-embedding-3-small' }), expect.any(Function), expect.any(Function));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks voice spend before uploading the file', async () => {
    await expect(transcribeAudio(Buffer.from('fixture'), { merchantId: 88 })).rejects.toMatchObject({ code: 'budget_exceeded' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('honors the super-admin disable switch for voice and embedding', async () => {
    mocks.enabled = false;
    await expect(transcribeAudio(Buffer.from('fixture'), { merchantId: 88 })).rejects.toThrow('disabled');
    expect(await generateEmbedding('fixture', 88)).toBeNull();
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('requires explicit nonzero prices and bounded input capacity', () => {
    const card = { provider: 'zahypi', model: 'qwen-local', version: 'contract-1', inputUsdPerMillion: 0, outputUsdPerMillion: 0, flatUsd: 0, maxInputTokens: 32000, enabled: true };
    expect(aiPriceCardInput.safeParse(card).success).toBe(false);
    expect(aiPriceCardInput.safeParse({ ...card, flatUsd: 0.01 }).success).toBe(true);
    expect(aiPriceCardInput.safeParse({ ...card, flatUsd: -1 }).success).toBe(false);
    expect(aiPriceCardInput.safeParse({ ...card, flatUsd: 1, maxInputTokens: Infinity }).success).toBe(false);
    expect(aiPriceCardInput.safeParse({ ...card, flatUsd: 0.0000001 }).success).toBe(false);
    expect(aiPriceCardInput.safeParse({ ...card, flatUsd: 1.000001 }).success).toBe(true);
  });
});
