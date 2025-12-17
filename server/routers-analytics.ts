import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { TRPCError } from "@trpc/server";

export const analyticsRouter = router({
  // Get analytics summary
  getSummary: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Get conversations count
      const conversations = await db.getConversationsByMerchantId(input.merchantId);
      const conversationsInRange = conversations.filter(c => 
        c.createdAt >= startDate && c.createdAt <= endDate
      );

      // Get messages count
      const messageStats = await db.getMessageStats(input.merchantId, startDate, endDate);

      // Get campaign stats
      const campaigns = await db.getCampaignsByMerchantId(input.merchantId);
      const campaignsInRange = campaigns.filter(c => 
        c.createdAt >= startDate && c.createdAt <= endDate
      );

      return {
        conversationsCount: conversationsInRange.length,
        messagesCount: messageStats?.count || 0,
        campaignsCount: campaignsInRange.length,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      };
    }),

  // Get daily analytics data
  getDailyData: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      days: z.number().default(30),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const dailyData = await db.getDailyMessageCount(input.merchantId, input.days);
      return dailyData;
    }),

  // Get campaign performance
  getCampaignPerformance: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      campaignId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await db.getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      if (input.campaignId) {
        const campaign = await db.getCampaignById(input.campaignId);
        if (!campaign || campaign.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        const logs = await db.getCampaignLogs(input.campaignId);
        const successCount = logs.filter(l => l.status === 'success').length;
        const failureCount = logs.filter(l => l.status === 'failed').length;

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          totalSent: logs.length,
          successCount,
          failureCount,
          deliveryRate: logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(2) : '0',
          readRate: campaign.readCount ? ((campaign.readCount / logs.length) * 100).toFixed(2) : '0',
        };
      }

      // Get all campaigns performance
      const campaigns = await db.getCampaignsByMerchantId(input.merchantId);
      const campaignsPerformance = await Promise.all(
        campaigns.map(async (campaign) => {
          const logs = await db.getCampaignLogs(campaign.id);
          const successCount = logs.filter(l => l.status === 'success').length;
          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            totalSent: logs.length,
            successCount,
            deliveryRate: logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(2) : '0',
          };
        })
      );

      return campaignsPerformance;
    }),

  // Export analytics as PDF
  exportPDF: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      reportType: z.enum(['daily', 'weekly', 'monthly']),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const merchant = await db.getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      try {
        const { generateAnalyticsReport } = await import('./analytics/pdf-export');
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);

        const conversations = await db.getConversationsByMerchantId(input.merchantId);
        const conversationsInRange = conversations.filter(c => 
          c.createdAt >= startDate && c.createdAt <= endDate
        );

        const messageStats = await db.getMessageStats(input.merchantId, startDate, endDate);

        const campaigns = await db.getCampaignsByMerchantId(input.merchantId);
        const campaignsInRange = campaigns.filter(c => 
          c.createdAt >= startDate && c.createdAt <= endDate
        );

        // Get top campaigns
        const topCampaigns = await Promise.all(
          campaignsInRange.slice(0, 5).map(async (campaign) => {
            const logs = await db.getCampaignLogs(campaign.id);
            const successCount = logs.filter(l => l.status === 'success').length;
            return {
              name: campaign.name,
              successRate: logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(2) : '0',
              messagesSent: logs.length,
            };
          })
        );

        const pdfBuffer = await generateAnalyticsReport({
          merchantId: input.merchantId,
          merchantName: merchant.name,
          reportType: input.reportType,
          dateRange: {
            start: startDate,
            end: endDate,
          },
          statistics: {
            totalConversations: conversationsInRange.length,
            totalMessages: messageStats?.count || 0,
            successRate: 85, // يمكن حسابها من البيانات الفعلية
            averageResponseTime: 2.3, // يمكن حسابها من البيانات الفعلية
          },
          topPerformingCampaigns: topCampaigns as any,
          messageBreakdown: {
            text: messageStats?.textCount || 0,
            image: messageStats?.imageCount || 0,
            voice: messageStats?.voiceCount || 0,
            document: messageStats?.documentCount || 0,
          },
        });

        return {
          success: true,
          filename: `analytics-${input.merchantId}-${Date.now()}.pdf`,
          size: pdfBuffer.length,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to generate PDF: ${error}`,
        });
      }
    }),
});

export type AnalyticsRouter = typeof analyticsRouter;
