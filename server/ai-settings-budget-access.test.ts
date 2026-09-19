import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), reconcile: vi.fn() }));
vi.mock('./ai/budget-admin', async importOriginal => ({
  ...await importOriginal<typeof import('./ai/budget-admin')>(),
  readAiBudgetAdmin: mocks.read, saveAiPriceCard: mocks.save, reconcileAiReservation: mocks.reconcile,
}));
import { aiSettingsRouter } from './routers-ai-settings';
const card = { provider: 'zahypi' as const, model: 'qwen-local', version: 'fixture', inputUsdPerMillion: 1,
  outputUsdPerMillion: 1, flatUsd: 0, maxInputTokens: 32000, enabled: true };
const evidence = { reservationKey: 'a'.repeat(64), billedUsd: 1, reference: 'statement-fixture', confirmedProviderEvidence: true as const };
const caller = (role: string | null) => aiSettingsRouter.createCaller({ user: role ? { id: 77, role } : null, req: {}, res: {} } as any);
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ configuredLimitUsd: 100 }); mocks.save.mockResolvedValue({ success: true }); mocks.reconcile.mockResolvedValue({ success: true }); });
describe('super-admin budget access', () => {
  it.each([null, 'user'])('denies %s reads, price changes and reconciliations before accessing storage', async role => {
    const api = caller(role);
    await expect(api.getBudget()).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(api.savePriceCard(card)).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(api.reconcileBudget(evidence)).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('attributes reconciliation to the authenticated admin', async () => {
    await expect(caller('admin').getBudget()).resolves.toEqual({ configuredLimitUsd: 100 });
    await caller('admin').savePriceCard(card);
    await caller('admin').reconcileBudget(evidence);
    expect(mocks.reconcile).toHaveBeenCalledWith(evidence, 77);
  });
});
