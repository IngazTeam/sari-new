import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, merchantProcedure, permissionProcedure } from './_core/trpc';
import * as notifications from './db-notifications';
import { getAllDefaultTemplates } from './notifications/whatsapp-auto-notifications';
import { generateWebhookSecret } from './webhooks/webhook-security';
import { getIntegrationsByMerchant, updateIntegrationSettings } from './db';
import { positiveId, timeOfDay, reportConfiguration, reportUpdate, storedReportConfiguration, autoNotificationFields } from './notification-workspace-input';
import { hasPermission } from './_core/permissions';

const settings = permissionProcedure('settings.manage');
const whatsapp = permissionProcedure('whatsapp.manage');
const integrations = permissionProcedure('integrations.manage');
const recordId = z.object({id: positiveId});
const limit = z.number().int().min(1).max(200).optional();
const platform = z.string().trim().min(1).max(64).optional();
function owned<T extends {id: number}>(records: T[], id: number): T {
  const record = records.find(row => row.id === id);
  if (!record) throw new TRPCError({code: 'NOT_FOUND', message: 'السجل غير موجود في هذا المتجر'});
  return record;
}

export const notificationsRouter = router({
  workspaceCapabilities: merchantProcedure.query(({ctx}) => ({
    reportsManage: hasPermission(ctx.merchantRole, 'settings.manage'),
    notificationsManage: hasPermission(ctx.merchantRole, 'whatsapp.manage'),
    integrationsManage: hasPermission(ctx.merchantRole, 'integrations.manage'),
    // These legacy configuration screens are not wired to an outbound worker.
    automaticDeliveryAvailable: false,
  })),
  getPushSettings: merchantProcedure.query(({ctx}) => notifications.getPushNotificationSettings(ctx.merchantId)),
  updatePushSettings: settings.input(z.object({
    newMessageEnabled: z.boolean().optional(), newOrderEnabled: z.boolean().optional(),
    newAppointmentEnabled: z.boolean().optional(), lowStockEnabled: z.boolean().optional(),
    paymentReceivedEnabled: z.boolean().optional(), batchNotifications: z.boolean().optional(),
    batchIntervalMinutes: z.number().int().min(1).max(120).optional(),
    quietHoursEnabled: z.boolean().optional(), quietHoursStart: timeOfDay.optional(), quietHoursEnd: timeOfDay.optional(),
    notificationEmail: z.union([z.literal(''), z.string().email().max(320)]).optional(),
    emailNotificationsEnabled: z.boolean().optional(),
  })).mutation(({ctx, input}) => notifications.upsertPushNotificationSettings(ctx.merchantId, input)),
  getPushLogs: merchantProcedure.input(z.object({limit}).optional())
    .query(({ctx, input}) => notifications.getPushNotificationLogs(ctx.merchantId, input?.limit)),

  getScheduledReports: permissionProcedure('analytics.read').query(({ctx}) => notifications.getScheduledReports(ctx.merchantId)),
  createScheduledReport: settings.input(reportConfiguration)
    .mutation(({ctx, input}) => notifications.createScheduledReport({merchantId: ctx.merchantId, ...input})),
  updateScheduledReport: settings.input(reportUpdate).mutation(async ({ctx, input}) => {
    const current = owned(await notifications.getScheduledReports(ctx.merchantId), input.id);
    const {id, ...data} = input;
    // Toggle-only patches must still work for legacy schedules with incomplete recipients.
    const changesConfiguration = Object.keys(data).some(key => key !== 'isActive');
    if (changesConfiguration) {
      const checked = reportConfiguration.safeParse({...storedReportConfiguration(current), ...data});
      if (!checked.success) throw new TRPCError({code: 'BAD_REQUEST', message: checked.error.issues[0].message});
    }
    await notifications.updateScheduledReport(id, data, ctx.merchantId);
    return {success: true};
  }),
  deleteScheduledReport: settings.input(recordId).mutation(async ({ctx, input}) => {
    owned(await notifications.getScheduledReports(ctx.merchantId), input.id);
    await notifications.deleteScheduledReport(input.id, ctx.merchantId);
    return {success: true};
  }),

  getWhatsappAutoNotifications: merchantProcedure.query(({ctx}) => notifications.getWhatsappAutoNotifications(ctx.merchantId)),
  getDefaultTemplates: merchantProcedure.query(() => getAllDefaultTemplates()),
  createWhatsappAutoNotification: whatsapp.input(autoNotificationFields)
    .mutation(({ctx, input}) => notifications.createWhatsappAutoNotification({merchantId: ctx.merchantId, ...input})),
  updateWhatsappAutoNotification: whatsapp.input(autoNotificationFields.partial().extend({id: positiveId})).mutation(async ({ctx, input}) => {
    owned(await notifications.getWhatsappAutoNotifications(ctx.merchantId), input.id);
    const {id, ...data} = input;
    await notifications.updateWhatsappAutoNotification(id, data, ctx.merchantId);
    return {success: true};
  }),
  deleteWhatsappAutoNotification: whatsapp.input(recordId).mutation(async ({ctx, input}) => {
    owned(await notifications.getWhatsappAutoNotifications(ctx.merchantId), input.id);
    await notifications.deleteWhatsappAutoNotification(input.id, ctx.merchantId);
    return {success: true};
  }),

  getIntegrationsDashboard: merchantProcedure.query(async ({ctx}) => {
    const [connected, stats, errors] = await Promise.all([
      getIntegrationsByMerchant(ctx.merchantId), notifications.getIntegrationStats(ctx.merchantId), notifications.getUnresolvedErrors(ctx.merchantId),
    ]);
    return {integrations: connected, stats, errors};
  }),
  getIntegrationStats: merchantProcedure.input(z.object({platform, days: z.number().int().min(1).max(366).optional()}).optional())
    .query(({ctx, input}) => notifications.getIntegrationStats(ctx.merchantId, input?.platform, input?.days)),
  getIntegrationErrors: merchantProcedure.input(z.object({platform, limit}).optional())
    .query(({ctx, input}) => notifications.getIntegrationErrors(ctx.merchantId, input?.platform, input?.limit)),
  resolveError: integrations.input(recordId).mutation(async ({ctx, input}) => {
    owned(await notifications.getUnresolvedErrors(ctx.merchantId), input.id);
    await notifications.resolveIntegrationError(input.id, ctx.merchantId);
    return {success: true};
  }),
  getWebhookSecurityLogs: integrations.input(z.object({limit}).optional())
    .query(({ctx, input}) => notifications.getWebhookSecurityLogs(ctx.merchantId, input?.limit)),
  getFailedWebhookAttempts: integrations.input(z.object({hours: z.number().int().min(1).max(168).optional()}).optional())
    .query(({ctx, input}) => notifications.getFailedWebhookAttempts(ctx.merchantId, input?.hours)),
  generateWebhookSecret: integrations.input(z.object({integrationId: positiveId})).mutation(async ({ctx, input}) => {
    owned(await getIntegrationsByMerchant(ctx.merchantId), input.integrationId);
    const secret = generateWebhookSecret();
    await updateIntegrationSettings(input.integrationId, {webhook_secret: secret});
    return {secret};
  }),
});
