import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), sync: vi.fn() }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./conversation-import', () => ({ importConversationHistory: m.sync }));
import { appRouter } from './routers';
import { conversationsRouter } from './routers-conversations';
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner', memberId: 3 }); });
describe.each(['app', 'module'])('history import %s', which => {
  const caller = (auth = true) => { const ctx = { user: auth ? { id: 7, role: 'user' } : null, req: { headers: { 'x-merchant-id': '20' } }, res: {} } as any; return which === 'app' ? appRouter.createCaller(ctx).conversations : conversationsRouter.createCaller(ctx); };
  it.each(['owner', 'manager'])('allows %s with server-resolved tenant only', async role => { m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 }); await caller().syncFromWhatsApp(); expect(m.sync).toHaveBeenCalledExactlyOnceWith(20); });
  it.each(['viewer', 'sales_supervisor', 'agent'])('denies %s before provider/storage work', async role => { m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 }); await expect(caller().syncFromWhatsApp()).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(m.sync).not.toHaveBeenCalled(); });
  it.each(['anonymous', 'revoked'])('denies %s', async kind => { m.access.mockResolvedValue(null); await expect(caller(kind !== 'anonymous').syncFromWhatsApp()).rejects.toThrow(); expect(m.sync).not.toHaveBeenCalled(); });
  it.each([{ merchantId: 99 }, { instanceId: 1 }, { chatId: '99900000001@c.us' }, { apiUrl: 'https://evil.test' }])('rejects identity/target injection %j', async input => { await expect((caller().syncFromWhatsApp as any)(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' }); expect(m.sync).not.toHaveBeenCalled(); });
});
