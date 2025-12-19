/**
 * Google Sheets Integration Router
 * tRPC APIs للتعامل مع Google Sheets
 */

import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import * as sheets from './_core/googleSheets';
import * as sheetsSync from './sheetsSync';
import * as sheetsReports from './sheetsReports';
import * as db from './db';

export const sheetsRouter = router({
  // الحصول على رابط التفويض
  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
    const authUrl = sheets.getAuthorizationUrl(ctx.user.merchantId);
    return { authUrl };
  }),

  // معالجة OAuth callback
  handleCallback: protectedProcedure
    .input(z.object({
      code: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await sheets.handleOAuthCallback(input.code, ctx.user.merchantId);
    }),

  // الحصول على حالة الاتصال
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    return await sheets.getConnectionStatus(ctx.user.merchantId);
  }),

  // إعداد Spreadsheet الرئيسي
  setupSpreadsheet: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsSync.setupMerchantSpreadsheet(ctx.user.merchantId);
  }),

  // مزامنة طلب محدد
  syncOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await sheetsSync.syncOrderToSheets(input.orderId);
    }),

  // مزامنة عميل محتمل
  syncLead: protectedProcedure
    .input(z.object({
      customerName: z.string(),
      customerPhone: z.string(),
      source: z.string(),
      status: z.string(),
      lastInteraction: z.date(),
      messageCount: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await sheetsSync.syncLeadToSheets(ctx.user.merchantId, input);
    }),

  // تصدير المحادثات
  exportConversations: protectedProcedure
    .input(z.object({
      conversationIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      return await sheetsSync.exportConversationsToSheets(
        ctx.user.merchantId,
        input.conversationIds
      );
    }),

  // مزامنة المخزون
  syncInventory: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsSync.syncInventoryToSheets(ctx.user.merchantId);
  }),

  // تحديث المخزون من Sheets
  updateInventoryFromSheets: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsSync.updateInventoryFromSheets(ctx.user.merchantId);
  }),

  // توليد تقرير يومي
  generateDailyReport: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsReports.generateDailyReport(ctx.user.merchantId);
  }),

  // توليد تقرير أسبوعي
  generateWeeklyReport: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsReports.generateWeeklyReport(ctx.user.merchantId);
  }),

  // توليد تقرير شهري
  generateMonthlyReport: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheetsReports.generateMonthlyReport(ctx.user.merchantId);
  }),

  // توليد تقرير مخصص
  generateCustomReport: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await sheetsReports.generateCustomReport(
        ctx.user.merchantId,
        input.startDate,
        input.endDate
      );
    }),

  // إرسال تقرير عبر WhatsApp
  sendReportViaWhatsApp: protectedProcedure
    .input(z.object({
      reportType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // توليد التقرير أولاً
      let result;
      switch (input.reportType) {
        case 'يومي':
          result = await sheetsReports.generateDailyReport(ctx.user.merchantId);
          break;
        case 'أسبوعي':
          result = await sheetsReports.generateWeeklyReport(ctx.user.merchantId);
          break;
        case 'شهري':
          result = await sheetsReports.generateMonthlyReport(ctx.user.merchantId);
          break;
        default:
          return { success: false, message: 'نوع التقرير غير صحيح' };
      }

      if (!result.success || !result.data) {
        return result;
      }

      // إرسال التقرير
      return await sheetsReports.sendReportViaWhatsApp(
        ctx.user.merchantId,
        input.reportType,
        result.data
      );
    }),

  // تحديث إعدادات التقارير التلقائية
  updateReportSettings: protectedProcedure
    .input(z.object({
      sendDailyReports: z.boolean().optional(),
      sendWeeklyReports: z.boolean().optional(),
      sendMonthlyReports: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const integration = await db.getGoogleIntegration(ctx.user.merchantId, 'sheets');

      if (!integration) {
        return { success: false, message: 'Google Sheets غير مربوط' };
      }

      const currentSettings = integration.settings ? JSON.parse(integration.settings) : {};
      const newSettings = { ...currentSettings, ...input };

      await db.updateGoogleIntegration(integration.id, {
        settings: JSON.stringify(newSettings),
      });

      return { success: true, message: 'تم تحديث الإعدادات بنجاح' };
    }),

  // الحصول على إعدادات التقارير
  getReportSettings: protectedProcedure.query(async ({ ctx }) => {
    const integration = await db.getGoogleIntegration(ctx.user.merchantId, 'sheets');

    if (!integration) {
      return {
        sendDailyReports: false,
        sendWeeklyReports: false,
        sendMonthlyReports: false,
      };
    }

    const settings = integration.settings ? JSON.parse(integration.settings) : {};

    return {
      sendDailyReports: settings.sendDailyReports || false,
      sendWeeklyReports: settings.sendWeeklyReports || false,
      sendMonthlyReports: settings.sendMonthlyReports || false,
    };
  }),

  // فصل الاتصال
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    return await sheets.disconnect(ctx.user.merchantId);
  }),
});
