import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => Object.fromEntries(['access', 'templates', 'save', 'health', 'ack', 'history', 'byOrder', 'order', 'workspace', 'detail'].map(k => [k, vi.fn()])));
vi.mock('./order-notification-workspace', () => ({ readOrderNoticeWorkspace: m.workspace, readOrderNoticeDetail: m.detail,
  OrderNoticeError: class extends Error { constructor(readonly reason: string) { super('order_notice:' + reason); } } }));
vi.mock('./accounts/merchant-access', () => ({ resolveMerchantAccess: m.access }));
vi.mock('./db', () => ({ getOrderNotificationsByMerchantId: m.history, getOrderNotificationsByOrderId: m.byOrder }));
vi.mock('./notifications/order-notifications', () => ({ ORDER_NOTIFICATION_STATUSES: ['pending','paid','processing','shipped','delivered','cancelled'], getOrderNotificationTemplateSettings: m.templates, saveOrderNotificationTemplate: m.save }));
vi.mock('./orders/merchant-order-lifecycle', () => ({ getMerchantOrder: m.order }));
vi.mock('./orders/order-status-notification-outbox', () => ({ getOrderStatusNotificationHealth: m.health, acknowledgeOrderStatusNotificationIncidents: m.ack }));
import { orderNotificationsRouter } from './routers-order-notifications';
import { OrderNoticeError } from './order-notification-workspace';
const caller = (user: any = { id: 7, role: 'user' }, selected = '20') => orderNotificationsRouter.createCaller({ user, req: { headers: { 'x-merchant-id': selected } }, res: {}, merchantId: 999 } as any);
const input = { status: 'paid' as const, template: 'Order {{orderNumber}}', enabled: true };
beforeEach(() => { vi.resetAllMocks(); m.access.mockResolvedValue({ merchantId: 20, role: 'owner', memberId: 3 }); m.order.mockResolvedValue({ id: 4 }); });
it('routes every read and write through resolved selected-tenant authority', async () => {
  const api = caller(); await api.getTemplates(); await api.getHealth(); await api.getHistory({ limit: 37 }); await api.getByOrderId({ orderId: 4 }); await api.updateTemplate(input); await api.acknowledgeIncidents();
  expect(m.access).toHaveBeenCalledWith(7, 20); expect(m.templates).toHaveBeenCalledWith(20); expect(m.health).toHaveBeenCalledWith(20);
  expect(m.history).toHaveBeenCalledWith(20, 37); expect(m.order).toHaveBeenCalledWith(20, 4); expect(m.byOrder).toHaveBeenCalledWith(20, 4);
  expect(m.save).toHaveBeenCalledWith({ merchantId: 20, ...input }); expect(m.ack).toHaveBeenCalledWith(20, 7);
});
it.each(['viewer', 'sales_supervisor'])('allows %s reads and rejects both writes', async role => {
  m.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 }); const api = caller();
  await api.getTemplates(); await api.getHealth(); await api.getHistory({}); await api.getByOrderId({ orderId: 4 });
  await expect(api.updateTemplate(input)).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(api.acknowledgeIncidents()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(m.save).not.toHaveBeenCalled(); expect(m.ack).not.toHaveBeenCalled();
});
it('allows a manager to configure the selected tenant', async () => {
  m.access.mockResolvedValue({ merchantId: 20, role: 'manager', memberId: 3 }); await caller().updateTemplate(input); expect(m.save).toHaveBeenCalledWith({ merchantId: 20, ...input });
});
it('rejects unauthenticated and revoked authority before data access', async () => {
  await expect(caller(null).getTemplates()).rejects.toMatchObject({ code: 'UNAUTHORIZED' }); m.access.mockResolvedValue(null);
  await expect(caller().getTemplates()).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(caller().updateTemplate(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(m.templates).not.toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
});
it('never requests notifications for a foreign or missing order', async () => {
  m.order.mockResolvedValue(null); await expect(caller().getByOrderId({ orderId: 4 })).rejects.toMatchObject({ code: 'NOT_FOUND' }); expect(m.byOrder).not.toHaveBeenCalled();
});
it.each([{ merchantId: 30 }, { template: ' ' }, { template: 'a\0b' }, { template: 'a'.repeat(3501) }, { enabled: 1 }, { status: 'confirmed' }])('rejects invalid template input %j', patch => expect(caller().updateTemplate({ ...input, ...patch } as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }));
it.each([{ limit: 101 }, { limit: 0 }, { merchantId: 30 }])('rejects invalid history selection %j', input => expect(caller().getHistory(input as any)).rejects.toMatchObject({ code: 'BAD_REQUEST' }));
it('does not turn storage or membership failures into successful empty results', async () => {
  m.history.mockRejectedValue(new Error('unavailable')); await expect(caller().getHistory({})).rejects.toThrow('unavailable');
  m.access.mockRejectedValue(new Error('private database error')); await expect(caller().getTemplates()).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
});
it('passes actor and selected tenant to the new read model, never forged context or body identity', async () => {
  await caller().workspace({query:'literal_%'}); await caller().detail({id:8});
  expect(m.workspace).toHaveBeenCalledWith(7,20,expect.objectContaining({query:'literal_%',page:1}));expect(m.detail).toHaveBeenCalledWith(7,20,{id:8});
  await expect(caller().workspace({merchantId:999} as any)).rejects.toMatchObject({code:'BAD_REQUEST'});
});
it.each([['forbidden','FORBIDDEN'],['missing','NOT_FOUND'],['unavailable','INTERNAL_SERVER_ERROR']])('maps %s without leaking source data',async(reason,code)=>{
  m.detail.mockRejectedValue(new OrderNoticeError(reason as any));await expect(caller().detail({id:8})).rejects.toMatchObject({code,message:'order_notice:unavailable'});
});
