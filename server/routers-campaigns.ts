import { campaignListInput } from '../shared/campaign-workspace';
import { campaignPerformanceInput } from '../shared/campaign-performance';
import { campaignReportInput,campaignReportExportInput } from '../shared/campaign-report';
import { campaignDetailsInput } from '../shared/campaign-details';
import { readCampaignDetails,CampaignDetailsMissingError,CampaignDetailsUnavailableError } from './campaign-details';
import { readCampaignReport,readCampaignReportExport,CampaignReportMissingError,CampaignReportUnavailableError,CampaignReportExportLimitError } from './campaign-report';
import { hasPermission } from './_core/permissions';
import { readCampaignWorkspace, readCampaignStatistics, readCampaignPerformance, CampaignWorkspaceUnavailableError } from './campaign-workspace';
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
import { protectedProcedure, permissionProcedure, router } from "./_core/trpc";
import { formatDateForDB } from './db/connection';
import {
  createCampaign,
  deleteCampaign,
  getActiveSubscriptionByMerchantId,
  getAllCampaignsWithMerchants,
  getCampaignById,
  getCampaignLogsWithStats,
  getCampaignsByMerchantId,
  getMerchantById,
  getPrimaryWhatsAppInstance,
  updateEditableCampaign,
} from './db';
import {
  CampaignSuppressionUnavailableError,
  filterCampaignRecipients,
  normalizeCampaignPhone,
} from './automation/campaign-guard';
import {
  acknowledgeCampaignManualReviews,
  CampaignReviewScopeError,
  CampaignDispatchConflictError,
  CampaignTargetingError,
  enqueueCampaignDeliveries,
  getCampaignAcceptanceTimeline,
  getCampaignDeliveryProgress,
  getCampaignManualReviewSummary,
  isValidCampaignTargetAudience,
} from './automation/campaign-delivery-outbox';

import { campaignAudienceSchema, parseCampaignAudience } from '../shared/campaign-audience';
import { CampaignAudienceLimitError, readCampaignAudience, requireCompleteCampaignAudience } from './campaign-audience';
import { campaignDefinitionKey } from './campaign-definition';
import { assertCampaignContent, CampaignContentError } from './campaign-content';
import { CampaignCapacityUnavailableError } from './campaign-capacity';

const campaignImageUrlSchema = z.string().url().max(500).refine(value => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
}, { message: 'Campaign images must use a public HTTPS URL' });

const campaignIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const campaignDefinitionSchema = z.string().regex(/^[a-f0-9]{64}$/);

function requireCampaignContent(message: unknown, imageUrl: unknown): void {
    try { assertCampaignContent(message, imageUrl); }
    catch (error) {
        if (error instanceof CampaignContentError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        throw error;
    }
}

// Validate at the server boundary as API clients can bypass the campaign form.
const campaignScheduleSchema = z.date()
    .max(new Date('2038-01-19T03:14:07Z'), { message: 'موعد الحملة خارج النطاق المدعوم' })
    .refine(value => value.getTime() > Date.now(), { message: 'اختر موعدًا للحملة في المستقبل' });

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx });
});

