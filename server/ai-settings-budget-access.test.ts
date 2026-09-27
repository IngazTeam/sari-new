import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), reconcile: vi.fn(), history: vi.fn(), alerts: vi.fn() }));
vi.mock('./ai/budget-alerts', async original => ({ ...await original<typeof import('./ai/budget-alerts')>(), readAiBudgetAlerts: mocks.alerts }));
vi.mock('./ai/price-admin', async importOriginal => ({
  ...await importOriginal<typeof import('./ai/price-admin')>(), readAiPriceHistory: mocks.history,
}));
vi.mock('./ai/budget-admin', async importOriginal => ({
  ...await importOriginal<typeof import('./ai/budget-admin')>(),
  readAiBudgetAdmin: mocks.read, saveAiPriceCard: mocks.save, reconcileAiReservation: mocks.reconcile,
}));
import { aiSettingsRouter } from './routers-ai-settings';
import { AiPriceAdminError } from './ai/price-admin';
const card = { provider: 'zahypi' as const, model: 'qwen-local', version: 'fixture', inputUsdPerMillion: 1,
  outputUsdPerMillion: 1, flatUsd: 0, maxInputTokens: 32000, enabled: true,
  reference: 'contract-fixture-only', requestId: '00000000-0000-4000-8000-000000000001', expectedRevision: null };
const evidence = { reservationKey: 'a'.repeat(64), billedUsd: 1, reference: 'statement-fixture', confirmedProviderEvidence: true as const };
const caller = (role: string | null) => aiSettingsRouter.createCaller({ user: role ? { id: 77, role } : null, req: {}, res: {} } as any);
beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue({ configuredLimitUsd: 100 });
  mocks.save.mockResolvedValue({ success: true, revisionId: 1, revision: 'a'.repeat(64), replayed: false });
  mocks.reconcile.mockResolvedValue({ success: true }); mocks.history.mockResolvedValue({ entries: [], nextBeforeId: null }); });
describe('super-admin budget access', () => {
  it('attributes alerts to the session actor and rejects invalid or private output', async () => {
    const value = { period: '2026-09-27', configured: true, enabled: true, limitUsd: 100, spentUsd: 70, reservedUsd: 0, level: 70, events: [] };
    mocks.alerts.mockResolvedValue(value);
    await expect(caller('admin').getBudgetAlerts()).resolves.toEqual(value);
    expect(mocks.alerts).toHaveBeenCalledWith(77);
    mocks.alerts.mockResolvedValue({ ...value, privateKey: 'secret' });
    await expect(caller('admin').getBudgetAlerts()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
  it('redacts alert storage errors and denies revoked authority', async () => {
    mocks.alerts.mockRejectedValue(Error('private SQL password'));
    await expect(caller('admin').getBudgetAlerts()).rejects.toMatchObject({ message: 'AI_PRICE_INTERNAL_SERVER_ERROR' });
    mocks.alerts.mockRejectedValue(new AiPriceAdminError('FORBIDDEN'));
    await expect(caller('admin').getBudgetAlerts()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each([null, 'user'])('denies %s reads, price changes and reconciliations before accessing storage', async role => {
    const api = caller(role);
    await expect(api.getBudgetAlerts()).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(mocks.alerts).not.toHaveBeenCalled();
    await expect(api.getBudget()).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(api.savePriceCard(card)).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(api.getPriceHistory({ provider: card.provider, model: card.model })).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    await expect(api.reconcileBudget(evidence)).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it('attributes reconciliation to the authenticated admin', async () => {
    await expect(caller('admin').getBudget()).resolves.toEqual({ configuredLimitUsd: 100 });
    await caller('admin').savePriceCard(card);
    await caller('admin').reconcileBudget(evidence);
    await caller('admin').getPriceHistory({ provider: card.provider, model: card.model });
    expect(mocks.read).toHaveBeenCalledWith(77);
    expect(mocks.save).toHaveBeenCalledWith(card, 77);
    expect(mocks.history).toHaveBeenCalledWith({ provider: card.provider, model: card.model }, 77);
    expect(mocks.reconcile).toHaveBeenCalledWith(evidence, 77);
  });
  it.each([{ actorId: 999 }, { origin: 'legacy' }, { expectedRevision: undefined }, { requestId: 'invalid' }, { reference: 'short' }, { version: 'line\nbreak' },
    { inputUsdPerMillion: 0.0000001 }, { inputUsdPerMillion: 0, outputUsdPerMillion: 0, flatUsd: 0 }, { model: "x'; DROP TABLE users;--" }])('rejects forged or unsafe price input %j', async fields => {
    await expect(caller('admin').savePriceCard({ ...card, ...fields } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it.each([{ beforeId: -1 }, { beforeId: 1.1 }, { limit: 10000 }, { actorId: 1 }, { model: '../etc/passwd' }])('bounds history and rejects extra fields %j', async fields => {
    await expect(caller('admin').getPriceHistory({ provider: 'openai', model: 'model', ...fields } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it('redacts storage faults and distinguishes conflicts', async () => {
    mocks.save.mockRejectedValue(new Error('mysql://private-user:secret@private-host table ai_price_card_revisions'));
    await expect(caller('admin').savePriceCard(card)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'AI_PRICE_INTERNAL_SERVER_ERROR' });
    mocks.history.mockRejectedValue(new Error('private audit snapshot'));
    await expect(caller('admin').getPriceHistory({ provider: 'openai', model: 'model' })).rejects.toMatchObject({ message: 'AI_PRICE_INTERNAL_SERVER_ERROR' });
    mocks.read.mockRejectedValue(new AiPriceAdminError('FORBIDDEN'));
    await expect(caller('admin').getBudget()).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'AI_PRICE_FORBIDDEN' });
    mocks.save.mockRejectedValue(new AiPriceAdminError('CONFLICT'));
    await expect(caller('admin').savePriceCard(card)).rejects.toMatchObject({ code: 'CONFLICT', message: 'AI_PRICE_CONFLICT' });
  });
  it('rejects unintended output fields', async () => {
    mocks.history.mockResolvedValue({ entries: [], nextBeforeId: null, privateKey: 'never-return' });
    await expect(caller('admin').getPriceHistory({ provider: 'openai', model: 'model' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    mocks.save.mockResolvedValue({ success: true });
    await expect(caller('admin').savePriceCard(card)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
  it('redacts manual settlement faults and respects revoked authority', async () => {
    mocks.reconcile.mockRejectedValue(new Error('private invoice SQL password'));
    await expect(caller('admin').reconcileBudget(evidence)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'AI_PRICE_INTERNAL_SERVER_ERROR' });
    mocks.reconcile.mockRejectedValue(new AiPriceAdminError('FORBIDDEN'));
    await expect(caller('admin').reconcileBudget(evidence)).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'AI_PRICE_FORBIDDEN' });
  });
});
