/**
 * Campaigns Router Module — Fixed & Hardened
 * Handles marketing campaign management, sending, and analytics
 * 
 * Fixes applied:
 * #1 - Targeting filters now wire to send endpoint
 * #2 - Rate-limited sequential batching (10/sec) instead of Promise.all
 * #3 - Removed fabricated delivery/read metrics; expose provider acceptance only
 * #4 - Delete now does real DELETE instead of status='failed'
 * #7 - Frontend confirms before send (frontend-side fix)
 * #8 - Unsubscribe support (campaignOptOut field)
 * #9 - getSendProgress endpoint for live updates
 * #11 - Phone deduplication before send
 * #12 - Real stats from campaign logs
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createCampaign,
  deleteCampaign,
  getActiveSubscriptionByMerchantId,
  getAllCampaignsWithMerchants,
  getCampaignById,
  getCampaignLogsWithStats,
  getCampaignsByMerchantId,
  getConversationsByMerchantId,
  getMerchantByUserId,
  getPrimaryWhatsAppInstance,
  updateCampaign,
} from './db';
import {
  CampaignSuppressionUnavailableError,
  filterCampaignRecipients,
  normalizeCampaignPhone,
} from './automation/campaign-guard';
import {
  CampaignDispatchConflictError,
  CampaignTargetingError,
  enqueueCampaignDeliveries,
  filterCampaignAudience,
  getCampaignAcceptanceTimeline,
  getCampaignDeliveryProgress,
  isValidCampaignTargetAudience,
} from './automation/campaign-delivery-outbox';

const campaignImageUrlSchema = z.string().url().max(500).refine(value => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}, { message: 'Campaign images must use a public HTTPS URL' });

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx });
});

export const campaignsRouter = router({
    // Get all campaigns for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getCampaignsByMerchantId(merchant.id);
    }),

    // Get all campaigns with merchant info (Admin only)
    listAll: adminProcedure.query(async () => {
        return await getAllCampaignsWithMerchants();
    }),

    // Get single campaign
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            return campaign;
        }),

    // Create new campaign — targetAudience is now stored as JSON
    create: protectedProcedure
        .input(z.object({
            name: z.string().trim().min(1).max(255),
            message: z.string().trim().min(1).max(3800),
            imageUrl: campaignImageUrlSchema.optional(),
            targetAudience: z.string().max(1000).refine(isValidCampaignTargetAudience).optional(),
            scheduledAt: z.date().optional(),
        }).strict())
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            if (merchant.status !== 'active') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
            }

            const campaign = await createCampaign({
                merchantId: merchant.id,
                name: input.name,
                message: input.message,
                imageUrl: input.imageUrl || null,
                targetAudience: input.targetAudience || null,
                status: input.scheduledAt ? 'scheduled' : 'draft',
                scheduledAt: (input.scheduledAt || null) as any,
                sentCount: 0,
                totalRecipients: 0,
            });

            return campaign;
        }),

    // Update campaign
    update: protectedProcedure
        .input(z.object({
            id: z.number(),
            name: z.string().trim().min(1).max(255).optional(),
            message: z.string().trim().min(1).max(3800).optional(),
            imageUrl: campaignImageUrlSchema.optional(),
            targetAudience: z.string().max(1000).refine(isValidCampaignTargetAudience).optional(),
            scheduledAt: z.date().optional(),
        }).strict())
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            if (campaign.status === 'completed' || campaign.status === 'sending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit campaign in current status' });
            }

            const { id, ...updateData } = input;
            // @ts-ignore
            await updateCampaign(id, updateData);

            return { success: true };
        }),

    // FIX #4: Delete campaign — real DELETE instead of soft-delete to failed
    delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            // Cannot delete a campaign that is currently sending
            if (campaign.status === 'sending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete a campaign that is currently being sent' });
            }

            // Real delete — removes campaign and its logs
            await deleteCampaign(input.id);
            return { success: true };
        }),

    // Durable send: consent-gated recipients are committed to an outbox in the
    // same transaction that claims the campaign. Provider I/O never runs here.
    send: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            if (!['draft', 'scheduled'].includes(campaign.status)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already sent or in progress' });
            }

            const instance = await getPrimaryWhatsAppInstance(merchant.id);
            if (!instance || instance.status !== 'active') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active WhatsApp instance found' });
            }

            const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'An active subscription is required' });
            }

            const conversations = await getConversationsByMerchantId(merchant.id);
            let targeted: typeof conversations;
            try {
                targeted = filterCampaignAudience(conversations, campaign.targetAudience);
            } catch (error) {
                if (error instanceof CampaignTargetingError) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign targeting must be reviewed before sending' });
                }
                throw error;
            }

            const phoneSet = new Set<string>();
            const uniqueRecipients: typeof targeted = [];
            for (const conv of targeted) {
                const phone = normalizeCampaignPhone(conv.customerPhone);
                if (phone && !phoneSet.has(phone)) {
                    phoneSet.add(phone);
                    uniqueRecipients.push(conv);
                }
            }

            if (uniqueRecipients.length === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'No customers match the targeting criteria' });
            }

            let eligibleRecipients: Array<(typeof uniqueRecipients)[number] & { canonicalPhone: string }>;
            let blockedRecipients = 0;
            let guardWarnings: string[] = [];
            try {
                const guard = await filterCampaignRecipients(
                    merchant.id,
                    uniqueRecipients.map(recipient => recipient.customerPhone),
                );
                const allowed = new Set(guard.allowed);
                eligibleRecipients = uniqueRecipients.flatMap(recipient => {
                    const phone = normalizeCampaignPhone(recipient.customerPhone);
                    if (!phone || !allowed.has(phone)) return [];
                    allowed.delete(phone);
                    return [{ ...recipient, canonicalPhone: phone }];
                });
                blockedRecipients = guard.blocked.length;
                guardWarnings = guard.warnings;
            } catch (error) {
                if (error instanceof CampaignSuppressionUnavailableError) {
                    throw new TRPCError({
                        code: 'SERVICE_UNAVAILABLE',
                        message: 'تعذر التحقق من الموافقة التسويقية أو قائمة الإلغاء؛ لم تُرسل الحملة',
                    });
                }
                throw error;
            }

            if (eligibleRecipients.length === 0) {
                throw new TRPCError({
                    code: 'PRECONDITION_FAILED',
                    message: 'لا يوجد مستلم مؤهل بعد تطبيق الموافقة وإلغاء الاشتراك وحدود الإرسال',
                });
            }

            try {
                await enqueueCampaignDeliveries({
                    campaignId: input.id,
                    merchantId: merchant.id,
                    recipients: eligibleRecipients.map(recipient => ({
                        customerId: recipient.id,
                        phone: recipient.canonicalPhone,
                    })),
                });
            } catch (error) {
                if (error instanceof CampaignDispatchConflictError) {
                    throw new TRPCError({ code: 'CONFLICT', message: 'Campaign was already claimed for delivery' });
                }
                throw error;
            }

            return {
                success: true,
                message: 'Campaign was queued for durable delivery',
                totalRecipients: eligibleRecipients.length,
                blockedRecipients,
                warnings: guardWarnings,
            };
        }),

    // FIX #9: Get send progress for live tracking
    getSendProgress: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            const delivery = await getCampaignDeliveryProgress(input.id, campaign.merchantId);
            return {
                status: campaign.status,
                sentCount: campaign.sentCount,
                totalRecipients: campaign.totalRecipients,
                progress: campaign.totalRecipients > 0
                    ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
                    : 0,
                awaiting: delivery.awaiting,
                acceptedByProvider: delivery.sent,
                suppressed: delivery.suppressed,
                needsReview: delivery.needsReview,
            };
        }),

    // Campaign statistics. `sentCount` records provider acceptance, not a
    // delivery receipt or a customer read receipt.
    getStats: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const campaigns = await getCampaignsByMerchantId(merchant.id);
        const totalCampaigns = campaigns.length;
        const completedCampaigns = campaigns.filter(c => c.status === 'completed');
        const totalSent = completedCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
        const totalRecipients = completedCampaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);

        const providerAcceptanceRate = totalRecipients > 0 ? (totalSent / totalRecipients) * 100 : 0;
        const unconfirmedCount = Math.max(0, totalRecipients - totalSent);

        return {
            totalCampaigns,
            completedCampaigns: completedCampaigns.length,
            activeCampaigns: campaigns.filter(c => c.status === 'sending' || c.status === 'scheduled').length,
            draftCampaigns: campaigns.filter(c => c.status === 'draft').length,
            totalAcceptedByProvider: totalSent,
            totalUnconfirmed: unconfirmedCount,
            providerAcceptanceRate: Math.round(providerAcceptanceRate * 10) / 10,
        };
    }),

    // Get campaign report with logs
    getReport: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            const { logs, stats } = await getCampaignLogsWithStats(input.id);

            return {
                campaign,
                logs,
                stats,
            };
        }),

    // Timeline used by the merchant reports page. The only currently provable
    // event is provider acceptance; delivery/read require receipt projection.
    getTimelineData: protectedProcedure
        .input(z.object({
            days: z.number().int().min(1).max(365).default(30),
        }).strict())
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return getCampaignAcceptanceTimeline(merchant.id, input.days);
        }),

    // Filter customers for targeting (migrated from legacy router)
    filterCustomers: protectedProcedure
        .input(z.object({
            lastActivityDays: z.number().optional(),
            purchaseCountMin: z.number().optional(),
            purchaseCountMax: z.number().optional(),
        }))
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const conversations = await getConversationsByMerchantId(merchant.id);
            let filtered = conversations;

            if (input.lastActivityDays) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - input.lastActivityDays);
                filtered = filtered.filter(c =>
                    c.lastActivityAt && new Date(c.lastActivityAt) >= cutoffDate
                );
            }

            if (input.purchaseCountMin !== undefined) {
                filtered = filtered.filter(c => c.purchaseCount >= input.purchaseCountMin!);
            }
            if (input.purchaseCountMax !== undefined) {
                filtered = filtered.filter(c => c.purchaseCount <= input.purchaseCountMax!);
            }

            return {
                customers: filtered,
                count: filtered.length,
            };
        }),

    // Main dashboard stats
    getStats2: protectedProcedure
        .query(async ({ ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getDashboardStats } = await import('./dashboard-analytics');
            return await getDashboardStats(merchant.id);
        }),
});

export type CampaignsRouter = typeof campaignsRouter;