export const campaignsRouter = router({
    detailsWorkspace: permissionProcedure('analytics.read').input(campaignDetailsInput).query(async ({ctx,input})=>{
        try{return {...await readCampaignDetails(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'campaigns.manage')};}
        catch(error){if(error instanceof CampaignDetailsMissingError)throw new TRPCError({code:'NOT_FOUND',message:'Campaign not found'});if(error instanceof CampaignDetailsUnavailableError)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Campaign details unavailable'});throw error;}
    }),
    reportExport: permissionProcedure('analytics.read').input(campaignReportExportInput).query(async ({ctx,input})=>{
        try{return {...await readCampaignReportExport(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'campaigns.manage')};}
        catch(error){if(error instanceof CampaignReportMissingError)throw new TRPCError({code:'NOT_FOUND',message:'تقرير الحملة غير متاح.'});if(error instanceof CampaignReportExportLimitError)throw new TRPCError({code:'PAYLOAD_TOO_LARGE',message:'حدد فلاتر أدق لتصدير ما لا يزيد على 10000 سجل.'});if(error instanceof CampaignReportUnavailableError)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'تعذر تصدير التقرير. حاول مجددًا.'});throw error;}
    }),
    reportWorkspace: permissionProcedure('analytics.read').input(campaignReportInput).query(async ({ctx,input})=>{
        try{return {...await readCampaignReport(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'campaigns.manage')};}
        catch(error){if(error instanceof CampaignReportMissingError)throw new TRPCError({code:'NOT_FOUND',message:'تقرير الحملة غير متاح.'});if(error instanceof CampaignReportUnavailableError)throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'تعذر تحميل التقرير. حاول مجددًا.'});throw error;}
    }),
    performanceSnapshot: permissionProcedure('analytics.read').input(campaignPerformanceInput).query(async ({ctx,input}) => {
        try { return await readCampaignPerformance(ctx.user.id,ctx.merchantId,input); }
        catch(error) { if(error instanceof CampaignWorkspaceUnavailableError) throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'تعذر تحميل أداء الحملات. حاول مجددًا.'}); throw error; }
    }),
    workspace: permissionProcedure('analytics.read').input(campaignListInput).query(async ({ctx,input}) => {
        try { return {...await readCampaignWorkspace(ctx.user.id,ctx.merchantId,input),canManage:hasPermission(ctx.merchantRole,'campaigns.manage')}; }
        catch(error) { if(error instanceof CampaignWorkspaceUnavailableError) throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'تعذر تحميل الحملات. حاول مجددًا.'}); throw error; }
    }),
    // Get all campaigns for current merchant
    list: permissionProcedure('analytics.read').query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
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
    getById: permissionProcedure('analytics.read')
        .input(z.object({ id: campaignIdSchema }).strict())
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            return campaign;
        }),

    // Create new campaign — targetAudience is now stored as JSON
    create: permissionProcedure('campaigns.manage')
        .input(z.object({
            name: z.string().trim().min(1).max(255),
            message: z.string().trim().min(1).max(3800),
            imageUrl: campaignImageUrlSchema.optional(),
            targetAudience: z.string().max(1000).refine(isValidCampaignTargetAudience).optional(),
            scheduledAt: campaignScheduleSchema.optional(),
        }).strict())
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            if (merchant.status !== 'active') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
            }

            requireCampaignContent(input.message, input.imageUrl);
            const campaign = await createCampaign({
                merchantId: merchant.id,
                name: input.name,
                message: input.message,
                imageUrl: input.imageUrl || null,
                targetAudience: input.targetAudience || null,
                status: input.scheduledAt ? 'scheduled' : 'draft',
                scheduledAt: input.scheduledAt ? formatDateForDB(input.scheduledAt) : null,
                sentCount: 0,
                totalRecipients: 0,
            });

            return campaign;
        }),

    // Update campaign
    update: permissionProcedure('campaigns.manage')
        .input(z.object({
            id: campaignIdSchema,
            expectedDefinition: campaignDefinitionSchema.optional(),
            name: z.string().trim().min(1).max(255).optional(),
            message: z.string().trim().min(1).max(3800).optional(),
            imageUrl: campaignImageUrlSchema.nullable().optional(),
            targetAudience: z.string().max(1000).refine(isValidCampaignTargetAudience).optional(),
            scheduledAt: campaignScheduleSchema.nullable().optional(),
        }).strict().refine(value => Object.entries(value).some(([key, field]) => !['id', 'expectedDefinition'].includes(key) && field !== undefined), {
            message: 'حدد بيانات الحملة المطلوب تعديلها',
        }))
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            if (!['draft', 'scheduled'].includes(campaign.status)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit campaign in current status' });
            }

            const { id, scheduledAt, expectedDefinition, ...updateData } = input;
            // Changing the schedule must also change the queue eligibility.
            const scheduleStatus = scheduledAt !== undefined
                ? { status: scheduledAt ? 'scheduled' as const : 'draft' as const,
                    scheduledAt: scheduledAt ? formatDateForDB(scheduledAt) : null }
                : {};
            let saved: boolean;
            try {
                saved = expectedDefinition === undefined
                    ? await updateEditableCampaign(id, merchant.id, { ...updateData, ...scheduleStatus })
                    : await updateEditableCampaign(id, merchant.id, { ...updateData, ...scheduleStatus }, expectedDefinition);
            } catch (error) {
                if (error instanceof CampaignContentError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
                throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Campaign could not be saved' });
            }
            if (!saved) throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت حالة الحملة. حدّث الصفحة قبل تعديلها.' });

            return { success: true };
        }),

    // FIX #4: Delete campaign — real DELETE instead of soft-delete to failed
    delete: permissionProcedure('campaigns.manage')
        .input(z.object({ id: campaignIdSchema }).strict())
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            // Cannot delete a campaign that is currently sending
            if (campaign.status === 'sending') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete a campaign that is currently being sent' });
            }

            // Real delete — removes campaign and its logs
            const removed = await deleteCampaign(input.id, merchant.id);
            if (!removed) throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت حالة الحملة أو لديها إرسال غير محسوم. حدّث الصفحة وراجع حالتها قبل حذفها.' });
            return { success: true };
        }),

    // Durable send: consent-gated recipients are committed to an outbox in the
    // same transaction that claims the campaign. Provider I/O never runs here.
    send: permissionProcedure('campaigns.manage')
        .input(z.object({ id: campaignIdSchema, expectedDefinition: campaignDefinitionSchema.optional() }).strict())
        .mutation(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
                throw new TRPCError({ code: 'FORBIDDEN' });
            }

            if (!['draft', 'scheduled'].includes(campaign.status)) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already sent or in progress' });
            }

            let definition: string;
            try { definition = campaignDefinitionKey(campaign); }
            catch { throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'Campaign details unavailable'}); }
            // Compatibility callers can omit this during migration. New review
            // screens submit the digest of the definition actually displayed.
            if (input.expectedDefinition && input.expectedDefinition !== definition) {
                throw new TRPCError({code:'CONFLICT',message:'Campaign changed; review the current details before sending'});
            }

            requireCampaignContent(campaign.message, campaign.imageUrl);

            const instance = await getPrimaryWhatsAppInstance(merchant.id);
            if (!instance || instance.status !== 'active') {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active WhatsApp instance found' });
            }

            const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
            if (!subscription) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'An active subscription is required' });
            }

            let uniqueRecipients;
            try {
                parseCampaignAudience(campaign.targetAudience);
                uniqueRecipients = requireCompleteCampaignAudience(await readCampaignAudience(merchant.id, campaign.targetAudience));
            } catch (error) {
                if (error instanceof CampaignTargetingError) {
                    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign targeting must be reviewed before sending' });
                }
                if (error instanceof CampaignAudienceLimitError) {
                    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
                }
                throw error;
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
                if (guard.blocked.some(row => row.reason === 'quiet_hours' || row.reason === 'rate_limit')) {
                    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر بدء الحملة كاملة بسبب ساعات الهدوء أو حد الإرسال. لم يُرسل أي جزء منها؛ راجع الجمهور أو حاول لاحقًا.' });
                }
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
                if (error instanceof CampaignCapacityUnavailableError) {
                    throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'تعذر التحقق من حصة رسائل الاشتراك. لم يبدأ إرسال الحملة.' });
                }
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
                    expectedDefinition: definition,
                    recipients: eligibleRecipients.map(recipient => ({
                        customerId: recipient.id,
                        phone: recipient.canonicalPhone,
                    })),
                });
            } catch (error) {
                if (error instanceof CampaignContentError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
                if (error instanceof CampaignDispatchConflictError) {
                    throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت الحملة أثناء التحضير. حدّثها وراجعها قبل الإرسال.' });
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
    getSendProgress: permissionProcedure('analytics.read')
        .input(z.object({ id: campaignIdSchema }).strict())
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
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

    // Acknowledgement closes uncertain outcomes without deleting or resending.
    acknowledgeManualReview: permissionProcedure('campaigns.manage')
        .input(z.object({ id: campaignIdSchema }).strict())
        .mutation(async ({ input, ctx }) => {
            try {
                return await acknowledgeCampaignManualReviews(input.id, ctx.merchantId);
            } catch (error) {
                if (error instanceof CampaignReviewScopeError) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
                }
                throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Campaign review unavailable' });
            }
        }),

    getManualReviewSummary: permissionProcedure('analytics.read').query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getCampaignManualReviewSummary(merchant.id);
    }),

    // Campaign statistics. `sentCount` records provider acceptance, not a
    // delivery receipt or a customer read receipt.
    getStats: permissionProcedure('analytics.read').query(async ({ ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        try { return await readCampaignStatistics(merchant.id); }
        catch(error) { if(error instanceof CampaignWorkspaceUnavailableError) throw new TRPCError({code:'SERVICE_UNAVAILABLE',message:'تعذر تحميل إحصاءات الحملات. حاول مجددًا.'}); throw error; }
    }),

    // Get campaign report with logs
    getReport: permissionProcedure('analytics.read')
        .input(z.object({ id: campaignIdSchema }).strict())
        .query(async ({ input, ctx }) => {
            const campaign = await getCampaignById(input.id);
            if (!campaign) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
            }

            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant || campaign.merchantId !== merchant.id) {
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
    getTimelineData: permissionProcedure('analytics.read')
        .input(z.object({
            days: z.number().int().min(1).max(365).default(30),
        }).strict())
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return getCampaignAcceptanceTimeline(merchant.id, input.days);
        }),

    // Filter customers for targeting (migrated from legacy router)
    filterCustomers: permissionProcedure('campaigns.manage')
        .input(campaignAudienceSchema)
        .query(async ({ input, ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            return readCampaignAudience(merchant.id, JSON.stringify(input));
        }),

    // Main dashboard stats
    getStats2: permissionProcedure('analytics.read')
        .query(async ({ ctx }) => {
            const merchant = await getMerchantById(ctx.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
            }

            const { getDashboardStats } = await import('./dashboard-analytics');
            return await getDashboardStats(merchant.id);
        }),
});

export type CampaignsRouter = typeof campaignsRouter;
