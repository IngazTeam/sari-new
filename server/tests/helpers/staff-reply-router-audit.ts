import { beforeEach, vi } from 'vitest';

// Exercise both public router entry points; only the durable service and legacy
// side effects are doubled. SQL authority and ownership are covered by the MySQL suites.
const mocks = vi.hoisted(() => ({ access: vi.fn(), send: vi.fn(), transport: vi.fn(), ownership: vi.fn(), message: vi.fn() }));
vi.mock('../../accounts/merchant-access', () => ({ resolveMerchantAccess: mocks.access }));
vi.mock('../../ai/staff-dashboard-reply', () => ({ trySendDashboardStaff: mocks.send }));
vi.mock('../../db', async original => ({ ...await original<typeof import('../../db')>(), updateConversation: mocks.ownership, createMessage: mocks.message }));
vi.mock('../../whatsapp', async original => ({ ...await original<typeof import('../../whatsapp')>(), sendMessageWithCredentials: mocks.transport }));
import { appRouter } from '../../routers';
import { conversationsRouter } from '../../routers-conversations';
export const staffRouteAudit = mocks;

export const staffAuditInput = { conversationId: 4, message: 'عرض للاختبار', requestId: '00000000-0000-4000-8000-000000000001' };
export function staffAuditCaller(kind: 'app' | 'module' = 'app') {
  const ctx = { user: { id: 7, role: 'user' }, req: {}, res: {} } as any;
  return kind === 'app' ? appRouter.createCaller(ctx).conversations : conversationsRouter.createCaller(ctx);
}
beforeEach(() => {
  vi.resetAllMocks();
  staffRouteAudit.access.mockResolvedValue({ merchantId: 20, role: 'owner', memberId: 3 });
  staffRouteAudit.send.mockResolvedValue({ success: true, status: 'accepted', persisted: true });
});
