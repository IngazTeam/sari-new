import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPool, closeDb } from './db/connection';
import * as db from './db-notifications';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';

describe.skipIf(!process.env.DATABASE_URL)('notification workspace MySQL contracts', () => {
  let first: {merchantId: number; userId: number}, second: {merchantId: number; userId: number};
  beforeEach(async () => {first = await createDisposableMerchant('notification-a'); second = await createDisposableMerchant('notification-b');});
  afterEach(async () => cleanupDisposableMerchants([first?.userId, second?.userId].filter(Boolean)));
  afterAll(closeDb);
  it('stores every false content flag, retains sparse fields and rejects cross-tenant writes', async () => {
    const id = await db.createScheduledReport({merchantId: first.merchantId, name: 'Synthetic', reportType: 'weekly', scheduleDay: 3, scheduleTime: '14:45', recipientEmail: 'synthetic@example.test'});
    await db.updateScheduledReport(id, {includeConversations: false, includeOrders: false, includeRevenue: false, includeProducts: false, includeCustomers: false, includeAppointments: false}, first.merchantId);
    await db.updateScheduledReport(id, {isActive: false}, first.merchantId);
    const saved = (await db.getScheduledReports(first.merchantId)).find(row => row.id === id);
    expect(saved).toMatchObject({schedule_day: 3, schedule_time: '14:45', is_active: 0, include_conversations: 0, include_orders: 0, include_revenue: 0, include_products: 0, include_customers: 0, include_appointments: 0});
    await db.updateScheduledReport(id, {name: 'Foreign'}, second.merchantId);
    await db.deleteScheduledReport(id, second.merchantId);
    expect((await db.getScheduledReports(first.merchantId))[0].name).toBe('Synthetic');
    expect(await db.getScheduledReports(second.merchantId)).toEqual([]);
    await db.deleteScheduledReport(id, first.merchantId); expect((await db.getScheduledReports(first.merchantId)).some(row => row.id === id)).toBe(false);
  });
  it('edits notification templates and false/zero values without crossing tenants', async () => {
    const id = await db.createWhatsappAutoNotification({merchantId: first.merchantId, triggerType: 'order_created', messageTemplate: 'Initial', isActive: true, delayMinutes: 5});
    await db.updateWhatsappAutoNotification(id, {messageTemplate: "{{customerName}} ' <example>", isActive: false, delayMinutes: 0}, first.merchantId);
    expect(await db.getWhatsappAutoNotificationById(id)).toMatchObject({message_template: "{{customerName}} ' <example>", is_active: 0, delay_minutes: 0});
    await db.updateWhatsappAutoNotification(id, {isActive: true}, second.merchantId);
    await db.deleteWhatsappAutoNotification(id, second.merchantId);
    expect((await db.getWhatsappAutoNotifications(first.merchantId))[0].is_active).toBe(0);
    expect(await db.getWhatsappAutoNotifications(second.merchantId)).toEqual([]);
    await db.deleteWhatsappAutoNotification(id, first.merchantId); expect(await db.getWhatsappAutoNotificationById(id)).toBeNull();
  });
  it('aggregates daily integration counters once per tenant/platform/date', async () => {
    await db.recordIntegrationStats({merchantId: first.merchantId, platform: 'synthetic', syncCount: 1, successCount: 1});
    await db.recordIntegrationStats({merchantId: first.merchantId, platform: 'synthetic', syncCount: 1, errorCount: 1});
    const rows = await db.getIntegrationStats(first.merchantId);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({sync_count: 2, success_count: 1, error_count: 1});
    expect(await db.getIntegrationStats(second.merchantId)).toEqual([]);
  });
  it('resolves only errors owned by the requested merchant', async () => {
    const id = await db.createIntegrationError({merchantId: first.merchantId, platform: 'synthetic', errorType: 'test', errorMessage: 'Synthetic failure'});
    await db.resolveIntegrationError(id, second.merchantId);
    expect(await db.getUnresolvedErrors(first.merchantId)).toHaveLength(1);
    await db.resolveIntegrationError(id, first.merchantId);
    expect(await db.getUnresolvedErrors(first.merchantId)).toEqual([]);
    expect((await db.getIntegrationErrors(first.merchantId))[0]).toMatchObject({resolved: 1});
    expect(await db.getIntegrationErrors(second.merchantId)).toEqual([]);
  });
  it('cascades owned configuration when the disposable merchant is removed', async () => {
    await db.createScheduledReport({merchantId: first.merchantId, name: 'Synthetic', reportType: 'daily'});
    await db.createWhatsappAutoNotification({merchantId: first.merchantId, triggerType: 'order_created', messageTemplate: 'Synthetic'});
    await (await getPool())!.execute('DELETE FROM merchants WHERE id=?', [first.merchantId]);
    expect(await db.getScheduledReports(first.merchantId)).toEqual([]);
    expect(await db.getWhatsappAutoNotifications(first.merchantId)).toEqual([]);
  });
});
