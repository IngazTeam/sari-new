/**
 * Google Sheets Integration Router
 * tRPC APIs للتعامل مع Google Sheets
 */

import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import * as sheets from './_core/googleSheets';
import * as sheetsSync from './sheetsSync';
import * as sheetsReports from './sheetsReports';
import {
  getGoogleIntegration,
  getMerchantByUserId,
  getOrderById,
  updateGoogleIntegration,
} from './db';

import { TRPCError } from '@trpc/server';

export const sheetsRouter = router({
  // Helper to get merchantId from user
  // الحصول على رابط التفويض
  getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    const authUrl = sheets.getAuthorizationUrl(merchant.id);
    return { authUrl };
  }),

  // معالجة OAuth callback
  handleCallback: protectedProcedure
    .input(z.object({
      code: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await sheets.handleOAuthCallback(input.code, merchant.id);
    }),

  // الحصول على حالة الاتصال
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheets.getConnectionStatus(merchant.id);
  }),

  // إعداد Spreadsheet الرئيسي
  setupSpreadsheet: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsSync.setupMerchantSpreadsheet(merchant.id);
  }),

  // مزامنة طلب محدد
  syncOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // SECURITY: Verify order belongs to this merchant
      const order = await getOrderById(input.orderId);
      if (!order || order.merchantId !== merchant.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

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
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await sheetsSync.syncLeadToSheets(merchant.id, input);
    }),

  // تصدير المحادثات
  exportConversations: protectedProcedure
    .input(z.object({
      conversationIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await sheetsSync.exportConversationsToSheets(
        merchant.id,
        input.conversationIds
      );
    }),

  // مزامنة المخزون
  syncInventory: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsSync.syncInventoryToSheets(merchant.id);
  }),

  // تحديث المخزون من Sheets
  updateInventoryFromSheets: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsSync.updateInventoryFromSheets(merchant.id);
  }),

  // توليد تقرير يومي
  generateDailyReport: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsReports.generateDailyReport(merchant.id);
  }),

  // توليد تقرير أسبوعي
  generateWeeklyReport: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsReports.generateWeeklyReport(merchant.id);
  }),

  // توليد تقرير شهري
  generateMonthlyReport: protectedProcedure.mutation(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheetsReports.generateMonthlyReport(merchant.id);
  }),

  // توليد تقرير مخصص
  generateCustomReport: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await sheetsReports.generateCustomReport(
        merchant.id,
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
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      // توليد التقرير أولاً
      let result;
      switch (input.reportType) {
        case 'يومي':
          result = await sheetsReports.generateDailyReport(merchant.id);
          break;
        case 'أسبوعي':
          result = await sheetsReports.generateWeeklyReport(merchant.id);
          break;
        case 'شهري':
          result = await sheetsReports.generateMonthlyReport(merchant.id);
          break;
        default:
          return { success: false, message: 'نوع التقرير غير صحيح' };
      }

      if (!result.success || !result.data) {
        return result;
      }

      // إرسال التقرير
      return await sheetsReports.sendReportViaWhatsApp(
        merchant.id,
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
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const integration = await getGoogleIntegration(merchant.id, 'sheets');

      if (!integration) {
        return { success: false, message: 'Google Sheets غير مربوط' };
      }

      const currentSettings = integration.settings ? JSON.parse(integration.settings) : {};
      const newSettings = { ...currentSettings, ...input };

      await updateGoogleIntegration(integration.id, {
        settings: JSON.stringify(newSettings),
      });

      return { success: true, message: 'تم تحديث الإعدادات بنجاح' };
    }),

  // الحصول على إعدادات التقارير
  getReportSettings: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

    const integration = await getGoogleIntegration(merchant.id, 'sheets');

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
    const merchant = await getMerchantByUserId(ctx.user.id);
    if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
    return await sheets.disconnect(merchant.id);
  }),
});

