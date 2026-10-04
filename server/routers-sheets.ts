/**
 * Google Sheets Integration Router
 * tRPC APIs للتعامل مع Google Sheets
 */

import { z } from 'zod';
import { sheetsReportReview, sheetsCustomReportReview, sheetsSendReportReview, sheetsReportReceipt } from '../shared/sheets-report-review';
import { assertReportReview, readSheetsReportContext } from './sheets-report-review';
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

  reportContext: permissionProcedure('integrations.manage').query(({ctx})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED'});
    return readSheetsReportContext({merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId});
  }),

  generateDailyReport: permissionProcedure('integrations.manage').input(sheetsReportReview).mutation(async({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    const scope={merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId};
    return runSheetsUserOperation(scope,async tx=>{
      await assertReportReview(tx,scope,input);
      const result=await sheetsReports.generateDailyReport(ctx.merchantId,{expectedSpreadsheetId:input.expectedSpreadsheetId});
      if(result?.success!==true||!result.data||result.data.merchantId!==ctx.merchantId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return sheetsReportReceipt.parse({success:true,actorId:ctx.user.id,merchantId:ctx.merchantId,spreadsheetId:input.expectedSpreadsheetId,channel:'sheet',reportKind:'daily',data:result.data});
    });
  }),

  generateWeeklyReport: permissionProcedure('integrations.manage').input(sheetsReportReview).mutation(async({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    const scope={merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId};
    return runSheetsUserOperation(scope,async tx=>{
      await assertReportReview(tx,scope,input);
      const result=await sheetsReports.generateWeeklyReport(ctx.merchantId,{expectedSpreadsheetId:input.expectedSpreadsheetId});
      if(result?.success!==true||!result.data||result.data.merchantId!==ctx.merchantId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return sheetsReportReceipt.parse({success:true,actorId:ctx.user.id,merchantId:ctx.merchantId,spreadsheetId:input.expectedSpreadsheetId,channel:'sheet',reportKind:'weekly',data:result.data});
    });
  }),

  generateMonthlyReport: permissionProcedure('integrations.manage').input(sheetsReportReview).mutation(async({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    const scope={merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId};
    return runSheetsUserOperation(scope,async tx=>{
      await assertReportReview(tx,scope,input);
      const result=await sheetsReports.generateMonthlyReport(ctx.merchantId,{expectedSpreadsheetId:input.expectedSpreadsheetId});
      if(result?.success!==true||!result.data||result.data.merchantId!==ctx.merchantId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return sheetsReportReceipt.parse({success:true,actorId:ctx.user.id,merchantId:ctx.merchantId,spreadsheetId:input.expectedSpreadsheetId,channel:'sheet',reportKind:'monthly',data:result.data});
    });
  }),

  generateCustomReport: permissionProcedure('integrations.manage').input(sheetsCustomReportReview).mutation(async({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    const scope={merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId};
    return runSheetsUserOperation(scope,async tx=>{
      await assertReportReview(tx,scope,input);
      const result=await sheetsReports.generateCustomReport(ctx.merchantId,input.startDate,input.endDate,{expectedSpreadsheetId:input.expectedSpreadsheetId});
      if(result?.success!==true||!result.data||result.data.merchantId!==ctx.merchantId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return sheetsReportReceipt.parse({success:true,actorId:ctx.user.id,merchantId:ctx.merchantId,spreadsheetId:input.expectedSpreadsheetId,channel:'sheet',reportKind:'custom',data:result.data});
    });
  }),

  sendReportViaWhatsApp: permissionProcedure('integrations.manage').input(sheetsSendReportReview).mutation(async({ctx,input})=>{
    if(!ctx.session?.sessionId)throw new TRPCError({code:'UNAUTHORIZED',message:'sheets_operation:session'});
    const scope={merchantId:ctx.merchantId,userId:ctx.user.id,sessionId:ctx.session.sessionId};
    return runSheetsUserOperation(scope,async tx=>{
      await assertReportReview(tx,scope,input);
      const kind=input.reportType==='يومي'?'daily':input.reportType==='أسبوعي'?'weekly':'monthly';
      const generate=kind==='daily'?sheetsReports.generateDailyReport:kind==='weekly'?sheetsReports.generateWeeklyReport:sheetsReports.generateMonthlyReport;
      const result=await generate(ctx.merchantId,{expectedSpreadsheetId:input.expectedSpreadsheetId});
      if(result?.success!==true||!result.data||result.data.merchantId!==ctx.merchantId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      try{await assertReportReview(tx,scope,input);}catch{throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});}
      const sent=await sheetsReports.sendReportViaWhatsApp(ctx.merchantId,input.reportType,result.data,{expectedRecipientPhone:input.expectedRecipientPhone,expectedInstanceId:input.expectedInstanceId});
      if(sent?.success!==true||!sent.messageId)throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
      return sheetsReportReceipt.parse({success:true,actorId:ctx.user.id,merchantId:ctx.merchantId,spreadsheetId:input.expectedSpreadsheetId,channel:'whatsapp',reportKind:kind,data:result.data,recipientPhone:input.expectedRecipientPhone,messageId:sent.messageId});
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
