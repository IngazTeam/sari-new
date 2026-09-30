import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({access: vi.fn(), integrations: vi.fn(), settings: vi.fn(), functions: Object.fromEntries([
  'getPushNotificationSettings','upsertPushNotificationSettings','getPushNotificationLogs','getScheduledReports','createScheduledReport','updateScheduledReport','deleteScheduledReport',
  'getWhatsappAutoNotifications','createWhatsappAutoNotification','updateWhatsappAutoNotification','deleteWhatsappAutoNotification',
  'getIntegrationStats','getIntegrationErrors','getUnresolvedErrors','resolveIntegrationError','getWebhookSecurityLogs','getFailedWebhookAttempts',
].map(name => [name, vi.fn()]))}));
vi.mock('./accounts/merchant-access', () => ({resolveMerchantAccess: mocks.access}));
vi.mock('./db', () => ({getIntegrationsByMerchant: mocks.integrations, updateIntegrationSettings: mocks.settings}));
vi.mock('./db-notifications', () => mocks.functions);
import { notificationsRouter } from './routers-notifications';
import { reportUpdate } from './notification-workspace-input';
const caller = (user: any = {id: 7, role: 'user'}) => notificationsRouter.createCaller({user, req: {headers: {'x-merchant-id': '20'}}, res: {}, merchantId: 999} as any);
const baseReport = {name: 'المبيعات', reportType: 'weekly' as const, recipientEmail: 'synthetic@example.test'};
const stored = {id: 1, merchant_id: 20, name: 'قبل التعديل', report_type: 'monthly', schedule_day: 12, schedule_time: '14:45', delivery_method: 'email', recipient_email: 'synthetic@example.test', include_orders: 0, include_revenue: 0, include_conversations: 1, include_products: 1, include_customers: 1, include_appointments: 1};
beforeEach(() => {
  vi.clearAllMocks(); mocks.access.mockResolvedValue({merchantId: 20, role: 'owner', memberId: 3});
  for (const fn of Object.values(mocks.functions)) fn.mockResolvedValue([]);
  mocks.functions.getScheduledReports.mockResolvedValue([stored]);
  mocks.functions.getWhatsappAutoNotifications.mockResolvedValue([{id: 2, merchant_id: 20}]);
  mocks.functions.getUnresolvedErrors.mockResolvedValue([{id: 3, merchant_id: 20}]);
  mocks.integrations.mockResolvedValue([]);
});

