import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  getPushNotificationSettings,
  upsertPushNotificationSettings,
  getPushNotificationLogs,
  getScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  getWhatsappAutoNotifications,
  createWhatsappAutoNotification,
  updateWhatsappAutoNotification,
  deleteWhatsappAutoNotification,
  getIntegrationStats,
  getIntegrationErrors,
  getUnresolvedErrors,
  resolveIntegrationError,
  getWebhookSecurityLogs,
  getFailedWebhookAttempts
} from "./db-notifications";
import { getAllDefaultTemplates } from "./notifications/whatsapp-auto-notifications";
import { generateWebhookSecret } from "./webhooks/webhook-security";
import { getMerchantByUserId, getIntegrationsByMerchant, updateIntegrationSettings } from "./db";

export const notificationsRouter = router({
  getPushSettings: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return null;
    return getPushNotificationSettings(merchant.id);
  }),

  updatePushSettings: protectedProcedure
    .input(z.object({
      newMessageEnabled: z.boolean().optional(),
      newOrderEnabled: z.boolean().optional(),
      newAppointmentEnabled: z.boolean().optional(),
      lowStockEnabled: z.boolean().optional(),
      paymentReceivedEnabled: z.boolean().optional(),
      batchNotifications: z.boolean().optional(),
      batchIntervalMinutes: z.number().optional(),
      quietHoursEnabled: z.boolean().optional(),
      quietHoursStart: z.string().optional(),
      quietHoursEnd: z.string().optional(),
      notificationEmail: z.string().optional(),
      emailNotificationsEnabled: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return upsertPushNotificationSettings(merchant.id, input);
    }),

  getPushLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      return getPushNotificationLogs(merchant.id, input?.limit);
    }),

  getScheduledReports: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return [];
    return getScheduledReports(merchant.id);
  }),

  createScheduledReport: protectedProcedure
    .input(z.object({
      name: z.string(),
      reportType: z.enum(['daily', 'weekly', 'monthly', 'custom']),
      scheduleDay: z.number().optional(),
      scheduleTime: z.string().optional(),
      deliveryMethod: z.enum(['email', 'whatsapp', 'both']).optional(),
      recipientEmail: z.string().optional(),
      recipientPhone: z.string().optional(),
      includeConversations: z.boolean().optional(),
      includeOrders: z.boolean().optional(),
      includeRevenue: z.boolean().optional(),
      includeProducts: z.boolean().optional(),
      includeCustomers: z.boolean().optional(),
      includeAppointments: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return createScheduledReport({ merchantId: merchant.id, ...input });
    }),

  updateScheduledReport: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      reportType: z.enum(['daily', 'weekly', 'monthly', 'custom']).optional(),
      scheduleDay: z.number().optional(),
      scheduleTime: z.string().optional(),
      deliveryMethod: z.enum(['email', 'whatsapp', 'both']).optional(),
      recipientEmail: z.string().optional(),
      recipientPhone: z.string().optional(),
      includeConversations: z.boolean().optional(),
      includeOrders: z.boolean().optional(),
      includeRevenue: z.boolean().optional(),
      includeProducts: z.boolean().optional(),
      includeCustomers: z.boolean().optional(),
      includeAppointments: z.boolean().optional(),
      isActive: z.boolean().optional()
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateScheduledReport(id, data);
      return { success: true };
    }),

  deleteScheduledReport: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteScheduledReport(input.id);
      return { success: true };
    }),

  getWhatsappAutoNotifications: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return [];
    return getWhatsappAutoNotifications(merchant.id);
  }),

  getDefaultTemplates: protectedProcedure.query(() => getAllDefaultTemplates()),

  createWhatsappAutoNotification: protectedProcedure
    .input(z.object({
      triggerType: z.string(),
      messageTemplate: z.string(),
      isActive: z.boolean().optional(),
      delayMinutes: z.number().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new Error("Merchant not found");
      return createWhatsappAutoNotification({ merchantId: merchant.id, ...input });
    }),

  updateWhatsappAutoNotification: protectedProcedure
    .input(z.object({
      id: z.number(),
      triggerType: z.string().optional(),
      messageTemplate: z.string().optional(),
      isActive: z.boolean().optional(),
      delayMinutes: z.number().optional()
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateWhatsappAutoNotification(id, data);
      return { success: true };
    }),

  deleteWhatsappAutoNotification: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteWhatsappAutoNotification(input.id);
      return { success: true };
    }),

  getIntegrationsDashboard: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) return { integrations: [], stats: [], errors: [] };
    const integrations = await getIntegrationsByMerchant(merchant.id);
    const stats = await getIntegrationStats(merchant.id);
    const errors = await getUnresolvedErrors(merchant.id);
    return { integrations, stats, errors };
  }),

  getIntegrationStats: protectedProcedure
    .input(z.object({ platform: z.string().optional(), days: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      return getIntegrationStats(merchant.id, input?.platform, input?.days);
    }),

  getIntegrationErrors: protectedProcedure
    .input(z.object({ platform: z.string().optional(), limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      return getIntegrationErrors(merchant.id, input?.platform, input?.limit);
    }),

  resolveError: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await resolveIntegrationError(input.id);
      return { success: true };
    }),

  getWebhookSecurityLogs: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) return [];
      return getWebhookSecurityLogs(merchant.id, input?.limit);
    }),

  getFailedWebhookAttempts: protectedProcedure
    .input(z.object({ hours: z.number().optional() }).optional())
    .query(async ({ input }) => getFailedWebhookAttempts(input?.hours)),

  generateWebhookSecret: protectedProcedure
    .input(z.object({ integrationId: z.number() }))
    .mutation(async ({ input }) => {
      const secret = generateWebhookSecret();
      await updateIntegrationSettings(input.integrationId, { webhook_secret: secret });
      return { secret };
    })
});
