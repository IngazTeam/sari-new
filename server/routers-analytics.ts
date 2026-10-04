import { permissionProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getCampaignById,
  getCampaignLogsByCampaignId,
  getCampaignsByMerchantId,
  getConversationsByMerchantId,
  getDailyMessageCount,
  getMerchantById,
  getMessageStats,
  getPool,
} from './db';
import { TRPCError } from "@trpc/server";

import { acquisitionInput } from "../shared/acquisition-workspace";
import { readAcquisitionWorkspace } from "./analytics/acquisition-workspace";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";

async function acquisitionRead(actorId: number, merchantId: number, input: unknown) {
  try { return await readAcquisitionWorkspace(actorId, merchantId, input); }
  catch (error) {
    throw new TRPCError({ code: error instanceof MerchantSettingsAuthorityError && error.reason === "forbidden" ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR", message: "acquisition:unavailable" });
  }
}

export const analyticsRouter = router({
  acquisitionWorkspace: permissionProcedure('analytics.read')
    .input(acquisitionInput)
    .query(({ ctx, input }) => acquisitionRead(ctx.user.id, ctx.merchantId, input)),
  // Get analytics summary
  getSummary: permissionProcedure('analytics.read')
    .input(z.object({
      merchantId: z.number().int().positive(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.id !== ctx.merchantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);

      // Get conversations count
      const conversations = await getConversationsByMerchantId(input.merchantId);
      const conversationsInRange = conversations.filter(c => 
        new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
      );

      // Get messages count
      const messageStats = await getMessageStats(input.merchantId, startDate, endDate);

      // Get campaign stats
      const campaigns = await getCampaignsByMerchantId(input.merchantId);
      const campaignsInRange = campaigns.filter(c => 
        new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
      );

      return {
        conversationsCount: conversationsInRange.length,
        messagesCount: messageStats?.total || 0,
        campaignsCount: campaignsInRange.length,
        dateRange: {
          start: startDate,
          end: endDate,
        },
      };
    }),

  // Get daily analytics data
  getDailyData: permissionProcedure('analytics.read')
    .input(z.object({
      merchantId: z.number().int().positive(),
      days: z.number().int().min(1).max(90).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.id !== ctx.merchantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const dailyData = await getDailyMessageCount(input.merchantId, input.days);
      return dailyData;
    }),

  // Get campaign performance
  getCampaignPerformance: permissionProcedure('analytics.read')
    .input(z.object({
      merchantId: z.number().int().positive(),
      campaignId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.id !== ctx.merchantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      if (input.campaignId) {
        const campaign = await getCampaignById(input.campaignId);
        if (!campaign || campaign.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        const logs = await getCampaignLogsByCampaignId(input.campaignId);
        const successCount = logs.filter((l: any) => l.status === 'success').length;
        const failureCount = logs.filter((l: any) => l.status === 'failed').length;

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          totalSent: logs.length,
          successCount,
          failureCount,
          deliveryRate: logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(2) : '0',
          // @ts-ignore
          readRate: campaign.readCount ? ((campaign.readCount / logs.length) * 100).toFixed(2) : '0',
        };
      }

      // Get all campaigns performance
      const campaigns = await getCampaignsByMerchantId(input.merchantId);
      const campaignsPerformance = await Promise.all(
        campaigns.map(async (campaign) => {
          const logs = await getCampaignLogsByCampaignId(campaign.id);
          const successCount = logs.filter((l: any) => l.status === 'success').length;
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
  exportPDF: permissionProcedure('analytics.read')
    .input(z.object({
      merchantId: z.number().int().positive(),
      reportType: z.enum(['daily', 'weekly', 'monthly']),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.id !== ctx.merchantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      try {
        const { generateAnalyticsReport } = await import('./analytics/pdf-export');
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);

        const conversations = await getConversationsByMerchantId(input.merchantId);
        const conversationsInRange = conversations.filter(c => 
          new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
        );

        const messageStats = await getMessageStats(input.merchantId, startDate, endDate);

        const campaigns = await getCampaignsByMerchantId(input.merchantId);
        const campaignsInRange = campaigns.filter(c => 
          new Date(c.createdAt) >= startDate && new Date(c.createdAt) <= endDate
        );

        // Get top campaigns
        const topCampaigns = await Promise.all(
          campaignsInRange.slice(0, 5).map(async (campaign) => {
            const logs = await getCampaignLogsByCampaignId(campaign.id);
            const successCount = logs.filter((l: any) => l.status === 'success').length;
            return {
              name: campaign.name,
              successRate: logs.length > 0 ? ((successCount / logs.length) * 100).toFixed(2) : '0',
              messagesSent: logs.length,
            };
          })
        );

        const pdfBuffer = await generateAnalyticsReport({
          merchantId: input.merchantId,
          // @ts-ignore
          merchantName: merchant.name,
          reportType: input.reportType,
          dateRange: {
            start: startDate,
            end: endDate,
          },
          statistics: {
            totalConversations: conversationsInRange.length,
            totalMessages: messageStats?.total || 0,
            // These metrics do not yet have an auditable source in this legacy
            // report. Zero is explicit and honest; never substitute demo KPIs.
            successRate: 0,
            averageResponseTime: 0,
          },
          topPerformingCampaigns: topCampaigns as any,
          messageBreakdown: {
            text: messageStats?.text || 0,
            image: messageStats?.image || 0,
            voice: messageStats?.voice || 0,
            document: 0, // Not tracked yet
          },
        });

        return {
          success: true,
          filename: `analytics-${input.merchantId}-${Date.now()}.pdf`,
          size: pdfBuffer.length,
        };
      } catch (error) {
        console.error('[Analytics] PDF generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'فشل إنشاء تقرير PDF. حاول مرة أخرى.',
        });
      }
    }),

  // Compatibility read; the tenant is still selected by the authenticated request.
  getAcquisitionSources: permissionProcedure('analytics.read')
    .input(z.object({ merchantId: z.number().int().positive().max(2147483647) }).strict())
    .query(async ({ input, ctx }) => {
      if (input.merchantId !== ctx.merchantId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      const data = await acquisitionRead(ctx.user.id, ctx.merchantId, { period: "all" });
      return { totalCustomers: data.totalProfiles, sources: data.sources.map(r => ({ source: r.source, count: r.count, percentage: r.sharePermille / 10 })) };
    }),

  // Supervisor Recovery statistics
  supervisorStats: permissionProcedure('analytics.read')
    .input(z.object({
      merchantId: z.number().int().positive(),
      days: z.number().int().min(1).max(90).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.id !== ctx.merchantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      const pool = await getPool();
      if (!pool) return { total: 0, responded: 0, converted: 0, responseRate: 0, conversionRate: 0, byReason: {} };

      try {
        const [rows] = await pool.execute(
          `SELECT reason, customer_responded, led_to_conversion, created_at
           FROM supervisor_interventions
           WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           ORDER BY created_at DESC`,
          [input.merchantId, input.days]
        );

        const interventions = rows as any[];
        const total = interventions.length;
        const responded = interventions.filter(i => i.customer_responded).length;
        const converted = interventions.filter(i => i.led_to_conversion).length;
        const byReason: Record<string, number> = {};

        for (const i of interventions) {
          byReason[i.reason] = (byReason[i.reason] || 0) + 1;
        }

        return {
          total,
          responded,
          converted,
          responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
          conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
          byReason,
        };
      } catch {
        // Table may not exist yet
        return { total: 0, responded: 0, converted: 0, responseRate: 0, conversionRate: 0, byReason: {} };
      }
    }),
});

export type AnalyticsRouter = typeof analyticsRouter;