describe('notification workspace boundaries', () => {
  it('surfaces scheduled-report storage failure without a successful empty response', async () => {
    mocks.functions.getScheduledReports.mockRejectedValue(new Error('Report storage unavailable'));
    await expect(caller().getScheduledReports()).rejects.toThrow('Report storage unavailable');
    await expect(caller().updateScheduledReport({id:1,isActive:false})).rejects.toThrow('Report storage unavailable');
    expect(mocks.functions.updateScheduledReport).not.toHaveBeenCalled();
  });
  it('uses the selected merchant for reads and never caller-supplied context ids', async () => {
    await caller().getScheduledReports();
    expect(mocks.access).toHaveBeenCalledWith(7, 20);
    expect(mocks.functions.getScheduledReports).toHaveBeenCalledWith(20);
  });
  it('scopes failed webhook attempts to the same merchant', async () => {
    await caller().getFailedWebhookAttempts({hours: 48});
    expect(mocks.functions.getFailedWebhookAttempts).toHaveBeenCalledWith(20, 48);
  });
  it('rejects unauthenticated reads before database access', async () => {
    await expect(caller(null).getScheduledReports()).rejects.toMatchObject({code: 'UNAUTHORIZED'});
    expect(mocks.functions.getScheduledReports).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'sales_supervisor'])('blocks %s changes while allowing report reads', async role => {
    mocks.access.mockResolvedValue({merchantId: 20, role, memberId: 3});
    await caller().getScheduledReports();
    await expect(caller().createScheduledReport(baseReport)).rejects.toMatchObject({code: 'FORBIDDEN'});
    await expect(caller().createWhatsappAutoNotification({triggerType: 'order_created', messageTemplate: 'Hello'})).rejects.toMatchObject({code: 'FORBIDDEN'});
    await expect(caller().resolveError({id: 3})).rejects.toMatchObject({code: 'FORBIDDEN'});
    expect(mocks.functions.createScheduledReport).not.toHaveBeenCalled();
    expect(mocks.functions.createWhatsappAutoNotification).not.toHaveBeenCalled();
    expect(mocks.functions.resolveIntegrationError).not.toHaveBeenCalled();
  });
  it('rejects foreign ids for every mutable record kind', async () => {
    await expect(caller().updateScheduledReport({id: 99, isActive: false})).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(caller().deleteScheduledReport({id: 99})).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(caller().updateWhatsappAutoNotification({id: 99, isActive: false})).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(caller().deleteWhatsappAutoNotification({id: 99})).rejects.toMatchObject({code: 'NOT_FOUND'});
    await expect(caller().resolveError({id: 99})).rejects.toMatchObject({code: 'NOT_FOUND'});
    for (const name of ['updateScheduledReport','deleteScheduledReport','updateWhatsappAutoNotification','deleteWhatsappAutoNotification','resolveIntegrationError']) expect(mocks.functions[name]).not.toHaveBeenCalled();
  });
  it('passes merchant ownership through to writes and preserves false configuration flags', async () => {
    const flags = {includeOrders: false, includeRevenue: false, includeConversations: false, includeProducts: false, includeCustomers: false, includeAppointments: false};
    await caller().updateScheduledReport({id: 1, ...flags});
    expect(mocks.functions.updateScheduledReport).toHaveBeenCalledWith(1, flags, 20);
    await caller().updateWhatsappAutoNotification({id: 2, isActive: false, delayMinutes: 0});
    expect(mocks.functions.updateWhatsappAutoNotification).toHaveBeenCalledWith(2, {isActive: false, delayMinutes: 0}, 20);
  });
  it('does not reset schedule or content defaults on a toggle-only patch', async () => {
    expect(reportUpdate.parse({id: 1, isActive: false})).toEqual({id: 1, isActive: false});
    await caller().updateScheduledReport({id: 1, isActive: false});
    expect(mocks.functions.updateScheduledReport).toHaveBeenCalledWith(1, {isActive: false}, 20);
  });
  it.each([
    {name: ' '}, {scheduleTime: '25:60'}, {scheduleDay: 7}, {reportType: 'monthly', scheduleDay: 0},
    {recipientEmail: ''}, {recipientEmail: 'invalid'}, {deliveryMethod: 'both', recipientPhone: ''},
  ])('rejects invalid report settings %# before writes', async patch => {
    await expect(caller().createScheduledReport({...baseReport, ...patch} as any)).rejects.toMatchObject({code: 'BAD_REQUEST'});
    expect(mocks.functions.createScheduledReport).not.toHaveBeenCalled();
  });
  it('validates channel requirements against the saved record when partially editing', async () => {
    await expect(caller().updateScheduledReport({id: 1, deliveryMethod: 'both'})).rejects.toMatchObject({code: 'BAD_REQUEST'});
    expect(mocks.functions.updateScheduledReport).not.toHaveBeenCalled();
  });
  it.each([{triggerType: 'unknown'}, {messageTemplate: ' '}, {messageTemplate: 'x'.repeat(4001)}, {delayMinutes: -1}])('rejects unsupported templates %#', async patch => {
    await expect(caller().createWhatsappAutoNotification({triggerType: 'order_created', messageTemplate: 'Hello', ...patch} as any)).rejects.toMatchObject({code: 'BAD_REQUEST'});
  });
  it('describes saved configuration and permissions without claiming live delivery', async () => {
    expect(await caller().workspaceCapabilities()).toEqual({reportsManage: true, notificationsManage: true, integrationsManage: true, automaticDeliveryAvailable: false});
  });
});
