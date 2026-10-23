import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ memory: vi.fn(), open: vi.fn(), budget: vi.fn(), understand: vi.fn(), byaan: vi.fn(), salla: vi.fn() }));
vi.mock('./customer-memory', async original => ({ ...await original<typeof import('./customer-memory')>(), captureDirectCustomerMemory: mocks.memory }));
vi.mock('./escalation-relay', async original => ({ ...await original<typeof import('./escalation-relay')>(), hasOpenEscalation: mocks.open }));
vi.mock('./budget-ledger', async original => ({ ...await original<typeof import('./budget-ledger')>(), getAiBudgetStatus: mocks.budget }));
vi.mock('./conversation-understanding', async original => ({ ...await original<typeof import('./conversation-understanding')>(), understandConversation: mocks.understand }));
vi.mock('./byaan-checkout-conversation', () => ({ handleByaanCheckout: mocks.byaan }));
vi.mock('./salla-checkout-conversation', () => ({ handleSallaCheckout: mocks.salla }));
import { chatWithSari, clearEscalationHold } from './sari-personality';

const params = { merchantId: 71, conversationId: 72, incomingMessageId: 73, customerPhone: '966500000071', message: 'موافق أكمل الطلب' };
describe('durable staff waiting before private sales actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEscalationHold(params.merchantId, params.customerPhone);
    mocks.memory.mockResolvedValue({ reply: null, forgetBeforeMessageId: 12 });
    mocks.open.mockResolvedValue(true);
    mocks.budget.mockResolvedValue({ exceeded: true });
  });
  it.each(['موافق أكمل الطلب', 'عندي موضوع جديد وأبغى رابط الدفع', 'أحتاج موظف'])('holds without a process-local cache and before any model or checkout: %s', async message => {
    expect(await chatWithSari({ ...params, message })).toContain('ننتظر رد الفريق');
    expect(mocks.open).toHaveBeenCalledWith(71, 72, params.customerPhone, 12);
    for (const fn of [mocks.budget, mocks.understand, mocks.byaan, mocks.salla]) expect(fn).not.toHaveBeenCalled();
  });
  it('fails closed when the durable waiting state cannot be checked', async () => {
    mocks.open.mockRejectedValueOnce(Error('database unavailable'));
    expect(await chatWithSari(params)).toContain('تعذر التحقق');
    expect(mocks.understand).not.toHaveBeenCalled(); expect(mocks.byaan).not.toHaveBeenCalled(); expect(mocks.salla).not.toHaveBeenCalled();
  });
  it('still handles a direct privacy request before waiting', async () => {
    mocks.memory.mockResolvedValueOnce({ reply: 'تم حذف الذاكرة', forgetBeforeMessageId: 73 });
    expect(await chatWithSari(params)).toBe('تم حذف الذاكرة'); expect(mocks.open).not.toHaveBeenCalled();
  });
  it('returns to the guarded sales pipeline after durable waiting ends', async () => {
    mocks.open.mockResolvedValueOnce(false);
    expect(await chatWithSari(params)).toContain('تعذر الرد الآلي');
    expect(mocks.budget).toHaveBeenCalledOnce(); expect(mocks.understand).not.toHaveBeenCalled();
  });
});
