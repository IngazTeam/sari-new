/**
 * Google Sheets Integration Router
 * tRPC APIs للتعامل مع Google Sheets
 */

import { z } from 'zod';
import { router, protectedProcedure, permissionProcedure } from './_core/trpc';
import { inventorySheetExportInput } from '../shared/inventory-sheet-export';
import { exportInventoryToSheet, readInventoryExportStatus } from './inventory-sheet-export';
import { guardInventoryExport } from './inventory-sheet-export-api';
import { reserveApiRateLimit } from './api/distributed-rate-limit';
import * as sheetsSync from './sheetsSync';
import * as sheetsReports from './sheetsReports';
import {
  getMerchantByUserId,
  getOrderById,
} from './db';

import { TRPCError } from '@trpc/server';
import { beginSheetsOAuth } from './sheets-oauth';
import { guardSheetsOAuth } from './sheets-oauth-api';
import { readSheetsSettings, writeSheetsReportSettings, disconnectSheets } from './sheets-settings';
import { sheetsSettingsChange, sheetsDisconnect } from '../shared/sheets-settings';

export const sheetsRouter = router({
  beginOAuth: permissionProcedure('integrations.manage').mutation(({ctx}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => beginSheetsOAuth({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId}));
  }),

  // الحصول على حالة الاتصال
  getStatus: permissionProcedure('integrations.manage').query(({ ctx }) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => readSheetsSettings({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId}));
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

  inventoryStatus: permissionProcedure('products.manage').query(({ctx}) =>
    guardInventoryExport(() => readInventoryExportStatus(ctx.merchantId,ctx.user.id))),
  syncInventory: permissionProcedure('products.manage').input(inventorySheetExportInput).mutation(async ({ctx,input}) => {
    if (!(await reserveApiRateLimit({namespace:'merchant_inventory_export',identity:String(ctx.merchantId),maxRequests:10,windowMs:60*60*1000})).allowed)
      throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'inventory_export:rate_limit'});
    return guardInventoryExport(()=>exportInventoryToSheet(ctx.merchantId,ctx.user.id,input));
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
  updateReportSettings: permissionProcedure('integrations.manage').input(sheetsSettingsChange).mutation(({ctx,input}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => writeSheetsReportSettings({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
  }),

  // الحصول على إعدادات التقارير
  getReportSettings: permissionProcedure('integrations.manage').query(({ctx}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(async () => (await readSheetsSettings({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId})).reports);
  }),

  // فصل الاتصال
  disconnect: permissionProcedure('integrations.manage').input(sheetsDisconnect).mutation(({ctx,input}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => disconnectSheets({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
  }),
});
