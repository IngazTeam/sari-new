import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ memory: vi.fn(), budget: vi.fn() }));
vi.mock('./customer-memory', async original => ({ ...await original<typeof import('./customer-memory')>(), captureDirectCustomerMemory: calls.memory }));
vi.mock('./budget-ledger', () => ({ getAiBudgetStatus: calls.budget }));
vi.mock('./zahypi-client', async original => ({ ...await original<typeof import('./zahypi-client')>(),
  runWithZahyPiContext: async (_scope: unknown, run: () => Promise<unknown>) => run() }));
import { chatWithSari } from './sari-personality';

beforeEach(() => { vi.clearAllMocks(); calls.budget.mockResolvedValue({ exceeded: true });
  calls.memory.mockResolvedValue({ reply: null, forgetBeforeMessageId: 0 }); });
describe('memory entrypoint before provider admission', () => {
  const input = { merchantId: 17, conversationId: 23, incomingMessageId: 40, customerPhone: '966500000087', message: 'احذف ذاكرة المبيعات الخاصة بي' };
  it('returns a persisted deletion acknowledgment even with no AI budget', async () => {
    calls.memory.mockResolvedValue({ reply: 'حذفت ذاكرة المبيعات الخاصة بك.', forgetBeforeMessageId: 40 });
    expect(await chatWithSari(input)).toContain('حذفت');
    expect(calls.memory).toHaveBeenCalledWith({ merchantId: 17, conversationId: 23, incomingMessageId: 40, customerPhone: input.customerPhone });
    expect(calls.budget).not.toHaveBeenCalled();
  });
  it('persists a correction before budget exhaustion stops paid generation', async () => {
    expect(await chatWithSari({ ...input, message: 'ميزانيتي 500 ريال' })).toContain('تعذر الرد الآلي');
    expect(calls.memory).toHaveBeenCalledTimes(1);
    expect(calls.memory.mock.invocationCallOrder[0]).toBeLessThan(calls.budget.mock.invocationCallOrder[0]);
  });
  it('does not claim a deletion after a storage or ownership failure', async () => {
    calls.memory.mockRejectedValue(new Error('private database diagnostic'));
    const reply = await chatWithSari(input);
    expect(reply).toContain('تعذر التحقق'); expect(reply).not.toContain('حذفت'); expect(reply).not.toContain('private');
    expect(calls.budget).not.toHaveBeenCalled();
  });
  it.each([{ isGroupMessage: true }, { incomingMessageId: undefined }, { conversationId: undefined }])('cannot mutate private memory without a private owned source: %j', async overrides => {
    await chatWithSari({ ...input, ...overrides });
    expect(calls.memory).not.toHaveBeenCalled();
  });
});
