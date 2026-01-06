import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as notifDb from "./db_notifications";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const notificationManagementRouter = router({
  // ==================== Notification Logs ====================
  
  /**
   * الحصول على جميع سجلات الإشعارات (Super Admin)
   */
  list: adminProcedure
    .input(z.object({
      merchantId: z.number().optional(),
      type: z.string().optional(),
      status: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const logs = await notifDb.getAllNotificationLogs({
        merchantId: input.merchantId,
        type: input.type,
        status: input.status,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        limit: input.limit,
        offset: input.offset,
      });
      
      return logs;
    }),
  
  /**
   * الحصول على تفاصيل إشعار معين
   */
  getById: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const log = await notifDb.getNotificationLogById(input.id);
      
      if (!log) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
      }
      
      return log;
    }),
  
  /**
   * الحصول على إحصائيات الإشعارات
   */
  getStats: adminProcedure
    .input(z.object({
      merchantId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const stats = await notifDb.getNotificationStats({
        merchantId: input.merchantId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
      
      return stats;
    }),
  
  /**
   * الحصول على إحصائيات الإشعارات حسب النوع
   */
  getStatsByType: adminProcedure
    .input(z.object({
      merchantId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const stats = await notifDb.getNotificationStatsByType({
        merchantId: input.merchantId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
      
      return stats;
    }),
  
  /**
   * إعادة إرسال إشعار فاشل
   */
  resend: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const log = await notifDb.getNotificationLogById(input.id);
      
      if (!log) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
      }
      
      if (log.status !== 'failed') {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Only failed notifications can be resent' 
        });
      }
      
      // تحديث الحالة إلى pending
      const updated = await notifDb.updateNotificationStatus(input.id, 'pending');
      
      // TODO: إضافة منطق إعادة الإرسال الفعلي هنا
      // يمكن استخدام queue أو background job
      
      return {
        success: true,
        message: 'Notification queued for resending',
        notification: updated,
      };
    }),
  
  /**
   * حذف سجل إشعار
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await notifDb.deleteNotificationLog(input.id);
      
      return {
        success: true,
        message: 'Notification deleted successfully',
      };
    }),
  
  /**
   * حذف سجلات الإشعارات القديمة
   */
  deleteOld: adminProcedure
    .input(z.object({ daysOld: z.number().min(1).max(365) }))
    .mutation(async ({ input }) => {
      await notifDb.deleteOldNotificationLogs(input.daysOld);
      
      return {
        success: true,
        message: `Notifications older than ${input.daysOld} days deleted successfully`,
      };
    }),
  
  // ==================== Notification Settings ====================
  
  /**
   * الحصول على إعدادات الإشعارات العامة
   */
  getSettings: adminProcedure.query(async () => {
    const settings = await notifDb.getNotificationSettings();
    return settings;
  }),
  
  /**
   * تحديث إعدادات الإشعارات العامة
   */
  updateSettings: adminProcedure
    .input(z.object({
      newOrdersGlobalEnabled: z.boolean().optional(),
      newMessagesGlobalEnabled: z.boolean().optional(),
      appointmentsGlobalEnabled: z.boolean().optional(),
      orderStatusGlobalEnabled: z.boolean().optional(),
      missedMessagesGlobalEnabled: z.boolean().optional(),
      whatsappDisconnectGlobalEnabled: z.boolean().optional(),
      weeklyReportsGlobalEnabled: z.boolean().optional(),
      weeklyReportDay: z.number().min(0).max(6).optional(),
      weeklyReportTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      adminEmail: z.string().email().optional(),
    }))
    .mutation(async ({ input }) => {
      const updated = await notifDb.updateNotificationSettings(input);
      
      return {
        success: true,
        message: 'Notification settings updated successfully',
        settings: updated,
      };
    }),
  
  /**
   * تفعيل/تعطيل نوع معين من الإشعارات
   */
  toggleType: adminProcedure
    .input(z.object({
      type: z.enum([
        'new_orders',
        'new_messages',
        'appointments',
        'order_status',
        'missed_messages',
        'whatsapp_disconnect',
        'weekly_reports',
      ]),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const updated = await notifDb.toggleNotificationType(input.type, input.enabled);
      
      return {
        success: true,
        message: `Notification type ${input.type} ${input.enabled ? 'enabled' : 'disabled'} successfully`,
        settings: updated,
      };
    }),
  
  // ==================== Merchant Notification Preferences ====================
  
  /**
   * الحصول على تفضيلات الإشعارات لتاجر معين
   */
  getMerchantPreferences: adminProcedure
    .input(z.object({ merchantId: z.number() }))
    .query(async ({ input }) => {
      const prefs = await notifDb.getNotificationPreferences(input.merchantId);
      return prefs;
    }),
  
  /**
   * تحديث تفضيلات الإشعارات لتاجر معين
   */
  updateMerchantPreferences: adminProcedure
    .input(z.object({
      merchantId: z.number(),
      newOrdersEnabled: z.boolean().optional(),
      newMessagesEnabled: z.boolean().optional(),
      appointmentsEnabled: z.boolean().optional(),
      orderStatusEnabled: z.boolean().optional(),
      missedMessagesEnabled: z.boolean().optional(),
      whatsappDisconnectEnabled: z.boolean().optional(),
      preferredMethod: z.enum(['push', 'email', 'both']).optional(),
      quietHoursEnabled: z.boolean().optional(),
      quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      instantNotifications: z.boolean().optional(),
      batchNotifications: z.boolean().optional(),
      batchInterval: z.number().min(5).max(120).optional(),
    }))
    .mutation(async ({ input }) => {
      const { merchantId, ...data } = input;
      const updated = await notifDb.updateNotificationPreferences(merchantId, data);
      
      return {
        success: true,
        message: 'Merchant notification preferences updated successfully',
        preferences: updated,
      };
    }),
});
