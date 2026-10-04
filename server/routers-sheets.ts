/**
 * Google Sheets Integration Router
 * tRPC APIs للتعامل مع Google Sheets
 */

import { z } from 'zod';
import { router, protectedProcedure, permissionProcedure } from './_core/trpc';
import { sheetsConversationExportInput } from '../shared/sheets-conversation-export';
import { exportScopedConversationsToSheets } from './sheets-conversation-export';
import { runSheetsUserOperation } from './sheets-user-operation';
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
import { sheetsSetupInput, sheetsSetupRead, sheetsSetupAcknowledge } from '../shared/sheets-setup';
import { startSheetsSetup, readSheetsSetup, recoverSheetsSetup, acknowledgeSheetsSetup } from './sheets-setup-attempts';
import { guardSheetsSetup } from './sheets-setup-api';

export const sheetsRouter = router({
  setup: router({
    start: permissionProcedure('integrations.manage').input(sheetsSetupInput).mutation(({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_setup:session'});
      return guardSheetsSetup(()=>startSheetsSetup({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
    }),
    read: permissionProcedure('integrations.manage').input(sheetsSetupRead.optional()).query(({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_setup:session'});
      return guardSheetsSetup(()=>readSheetsSetup({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input ?? {}));
    }),
    recover: permissionProcedure('integrations.manage').input(sheetsSetupRead.required()).mutation(({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_setup:session'});
      return guardSheetsSetup(()=>recoverSheetsSetup({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
    }),
    acknowledge: permissionProcedure('integrations.manage').input(sheetsSetupAcknowledge).mutation(({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_setup:session'});
      return guardSheetsSetup(()=>acknowledgeSheetsSetup({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
    }),
  }),
  beginOAuth: permissionProcedure('integrations.manage').mutation(({ctx}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => beginSheetsOAuth({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId}));
  }),

  // الحصول على حالة الاتصال
  getStatus: permissionProcedure('integrations.manage').query(({ ctx }) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => readSheetsSettings({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId}));
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
  exportConversations: permissionProcedure('integrations.manage').input(sheetsConversationExportInput).mutation(({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    return exportScopedConversationsToSheets({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},input);
  }),

  inventoryStatus: permissionProcedure('products.manage').query(({ctx}) =>
    guardInventoryExport(() => readInventoryExportStatus(ctx.merchantId,ctx.user.id))),
  syncInventory: permissionProcedure('products.manage').input(inventorySheetExportInput).mutation(async ({ctx,input}) => {
    if (!(await reserveApiRateLimit({namespace:'merchant_inventory_export',identity:String(ctx.merchantId),maxRequests:10,windowMs:60*60*1000})).allowed)
      throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'inventory_export:rate_limit'});
    return guardInventoryExport(()=>exportInventoryToSheet(ctx.merchantId,ctx.user.id,input));
  }),

  // توليد تقرير يومي
  generateDailyReport: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    return runSheetsUserOperation({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},async()=>{
      const result=await sheetsReports.generateDailyReport(ctx.merchantId);
      if(result?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return {success:true as const,data:result.data,message:'تم تجهيز التقرير'};
    });
  }),

  // توليد تقرير أسبوعي
  generateWeeklyReport: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    return runSheetsUserOperation({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},async()=>{
      const result=await sheetsReports.generateWeeklyReport(ctx.merchantId);
      if(result?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return {success:true as const,data:result.data,message:'تم تجهيز التقرير'};
    });
  }),

  // توليد تقرير شهري
  generateMonthlyReport: permissionProcedure('integrations.manage').mutation(async ({ ctx }) => {
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    return runSheetsUserOperation({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},async()=>{
      const result=await sheetsReports.generateMonthlyReport(ctx.merchantId);
      if(result?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return {success:true as const,data:result.data,message:'تم تجهيز التقرير'};
    });
  }),

  // توليد تقرير مخصص
  generateCustomReport: permissionProcedure('integrations.manage')
    .input(z.object({startDate:z.date(),endDate:z.date()}).strict().refine(v=>v.endDate.getTime()>v.startDate.getTime()&&v.endDate.getTime()-v.startDate.getTime()<=366*86400000,'Invalid report period'))
    .mutation(async({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
      return runSheetsUserOperation({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},async()=>{
        const result=await sheetsReports.generateCustomReport(ctx.merchantId,input.startDate,input.endDate);
        if(result?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
        return {success:true as const,data:result.data,message:'تم تجهيز التقرير'};
      });
    }),

  sendReportViaWhatsApp: permissionProcedure('integrations.manage')
    .input(z.object({reportType:z.enum(['يومي','أسبوعي','شهري'])}).strict())
    .mutation(async({ctx,input})=>{
      if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
      return runSheetsUserOperation({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId},async()=>{
        const generate=input.reportType==='يومي'?sheetsReports.generateDailyReport:input.reportType==='أسبوعي'?sheetsReports.generateWeeklyReport:sheetsReports.generateMonthlyReport;
        const result=await generate(ctx.merchantId);
        if(result?.success!==true||!result.data)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
        const sent=await sheetsReports.sendReportViaWhatsApp(ctx.merchantId,input.reportType,result.data);
        if(sent?.success!==true)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
        return {success:true as const,message:'قُبل إرسال التقرير'};
      });
    }),

  // تحديث إعدادات التقارير التلقائية
  updateReportSettings: permissionProcedure('integrations.manage').input(sheetsSettingsChange).mutation(({ctx,input}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => writeSheetsReportSettings({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
  }),

  // فصل الاتصال
  disconnect: permissionProcedure('integrations.manage').input(sheetsDisconnect).mutation(({ctx,input}) => {
    if (!ctx.session?.sessionId) throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_oauth:session'});
    return guardSheetsOAuth(() => disconnectSheets({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session!.sessionId},input));
  }),
});
