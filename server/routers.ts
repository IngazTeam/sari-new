import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { insightsRouter } from "./routers-insights";
import { offersRouter } from "./routers-offers";
import { promotionsRouter } from "./routers-promotions";
import { mediaRouter } from "./routers-media";
import { performanceRouter } from "./routers-performance";
import { googleAuthRouter } from "./routers-google-auth";
import { sheetsRouter } from "./routers-sheets";
import { loyaltyRouter } from "./routers-loyalty";
import { aiSuggestionsRouter } from "./routers-ai-suggestions";
import { zidRouter } from "./integrations/zid";
import { calendlyRouter } from "./integrations/calendly";
import { websiteAnalysisRouter } from "./routers-website-analysis";
import { analysisRouter } from "./routers/analysis";
import { setupWizardRouter } from "./routers-setup-wizard";
import {
  subscriptionPlansRouter,
  subscriptionAddonsRouter,
  merchantSubscriptionRouter,
  merchantAddonsRouter,
  paymentRouter,
  tapSettingsRouter,
  adminSubscriptionsRouter,
} from "./routers/subscriptions";
import { subscriptionSignupRouter } from "./routers/subscription-signup";
import { accountDataRouter } from './routers-account-data';
import { notificationsRouter } from "./routers-notifications";
import { notificationManagementRouter } from "./routers-notification-management";
import { smartNotificationsRouter } from "./routers-smart-notifications";
import { syncGreenAPIData } from "./data-sync/green-api-sync";
// New modular routers
import { servicesRouter } from "./routers-services";
import { serviceCategoriesRouter } from "./routers-service-categories";
import { servicePackagesRouter } from "./routers-service-packages";
import { bookingsRouter } from "./routers-bookings";
import { bookingReviewsRouter } from "./routers-booking-reviews";
import { googleOAuthSettingsRouter } from "./routers-google-oauth-settings";
import { reportsRouter } from "./routers-reports";
import { pushRouter } from "./routers-push";
import { smtpRouter } from "./routers-smtp";
import { couponsRouter } from "./routers-coupons";
import { usageRouter } from "./routers-usage";
import { trialRouter } from "./routers-trial";
import { emailRouter } from "./routers-email";
import { integrationsRouter } from "./routers-integrations";
import { subscriptionReportsRouter } from "./routers-subscription-reports";
import { weeklyReportRouter } from "./routers-weekly-report";
import { templateTranslationsRouter } from "./routers-template-translations";
import { userNotificationsRouter } from "./routers-user-notifications";
import { productsRouter } from "./routers-products";
import { woocommerceRouter } from "./woocommerce_router";
import { knowledgeDocsRouter } from "./routers-knowledge-docs";
import { sariBrainRouter } from "./routers-sari-brain";
import { salesPipelineRouter } from "./routers-sales-pipeline";
import { virtualAgentsRouter } from "./routers-virtual-agents";
import { aiSettingsRouter } from "./routers-ai-settings";
import { aiDirectivesRouter } from "./routers-ai-directives";
import { googleAnalyticsRouter } from "./routers-google-analytics";
import { dashboardRouter } from "./routers-dashboard";
import { merchantsRouter } from "./routers-merchants";
import { monitorRouter } from "./routers-monitor";
import { botSettingsRouter } from "./routers-bot-settings";
import { adminAiAnalyticsRouter } from "./routers-admin-ai-analytics";
import { emailTemplatesRouter } from "./routers-email-templates";
import { teamRouter } from "./routers-team";
import { byaanRouter } from "./routers-byaan";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import type { WhatsAppRequest } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { notificationPreferences } from '../drizzle/schema';
import { containsUnverifiedActionClaim } from './ai/transactional-truth';
import { decodeValidatedAudio } from './utils/audio';
import { completeMetaEmbeddedSignup as completeMetaEmbeddedSignupService } from './channels/whatsapp/meta-embedded-signup';
import {
  approveWhatsAppConnectionRequest,
  approveWhatsAppRequest,
  cancelAppointment,
  cancelOrder,
  checkAppointmentConflict,
  checkBookingConflict,
  claimReward,
  completeWhatsAppRequest,
  createABTest,
  createAppointment,
  createBooking,
  createBookingReview,
  createCampaign,
  createCampaignLog,
  createDiscountCode,
  createDiscountCoupon,
  createGoogleIntegration,
  createMessage,
  createNotification,
  createOccasionCampaign,
  createOrUpdatePaymentGateway,
  createPlan,
  createPlanChangeLog,
  createProduct,
  createQuickResponse,
  createReferral,
  createReward,
  createSallaConnection,
  createScheduledMessage,
  createService,
  createServiceCategory,
  createServicePackage,
  createStaffMember,
  createSubscription,
  createTemplateTranslation,
  createTestConversation,
  createWhatsAppConnectionRequest,
  createWhatsAppInstance,
  createWhatsAppRequest,
  deactivateDiscountCoupon,
  declareABTestWinner,
  deleteBooking,
  deleteCampaign,
  deleteDiscountCode,
  deleteGoogleIntegration,
  deleteKeywordAnalysis,
  deleteQuickResponse,
  deleteSallaConnection,
  deleteScheduledMessage,
  deleteService,
  deleteServiceCategory,
  deleteServicePackage,
  deleteStaffMember,
  deleteTemplateTranslation,
  deleteWhatsAppConnectionRequest,
  deleteWhatsAppInstance,
  generateReferralCode,
  getABTestById,
  getABTests,
  getAbandonedCartById,
  getAbandonedCartsByMerchantId,
  getActiveABTestForKeyword,
  getActiveStaffByMerchant,
  getActiveSubscriptionByMerchantId,
  getActiveWhatsAppInstancesCount,
  getAllBusinessTemplates,
  getAllCampaignsWithMerchants,
  getAllDiscountCoupons,
  getAllInvoices,
  getAllPaymentGateways,
  getAllPlanChangeLogs,
  getAllPlans,
  getAllWhatsAppConnectionRequests,
  getAllWhatsAppRequests,
  getAppointmentById,
  getAppointmentStats,
  getAppointmentsByMerchant,
  getAvailableTimeSlots,
  getBookingById,
  getBookingReviews,
  getBookingReviewById,
  getBookingStats,
  getBookingsByCustomer,
  getBookingsByMerchant,
  getBookingsByService,
  getBotSettings,
  getCampaignById,
  getCampaignLogsWithStats,
  getCampaignsByMerchantId,
  getConversationById,
  getConversationCountByMerchantId,
  getConversationsByMerchantId,
  getConversionRate,
  getCouponUsageCountByMerchant,
  getCustomerByPhone,
  getCustomerReviewById,
  getCustomerReviewsByMerchantId,
  getCustomerStats,
  getCustomersByMerchant,
  getDailyMessageCount,
  getDb,
  getDiscountCodeById,
  getDiscountCodesByMerchantId,
  getDiscountCouponByCode,
  getExpiringWhatsAppInstances,
  getGoogleIntegration,
  getInvoiceById,
  getInvoicesByMerchantId,
  getKeywordAnalysisById,
  getKeywordStats,
  getMerchantById,
  getMerchantByUserId,
  getMerchantCurrentSubscription,
  getMerchantPaymentSettings,
  getMerchantSentimentStats,
  getMessageStats,
  getMessagesByConversationId,
  getNewKeywords,
  getNotificationTemplateById,
  getNotificationTemplatesByMerchantId,
  getOccasionCampaignById,
  getOccasionCampaignByTypeAndYear,
  getOccasionCampaignsByMerchantId,
  getOccasionCampaignsStats,
  getOrCreatePersonalitySettings,
  getOrderById,
  getOrderNotificationsByMerchantId,
  getOrderNotificationsByOrderId,
  getOrderStats,
  getOrdersByMerchantId,
  getOrdersWithFilters,
  getPaymentByTransactionId,
  getPeakHours,
  getPendingWhatsAppRequests,
  getPlanById,
  getPlanChangeLogs,
  getPrimaryWhatsAppInstance,
  getProductsByMerchantId,
  getQuickResponseById,
  getQuickResponses,
  getReferralCodeByCode,
  getReferralCodeByMerchantId,
  getReferralStats,
  getReferralsWithDetails,
  getReviewsByService,
  getRewardById,
  getRewardsByMerchantId,
  getSallaConnectionByMerchantId,
  getScheduledMessages,
  getServiceById,
  getServiceCategoriesByMerchant,
  getServiceCategoryById,
  getServicePackageById,
  getServicePackagesByMerchant,
  getServiceRatingStats,
  getServicesByCategory,
  getServicesByMerchant,
  getStaffMemberById,
  getStaffMembersByMerchant,
  getSubscriptionPlanById,
  getSyncLogsByMerchantId,
  getTemplateTranslation,
  getTemplateTranslationsByTemplateId,
  getTopProducts,
  getTrySariAnalyticsBySessionId,
  getTrySariAnalyticsStats,
  getTrySariDailyData,
  getUserByEmail,
  getUserById,
  getWeeklySentimentReportById,
  getWeeklySentimentReports,
  getWhatsAppConnectionRequestById,
  getWhatsAppConnectionRequestByMerchantId,
  getActiveInstanceByPhoneNumber,
  getWhatsAppInstanceById,
  getWhatsAppInstanceByInstanceId,
  getWhatsAppInstancesByMerchantId,
  getWhatsAppRequestById,
  getWhatsAppRequestsByMerchantId,
  getWhatsappConnectionByMerchantId,
  incrementReferralCount,
  markAbandonedCartRecovered,
  markConvertedToSignup,
  markSignupPromptShown,
  markTestConversationAsDeal,
  pauseABTest,
  rejectWhatsAppConnectionRequest,
  rejectWhatsAppRequest,
  replyToReview,
  resumeABTest,
  saveTestMessage,
  searchCustomers,
  setWhatsAppInstanceAsPrimary,
  shouldBotRespond,
  toggleScheduledMessage,
  updateBooking,
  updateBotSettings,
  updateCampaign,
  updateConversation,
  updateCustomerReview,
  updateDiscountCode,
  updateDiscountCoupon,
  updateGoogleIntegration,
  updateKeywordStatus,
  updateMerchant,
  updateNotificationTemplate,
  updateOccasionCampaign,
  updateOrderStatus,
  updatePlan,
  updateQuickResponse,
  updateSallaConnection,
  updateSariPersonalitySettings,
  updateScheduledMessage,
  updateService,
  updateServiceCategory,
  updateServicePackage,
  updateStaffMember,
  updateSubscription,
  updateTemplateTranslation,
  updateUser,
  updateUserLastSignedIn,
  updateWhatsAppConnectionRequest,
  updateWhatsAppInstance,
  updateWhatsAppRequest,
  upsertMerchantPaymentSettings,
  upsertTrySariAnalytics,
  releaseTrySariMessageSlot,
  reserveTrySariMessageSlot,
  validatePasswordResetToken,
} from './db';
import {
  PAYMENT_LINK_ID_PATTERN,
  PAYMENT_PROVIDER_REFERENCE_PATTERN,
  TAP_CHARGE_ID_PATTERN,
  toPublicOrderPaymentStatus,
  toPublicSubscriptionPaymentStatus,
} from '@shared/subscription-payment-status';
import { registerMerchantAccount } from './accounts/lifecycle';
import {
  consumePasswordResetTokenAndUpdatePassword,
  reservePasswordResetAttempt,
} from './accounts/password-reset-security';
import { deliverEmailVerification } from './accounts/email-verification-delivery';
import {
  consumeEmailVerificationToken,
  EMAIL_VERIFICATION_TOKEN_PATTERN,
} from './accounts/email-verification-security';
import * as seoDb from './seo-functions';
import bcrypt from 'bcryptjs';
import { createSessionToken } from './_core/auth';
import { THIRTY_DAYS_MS } from '@shared/const';
import { z } from 'zod';
import { toPublicWhatsAppConnectionRequest, toPublicWhatsAppInstance, toPublicWhatsAppRequest } from './whatsapp/public-records';
import { toPublicPaymentGateway } from './security/secrets';

const passwordResetEmailSchema = z.string()
  .trim()
  .email()
  .max(320)
  .transform(value => value.toLowerCase());
const passwordResetTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid reset token');
const replacementPasswordSchema = z.string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');
const PASSWORD_RESET_RESPONSE = {
  success: true,
  message: 'إذا كان البريد الإلكتروني مسجلاً، فستصلك رسالة بالتعليمات.',
} as const;

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  accountData: accountDataRouter,
  // User Notifications — modularized to routers-user-notifications.ts
  notifications: userNotificationsRouter,
  system: systemRouter,

  // Merchants — modularized to routers-merchants.ts
  merchants: merchantsRouter,

  // Bot Settings — takeover, groups, working hours (modularized)
  botSettings: botSettingsRouter,

  // Integrations — platform connections (Byaan, Salla, Zid, etc.)
  integrations: integrationsRouter,

  auth: router({
    me: protectedProcedure.query(opts => {
      const { password, openId, ...safeUser } = opts.ctx.user as any;
      return safeUser;
    }),

    // Login with email and password
    login: publicProcedure
      .input(z.object({
        email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
        password: z.string().min(1).max(128),
      }))
      .mutation(async ({ input, ctx }) => {
        // SECURITY: Rate limit login attempts (5 per 15 min per IP)
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const clientIp = String(
          (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown',
        ).slice(0, 45);
        const loginCheck = checkRateLimit(`login_ip:${clientIp}`, 5, 15 * 60 * 1000);
        if (!loginCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'محاولات كثيرة. حاول بعد 15 دقيقة.' });
        }

        const {
          clearSuccessfulLoginAttempts,
          DUMMY_PASSWORD_HASH,
          reserveLoginAttempt,
        } = await import('./accounts/login-security');
        const reservation = await reserveLoginAttempt({
          email: input.email,
          ipAddress: clientIp,
        });
        if (!reservation.allowed) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'محاولات كثيرة. حاول بعد 15 دقيقة.',
          });
        }

        const user = await getUserByEmail(input.email);
        const isValidPassword = await bcrypt.compare(
          input.password,
          user?.password || DUMMY_PASSWORD_HASH,
        );

        if (!user || !user.password || user.accountStatus !== 'active' || !isValidPassword) {
          console.warn('[Auth] Login rejected', {
            reason: 'invalid_credentials',
            requestId: ctx.req.headers['x-request-id'],
          });
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }

        // Update last signed in
        await updateUserLastSignedIn(user.id);

        // Create session token using SDK
        const sessionToken = await createSessionToken(String(user.id), {
          name: user.name || '',
          email: user.email || '',
          expiresInMs: THIRTY_DAYS_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);

        await clearSuccessfulLoginAttempts(input.email);
        // HttpOnly cookie is the only browser credential surface.
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });
        return {
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        };
      }),

    // Email Verification
    emailVerification: router({
      sendVerificationEmail: protectedProcedure
        .mutation(async ({ ctx }) => {
          if (!ctx.user.email) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد بريد مرتبط بالحساب' });
          }
          const clientIp = String(ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown').slice(0, 45);
          const result = await deliverEmailVerification({
            userId: ctx.user.id,
            email: ctx.user.email,
            ipAddress: clientIp,
          });
          if (!result.delivered) {
            if ('retryAfterSeconds' in result) {
              throw new TRPCError({
                code: 'TOO_MANY_REQUESTS',
                message: 'طلبات كثيرة لإرسال رابط التحقق. حاول لاحقاً.',
                cause: { remainingTime: result.retryAfterSeconds },
              });
            }
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'تعذر إرسال رابط التحقق حالياً. حاول لاحقاً.',
            });
          }

          return {
            success: true,
            alreadyVerified: result.alreadyVerified,
            message: result.alreadyVerified
              ? 'البريد الإلكتروني مؤكد مسبقاً'
              : 'تم إرسال رابط التأكيد إلى بريدك الإلكتروني',
          };
        }),

      verifyEmail: publicProcedure
        .input(z.object({
          token: z.string().length(64).regex(EMAIL_VERIFICATION_TOKEN_PATTERN),
        }))
        .mutation(async ({ input, ctx }) => {
          const { checkRateLimit } = await import('./_core/rateLimiter');
          const clientIp = String(ctx.req.ip || ctx.req.socket?.remoteAddress || 'unknown').slice(0, 45);
          const check = checkRateLimit(`email_verify_consume_ip:${clientIp}`, 30, 15 * 60 * 1000);
          if (!check.allowed) {
            throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'طلبات كثيرة. حاول لاحقاً.' });
          }
          const consumed = await consumeEmailVerificationToken(input.token);
          if (!consumed) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'رابط التحقق غير صالح أو منتهي الصلاحية',
            });
          }
          return { success: true };
        }),
    }),

    // Sign up with email and password
    signup: publicProcedure
      .input(z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
        password: z.string().min(8).max(128)
          .regex(/[A-Z]/, 'Password must contain an uppercase letter')
          .regex(/[0-9]/, 'Password must contain a number'),
        businessName: z.string().trim().min(2).max(255),
        phone: z.string().trim().min(9).max(20).regex(/^\+?[0-9]+$/, 'Invalid phone number'),
        acceptedTerms: z.literal(true),
        acceptedPrivacy: z.literal(true),
        marketingConsent: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // SECURITY: Rate limit signup attempts (3 per hour per IP)
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const clientIp = String(
          (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown',
        ).slice(0, 45);
        const signupCheck = checkRateLimit(`signup_ip:${clientIp}`, 3, 60 * 60 * 1000);
        if (!signupCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'عدد كبير من محاولات التسجيل. حاول لاحقاً.' });
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);
        let registration;
        try {
          registration = await registerMerchantAccount({
            name: input.name,
            email: input.email,
            passwordHash: hashedPassword,
            businessName: input.businessName,
            phone: input.phone,
            acceptedTerms: input.acceptedTerms,
            acceptedPrivacy: input.acceptedPrivacy,
            marketingConsent: input.marketingConsent,
            ipAddress: clientIp,
            userAgent: typeof ctx.req.headers['user-agent'] === 'string'
              ? ctx.req.headers['user-agent']
              : null,
          });
        } catch (error) {
          if (error instanceof Error && error.message === 'EMAIL_ALREADY_REGISTERED') {
            throw new TRPCError({ code: 'CONFLICT', message: 'تعذر إنشاء الحساب بهذه البيانات' });
          }
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'تعذر إنشاء الحساب' });
        }
        const { user, trialEndsAt } = registration;

        // Send welcome email with trial information
        try {
          const { sendWelcomeEmail } = await import('./_core/email');
          await sendWelcomeEmail({
            name: input.name,
            email: input.email,
            trialEndDate: trialEndsAt.toLocaleDateString('ar-SA', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
          });
        } catch (error) {
          console.error('[Signup] Failed to send welcome email:', error);
          // Don't fail signup if email fails
        }

        let verificationEmailSent = false;
        try {
          const verification = await deliverEmailVerification({
            userId: user.id,
            email: input.email,
            ipAddress: clientIp,
          });
          verificationEmailSent = verification.delivered;
        } catch {
          console.error('[Signup] Email verification delivery failed');
        }

        // Create session token
        const sessionToken = await createSessionToken(String(user.id), {
          name: user.name || '',
          email: user.email || '',
          expiresInMs: THIRTY_DAYS_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });

        return {
          success: true,
          verificationEmailSent,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        };
      }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });

      if (!ctx.user || !ctx.session) {
        return {
          success: true,
          sessionRevoked: false,
        } as const;
      }

      const { revokeAuthSession } = await import('./db');
      await revokeAuthSession(ctx.user.id, ctx.session.sessionId);
      return {
        success: true,
        sessionRevoked: true,
      } as const;
    }),

    // Request password reset
    requestPasswordReset: publicProcedure
      .input(z.object({
        email: passwordResetEmailSchema,
      }))
      .mutation(async ({ input, ctx }) => {
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const crypto = await import('node:crypto');
        const clientIp = String(
          (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown',
        ).slice(0, 45);
        const emailFingerprint = crypto.createHash('sha256').update(input.email).digest('hex');
        const ipLimit = checkRateLimit(`password_reset_ip:${clientIp}`, 5, 60 * 60 * 1000);
        const emailLimit = checkRateLimit(`password_reset_email:${emailFingerprint}`, 3, 10 * 60 * 1000);

        if (!ipLimit.allowed || !emailLimit.allowed) {
          const retryAfterSeconds = Math.ceil(Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs) / 1000);
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'طلبات كثيرة لإعادة التعيين. حاول لاحقاً.',
            cause: { remainingTime: retryAfterSeconds },
          });
        }

        const reservation = await reservePasswordResetAttempt({
          email: input.email,
          ipAddress: clientIp,
        });
        if (!reservation.allowed) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'طلبات كثيرة لإعادة التعيين. حاول لاحقاً.',
            cause: { remainingTime: reservation.retryAfterSeconds },
          });
        }

        const user = await getUserByEmail(input.email);

        if (!user || user.accountStatus !== 'active' || !user.email) {
          return PASSWORD_RESET_RESPONSE;
        }

        const { deliverPasswordResetForUser } = await import('./accounts/password-reset-delivery');
        const delivered = await deliverPasswordResetForUser({
          id: user.id,
          email: user.email,
          name: user.name,
        });
        if (!delivered) console.error('[Password Reset] Email delivery failed');

        return PASSWORD_RESET_RESPONSE;
      }),

    // Verify reset token
    verifyResetToken: publicProcedure
      .input(z.object({
        token: passwordResetTokenSchema,
      }))
      .query(async ({ input }) => {
        const validation = await validatePasswordResetToken(input.token);
        if (!validation.valid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'الرابط غير صالح أو منتهي الصلاحية' });
        }
        return { valid: true };
      }),

    // Reset password
    resetPassword: publicProcedure
      .input(z.object({
        token: passwordResetTokenSchema,
        newPassword: replacementPasswordSchema,
      }))
      .mutation(async ({ input }) => {
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);
        const consumed = await consumePasswordResetTokenAndUpdatePassword(input.token, hashedPassword);
        if (!consumed) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'الرابط غير صالح أو منتهي الصلاحية' });
        }

        return { success: true, message: 'تم تغيير كلمة المرور بنجاح' };
      }),

    // Update user profile
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(2).max(120).optional(),
        email: z.string().trim().email().max(320).transform(value => value.toLowerCase()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (
          input.email &&
          input.email !== ctx.user.email?.trim().toLowerCase()
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'تغيير البريد يتطلب مسار تحقق مخصص. تواصل مع الدعم حالياً.',
          });
        }
        if (input.name) {
          await updateUser(ctx.user.id, { name: input.name });
        }
        return { success: true };
      }),

  }),



  // Products Management (standalone module with uploadExcel, CSV, Google Sheets sync)
  products: productsRouter,

  // Virtual Agents — AI team personas
  virtualAgents: virtualAgentsRouter,

  // Campaign Management
  campaigns: router({
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

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        return campaign;
      }),

    // Create new campaign
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        message: z.string().min(1),
        imageUrl: z.string().url().optional(),
        targetAudience: z.string().optional(),
        scheduledAt: z.date().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check merchant status
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
        name: z.string().optional(),
        message: z.string().optional(),
        imageUrl: z.string().url().optional(),
        targetAudience: z.string().optional(),
        scheduledAt: z.date().optional(),
        status: z.enum(['draft', 'scheduled', 'sending', 'completed', 'failed']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Can't edit completed or sending campaigns
        if (campaign.status === 'completed' || campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit campaign in current status' });
        }

        const { id, ...updateData } = input;
        // @ts-ignore
        await updateCampaign(id, updateData);

        return { success: true };
      }),

    // Delete campaign
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // FIX #4: Real delete instead of soft-delete
        if (campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete a campaign that is currently being sent' });
        }
        await deleteCampaign(input.id);
        return { success: true };
      }),

    // Send campaign
    send: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Check if campaign is already sent or in progress
        if (campaign.status === 'completed' || campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already sent or in progress' });
        }

        // Get primary WhatsApp instance
        const instance = await getPrimaryWhatsAppInstance(merchant.id);
        if (!instance || instance.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active WhatsApp instance found. Please connect WhatsApp first.' });
        }

        // FIX #1: Apply targeting filters from campaign's targetAudience
        const conversations = await getConversationsByMerchantId(merchant.id);
        let targeted = conversations;
        if (campaign.targetAudience) {
          try {
            const filters = JSON.parse(campaign.targetAudience);
            if (filters.lastActivityDays) {
              const cutoff = new Date();
              cutoff.setDate(cutoff.getDate() - filters.lastActivityDays);
              targeted = targeted.filter(c => c.lastActivityAt && new Date(c.lastActivityAt) >= cutoff);
            }
            if (filters.purchaseCountMin !== undefined) {
              targeted = targeted.filter(c => c.purchaseCount >= filters.purchaseCountMin);
            }
            if (filters.purchaseCountMax !== undefined) {
              targeted = targeted.filter(c => c.purchaseCount <= filters.purchaseCountMax);
            }
          } catch { /* backward compat - non-JSON targetAudience */ }
        }

        // FIX #11: Deduplicate phone numbers
        const phoneSet = new Set<string>();
        const uniqueRecipients: typeof targeted = [];
        for (const conv of targeted) {
          if (conv.customerPhone && !phoneSet.has(conv.customerPhone)) {
            phoneSet.add(conv.customerPhone);
            uniqueRecipients.push(conv);
          }
        }
        const recipients = uniqueRecipients.map(c => c.customerPhone);

        if (recipients.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No customers match the targeting criteria' });
        }

        // Update status to sending and set total recipients
        await updateCampaign(input.id, {
          status: 'sending',
          totalRecipients: recipients.length,
        });

        // Send campaign in background
        const axios = await import('axios');
        const instancePrefix = instance.instanceId.substring(0, 4);
        const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${instance.instanceId}`;

        // FIX #2: Send with rate-limited sequential batching
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const BATCH_SIZE = 10;
        const BATCH_DELAY = 1200;

        (async () => {
          let successCount = 0;
          for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
            const batch = recipients.slice(i, i + BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (phone) => {
                const conversation = conversations.find(c => c.customerPhone === phone);
                try {
                  if (campaign.imageUrl) {
                    await axios.default.post(`${baseURL}/sendFileByUrl/${instance.token}`, {
                      chatId: `${phone}@c.us`,
                      urlFile: campaign.imageUrl,
                      fileName: 'campaign.jpg',
                      caption: campaign.message,
                    });
                  } else {
                    await axios.default.post(`${baseURL}/sendMessage/${instance.token}`, {
                      chatId: `${phone}@c.us`,
                      message: campaign.message,
                    });
                  }
                  await createCampaignLog({
                    campaignId: input.id,
                    customerId: conversation?.id || null,
                    customerPhone: phone,
                    customerName: conversation?.customerName || null,
                    status: 'success',
                    errorMessage: null,
                    sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
                  });
                  return true;
                } catch (error: any) {
                  await createCampaignLog({
                    campaignId: input.id,
                    customerId: conversation?.id || null,
                    customerPhone: phone,
                    customerName: conversation?.customerName || null,
                    status: 'failed',
                    errorMessage: error.message || 'Unknown error',
                    sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
                  });
                  return false;
                }
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled' && r.value) successCount++;
            }
            // Update progress
            await updateCampaign(input.id, { sentCount: successCount });
            if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY);
          }

          // Update campaign status
          await updateCampaign(input.id, {
            status: 'completed',
            sentCount: successCount,
          });

          console.log(`Campaign ${input.id} completed: ${successCount}/${recipients.length} sent`);

          // Notify admin about campaign completion
          try {
            const { notifyMarketingCampaign } = await import('./_core/emailNotifications');
            const user = await getUserById(merchant.userId);
            await notifyMarketingCampaign({
              merchantName: user?.name || merchant.businessName,
              businessName: merchant.businessName,
              campaignName: campaign.name,
              targetAudience: campaign.targetAudience || 'All Customers',
              recipientsCount: recipients.length,
              // @ts-ignore
              sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
              status: 'sent',
            });
          } catch (error) {
            console.error('Failed to send campaign notification:', error);
          }
        })().catch(async (error) => {
          console.error('Error sending campaign:', error);
          await updateCampaign(input.id, { status: 'failed' });
        });

        return {
          success: true,
          message: 'Campaign is being sent',
          totalRecipients: recipients.length,
        };
      }),



    // Get campaign statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const campaigns = await getCampaignsByMerchantId(merchant.id);

      // Calculate statistics
      const totalCampaigns = campaigns.length;
      const completedCampaigns = campaigns.filter(c => c.status === 'completed');
      const totalSent = completedCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
      const totalRecipients = completedCampaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);

      // FIX #3: Real delivery rate, no fake readRate
      const deliveryRate = totalRecipients > 0 ? (totalSent / totalRecipients) * 100 : 0;

      return {
        totalCampaigns,
        completedCampaigns: completedCampaigns.length,
        totalSent,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
      };
    }),

    // Get send progress for live tracking (FIX #9)
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

        return {
          status: campaign.status,
          sentCount: campaign.sentCount,
          totalRecipients: campaign.totalRecipients,
          progress: campaign.totalRecipients > 0
            ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
            : 0,
        };
      }),

    // Get timeline data for charts
    getTimelineData: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const campaigns = await getCampaignsByMerchantId(merchant.id);
        const completedCampaigns = campaigns.filter(c => c.status === 'completed');

        // Group campaigns by date
        const dateMap = new Map<string, { sent: number; delivered: number; read: number }>();

        // Initialize last N days
        const today = new Date();
        for (let i = input.days - 1; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          dateMap.set(dateStr, { sent: 0, delivered: 0, read: 0 });
        }

        // Aggregate campaign data by date
        completedCampaigns.forEach(campaign => {
          if (campaign.createdAt) {
            const dateStr = new Date(campaign.createdAt).toISOString().split('T')[0];
            const existing = dateMap.get(dateStr);
            if (existing) {
              existing.sent += campaign.sentCount || 0;
              existing.delivered += campaign.sentCount || 0;
              existing.read += 0; // No real read tracking available from WhatsApp API
            }
          }
        });

        // Convert to array format for charts
        return Array.from(dateMap.entries()).map(([date, data]) => ({
          date,
          sent: data.sent,
          delivered: data.delivered,
          read: data.read,
        }));
      }),

    // Get campaign report with logs
    getReport: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const campaign = await getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Get logs with stats
        const { logs, stats } = await getCampaignLogsWithStats(input.id);

        return {
          campaign,
          logs,
          stats,
        };
      }),

    // Filter customers for targeting
    filterCustomers: protectedProcedure
      .input(z.object({
        lastActivityDays: z.number().optional(), // 7, 30, 90
        purchaseCountMin: z.number().optional(), // 0, 1, 5
        purchaseCountMax: z.number().optional(),
        productIds: z.array(z.number()).optional(), // Filter by purchased products
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Get all conversations for this merchant
        const conversations = await getConversationsByMerchantId(merchant.id);

        // Apply filters
        let filtered = conversations;

        // Filter by last activity
        if (input.lastActivityDays) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - input.lastActivityDays);
          filtered = filtered.filter(c =>
            c.lastActivityAt && new Date(c.lastActivityAt) >= cutoffDate
          );
        }

        // Filter by purchase count
        if (input.purchaseCountMin !== undefined) {
          filtered = filtered.filter(c => c.purchaseCount >= input.purchaseCountMin!);
        }
        if (input.purchaseCountMax !== undefined) {
          filtered = filtered.filter(c => c.purchaseCount <= input.purchaseCountMax!);
        }

        // Filter by purchased products
        if (input.productIds && input.productIds.length > 0) {
          // Get orders for these customers
          const customerPhones = filtered.map(c => c.customerPhone);
          const orders = await getOrdersByMerchantId(merchant.id);

          // Filter orders by customer phone and product IDs
          const matchingPhones = new Set<string>();
          for (const order of orders) {
            if (customerPhones.includes(order.customerPhone)) {
              // Check if order contains any of the specified products
              const orderItems = JSON.parse(order.items || '[]');
              const hasProduct = orderItems.some((item: any) =>
                input.productIds!.includes(item.productId)
              );
              if (hasProduct) {
                matchingPhones.add(order.customerPhone);
              }
            }
          }

          filtered = filtered.filter(c => matchingPhones.has(c.customerPhone));
        }

        return {
          customers: filtered,
          count: filtered.length,
        };
      }),
  }),

  // Subscription & Plans
  plans: router({
    // Get all active plans
    list: publicProcedure.query(async () => {
      return getAllPlans();
    }),

    // Get plan by ID
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const plan = await getPlanById(input.id);
        return plan;
      }),

    // Create plan (Admin only)
    create: adminProcedure
      .input(z.object({
        name: z.string(),
        nameAr: z.string(),
        priceMonthly: z.number(),
        conversationLimit: z.number(),
        voiceMessageLimit: z.number(),
        features: z.string(),
      }))
      .mutation(async ({ input }) => {
        return createPlan(input);
      }),

    // Update plan (Admin only)
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        nameAr: z.string().optional(),
        priceMonthly: z.number().optional(),
        conversationLimit: z.number().optional(),
        voiceMessageLimit: z.number().optional(),
        features: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input;

        // Get old values before update
        const oldPlan = await getPlanById(id);
        if (!oldPlan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }

        // Update plan
        await (updatePlan as any)(id, updateData);

        // Log changes
        const changedBy = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
        const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];

        if (updateData.priceMonthly !== undefined && updateData.priceMonthly !== oldPlan.priceMonthly) {
          changes.push({ field: 'priceMonthly', oldValue: oldPlan.priceMonthly.toString(), newValue: updateData.priceMonthly.toString() });
        }
        if (updateData.conversationLimit !== undefined && updateData.conversationLimit !== oldPlan.conversationLimit) {
          changes.push({ field: 'conversationLimit', oldValue: oldPlan.conversationLimit.toString(), newValue: updateData.conversationLimit.toString() });
        }
        if (updateData.voiceMessageLimit !== undefined && updateData.voiceMessageLimit !== oldPlan.voiceMessageLimit) {
          changes.push({ field: 'voiceMessageLimit', oldValue: oldPlan.voiceMessageLimit.toString(), newValue: updateData.voiceMessageLimit.toString() });
        }
        if (updateData.name !== undefined && updateData.name !== oldPlan.name) {
          changes.push({ field: 'name', oldValue: oldPlan.name, newValue: updateData.name });
        }
        if (updateData.nameAr !== undefined && updateData.nameAr !== oldPlan.nameAr) {
          changes.push({ field: 'nameAr', oldValue: oldPlan.nameAr, newValue: updateData.nameAr });
        }
        if (updateData.isActive !== undefined && updateData.isActive !== (oldPlan.isActive as any)) {
          changes.push({ field: 'isActive', oldValue: oldPlan.isActive.toString(), newValue: updateData.isActive.toString() });
        }

        // Save change logs
        for (const change of changes) {
          await createPlanChangeLog({
            planId: id,
            changedBy,
            fieldName: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          });
        }

        return { success: true };
      }),

    // Get change logs (Admin only)
    getChangeLogs: adminProcedure
      .input(z.object({ planId: z.number().optional() }))
      .query(async ({ input }) => {
        if (input.planId) {
          return getPlanChangeLogs(input.planId);
        }
        return getAllPlanChangeLogs();
      }),
  }),

  // Subscriptions
  subscriptions: router({
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        return null;
      }

      return getActiveSubscriptionByMerchantId(merchant.id);
    }),

    // Get usage statistics
    getUsage: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const { getUsageStats } = await import('./usage-tracking');
      const stats = await getUsageStats(merchant.id);

      if (!stats) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
      }

      return stats;
    }),

    // Create subscription
    create: protectedProcedure
      .input(z.object({
        planId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const plan = await getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }

        // Check if there's already an active subscription
        const existing = await getActiveSubscriptionByMerchantId(merchant.id);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription already exists' });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        const subscription = await createSubscription({
          merchantId: merchant.id,
          planId: input.planId,
          status: 'pending',
          conversationsUsed: 0,
          voiceMessagesUsed: 0,
          startDate: startDate as any,
          endDate: endDate as any,
          autoRenew: 1,
        });

        return subscription;
      }),
  }),

  // WhatsApp Integration
  whatsapp: router({
    // Request WhatsApp connection
    requestConnection: protectedProcedure
      .input(z.object({
        countryCode: z.string(),
        phoneNumber: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if merchant has an active subscription
        const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
        if (!subscription) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'يجب اختيار باقة اشتراك أولاً لربط رقم الواتساب'
          });
        }

        // Check if there's already a pending request
        const existingRequest = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
        if (existingRequest && existingRequest.status === 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
        }

        // Create new request
        const fullNumber = `${input.countryCode}${input.phoneNumber}`;
        const request = await createWhatsAppConnectionRequest({
          merchantId: merchant.id,
          countryCode: input.countryCode,
          phoneNumber: input.phoneNumber,
          fullNumber,
          status: 'pending',
        });

        // Notify admin (non-blocking — don't fail if notification service isn't configured)
        try {
          const notifyOwner = await import('./_core/notification');
          await notifyOwner.notifyOwner({
            title: 'طلب ربط واتساب جديد',
            content: `التاجر ${merchant.businessName} يطلب ربط رقم الواتساب: ${fullNumber}`,
          });
        } catch (notifErr) {
          console.warn('[WhatsApp] Admin notification failed (non-blocking):', (notifErr as Error).message);
        }

        return { success: true, request: toPublicWhatsAppConnectionRequest(request) };
      }),

    // Get current connection request status
    getRequestStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return toPublicWhatsAppConnectionRequest(await getWhatsAppConnectionRequestByMerchantId(merchant.id));
    }),

    // Disconnect WhatsApp (Reset) - allows merchant to remove current connection and request a new one
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get current connection request
      const existingRequest = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
      if (!existingRequest) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No WhatsApp connection found' });
      }

      // Delete the connection request
      await deleteWhatsAppConnectionRequest(existingRequest.id);

      // Also delete any WhatsApp instances associated with this merchant
      const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
      for (const instance of instances) {
        await deleteWhatsAppInstance(instance.id);
      }

      // Notify admin about the disconnection (non-blocking)
      try {
        const notifyOwner = await import('./_core/notification');
        await notifyOwner.notifyOwner({
          title: 'فك ربط واتساب',
          content: `التاجر ${merchant.businessName} قام بفك ربط رقم الواتساب: ${existingRequest.fullNumber}`,
        });
      } catch (notifErr) {
        console.warn('[WhatsApp] Admin notification failed (non-blocking):', (notifErr as Error).message);
      }

      // إرسال إشعار للتاجر بفك الربط
      try {
        const { notifyWhatsAppDisconnect } = await import('./_core/notificationService');
        await notifyWhatsAppDisconnect(merchant.id);
        console.log(`[Notification] WhatsApp disconnect notification sent to merchant ${merchant.id}`);
      } catch (error) {
        console.error('[Notification] Failed to send WhatsApp disconnect notification:', error);
      }

      return { success: true };
    }),

    // Get all connection requests (Admin only)
    listRequests: adminProcedure
      .input(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }))
      .query(async ({ input }) => {
        const requests = await getAllWhatsAppConnectionRequests(input.status);
        return requests.map(request => toPublicWhatsAppConnectionRequest(request));
      }),

    // Approve connection request (Admin only) - with Green API credentials
    approveRequest: adminProcedure
      .input(z.object({
        requestId: z.number(),
        instanceId: z.string().min(1, 'Instance ID is required'),
        apiToken: z.string().min(1, 'API Token is required'),
        apiUrl: z.string().url().optional().default('https://api.green-api.com'),
      }))
      .mutation(async ({ input, ctx }) => {
        const request = await getWhatsAppConnectionRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;

        // Auto-derive api_url from instanceId if not explicitly provided
        // Green API subdomain pattern: instanceId 7105411382 → https://7105.api.greenapi.com
        let resolvedApiUrl = input.apiUrl;
        if (resolvedApiUrl === 'https://api.green-api.com' || resolvedApiUrl === 'https://api.greenapi.com') {
          const prefix = input.instanceId.substring(0, 4);
          resolvedApiUrl = `https://${prefix}.api.greenapi.com`;
          console.log(`[approveRequest] Auto-derived api_url: ${resolvedApiUrl} from instanceId: ${input.instanceId}`);
        }

        await approveWhatsAppConnectionRequest(
          input.requestId,
          userId,
          input.instanceId,
          input.apiToken,
          resolvedApiUrl
        );

        // Register Webhook URL in Green API
        try {
          const { setWebhookUrl } = await import('./whatsapp');
          // Get the base URL from environment or use default
          const baseUrl = process.env.VITE_APP_URL || 'https://sary.live';
          const webhookUrl = `${baseUrl}/api/webhooks/greenapi`;

          const webhookResult = await setWebhookUrl(
            input.instanceId,
            input.apiToken,
            webhookUrl,
            resolvedApiUrl
          );

          if (webhookResult.success) {
            console.log(`Webhook URL registered successfully for instance ${input.instanceId}: ${webhookUrl}`);
          } else {
            console.error(`Failed to register webhook URL: ${webhookResult.error}`);
          }
        } catch (webhookError) {
          console.error('Error registering webhook URL:', webhookError);
        }

        // Send notification to merchant about approval
        try {
          await createNotification({
            userId: request.merchantId,
            title: 'تمت الموافقة على طلب ربط الواتساب',
            message: `تمت الموافقة على طلب ربط رقم الواتساب ${request.phoneNumber}. يمكنك الآن ربط الرقم عبر مسح QR Code من لوحة التحكم.`,
            type: 'success',
            link: '/merchant/whatsapp',
          });
        } catch (notifError) {
          console.error('Failed to send notification to merchant:', notifError);
        }

        return { success: true };
      }),

    // Reject connection request (Admin only)
    rejectRequest: adminProcedure
      .input(z.object({ requestId: z.number(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const request = await getWhatsAppConnectionRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
        await rejectWhatsAppConnectionRequest(input.requestId, userId, input.reason);

        return { success: true };
      }),

    // Get QR Code for connection (from approved request)
    getQRCode: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get the approved request with credentials
      const request = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No WhatsApp request found' });
      }

      if (request.status !== 'approved' && request.status !== 'connected') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request not approved yet' });
      }

      if (!request.instanceId || !request.apiToken) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance credentials not set by admin' });
      }

      // Get QR code from Green API using merchant's credentials
      try {
        const axios = await import('axios');
        const instancePrefix = request.instanceId.substring(0, 4);
        const baseUrl = `https://${instancePrefix}.api.greenapi.com`;
        const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.apiToken}`;

        console.log('[QR Code] Fetching from:', url);

        const response = await axios.default.get(url, { timeout: 15000 });

        if (response.data && response.data.type === 'qrCode') {
          return {
            success: true,
            qrCode: response.data.message, // Base64 encoded QR code
            message: 'Scan this QR code with WhatsApp',
          };
        } else if (response.data && response.data.type === 'alreadyLogged') {
          // Already connected
          return {
            success: true,
            alreadyConnected: true,
            message: 'WhatsApp is already connected',
          };
        } else {
          throw new Error('Unexpected response from Green API');
        }
      } catch (error: any) {
        console.error('[QR Code] Error:', error.message);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.response?.data?.message || error.message || 'Failed to get QR code',
        });
      }
    }),

    // Get connection status (check if WhatsApp is connected)
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get the approved request with credentials
      const request = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
      if (!request || !request.instanceId || !request.apiToken) {
        return { connected: false, status: 'no_credentials' };
      }

      if (request.status !== 'approved' && request.status !== 'connected') {
        return { connected: false, status: request.status };
      }

      // Check connection status from Green API
      try {
        const axios = await import('axios');
        const instancePrefix = request.instanceId.substring(0, 4);
        const baseUrl = `https://${instancePrefix}.api.greenapi.com`;
        const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.apiToken}`;

        const response = await axios.default.get(url, { timeout: 10000 });

        if (response.data && response.data.stateInstance === 'authorized') {
          // Update request status to connected if not already
          if (request.status !== 'connected') {
            await updateWhatsAppConnectionRequest(request.id, {
              status: 'connected',
              connectedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            });
          }
          return {
            connected: true,
            status: 'authorized',
            phoneNumber: response.data.phoneNumber,
          };
        } else {
          return {
            connected: false,
            status: response.data?.stateInstance || 'unknown',
          };
        }
      } catch (error: any) {
        console.error('[WhatsApp Status] Error:', error.message);
        return {
          connected: false,
          status: 'error',
          error: error.message,
        };
      }
    }),

    // Send text message
    sendMessage: protectedProcedure
      .input(
        z.object({
          phoneNumber: z.string(),
          message: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const whatsapp = await import('./whatsapp');
        return await whatsapp.sendTextMessage(input.phoneNumber, input.message);
      }),

    // Send image message
    sendImage: protectedProcedure
      .input(
        z.object({
          phoneNumber: z.string(),
          imageUrl: z.string(),
          caption: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const whatsapp = await import('./whatsapp');
        return await whatsapp.sendImageMessage(input.phoneNumber, input.imageUrl, input.caption);
      }),

    // Test APIs for WhatsApp (with custom credentials)
    testConnection: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const axios = await import('axios');
        // Green API format: https://{instancePrefix}.api.greenapi.com/waInstance{instanceId}/method/{token}
        // Extract first 4 digits from instanceId for subdomain
        const instancePrefix = input.instanceId.substring(0, 4);
        const url = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}/getStateInstance/${input.token}`;

        console.log('[Green API Test] Connection test started');

        try {
          const response = await axios.default.get(url, {
            timeout: 15000,
          });

          const isConnected = response.data.stateInstance === 'authorized';
          return {
            success: isConnected,
            status: response.data.stateInstance || 'unknown',
            phoneNumber: response.data.phoneNumber,
          };
        } catch (error: any) {
          console.warn('[Green API Test] Connection test failed', {
            errorCode: error.code,
            responseStatus: error.response?.status,
          });

          let errorMessage = 'فشل الاتصال';
          if (error.response?.status === 401 || error.response?.status === 403) {
            errorMessage = 'Instance ID أو Token غير صحيح';
          } else if (error.response?.status === 404) {
            errorMessage = 'Instance غير موجود';
          } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            errorMessage = 'انتهى وقت الاتصال';
          }

          // Return error with debug info instead of throwing
          return {
            success: false,
            status: 'error',
            error: errorMessage,
          };
        }
      }),

    sendTestMessage: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
          phoneNumber: z.string(),
          message: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const axios = await import('axios');
        // Extract first 4 digits from instanceId for subdomain
        const instancePrefix = input.instanceId.substring(0, 4);
        const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}`;

        const response = await axios.default.post(`${baseURL}/sendMessage/${input.token}`, {
          chatId: `${input.phoneNumber}@c.us`,
          message: input.message,
        });

        return response.data;
      }),

    sendTestImage: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
          phoneNumber: z.string(),
          imageUrl: z.string(),
          caption: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const axios = await import('axios');
        // Extract first 4 digits from instanceId for subdomain
        const instancePrefix = input.instanceId.substring(0, 4);
        const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${input.instanceId}`;

        const response = await axios.default.post(`${baseURL}/sendFileByUrl/${input.token}`, {
          chatId: `${input.phoneNumber}@c.us`,
          urlFile: input.imageUrl,
          fileName: 'image.jpg',
          caption: input.caption || '',
        });

        return response.data;
      }),

    // Save WhatsApp instance
    saveInstance: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
          phoneNumber: z.string().optional(),
          expiresAt: z.string().optional(), // ISO date string
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // SEC-FIX: Verify active subscription before allowing instance save
        const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
        if (!subscription) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'لا يوجد اشتراك نشط. يرجى تجديد اشتراكك لربط رقم الواتساب.',
          });
        }

        // Check if instance already exists
        const existing = await getWhatsAppInstanceByInstanceId(input.instanceId);

        // If creating new instance, check WhatsApp number limit
        if (!existing) {
          const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
          await checkWhatsAppNumberLimit(merchant.id);
        }
        if (existing && existing.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already in use' });
        }
        if (input.phoneNumber) {
          const phoneOwner = await getActiveInstanceByPhoneNumber(input.phoneNumber);
          if (phoneOwner && phoneOwner.id !== existing?.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقل ملكية موثقًا' });
          }
        }

        if (existing) {
          // Update existing instance
          await updateWhatsAppInstance(existing.id, {
            token: input.token,
            phoneNumber: input.phoneNumber,
            status: 'active',
            connectedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : undefined,
          });
          return { success: true, instanceId: existing.id };
        } else {
          // Create new instance
          const instance = await createWhatsAppInstance({
            merchantId: merchant.id,
            instanceId: input.instanceId,
            token: input.token,
            phoneNumber: input.phoneNumber,
            status: 'active',
            isPrimary: 1, // First instance is primary
            connectedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : undefined,
          });
          return { success: true, instanceId: instance?.id };
        }
      }),

    // Get primary WhatsApp instance
    getPrimaryInstance: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return toPublicWhatsAppInstance(await getPrimaryWhatsAppInstance(merchant.id));
    }),

    // Get all WhatsApp instances
    listInstances: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
      return instances.map(instance => toPublicWhatsAppInstance(instance));
    }),

    // Delete WhatsApp instance
    deleteInstance: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify ownership
        const instance = await getWhatsAppInstanceById(input.instanceId);
        if (!instance || instance.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        await deleteWhatsAppInstance(input.instanceId);
        return { success: true };
      }),
  }),

  // Conversations
  conversations: router({
    // Get all conversations for current merchant (with optional pipeline filters)
    list: protectedProcedure
      .input(z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
        // Pipeline filters (from SalesPipeline deep-links)
        stage: z.string().optional(),
        needsHuman: z.boolean().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const page = input?.page ?? 1;
        const pageSize = input?.pageSize ?? 50;
        const offset = (page - 1) * pageSize;
        const stage = input?.stage;
        const needsHuman = input?.needsHuman;

        // Whitelist of valid deal stages — invalid values fall through to unfiltered default
        const { isValidDealStage } = await import('@shared/const');
        const isValidFilter = needsHuman || (stage && isValidDealStage(stage));

        // If pipeline filters are active, use targeted SQL query
        if (isValidFilter) {
          const { getPool } = await import('./db');
          const pool = await getPool();
          if (!pool) return { items: [], total: 0, page, pageSize, totalPages: 0 };

          let where = 'c.merchantId = ?';
          const params: any[] = [merchant.id];

          if (needsHuman) {
            where += ` AND c.id IN (SELECT DISTINCT conversation_id FROM sari_escalation_queue WHERE merchant_id = ? AND status IN ('pending', 'notified'))`;
            params.push(merchant.id);
          } else if (stage === 'stalled') {
            where += ` AND c.deal_stage IN ('interested', 'qualified') AND c.lastMessageAt < DATE_SUB(NOW(), INTERVAL 48 HOUR) AND c.loss_reason IS NULL`;
          } else if (stage === 'ready') {
            // Match pipeline card: only show ready leads active in last 48h
            where += ` AND c.deal_stage = 'ready' AND c.lastMessageAt > DATE_SUB(NOW(), INTERVAL 48 HOUR)`;
          } else if (stage) {
            where += ` AND c.deal_stage = ?`;
            params.push(stage);
          }

          const [countRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM conversations c WHERE ${where}`, params
          );
          const total = (countRows as any[])[0]?.total || 0;

          const [rows] = await pool.execute(
            `SELECT c.* FROM conversations c WHERE ${where} ORDER BY c.lastMessageAt DESC LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
          );

          return { items: rows as any[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
        }

        // Default: no filter (also reached if stage is invalid)
        const [items, total] = await Promise.all([
          getConversationsByMerchantId(merchant.id, { limit: pageSize, offset }),
          getConversationCountByMerchantId(merchant.id),
        ]);

        return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
      }),

    // Lightweight: get only recent conversations (for Dashboard)
    listRecent: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getConversationsByMerchantId(merchant.id, { limit: input.limit });
      }),

    // Lightweight: get count only (for Dashboard stats)
    count: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return getConversationCountByMerchantId(merchant.id);
    }),

    // Get messages for a conversation
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input, ctx }) => {
        const conversation = await getConversationById(input.conversationId);
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Check ownership
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        return getMessagesByConversationId(input.conversationId);
      }),

    // Send reply from merchant dashboard
    sendReply: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        message: z.string().min(1).max(5000),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check ownership
        const conversation = await getConversationById(input.conversationId);
        if (!conversation || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        // FIX-3: Fallback chain — try new whatsapp_instances first, then legacy connection_requests
        const waInstance = await getPrimaryWhatsAppInstance(merchant.id);
        let waInstanceId: string, waToken: string, waApiUrl: string;

        if (waInstance && waInstance.status === 'active' && waInstance.instanceId && waInstance.token) {
          waInstanceId = waInstance.instanceId;
          waToken = waInstance.token;
          waApiUrl = (waInstance as any).apiUrl || 'https://api.green-api.com';
        } else {
          // Fallback to legacy connection_requests
          const waRequest = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
          if (!waRequest || !waRequest.instanceId || !waRequest.apiToken) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: 'يجب ربط حساب WhatsApp أولاً',
            });
          }
          waInstanceId = waRequest.instanceId;
          waToken = waRequest.apiToken;
          waApiUrl = waRequest.apiUrl || 'https://api.green-api.com';
        }

        // Send via WhatsApp
        const { sendMessageWithCredentials } = await import('./whatsapp');
        const result = await sendMessageWithCredentials(
          waInstanceId,
          waToken,
          waApiUrl,
          conversation.customerPhone,
          input.message,
        );

        if (!result.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `فشل إرسال الرسالة: ${result.error}`,
          });
        }

        // Save to DB
        const { createMessage } = await import('./db');
        await createMessage({
          conversationId: input.conversationId,
          direction: 'outgoing',
          messageType: 'text',
          content: input.message,
          externalId: result.messageId || null,
        });

        // ── FIX: Activate humanTakeover so bot stays silent (parity with modular router) ──
        try {
          const { getBotSettings: getBSInline, updateConversation: updateConvInline } = await import('./db');
          const bsInline = await getBSInline(merchant.id);
          const timeoutMin = bsInline.takeoverTimeoutMinutes || 15;
          await updateConvInline(input.conversationId, {
            humanTakeover: 1,
            humanTakeoverAt: new Date(),
            humanExpiresAt: new Date(Date.now() + timeoutMin * 60 * 1000),
          } as any);
          console.log(`[Dashboard-Inline] Human takeover activated on conv ${input.conversationId} for ${timeoutMin} min`);
        } catch (takeoverErr) {
          console.warn('[Dashboard-Inline] Failed to activate takeover:', takeoverErr);
        }

        return { success: true, messageId: result.messageId };
      }),

    // Send a voice reply that was uploaded through the authenticated voice endpoint.
    // The client passes an opaque storage key, never an arbitrary URL.
    sendVoiceReply: protectedProcedure
      .input(z.object({
        conversationId: z.number().int().positive(),
        storageKey: z.string().min(1).max(500),
        mimeType: z.enum(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav']),
        duration: z.number().positive().max(3600),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const conversation = await getConversationById(input.conversationId);
        if (!conversation || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        const expectedPrefix = `audio/voice-${ctx.user.id}-`;
        if (!input.storageKey.startsWith(expectedPrefix) || input.storageKey.includes('..')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid audio object' });
        }

        const waInstance = await getPrimaryWhatsAppInstance(merchant.id);
        let waInstanceId: string;
        let waToken: string;
        let waApiUrl: string;

        if (waInstance && waInstance.status === 'active' && waInstance.instanceId && waInstance.token) {
          waInstanceId = waInstance.instanceId;
          waToken = waInstance.token;
          waApiUrl = (waInstance as any).apiUrl || 'https://api.green-api.com';
        } else {
          const waRequest = await getWhatsAppConnectionRequestByMerchantId(merchant.id);
          if (!waRequest || !waRequest.instanceId || !waRequest.apiToken) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط حساب WhatsApp أولاً' });
          }
          waInstanceId = waRequest.instanceId;
          waToken = waRequest.apiToken;
          waApiUrl = waRequest.apiUrl || 'https://api.green-api.com';
        }

        const { storageGet } = await import('./storage');
        const { url: audioUrl } = await storageGet(input.storageKey);
        const extensionByMime: Record<typeof input.mimeType, string> = {
          'audio/webm': 'webm',
          'audio/ogg': 'ogg',
          'audio/mpeg': 'mp3',
          'audio/mp3': 'mp3',
          'audio/mp4': 'm4a',
          'audio/wav': 'wav',
        };
        const fileName = `voice-message.${extensionByMime[input.mimeType]}`;

        const { sendFileWithCredentials } = await import('./whatsapp');
        const result = await sendFileWithCredentials(
          waInstanceId,
          waToken,
          waApiUrl,
          conversation.customerPhone,
          audioUrl,
          fileName,
        );

        if (!result.success || !result.messageId) {
          console.error('[Dashboard] Voice provider rejected message:', result.error || 'missing message identifier');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل إرسال الرسالة الصوتية عبر مزود WhatsApp',
          });
        }

        let persisted = true;
        try {
          const savedMessage = await createMessage({
            conversationId: input.conversationId,
            direction: 'outgoing',
            messageType: 'voice',
            content: `[رسالة صوتية — ${Math.round(input.duration)} ثانية]`,
            voiceUrl: audioUrl,
            mediaUrl: audioUrl,
            externalId: result.messageId,
            isProcessed: 1,
          });
          persisted = Boolean(savedMessage);

          const botSettings = await getBotSettings(merchant.id);
          const timeoutMin = botSettings.takeoverTimeoutMinutes || 15;
          await updateConversation(input.conversationId, {
            humanTakeover: 1,
            humanTakeoverAt: new Date(),
            humanExpiresAt: new Date(Date.now() + timeoutMin * 60 * 1000),
          } as any);
        } catch (persistenceError) {
          persisted = false;
          console.error(`[Dashboard] Voice ${result.messageId} delivered but persistence failed:`, persistenceError);
        }

        return { success: true, messageId: result.messageId, persisted };
      }),

    // ── Sync conversations from Green API (recover missed data) ──
    syncFromWhatsApp: protectedProcedure
      .mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        console.log(`[Sync] 🔄 Starting WhatsApp sync for merchant ${merchant.id}...`);

        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstance = instances.find((i: any) => i.status === 'active' && i.instanceId && i.token);

        if (!activeInstance) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد اتصال واتساب نشط' });
        }

        const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
        const baseURL = `${apiUrl}/waInstance${activeInstance.instanceId}`;
        const axios = (await import('axios')).default;
        const { getConversationByMerchantAndPhone, createConversation, getPool, updateConversation } = await import('./db');

        let chatsImported = 0;
        let messagesImported = 0;
        const errors: string[] = [];

        try {
          // Fetch all chats from Green API
          const chatsResponse = await axios.post(
            `${baseURL}/getChats/${activeInstance.token}`,
            {},
            { timeout: 30000 }
          );

          const chats: any[] = chatsResponse.data || [];
          console.log(`[Sync] Found ${chats.length} chats from Green API`);

          const personalChats = chats.filter((c: any) => c.id?.endsWith('@c.us'));

          for (const chat of personalChats) {
            try {
              const phoneNumber = chat.id.replace('@c.us', '');
              const customerName = chat.name || chat.contact?.name || phoneNumber;

              let conversation = await getConversationByMerchantAndPhone(merchant.id, phoneNumber);

              if (!conversation) {
                conversation = await createConversation({
                  merchantId: merchant.id,
                  customerPhone: phoneNumber,
                  customerName: customerName,
                  status: 'active',
                  lastMessageAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
                });
                chatsImported++;
              }

              if (!conversation) continue;

              // Fetch recent messages
              try {
                const historyResponse = await axios.post(
                  `${baseURL}/getChatHistory/${activeInstance.token}`,
                  { chatId: chat.id, count: 50 },
                  { timeout: 15000 }
                );

                const chatMessages: any[] = historyResponse.data || [];
                const pool = await getPool();
                if (!pool) continue;

                for (const msg of chatMessages) {
                  if (!msg.idMessage) continue;

                  const [existing] = await pool.execute(
                    'SELECT id FROM messages WHERE externalId = ? LIMIT 1',
                    [msg.idMessage]
                  );

                  if ((existing as any[])?.length > 0) continue;

                  let content = '';
                  let messageType: string = 'text';

                  if (msg.typeMessage === 'textMessage') {
                    content = msg.textMessage || '';
                  } else if (msg.typeMessage === 'extendedTextMessage') {
                    content = msg.extendedTextMessage?.text || msg.textMessage || '';
                  } else if (msg.typeMessage === 'imageMessage') {
                    content = msg.caption || '[صورة]';
                    messageType = 'image';
                  } else if (msg.typeMessage === 'audioMessage' || msg.typeMessage === 'voiceMessage') {
                    content = '[رسالة صوتية]';
                    messageType = 'voice';
                  } else if (msg.typeMessage === 'documentMessage') {
                    content = msg.caption || `[ملف: ${msg.fileName || 'مستند'}]`;
                    messageType = 'document';
                  } else {
                    content = `[${msg.typeMessage || 'رسالة'}]`;
                  }

                  if (!content) continue;

                  const isOutgoing = msg.type === 'outgoing';
                  const msgTimestamp = msg.timestamp
                    ? new Date(msg.timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ')
                    : new Date().toISOString().slice(0, 19).replace('T', ' ');

                  try {
                    await pool.execute(
                      `INSERT INTO messages (conversationId, direction, messageType, content, externalId, isProcessed, createdAt)
                       VALUES (?, ?, ?, ?, ?, 1, ?)`,
                      [conversation.id, isOutgoing ? 'outgoing' : 'incoming', messageType, content.substring(0, 5000), msg.idMessage, msgTimestamp]
                    );
                    messagesImported++;
                  } catch (insertErr: any) {
                    if (!insertErr.message?.includes('Duplicate')) {
                      console.warn(`[Sync] Message insert error:`, insertErr.message);
                    }
                  }
                }

                if (chatMessages.length > 0) {
                  const latestTimestamp = Math.max(...chatMessages.map((m: any) => m.timestamp || 0));
                  if (latestTimestamp > 0) {
                    const latestDate = new Date(latestTimestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
                    await updateConversation(conversation.id, {
                      lastMessageAt: latestDate,
                      customerName: customerName !== phoneNumber ? customerName : undefined,
                    } as any);
                  }
                }
              } catch (historyErr: any) {
                errors.push(`Chat ${phoneNumber}: ${historyErr.message}`);
              }

              await new Promise(r => setTimeout(r, 200));
            } catch (chatErr: any) {
              errors.push(`Chat error: ${chatErr.message}`);
            }
          }
        } catch (apiErr: any) {
          console.error('[Sync] Green API error:', apiErr.message);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `فشل الاتصال بـ Green API: ${apiErr.message}`,
          });
        }

        console.log(`[Sync] ✅ Sync complete: ${chatsImported} new chats, ${messagesImported} messages imported`);

        return {
          success: true,
          chatsImported,
          messagesImported,
          totalChats: chatsImported,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        };
      }),

    // ── Diagnose & fix webhook configuration ──
    diagnoseWebhook: protectedProcedure
      .mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstance = instances.find((i: any) => i.status === 'active' && i.instanceId && i.token);

        if (!activeInstance) {
          return { status: 'no_instance', message: 'لا يوجد اتصال واتساب نشط', fixed: false, details: {} };
        }

        const axios = (await import('axios')).default;
        const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';
        const baseURL = `${apiUrl}/waInstance${activeInstance.instanceId}`;

        const issues: string[] = [];
        const details: Record<string, any> = {};

        // 1. Check instance state (authorized?)
        let instanceState = 'unknown';
        try {
          const stateRes = await axios.get(
            `${baseURL}/getStateInstance/${activeInstance.token}`,
            { timeout: 10000 }
          );
          instanceState = stateRes.data?.stateInstance || 'unknown';
          details.instanceState = instanceState;

          if (instanceState !== 'authorized') {
            issues.push(`حالة الاتصال: ${instanceState} (يجب أن تكون authorized)`);
          }
        } catch (err: any) {
          issues.push(`فشل فحص حالة الاتصال: ${err.message}`);
        }

        // 2. Check ALL settings from Green API
        let settings: any = {};
        try {
          const settingsRes = await axios.get(
            `${baseURL}/getSettings/${activeInstance.token}`,
            { timeout: 10000 }
          );
          settings = settingsRes.data || {};
          details.webhookUrl = settings.webhookUrl || '(فارغ)';
          details.incomingWebhook = settings.incomingWebhook;
          details.outgoingWebhook = settings.outgoingWebhook;
          details.outgoingMessageWebhook = settings.outgoingMessageWebhook;
          details.outgoingAPIMessageWebhook = settings.outgoingAPIMessageWebhook;
          details.stateWebhook = settings.stateWebhook;
        } catch (err: any) {
          return { status: 'api_error', message: `فشل الاتصال بـ Green API: ${err.message}`, fixed: false, details };
        }

        const expectedWebhookUrl = `https://sary.live/api/webhooks/greenapi`;
        const isWebhookUrlCorrect = settings.webhookUrl === expectedWebhookUrl;
        const isIncomingEnabled = settings.incomingWebhook === 'yes';
        const isOutgoingEnabled = settings.outgoingWebhook === 'yes';

        if (!isWebhookUrlCorrect) {
          issues.push(`عنوان Webhook غير صحيح: "${settings.webhookUrl || '(فارغ)'}"`);
        }
        if (!isIncomingEnabled) {
          issues.push('استقبال الرسائل (incomingWebhook) مُعطّل');
        }
        if (!isOutgoingEnabled) {
          issues.push('إرسال الرسائل الصادرة (outgoingWebhook) مُعطّل');
        }

        // 3. Fix all issues at once via setSettings
        let fixed = false;
        if (issues.length > 0) {
          try {
            console.log(`[Diagnose] Fixing ${issues.length} issues for merchant ${merchant.id}:`, issues);
            const fixRes = await axios.post(`${baseURL}/setSettings/${activeInstance.token}`, {
              webhookUrl: expectedWebhookUrl,
              webhookUrlToken: '',
              delaySendMessagesMilliseconds: 1000,
              markIncomingMessagesReaded: 'yes',
              markIncomingMessagesReadedOnReply: 'yes',
              outgoingWebhook: 'yes',
              outgoingMessageWebhook: 'yes',
              outgoingAPIMessageWebhook: 'yes',
              incomingWebhook: 'yes',
              deviceWebhook: 'no',
              statusInstanceWebhook: 'yes',
              stateWebhook: 'yes',
              keepOnlineStatus: 'yes',
            }, { timeout: 15000 });

            fixed = fixRes.status === 200 || fixRes.data?.saveSettings === true;
            console.log(`[Diagnose] Settings ${fixed ? 'fixed ✅' : 'fix failed ❌'} for merchant ${merchant.id}`);
          } catch (fixErr: any) {
            console.error('[Diagnose] Failed to fix settings:', fixErr.message);
          }
        }

        const allOk = issues.length === 0;
        const isDisconnected = instanceState !== 'authorized';

        let message = '';
        if (allOk) {
          message = 'كل الإعدادات صحيحة ✅';
        } else if (isDisconnected) {
          message = `واتساب غير متصل (${instanceState}) ❌ — أعد مسح QR Code`;
        } else if (fixed) {
          message = `تم إصلاح ${issues.length} مشكلة ✅ — الرسائل ستبدأ بالوصول`;
        } else {
          message = `${issues.length} مشكلة: ${issues[0]}`;
        }

        return {
          status: allOk ? 'ok' : (fixed ? 'fixed' : (isDisconnected ? 'disconnected' : 'broken')),
          instanceState,
          fixed,
          issues,
          details,
          message,
        };
      }),

    // ── Lightweight connection status check (auto-query on page load) ──
    connectionStatus: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) return { connected: true, state: 'unknown' };

        const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
        const activeInstance = instances.find((i: any) => i.status === 'active' && i.instanceId && i.token);

        if (!activeInstance) return { connected: false, state: 'no_instance', message: 'لا يوجد اتصال واتساب' };

        const axios = (await import('axios')).default;
        const apiUrl = (activeInstance as any).apiUrl || 'https://api.green-api.com';

        try {
          const stateRes = await axios.get(
            `${apiUrl}/waInstance${activeInstance.instanceId}/getStateInstance/${activeInstance.token}`,
            { timeout: 8000 }
          );
          const state = stateRes.data?.stateInstance || 'unknown';
          return {
            connected: state === 'authorized',
            state,
            phoneNumber: activeInstance.phoneNumber,
            message: state === 'authorized'
              ? 'متصل ✅'
              : `واتساب غير متصل (${state}) — أعد الربط من صفحة إدارة الأرقام`,
          };
        } catch {
          return { connected: true, state: 'check_failed' }; // Assume OK if Green API is down
        }
      }),
  }),

  // Subscription Payments Router
  subscriptionPayments: router({
    createSession: protectedProcedure
      .input(z.object({
        planId: z.number().int().positive(),
        gateway: z.enum(['tap', 'paypal']),
      }))
      .mutation(async () => {
        // New writes must use merchantSubscription.subscribe so entitlement and
        // payment state are committed by the canonical Tap processor.
        throw new TRPCError({
          code: 'METHOD_NOT_SUPPORTED',
          message: 'Legacy checkout is closed; use the current subscription checkout',
        });
      }),

    // Drain-only local status for sessions issued before canonical cutover.
    // Provider callbacks never mutate entitlement; signed webhooks are authoritative.
    verifyPayment: protectedProcedure
      .input(z.object({
        subscriptionId: z.number().int().positive(),
        transactionId: z.string().trim().regex(PAYMENT_PROVIDER_REFERENCE_PATTERN),
      }).strict())
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Get payment
        const payment = await getPaymentByTransactionId(input.transactionId);
        if (!payment || payment.merchantId !== merchant.id || payment.subscriptionId !== input.subscriptionId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
        }

        return { status: toPublicSubscriptionPaymentStatus(payment.status) };
      }),
  }),

  // Payment Gateways Router (Admin only)
  paymentGateways: router({
    list: adminProcedure.query(async () => {
      const gateways = await getAllPaymentGateways();
      return gateways.map(gateway => toPublicPaymentGateway(gateway));
    }),

    upsert: adminProcedure
      .input(z.object({
        gateway: z.enum(['tap', 'paypal']),
        isEnabled: z.boolean(),
        publicKey: z.string().optional(),
        secretKey: z.string().optional(),
        webhookSecret: z.string().optional(),
        testMode: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const result = await createOrUpdatePaymentGateway({
          ...input,
          isEnabled: input.isEnabled ? 1 : 0,
          testMode: input.testMode ? 1 : 0,
        });
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save payment gateway' });
        }
        return { success: true, gateway: toPublicPaymentGateway(result) };
      }),
  }),

  // Invoices router
  invoices: router({
    list: adminProcedure.query(async () => {
      return await getAllInvoices();
    }),

    getByMerchant: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        return await getInvoicesByMerchantId(merchant.id);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const invoice = await getInvoiceById(input.id);
        if (!invoice || invoice.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Invoice not found' });
        }
        return invoice;
      }),
  }),

  // Salla Integration Router
  salla: router({
    // Get connection status
    getConnection: protectedProcedure
      .query(async ({ ctx }) => {
        // SECURITY: derive merchantId from session
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          return { connected: false };
        }

        const connection = await getSallaConnectionByMerchantId(merchant.id);
        if (!connection) {
          return { connected: false };
        }

        return {
          connected: true,
          storeUrl: connection.storeUrl,
          syncStatus: connection.syncStatus,
          lastSyncAt: connection.lastSyncAt,
        };
      }),

    // Connect to Salla store
    connect: protectedProcedure
      .input(z.object({
        storeUrl: z.string().url(),
        accessToken: z.string().min(10),
      }))
      .mutation(async ({ input, ctx }) => {
        // SECURITY: derive merchantId from session
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        // Check for existing platform connections
        const { validateNewPlatformConnection } = await import('./integrations/platform-checker');
        try {
          await validateNewPlatformConnection(merchant.id, 'سلة');
        } catch (error: any) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message
          });
        }

        // Test connection first
        const { SallaIntegration } = await import('./integrations/salla');
        const salla = new SallaIntegration(merchant.id, input.accessToken);
        const testResult = await salla.testConnection();

        if (!testResult.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'فشل الاتصال بـ Salla. تأكد من صحة الرابط والـ Token'
          });
        }

        // Check if connection already exists
        const existing = await getSallaConnectionByMerchantId(merchant.id);

        if (existing) {
          // Update existing connection
          await updateSallaConnection(merchant.id, {
            storeUrl: input.storeUrl,
            accessToken: input.accessToken,
            syncStatus: 'active',
          });
        } else {
          // Create new connection
          await createSallaConnection({
            merchantId: merchant.id,
            storeUrl: input.storeUrl,
            accessToken: input.accessToken,
            syncStatus: 'active',
          });
        }

        // Start initial sync in background
        salla.fullSync().catch(err => {
          console.error('[Salla] Initial sync failed:', err);
        });

        return {
          success: true,
          message: 'تم ربط المتجر بنجاح! جاري مزامنة المنتجات...'
        };
      }),

    // Disconnect from Salla
    disconnect: protectedProcedure
      .mutation(async ({ ctx }) => {
        // SECURITY: derive merchantId from session
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        await deleteSallaConnection(merchant.id);
        return { success: true, message: 'تم فصل المتجر بنجاح' };
      }),

    // Manual sync
    syncNow: protectedProcedure
      .input(z.object({
        syncType: z.enum(['full', 'stock']).default('stock'),
      }))
      .mutation(async ({ input, ctx }) => {
        // SECURITY: derive merchantId from session
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        const connection = await getSallaConnectionByMerchantId(merchant.id);
        if (!connection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير مربوط' });
        }

        const { SallaIntegration } = await import('./integrations/salla');
        const salla = new SallaIntegration(merchant.id, connection.accessToken);

        try {
          let result;
          if (input.syncType === 'full') {
            result = await salla.fullSync();
            return {
              success: true,
              message: `تمت مزامنة ${result.synced} منتج بنجاح`
            };
          } else {
            result = await salla.syncStock();
            return {
              success: true,
              message: `تم تحديث ${result.updated} منتج بنجاح`
            };
          }
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'فشلت المزامنة'
          });
        }
      }),

    // Get sync logs
    getSyncLogs: protectedProcedure
      .query(async ({ ctx }) => {
        // SECURITY: derive merchantId from session
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) return [];

        return await getSyncLogsByMerchantId(merchant.id, 20);
      }),
  }),

  // Orders from WhatsApp Chat
  orders: router({
    // Create order from chat
    createFromChat: protectedProcedure
      .input(z.object({
        merchantId: z.number(),
        customerPhone: z.string(),
        customerName: z.string(),
        message: z.string(), // Customer's message
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { parseOrderMessage, createOrderFromChat, generateOrderConfirmationMessage, generateGiftOrderConfirmationMessage } = await import('./automation/order-from-chat');

        // Parse order from message
        const parsedOrder = await parseOrderMessage(input.message, input.merchantId);
        if (!parsedOrder || parsedOrder.products.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'لم نتمكن من فهم الطلب. يرجى توضيح المنتجات المطلوبة.'
          });
        }

        // Create order
        const result = await createOrderFromChat(
          input.merchantId,
          input.customerPhone,
          input.customerName,
          parsedOrder
        );

        if (!result) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل إنشاء الطلب'
          });
        }

        // Get order details for confirmation message
        const order = await getOrderById(result.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const items = JSON.parse(order.items);

        // Generate confirmation message
        const confirmationMessage = order.isGift
          ? generateGiftOrderConfirmationMessage(
            order.orderNumber || '',
            order.giftRecipientName || '',
            items,
            order.totalAmount,
            result.paymentUrl || ''
          )
          : generateOrderConfirmationMessage(
            order.orderNumber || '',
            items,
            order.totalAmount,
            result.paymentUrl || ''
          );

        // Auto-sync to Google Sheets if enabled
        try {
          const { syncOrderToSheets } = await import('./sheetsSync');
          await syncOrderToSheets(result.orderId);
          console.log(`[Auto-Sync] Order ${result.orderId} synced to Google Sheets`);
        } catch (error) {
          console.error('[Auto-Sync] Failed to sync order to Google Sheets:', error);
          // Don't throw error - just log it
        }

        // إرسال إشعار بالطلب الجديد
        try {
          const { notifyNewOrder } = await import('./_core/notificationService');
          await notifyNewOrder(input.merchantId, result.orderId, order.totalAmount);
          console.log(`[Notification] New order notification sent for order ${result.orderId}`);
        } catch (error) {
          console.error('[Notification] Failed to send new order notification:', error);
          // Don't throw error - just log it
        }

        return {
          success: true,
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          paymentUrl: result.paymentUrl,
          confirmationMessage
        };
      }),

    // Get order by ID
    getById: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input, ctx }) => {
        const order = await getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
        }

        // Verify user owns this merchant
        const merchant = await getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return order;
      }),

    // List orders for merchant
    listByMerchant: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getOrdersByMerchantId(merchant.id);
      }),

    // Get orders with filters
    getWithFilters: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchQuery: z.string().optional(),
        search: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const filters: any = {};
        if (input.status) filters.status = input.status;
        if (input.startDate) filters.startDate = new Date(input.startDate);
        if (input.endDate) filters.endDate = new Date(input.endDate);
        if (input.searchQuery) filters.searchQuery = input.searchQuery;
        if (input.search) filters.searchQuery = input.search;

        return await getOrdersWithFilters(merchant.id, filters);
      }),

    // Get order statistics
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getOrderStats(merchant.id);
      }),

    // Cancel order
    cancel: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const order = await getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Verify user owns this merchant
        const merchant = await getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await cancelOrder(input.orderId, input.reason);

        return { success: true, message: 'تم إلغاء الطلب' };
      }),

    // Update order status
    updateStatus: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']),
        trackingNumber: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const order = await getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Verify user owns this merchant
        const merchant = await getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await updateOrderStatus(input.orderId, input.status, input.trackingNumber);

        // Send notification to customer
        const { sendOrderNotification } = await import('./notifications/order-notifications');
        await sendOrderNotification(
          input.orderId,
          order.merchantId,
          order.customerPhone,
          input.status,
          {
            customerName: order.customerName || 'عزيزي العميل',
            storeName: merchant.businessName,
            orderNumber: order.orderNumber || `ORD-${order.id}`,
            total: order.totalAmount,
            trackingNumber: input.trackingNumber,
          }
        );

        return { success: true, message: 'تم تحديث حالة الطلب وإرسال الإشعار' };
      }),
  }),

  // Discount Codes Management
  discounts: router({
    // Create discount code
    create: protectedProcedure
      .input(z.object({
        code: z.string().trim().min(4).max(50),
        type: z.enum(['percentage', 'fixed']),
        value: z.number().positive(),
        minOrderAmount: z.number().nonnegative().optional(),
        maxUses: z.number().int().positive().optional(),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).refine((data) => data.type !== 'percentage' || data.value <= 100, {
        path: ['value'],
        message: 'Percentage discount cannot exceed 100',
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const existingCodes = await getDiscountCodesByMerchantId(merchant.id);
        if (existingCodes.some((code) => code.code === input.code.toUpperCase())) {
          throw new TRPCError({ code: 'CONFLICT', message: 'كود الخصم موجود مسبقاً' });
        }

        const discountCode = await createDiscountCode({
          merchantId: merchant.id,
          code: input.code.toUpperCase(),
          type: input.type,
          value: input.value,
          minOrderAmount: input.minOrderAmount || null,
          maxUses: input.maxUses || null,
          usedCount: 0,
          isActive: 1,
          expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : null,
        });

        return { success: true, discountCode };
      }),

    // List all discount codes
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return await getDiscountCodesByMerchantId(merchant.id);
      }),

    // Get discount code by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const discountCode = await getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await getMerchantById(discountCode.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return discountCode;
      }),

    // Update discount code
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean().optional(),
        maxUses: z.number().int().positive().optional(),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const discountCode = await getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await getMerchantById(discountCode.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await updateDiscountCode(input.id, {
          isActive: input.isActive === undefined ? undefined : input.isActive ? 1 : 0,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : undefined,
        });

        return { success: true, message: 'تم تحديث كود الخصم' };
      }),

    // Delete discount code
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const discountCode = await getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await getMerchantById(discountCode.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await deleteDiscountCode(input.id);
        return { success: true, message: 'تم حذف كود الخصم' };
      }),

    // Get statistics
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const codes = await getDiscountCodesByMerchantId(merchant.id);
        const active = codes.filter(c => c.isActive).length;
        const used = codes.reduce((sum, c) => sum + c.usedCount, 0);

        return {
          total: codes.length,
          active,
          used,
        };
      }),
  }),

  // Referrals & Rewards Management
  referrals: router({
    // Get my referral code (auto-generate if doesn't exist)
    getMyCode: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Try to get existing code
      let code = await getReferralCodeByMerchantId(merchant.id);

      // Generate new code if doesn't exist
      if (!code) {
        code = await generateReferralCode(
          merchant.id,
          merchant.businessName,
          merchant.phone || ''
        );
      }

      return code;
    }),

    // Get my referrals list
    getMyReferrals: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getReferralsWithDetails(merchant.id);
    }),

    // Get my rewards
    getMyRewards: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getRewardsByMerchantId(merchant.id);
    }),

    // Get referral statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getReferralStats(merchant.id);
    }),

    // Apply referral code during signup — SEC-W4 FIX: protectedProcedure, merchantId from auth
    applyReferralCode: protectedProcedure
      .input(z.object({
        code: z.string().max(50),
      }))
      .mutation(async ({ input, ctx }) => {
        // Rate limit
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const clientIp = ctx.req?.ip || ctx.req?.socket?.remoteAddress || 'unknown';
        const check = checkRateLimit(`referral_apply:${clientIp}`, 5, 3600000);
        if (!check.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'حاول لاحقاً.' });
        }

        // Derive merchant from authenticated user
        const referredMerchant = await getMerchantByUserId(ctx.user.id);
        if (!referredMerchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const referralCode = await getReferralCodeByCode(input.code);
        if (!referralCode || !referralCode.isActive) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'كود الإحالة غير صحيح' });
        }

        // Prevent self-referral
        if (referralCode.merchantId === referredMerchant.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يمكنك إحالة نفسك' });
        }

        const referral = await createReferral({
          referralCodeId: referralCode.id,
          referredPhone: referredMerchant.phone || '',
          referredName: referredMerchant.businessName,
          orderCompleted: 0,
        });

        if (!referral) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تسجيل الإحالة' });
        }

        await incrementReferralCount(referralCode.id);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        await createReward({
          merchantId: referralCode.merchantId,
          referralId: referral.id,
          rewardType: 'discount_10',
          status: 'pending',
          expiresAt: expiresAt as any,
          description: `خصم 10% على الاشتراك القادم لإحالة ${referredMerchant.businessName}`,
        });

        // Notify referrer and admin
        try {
          const { notifyOwner } = await import('./_core/notification');
          const { notifyNewReferral } = await import('./_core/emailNotifications');
          const referrer = await getMerchantById(referralCode.merchantId);
          if (referrer) {
            await notifyOwner({
              title: 'إحالة جديدة!',
              content: `${referrer.businessName} حصل على إحالة جديدة من ${referredMerchant.businessName}`,
            });

            const referredUser = await getUserById(referredMerchant.userId);
            await notifyNewReferral({
              referrerName: referrer.businessName,
              referrerBusiness: referrer.businessName,
              newMerchantName: referredMerchant.businessName,
              newMerchantEmail: referredUser?.email || '',
              referralCode: input.code,
              referredAt: new Date(),
            });
          }
        } catch (error) {
          console.error('Failed to send referral notification:', error);
        }

        return { success: true, message: 'تم تطبيق كود الإحالة بنجاح' };
      }),

    // Claim a reward
    claimReward: protectedProcedure
      .input(z.object({ rewardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const reward = await getRewardById(input.rewardId);
        if (!reward || reward.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (reward.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة غير متاحة' });
        }

        // Check if expired
        if (new Date() > new Date(reward.expiresAt)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'المكافأة منتهية الصلاحية' });
        }

        await claimReward(input.rewardId);

        return { success: true, message: 'تم استخدام المكافأة بنجاح' };
      }),
  }),

  // Abandoned Carts Management
  abandonedCarts: router({
    // List abandoned carts for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await getAbandonedCartsByMerchantId(input.merchantId);
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getCartRecoveryStats } = await import('./automation/abandoned-cart-recovery');
        return await getCartRecoveryStats(input.merchantId);
      }),

    // Mark cart as recovered
    markRecovered: protectedProcedure
      .input(z.object({ cartId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const cart = await getAbandonedCartById(input.cartId);
        if (!cart) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
        }

        const merchant = await getMerchantById(cart.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await markAbandonedCartRecovered(input.cartId);
      }),

    // Send reminder manually
    sendReminder: protectedProcedure
      .input(z.object({ cartId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const cart = await getAbandonedCartById(input.cartId);
        if (!cart) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
        }

        const merchant = await getMerchantById(cart.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { sendCartReminder } = await import('./automation/abandoned-cart-recovery');
        const success = await sendCartReminder(input.cartId);

        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send reminder' });
        }

        return { success: true };
      }),
  }),

  // Occasion Campaigns Management
  occasionCampaigns: router({
    // List occasion campaigns for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await getOccasionCampaignsByMerchantId(input.merchantId);
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await getOccasionCampaignsStats(input.merchantId);
      }),

    // Get upcoming occasions
    getUpcoming: protectedProcedure.query(async () => {
      const { getUpcomingOccasions } = await import('./automation/occasion-campaigns');
      return getUpcomingOccasions();
    }),

    // Toggle campaign enabled status
    toggle: protectedProcedure
      .input(z.object({ campaignId: z.number(), enabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await getOccasionCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        const merchant = await getMerchantById(campaign.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await updateOccasionCampaign(input.campaignId, {
          enabled: input.enabled ? 1 : 0,
        });

        return { success: true };
      }),

    // Create occasion campaign manually
    create: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          occasionType: z.enum(['ramadan', 'eid_fitr', 'eid_adha', 'national_day', 'new_year', 'hijri_new_year']),
          discountPercentage: z.number().min(5).max(50),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const year = new Date().getFullYear();

        // Check if campaign already exists
        const existing = await getOccasionCampaignByTypeAndYear(
          input.merchantId,
          input.occasionType,
          year
        );

        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already exists for this occasion' });
        }

        // Create campaign
        const campaign = await createOccasionCampaign({
          merchantId: input.merchantId,
          occasionType: input.occasionType,
          year,
          enabled: 1,
          discountPercentage: input.discountPercentage,
          status: 'pending',
        });

        return campaign;
      }),
  }),

  // Advanced Analytics
  analytics: router({
    // Dashboard KPIs
    getDashboardKPIs: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getDashboardKPIs } = await import('./analytics/analytics');
        return await getDashboardKPIs(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Revenue Trends
    getRevenueTrends: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
          groupBy: z.enum(['day', 'week', 'month']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getRevenueTrends } = await import('./analytics/analytics');
        return await getRevenueTrends(
          input.merchantId,
          {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          },
          input.groupBy
        );
      }),

    // Top Products
    getTopProducts: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getTopProducts } = await import('./analytics/analytics');
        return await getTopProducts(
          input.merchantId,
          {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          },
          input.limit
        );
      }),

    // Campaign Analytics
    getCampaignAnalytics: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getCampaignAnalytics } = await import('./analytics/analytics');
        return await getCampaignAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Customer Segments
    getCustomerSegments: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getCustomerSegments } = await import('./analytics/analytics');
        return await getCustomerSegments(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Hourly Analytics
    getHourlyAnalytics: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getHourlyAnalytics } = await import('./analytics/analytics');
        return await getHourlyAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Weekday Analytics
    getWeekdayAnalytics: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getWeekdayAnalytics } = await import('./analytics/analytics');
        return await getWeekdayAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Discount Code Analytics
    getDiscountCodeAnalytics: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          startDate: z.string(),
          endDate: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getDiscountCodeAnalytics } = await import('./analytics/analytics');
        return await getDiscountCodeAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),
  }),

  // WhatsApp Instances Management
  whatsappInstances: router({
    // List all instances for merchant (ADMIN ONLY — credentials never leave the server)
    list: adminProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input }) => {
        const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
        return instances.map(instance => toPublicWhatsAppInstance(instance));
      }),

    // List instances for merchant dashboard (SAFE — no tokens, no API keys)
    listSafe: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
        return instances.map((i: any) => ({
          id: i.id,
          merchantId: i.merchantId,
          provider: i.provider || 'green_api',
          phoneNumber: i.phoneNumber,
          status: i.status,
          isPrimary: i.isPrimary,
          connectedAt: i.connectedAt,
          createdAt: i.createdAt,
          expiresAt: i.expiresAt,
        }));
      }),

    completeMetaEmbeddedSignup: protectedProcedure
      .input(z.object({
        merchantId: z.number().int().positive(),
        code: z.string().min(20).max(2048),
        wabaId: z.string().regex(/^\d{5,30}$/),
        phoneNumberId: z.string().regex(/^\d{5,30}$/),
      }))
      .mutation(async ({ input, ctx }) => completeMetaEmbeddedSignupService({
        userId: ctx.user.id,
        ...input,
      })),

    // Toggle instance status (activate / deactivate)
    toggleStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        merchantId: z.number(),
        newStatus: z.enum(['active', 'inactive']),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instance = await getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        // Activation is fail-closed: enforce the plan, provider health, and
        // tenant ownership before changing any local state.
        if (input.newStatus === 'active') {
          if (instance.status !== 'active') {
            const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
            try {
              await checkWhatsAppNumberLimit(input.merchantId);
            } catch (err) {
              throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'لقد وصلت للحد الأقصى من الأرقام النشطة في باقتك. أوقف رقماً آخر أو قم بالترقية.',
              });
            }
          }

          const { getWhatsAppProvider } = await import('./channels/whatsapp/providers');
          const providerName = (instance.provider || 'green_api') as 'green_api' | 'meta_cloud' | 'mock';
          const provider = getWhatsAppProvider(providerName);
          const health = await provider.health({
            provider: providerName,
            instanceId: instance.instanceId,
            token: instance.token,
            apiUrl: instance.apiUrl,
            phoneNumberId: instance.phoneNumberId,
            providerAccountId: instance.providerAccountId,
          });
          if (!health.healthy) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر تفعيل الرقم قبل نجاح فحص المزود' });
          }

          if (instance.phoneNumber) {
            const conflicting = await getActiveInstanceByPhoneNumber(instance.phoneNumber);
            if (conflicting && conflicting.id !== instance.id) {
              throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقلًا إداريًا موثقًا' });
            }
          }
        }

        // If deactivating primary, auto-reassign to another active instance
        if (input.newStatus === 'inactive' && instance.isPrimary) {
          const allInstances = await getWhatsAppInstancesByMerchantId(input.merchantId);
          const anotherActive = allInstances.find((i: any) => i.id !== input.id && i.status === 'active');
          if (anotherActive) {
            await setWhatsAppInstanceAsPrimary(anotherActive.id, input.merchantId);
          }
        }

        await updateWhatsAppInstance(input.id, { status: input.newStatus });
        return { success: true };
      }),

    // Get WhatsApp number usage vs plan limit
    getUsage: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        const subscription = await getMerchantCurrentSubscription(input.merchantId);
        if (!subscription || !subscription.planId) {
          return { current: 0, total: 0, max: 1, remaining: 1, percentage: 0, planName: '' };
        }

        const plan = await getSubscriptionPlanById(subscription.planId);
        if (!plan) {
          return { current: 0, total: 0, max: 1, remaining: 1, percentage: 0, planName: '' };
        }

        const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
        const activeCount = instances.filter((i: any) => i.status === 'active').length;
        const totalCount = instances.length;

        return {
          current: activeCount,
          total: totalCount,
          max: plan.maxWhatsAppNumbers,
          remaining: Math.max(0, plan.maxWhatsAppNumbers - activeCount),
          percentage: Math.min(100, (activeCount / plan.maxWhatsAppNumbers) * 100),
          planName: plan.name,
        };
      }),

    // Get primary instance
    getPrimary: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return toPublicWhatsAppInstance(await getPrimaryWhatsAppInstance(input.merchantId));
      }),

    // ==================== Reconnect Flow (Change Number) ====================
    
    // Step 1: Logout from Green API to allow new QR scan
    reconnect: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const instance = await getWhatsAppInstanceById(input.instanceId);
        if (!instance) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        const merchant = await getMerchantById(instance.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        if ((instance.provider || 'green_api') !== 'green_api') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'إعادة الربط عبر QR متاحة لاتصال Green API القديم فقط' });
        }

        const baseUrl = instance.apiUrl || 'https://api.green-api.com';

        // SSRF guard
        try {
          const parsed = new URL(baseUrl);
          const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
          const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
          if (!isAllowed || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('blocked');
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API URL' });
        }

        // Logout from Green API to invalidate current session
        try {
          const logoutUrl = `${baseUrl}/waInstance${instance.instanceId}/logout/${instance.token}`;
          await fetch(logoutUrl);
          console.log(`[reconnect] Logged out instance ${instance.instanceId}`);
        } catch (e) {
          console.error('[reconnect] Logout error:', e);
        }

        // Mark instance as reconnecting
        await updateWhatsAppInstance(instance.id, {
          status: 'inactive',
          phoneNumber: null,
        });

        return { success: true, message: 'تم تسجيل الخروج. امسح QR Code بالرقم الجديد.' };
      }),

    // Step 2: Get QR code for reconnection
    getReconnectQR: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const instance = await getWhatsAppInstanceById(input.instanceId);
        if (!instance) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        const merchant = await getMerchantById(instance.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        if ((instance.provider || 'green_api') !== 'green_api') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'QR متاح لاتصال Green API القديم فقط' });
        }

        const baseUrl = instance.apiUrl || 'https://api.green-api.com';

        // SSRF guard
        try {
          const parsed = new URL(baseUrl);
          const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
          if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)) || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API URL' });
        }

        try {
          const qrUrl = `${baseUrl}/waInstance${instance.instanceId}/qr/${instance.token}`;
          const response = await fetch(qrUrl);
          const data = await response.json();

          if (response.ok && data.type === 'qrCode') {
            return { qrCode: data.message, status: 'waiting' };
          } else if (data.type === 'alreadyLogged') {
            return { qrCode: null, status: 'already_connected' };
          } else {
            return { qrCode: null, status: 'error', error: 'QR code not available' };
          }
        } catch (e) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get QR code' });
        }
      }),

    // Step 3: Confirm reconnection — check if authorized, update phone + webhook
    confirmReconnect: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const instance = await getWhatsAppInstanceById(input.instanceId);
        if (!instance) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        const merchant = await getMerchantById(instance.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        if ((instance.provider || 'green_api') !== 'green_api') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'تأكيد QR متاح لاتصال Green API القديم فقط' });
        }

        const baseUrl = instance.apiUrl || 'https://api.green-api.com';

        // SSRF guard
        try {
          const parsed = new URL(baseUrl);
          const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
          if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)) || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API URL' });
        }

        try {
          // Check state
          const stateUrl = `${baseUrl}/waInstance${instance.instanceId}/getStateInstance/${instance.token}`;
          const stateResponse = await fetch(stateUrl);
          const stateData = await stateResponse.json();

          if (stateData.stateInstance !== 'authorized') {
            return { connected: false, status: stateData.stateInstance || 'not_authorized' };
          }

          // Get new phone number
          let phoneNumber = '';
          try {
            const settingsUrl = `${baseUrl}/waInstance${instance.instanceId}/getSettings/${instance.token}`;
            const settingsResponse = await fetch(settingsUrl);
            const settingsData = await settingsResponse.json();
            if (settingsData.wid) {
              phoneNumber = settingsData.wid.replace('@c.us', '');
            }
          } catch (e) {
            console.error('[confirmReconnect] Failed to get phone:', e);
          }

          if (!phoneNumber) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر التحقق من رقم واتساب المتصل' });
          }

          const conflicting = await getActiveInstanceByPhoneNumber(phoneNumber);
          if (conflicting && conflicting.id !== instance.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقلًا إداريًا موثقًا' });
          }

          if (instance.status !== 'active') {
            const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
            await checkWhatsAppNumberLimit(instance.merchantId);
          }

          // Register the authenticated webhook before exposing the connection as active.
          const { setWebhookUrl } = await import('./whatsapp');
          const appUrl = process.env.VITE_APP_URL || 'https://sary.live';
          const webhookUrl = `${appUrl}/api/webhooks/greenapi`;
          const webhookResult = await setWebhookUrl(instance.instanceId, instance.token, webhookUrl, baseUrl);
          if (!webhookResult.success) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'تعذر تسجيل webhook موثّق للرقم' });
          }

          await updateWhatsAppInstance(instance.id, {
            status: 'active',
            phoneNumber,
            webhookUrl,
            connectedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          });

          return {
            connected: true,
            status: 'authorized',
            phoneNumber,
          };
        } catch (e) {
          return { connected: false, status: 'error' };
        }
      }),

    // Refresh instance - fetch phone number from Green API and re-register webhook
    refreshInstance: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const instance = await getWhatsAppInstanceById(input.instanceId);
        if (!instance) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        const merchant = await getMerchantById(instance.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        if ((instance.provider || 'green_api') !== 'green_api') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'تحديث الاتصال اليدوي متاح لاتصال Green API القديم فقط' });
        }

        // Rate limit: max 5 refreshes per 10 minutes per merchant
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const rateLimitCheck = checkRateLimit(`wa_refresh:${merchant.id}`, 5, 10 * 60 * 1000);
        if (!rateLimitCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'يرجى الانتظار قبل المحاولة مرة أخرى' });
        }

        const baseUrl = instance.apiUrl || 'https://api.green-api.com';

        // SSRF guard — only allow Green API domains
        try {
          const parsed = new URL(baseUrl);
          const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
          const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
          if (!isAllowed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only Green API URLs are allowed' });
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API URL' });
        }

        const updates: any = {};

        // 1. Fetch phone number from Green API settings
        try {
          const settingsUrl = `${baseUrl}/waInstance${instance.instanceId}/getSettings/${instance.token}`;
          const settingsResponse = await fetch(settingsUrl);
          const settingsData = await settingsResponse.json();
          if (settingsData.wid) {
            updates.phoneNumber = settingsData.wid.replace('@c.us', '');
          }
        } catch (e) {
          console.error('[refreshInstance] Failed to get settings:', e);
        }

        // 2. Re-register webhook
        try {
          const { setWebhookUrl } = await import('./whatsapp');
          const appUrl = process.env.VITE_APP_URL || 'https://sary.live';
          const webhookUrl = `${appUrl}/api/webhooks/greenapi`;

          const result = await setWebhookUrl(
            instance.instanceId,
            instance.token,
            webhookUrl,
            baseUrl
          );

          if (result.success) {
            updates.webhookUrl = webhookUrl;
            console.log(`[refreshInstance] Webhook registered for ${instance.instanceId}`);
          } else {
            console.error(`[refreshInstance] Webhook failed: ${result.error}`);
          }
        } catch (e) {
          console.error('[refreshInstance] Webhook error:', e);
        }

        // 3. Update instance in DB
        if (Object.keys(updates).length > 0) {
          if (updates.phoneNumber && instance.status === 'active') {
            const phoneOwner = await getActiveInstanceByPhoneNumber(updates.phoneNumber);
            if (phoneOwner && phoneOwner.id !== instance.id) {
              throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقل ملكية موثقًا' });
            }
          }
          await updateWhatsAppInstance(instance.id, updates);
        }

        const updated = await getWhatsAppInstanceById(instance.id);
        return {
          success: true,
          phoneNumber: updated?.phoneNumber || updates.phoneNumber || instance.phoneNumber,
          webhookRegistered: !!updates.webhookUrl,
        };
      }),

    // Create new instance (ADMIN ONLY — merchants use whatsappRequests.create)
    create: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          instanceId: z.string().min(1),
          token: z.string().min(1),
          apiUrl: z.string().url().optional(),
          phoneNumber: z.string().optional(),
          webhookUrl: z.string().url().optional(),
          isPrimary: z.boolean().optional(),
          expiresAt: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // SEC-PEN-WA-01: Admin-only — merchants must use whatsappRequests.create
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required. Use the WhatsApp connection request flow.' });
        }
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if instance ID already exists
        const existing = await getWhatsAppInstanceByInstanceId(input.instanceId);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already exists' });
        }

        // Check WhatsApp number limit
        const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
        await checkWhatsAppNumberLimit(input.merchantId);

        const instance = await createWhatsAppInstance({
          merchantId: input.merchantId,
          instanceId: input.instanceId,
          token: input.token,
          apiUrl: input.apiUrl || 'https://api.green-api.com',
          phoneNumber: input.phoneNumber || null,
          webhookUrl: input.webhookUrl || null,
          status: 'pending',
          isPrimary: input.isPrimary ? 1 : 0,
          expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : null,
          metadata: null,
        });

        // If this is set as primary, update all others
        if (input.isPrimary && instance) {
          await setWhatsAppInstanceAsPrimary(instance.id, input.merchantId);
        }

        return toPublicWhatsAppInstance(instance);
      }),

    // Update instance (ADMIN ONLY — merchants use toggleStatus/setPrimary)
    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          merchantId: z.number(),
          instanceId: z.string().optional(),
          token: z.string().optional(),
          apiUrl: z.string().url().optional(),
          phoneNumber: z.string().optional(),
          webhookUrl: z.string().url().optional(),
          status: z.enum(['active', 'inactive', 'pending', 'expired']).optional(),
          expiresAt: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // SEC-PEN-WA-02: Admin-only — merchants use toggleStatus/setPrimary for safe operations
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const instance = await getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        const finalStatus = input.status ?? instance.status;
        const finalPhoneNumber = input.phoneNumber ?? instance.phoneNumber;
        if (finalStatus === 'active' && finalPhoneNumber) {
          const phoneOwner = await getActiveInstanceByPhoneNumber(finalPhoneNumber);
          if (phoneOwner && phoneOwner.id !== instance.id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقل ملكية موثقًا' });
          }
        }

        await updateWhatsAppInstance(input.id, {
          instanceId: input.instanceId,
          token: input.token,
          apiUrl: input.apiUrl,
          phoneNumber: input.phoneNumber,
          webhookUrl: input.webhookUrl,
          status: input.status,
          expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString().slice(0, 19).replace("T", " ") : undefined,
        });

        return toPublicWhatsAppInstance(await getWhatsAppInstanceById(input.id));
      }),

    // Set as primary
    setPrimary: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          merchantId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instance = await getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        await setWhatsAppInstanceAsPrimary(input.id, input.merchantId);
        return { success: true };
      }),

    // Delete instance (ADMIN ONLY)
    delete: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          merchantId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // SEC-PEN-WA-01: Admin-only — merchants cannot delete instances directly
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const instance = await getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        // Don't allow deleting the primary instance if it's the only one
        if (instance.isPrimary) {
          const count = await getActiveWhatsAppInstancesCount(input.merchantId);
          if (count <= 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the only active instance' });
          }
        }

        await deleteWhatsAppInstance(input.id);
        return { success: true };
      }),

    // Test connection (ADMIN ONLY — accepts raw credentials)
    testConnection: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
          apiUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // SEC-PEN-WA-01: Admin-only — this endpoint accepts raw credentials
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        try {
          const baseUrl = input.apiUrl || 'https://api.green-api.com';

          // SEC-SSRF: Only allow Green API domains
          try {
            const parsed = new URL(baseUrl);
            const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
            const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
            if (!isAllowed || !['https:', 'http:'].includes(parsed.protocol)) {
              return { success: false, status: 'error', message: 'Only Green API URLs are allowed' };
            }
          } catch {
            return { success: false, status: 'error', message: 'Invalid API URL format' };
          }

          const url = `${baseUrl}/waInstance${input.instanceId}/getStateInstance/${input.token}`;

          const response = await fetch(url);
          const data = await response.json();

          if (response.ok && data.stateInstance) {
            return {
              success: true,
              status: data.stateInstance,
              message: 'Connection successful',
            };
          } else {
            return {
              success: false,
              status: 'error',
              message: 'Failed to connect to instance',
            };
          }
        } catch (error) {
          return {
            success: false,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),

    // Get instance statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instances = await getWhatsAppInstancesByMerchantId(input.merchantId);
        const activeCount = instances.filter(i => i.status === 'active').length;
        const inactiveCount = instances.filter(i => i.status === 'inactive').length;
        const expiredCount = instances.filter(i => i.status === 'expired').length;
        const primary = instances.find(i => i.isPrimary);

        return {
          total: instances.length,
          active: activeCount,
          inactive: inactiveCount,
          expired: expiredCount,
          primary: primary ? toPublicWhatsAppInstance(primary) : null,
        };
      }),

    // Get expiring instances
    getExpiring: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { expiring7Days, expiring3Days, expiring1Day, expired } = await getExpiringWhatsAppInstances();

        // Filter by merchant
        const merchantExpiring7Days = expiring7Days.filter(i => i.merchantId === input.merchantId);
        const merchantExpiring3Days = expiring3Days.filter(i => i.merchantId === input.merchantId);
        const merchantExpiring1Day = expiring1Day.filter(i => i.merchantId === input.merchantId);
        const merchantExpired = expired.filter(i => i.merchantId === input.merchantId);

        return {
          expiring7Days: merchantExpiring7Days.map(toPublicWhatsAppInstance),
          expiring3Days: merchantExpiring3Days.map(toPublicWhatsAppInstance),
          expiring1Day: merchantExpiring1Day.map(toPublicWhatsAppInstance),
          expired: merchantExpired.map(toPublicWhatsAppInstance),
        };
      }),
  }),

  // ============================================
  // WhatsApp Requests Router
  // ============================================
  whatsappRequests: router({
    // Create new request (merchant)
    create: protectedProcedure
      .input(
        z.object({
          merchantId: z.number(),
          phoneNumber: z.string().optional(),
          businessName: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // PEN-WA-01 FIX: Rate limit — max 3 requests per day per merchant
        const { checkRateLimit } = await import('./_core/rateLimiter');
        const rateLimitCheck = checkRateLimit(`wa_request_merchant:${input.merchantId}`, 3, 24 * 60 * 60 * 1000);
        if (!rateLimitCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'تم تجاوز الحد الأقصى لطلبات الربط. حاول مرة أخرى غداً.' });
        }

        // Check if there's already a pending request
        const existingRequests = await getWhatsAppRequestsByMerchantId(input.merchantId);
        const pendingRequest = existingRequests.find((r: WhatsAppRequest) => r.status === 'pending');
        if (pendingRequest) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
        }

        const request = await createWhatsAppRequest({
          merchantId: input.merchantId,
          phoneNumber: input.phoneNumber,
          businessName: input.businessName || merchant.businessName,
          status: 'pending',
        });

        // Notify admin about new WhatsApp connection request
        try {
          const { notifyWhatsAppConnectionRequest } = await import('./_core/emailNotifications');
          const user = await getUserById(merchant.userId);
          await notifyWhatsAppConnectionRequest({
            merchantName: user?.name || merchant.businessName,
            merchantEmail: user?.email || '',
            businessName: merchant.businessName,
            phoneNumber: input.phoneNumber || '',
            requestedAt: new Date(),
          });
        } catch (error) {
          console.error('Failed to send WhatsApp connection request notification:', error);
        }

        return toPublicWhatsAppRequest(request);
      }),

    // PEN-WA-02 FIX: Use adminProcedure middleware instead of manual role check
    listAll: adminProcedure
      .query(async () => {
        const requests = await getAllWhatsAppRequests();
        return requests.map(request => toPublicWhatsAppRequest(request));
      }),

    // Get pending requests (admin only)
    listPending: adminProcedure
      .query(async () => {
        const requests = await getPendingWhatsAppRequests();
        return requests.map(request => toPublicWhatsAppRequest(request));
      }),

    // Get merchant's requests
    listMine: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const requests = await getWhatsAppRequestsByMerchantId(input.merchantId);
        return requests.map(request => toPublicWhatsAppRequest(request));
      }),

    // PEN-WA-02 FIX: Use adminProcedure + PEN-WA-03 FIX: Validate status
    approve: adminProcedure
      .input(
        z.object({
          requestId: z.number(),
          instanceId: z.string(),
          token: z.string(),
          apiUrl: z.string().url().default('https://api.green-api.com'),
          adminNotes: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // PEN-WA-03 FIX: Validate request exists and is pending
        const existingRequest = await getWhatsAppRequestById(input.requestId);
        if (!existingRequest) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }
        if (existingRequest.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        // Auto-derive api_url from instanceId if default was used
        let resolvedApiUrl = input.apiUrl;
        if (resolvedApiUrl === 'https://api.green-api.com' || resolvedApiUrl === 'https://api.greenapi.com') {
          const prefix = input.instanceId.substring(0, 4);
          resolvedApiUrl = `https://${prefix}.api.greenapi.com`;
          console.log(`[approve] Auto-derived api_url: ${resolvedApiUrl} from instanceId: ${input.instanceId}`);
        }

        const request = await approveWhatsAppRequest(
          input.requestId,
          input.instanceId,
          input.token,
          resolvedApiUrl,
          ctx.user.id
        );

        if (input.adminNotes) {
          await updateWhatsAppRequest(input.requestId, { adminNotes: input.adminNotes });
        }

        return toPublicWhatsAppRequest(request);
      }),

    // PEN-WA-02 FIX: Use adminProcedure + PEN-WA-03 FIX: Validate status
    reject: adminProcedure
      .input(
        z.object({
          requestId: z.number(),
          rejectionReason: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // PEN-WA-03 FIX: Validate request exists and is pending
        const existingRequest = await getWhatsAppRequestById(input.requestId);
        if (!existingRequest) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }
        if (existingRequest.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        return rejectWhatsAppRequest(
          input.requestId,
          input.rejectionReason,
          ctx.user.id
        );
      }),

    // Get QR code for approved request (merchant)
    getQRCode: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const request = await getWhatsAppRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        const merchant = await getMerchantById(request.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (request.status !== 'approved') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request not approved yet' });
        }

        if (!request.instanceId || !request.token) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance details not set' });
        }

        // Get QR code from Green API
        try {
          const baseUrl = request.apiUrl || 'https://api.green-api.com';

          // PEN-WA-11 FIX: SSRF guard — only allow Green API domains
          try {
            const parsed = new URL(baseUrl);
            const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
            const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
            if (!isAllowed || !['https:', 'http:'].includes(parsed.protocol)) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only Green API URLs are allowed' });
            }
          } catch (e) {
            if (e instanceof TRPCError) throw e;
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid API URL format' });
          }

          const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.token}`;

          const response = await fetch(url);
          const data = await response.json();

          if (response.ok && data.type === 'qrCode') {
            // Update request with QR code
            await updateWhatsAppRequest(request.id, {
              qrCodeUrl: data.message,
              qrCodeExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString().slice(0, 19).replace("T", " "), // 2 minutes
            });

            return {
              qrCodeUrl: data.message,
              expiresAt: new Date(Date.now() + 2 * 60 * 1000),
            };
          } else {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to get QR code' });
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }),

    // Check connection status (merchant)
    checkConnection: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const request = await getWhatsAppRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        const merchant = await getMerchantById(request.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (!request.instanceId || !request.token) {
          return { connected: false, status: 'pending' };
        }

        try {
          const baseUrl = request.apiUrl || 'https://api.green-api.com';

          // PEN-WA-11 FIX: SSRF guard — only allow Green API domains
          try {
            const parsed = new URL(baseUrl);
            const allowedHosts = ['api.green-api.com', 'api.greenapi.com'];
            const isAllowed = allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
            if (!isAllowed || !['https:', 'http:'].includes(parsed.protocol)) {
              return { connected: false, status: 'error', error: 'Only Green API URLs are allowed' };
            }
          } catch {
            return { connected: false, status: 'error', error: 'Invalid API URL' };
          }

          const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.token}`;

          const response = await fetch(url);
          const data = await response.json();

          if (response.ok && data.stateInstance === 'authorized') {
            // Connection successful - create WhatsApp instance
            if (request.status === 'approved') {
              // Race condition guard: check if instance already created by concurrent request
              const existingInstances = await getWhatsAppInstancesByMerchantId(request.merchantId);
              const alreadyExists = existingInstances.some((i: any) => i.instanceId === request.instanceId);
              if (alreadyExists) {
                return { connected: true, status: 'authorized', phoneNumber: data.phoneNumber };
              }

              // Check WhatsApp number limit before creating instance
              const { checkWhatsAppNumberLimit } = await import('./helpers/subscriptionGuard');
              await checkWhatsAppNumberLimit(request.merchantId);

              // Get phone number from Green API settings
              let phoneNumber = request.phoneNumber || '';
              try {
                const settingsUrl = `${baseUrl}/waInstance${request.instanceId}/getSettings/${request.token}`;
                const settingsResponse = await fetch(settingsUrl);
                const settingsData = await settingsResponse.json();
                if (settingsData.wid) {
                  // wid format: "966XXXXXXXXX@c.us"
                  phoneNumber = settingsData.wid.replace('@c.us', '');
                }
              } catch (e) {
                console.error('[checkConnection] Failed to get phone number from settings:', e);
              }

              if (phoneNumber) {
                const phoneOwner = await getActiveInstanceByPhoneNumber(phoneNumber);
                if (phoneOwner) {
                  throw new TRPCError({ code: 'CONFLICT', message: 'رقم واتساب مرتبط بحساب آخر ويتطلب نقل ملكية موثقًا' });
                }
              }

              // Create instance WITH phone number
              await createWhatsAppInstance({
                merchantId: request.merchantId,
                instanceId: request.instanceId,
                token: request.token,
                apiUrl: request.apiUrl || 'https://api.green-api.com',
                phoneNumber: phoneNumber || null,
                status: 'active',
                isPrimary: 1,
                connectedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
              });

              // Mark request as completed
              await completeWhatsAppRequest(request.id, phoneNumber);

              // Register Webhook URL in Green API so bot can receive messages
              try {
                const { setWebhookUrl } = await import('./whatsapp');
                const appUrl = process.env.VITE_APP_URL || 'https://sary.live';
                const webhookUrl = `${appUrl}/api/webhooks/greenapi`;

                const webhookResult = await setWebhookUrl(
                  request.instanceId,
                  request.token,
                  webhookUrl,
                  request.apiUrl || 'https://api.green-api.com'
                );

                if (webhookResult.success) {
                  console.log(`[checkConnection] Webhook registered for instance ${request.instanceId}: ${webhookUrl}`);
                } else {
                  console.error(`[checkConnection] Webhook registration failed: ${webhookResult.error}`);
                }
              } catch (webhookError) {
                console.error('[checkConnection] Error registering webhook:', webhookError);
              }
            }

            return {
              connected: true,
              status: 'authorized',
              phoneNumber: data.phoneNumber,
            };
          } else {
            return {
              connected: false,
              status: data.stateInstance || 'unknown',
            };
          }
        } catch (error) {
          return {
            connected: false,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
  }),

  // Order Notifications Router
  orderNotifications: router({
    // Get notification templates (merchant)
    getTemplates: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return getNotificationTemplatesByMerchantId(merchant.id);
      }),

    // Update notification template (merchant)
    updateTemplate: protectedProcedure
      .input(z.object({
        id: z.number(),
        template: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify template belongs to merchant
        const template = await getNotificationTemplateById(input.id);
        if (!template || template.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return updateNotificationTemplate(input.id, {
          template: input.template,
          enabled: input.enabled !== undefined ? (input.enabled ? 1 : 0) : undefined,
        });
      }),

    // Get notification history (merchant)
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return getOrderNotificationsByMerchantId(merchant.id, input.limit);
      }),

    // Get notifications for specific order (merchant)
    getByOrderId: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify order belongs to merchant
        const order = await getOrderById(input.orderId);
        if (!order || order.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return getOrderNotificationsByOrderId(input.orderId);
      }),
  }),

  // Voice router
  voice: router({
    // رفع ملف صوتي إلى S3
    uploadAudio: protectedProcedure
      .input(z.object({
        audioBase64: z.string().min(1).max(24 * 1024 * 1024),
        mimeType: z.enum(['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav']),
        duration: z.number().positive().max(3600),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const audioBuffer = decodeValidatedAudio(input.audioBase64, input.mimeType);
          const sizeMB = audioBuffer.length / (1024 * 1024);

          // تحديد امتداد الملف
          const extensionByMime: Record<typeof input.mimeType, string> = {
            'audio/webm': 'webm',
            'audio/ogg': 'ogg',
            'audio/mpeg': 'mp3',
            'audio/mp3': 'mp3',
            'audio/mp4': 'm4a',
            'audio/wav': 'wav',
          };
          const extension = extensionByMime[input.mimeType];
          const timestamp = Date.now();
          const randomStr = (await import('node:crypto')).randomBytes(4).toString('hex');
          const fileName = `voice-${ctx.user.id}-${timestamp}-${randomStr}.${extension}`;

          // رفع الملف إلى S3
          const { storagePut } = await import('./storage');
          const { key, url } = await storagePut(
            `audio/${fileName}`,
            audioBuffer,
            input.mimeType
          );

          return {
            success: true,
            storageKey: key,
            audioUrl: url,
            duration: input.duration,
            size: sizeMB,
          };
        } catch (error) {
          console.error('[Voice] Upload failed:', error);
          if (error instanceof TRPCError) throw error;
          const audioValidationCodes = new Set([
            'INVALID_BASE64',
            'EMPTY_AUDIO',
            'AUDIO_TOO_LARGE',
            'AUDIO_SIGNATURE_MISMATCH',
          ]);
          const errorCode = error instanceof Error ? error.message : '';
          const isValidationError = audioValidationCodes.has(errorCode);
          const message = errorCode === 'AUDIO_TOO_LARGE'
            ? 'حجم الملف الصوتي يتجاوز 16MB'
            : isValidationError
              ? 'الملف المرفوع ليس تسجيلاً صوتياً صالحاً أو لا يطابق نوعه'
              : 'تعذر تخزين التسجيل الصوتي';
          throw new TRPCError({
            code: isValidationError ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
            message,
          });
        }
      }),

    // تحويل الصوت إلى نص
    transcribe: protectedProcedure
      .input(z.object({
        audioUrl: z.string().url(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { transcribeAudio } = await import('./_core/voiceTranscription');
          const result = await transcribeAudio({
            audioUrl: input.audioUrl,
            language: input.language || 'ar',
          });

          // التحقق من وجود خطأ
          if ('error' in result) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: result.error,
            });
          }

          return {
            success: true,
            text: result.text,
            language: result.language,
            duration: result.duration,
            segments: result.segments,
          };
        } catch (error) {
          console.error('[Voice] Transcription failed:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل تحويل الصوت إلى نص'
          });
        }
      }),
  }),

  // Message Analytics APIs
  messageAnalytics: router({
    // إحصائيات الرسائل
    getMessageStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return getMessageStats(merchant.id, startDate, endDate);
      }),

    // أوقات الذروة
    getPeakHours: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return getPeakHours(merchant.id, startDate, endDate);
      }),

    // المنتجات الأكثر استفساراً
    getTopProducts: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        return getTopProducts(merchant.id, input.limit || 10);
      }),

    // معدل التحويل
    getConversionRate: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return getConversionRate(merchant.id, startDate, endDate);
      }),

    // عدد الرسائل اليومي
    getDailyMessageCount: protectedProcedure
      .input(z.object({
        days: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        return getDailyMessageCount(merchant.id, input.days || 30);
      }),

    // تصدير PDF
    exportPDF: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        // Gather all analytics data
        const messageStats = await getMessageStats(merchant.id, startDate, endDate);
        const peakHours = await getPeakHours(merchant.id, startDate, endDate);
        const topProducts = await getTopProducts(merchant.id, 10);
        const conversionRate = await getConversionRate(merchant.id, startDate, endDate);
        const dailyMessages = await getDailyMessageCount(merchant.id, 30);

        const dateRange = input.startDate && input.endDate
          ? `${input.startDate} - ${input.endDate}`
          : 'All Time';

        const { generatePDFReport } = await import('./exportReports');
        const pdfBuffer = generatePDFReport({
          merchantName: merchant.businessName,
          dateRange,
          messageStats,
          peakHours,
          topProducts,
          conversionRate,
          dailyMessages,
        });

        // Return base64 encoded PDF
        return {
          data: pdfBuffer.toString('base64'),
          filename: `sari-analytics-${Date.now()}.pdf`,
        };
      }),

    // تصدير Excel
    exportExcel: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        // Gather all analytics data
        const messageStats = await getMessageStats(merchant.id, startDate, endDate);
        const peakHours = await getPeakHours(merchant.id, startDate, endDate);
        const topProducts = await getTopProducts(merchant.id, 10);
        const conversionRate = await getConversionRate(merchant.id, startDate, endDate);
        const dailyMessages = await getDailyMessageCount(merchant.id, 30);

        const dateRange = input.startDate && input.endDate
          ? `${input.startDate} - ${input.endDate}`
          : 'All Time';

        const { generateExcelReport } = await import('./exportReports');
        const excelBuffer = await generateExcelReport({
          merchantName: merchant.businessName,
          dateRange,
          messageStats,
          peakHours,
          topProducts,
          conversionRate,
          dailyMessages,
        });

        // Return base64 encoded Excel
        return {
          data: excelBuffer.toString('base64'),
          filename: `sari-analytics-${Date.now()}.xlsx`,
        };
      }),
  }),

  // Dashboard Analytics — MIGRATED to routers-dashboard.ts (registered below as dashboard: dashboardRouter)
  // Inline router removed to fix duplicate key warning

  // Reviews Management
  reviews: router({
    // List all reviews for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await getCustomerReviewsByMerchantId(input.merchantId);
      }),

    // Get review statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getMerchantReviewStats } = await import('./automation/review-request');
        return await getMerchantReviewStats(input.merchantId);
      }),

    // Get review by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const review = await getCustomerReviewById(input.id);
        if (!review) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
        }

        const order = await getOrderById(review.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
        }

        const merchant = await getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return review;
      }),

    // Reply to a review
    reply: protectedProcedure
      .input(z.object({
        reviewId: z.number(),
        reply: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const review = await getCustomerReviewById(input.reviewId);
        if (!review) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
        }

        const order = await getOrderById(review.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
        }

        const merchant = await getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Update review with merchant reply
        await updateCustomerReview(input.reviewId, {
          merchantReply: input.reply,
          repliedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        });

        // Send reply via WhatsApp
        try {
          const { sendTextMessage } = await import('./whatsapp');
          const message = `شكراً لتقييمك! \n\nردنا:\n${input.reply}`;
          await sendTextMessage(review.customerPhone, message);
        } catch (error) {
          console.error('Failed to send WhatsApp reply:', error);
          // Don't fail the whole operation if WhatsApp fails
        }

        return { success: true };
      }),
  }),

  // AI & Sari Assistant
  ai: router({
    // Chat with Sari AI
    chat: protectedProcedure
      .input(z.object({
        message: z.string(),
        conversationId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { chatWithSari } = await import('./ai/sari-personality');

        const response = await chatWithSari({
          merchantId: merchant.id,
          customerPhone: 'test', // For testing
          message: input.message,
          conversationId: input.conversationId,
        });

        return { response };
      }),

    // Search products with AI
    searchProducts: protectedProcedure
      .input(z.object({
        query: z.string(),
        limit: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { searchProducts } = await import('./ai/product-intelligence');

        const products = await searchProducts({
          merchantId: merchant.id,
          query: input.query,
          limit: input.limit,
        });

        return { products };
      }),

    // Suggest products based on context
    suggestProducts: protectedProcedure
      .input(z.object({
        context: z.string(),
        limit: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { suggestProducts } = await import('./ai/product-intelligence');

        const result = await suggestProducts({
          merchantId: merchant.id,
          conversationContext: input.context,
          limit: input.limit,
        });

        return result;
      }),

    // Process voice message
    processVoice: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        audioUrl: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check voice processing limits
        const { hasReachedVoiceLimit, processVoiceMessage, incrementVoiceMessageUsage } = await import('./ai/voice-handler');

        const limitReached = await hasReachedVoiceLimit(merchant.id);
        if (limitReached) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'لقد وصلت لحد الرسائل الصوتية في باقتك. يرجى الترقية للاستمرار.'
          });
        }

        // Get conversation
        const conversation = await getConversationById(input.conversationId);
        if (!conversation || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Process voice
        const result = await processVoiceMessage({
          merchantId: merchant.id,
          conversationId: input.conversationId,
          customerPhone: conversation.customerPhone,
          customerName: conversation.customerName || undefined,
          audioUrl: input.audioUrl,
        });

        // Increment usage
        await incrementVoiceMessageUsage(merchant.id);

        return result;
      }),

    // Test OpenAI connection
    testConnection: protectedProcedure.query(async () => {
      const { testOpenAIConnection } = await import('./ai/openai');
      const isConnected = await testOpenAIConnection();
      return { connected: isConnected };
    }),

    // Generate welcome message
    generateWelcome: protectedProcedure
      .input(z.object({
        customerName: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { generateWelcomeMessage } = await import('./ai/sari-personality');

        const message = await generateWelcomeMessage({
          merchantId: merchant.id,
          customerName: input.customerName,
        });

        return { message };
      }),
  }),

  // Public Sari AI - Public demo for website visitors (no auth required)
  publicSari: router({
    // Send a message and get AI response (public, no auth)
    chat: publicProcedure
      .input(z.object({
        message: z.string().trim().min(1).max(1000),
        sessionId: z.string().regex(/^[A-Za-z0-9-]{16,100}$/),
        exampleUsed: z.string().max(500).optional(),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // SECURITY: Rate limit public AI chat to prevent cost abuse
        const { checkRateLimit, TRPC_LIMITS } = await import('./_core/rateLimiter');
        const clientIp = (ctx as any).req?.ip || (ctx as any).req?.socket?.remoteAddress || 'unknown';

        const ipCheck = checkRateLimit(`chat_ip:${clientIp}`, TRPC_LIMITS.CHAT_PER_IP.max, TRPC_LIMITS.CHAT_PER_IP.windowMs);
        if (!ipCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'عدد كبير من الرسائل. حاول مرة أخرى بعد قليل.' });
        }

        const sessionCheck = checkRateLimit(`chat_session:${input.sessionId}`, TRPC_LIMITS.CHAT_PER_SESSION.max, TRPC_LIMITS.CHAT_PER_SESSION.windowMs);
        if (!sessionCheck.allowed) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'وصلت للحد الأقصى من الرسائل في هذه الجلسة. سجل حساب لتجربة كاملة!' });
        }

        const demoMerchantId = Number(process.env.PUBLIC_DEMO_MERCHANT_ID || 0);
        if (!Number.isInteger(demoMerchantId) || demoMerchantId <= 0) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Public demo is not configured' });
        }
        const demoMerchant = await getMerchantById(demoMerchantId);

        if (!demoMerchant) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Demo merchant not configured' });
        }

        // Create a zero-count session before the external AI call. Failed calls
        // remain visible operationally but never consume a successful demo turn.
        const session = await getTrySariAnalyticsBySessionId(input.sessionId);
        if (!session) {
          const created = await upsertTrySariAnalytics({
            sessionId: input.sessionId,
            exampleUsed: input.exampleUsed,
            ipAddress: clientIp.slice(0, 64),
            userAgent: String((ctx as any).req?.headers?.['user-agent'] || '').slice(0, 500),
          });
          if (!created && !(await getTrySariAnalyticsBySessionId(input.sessionId))) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Public demo analytics unavailable' });
          }
        } else if (input.exampleUsed && !session.exampleUsed) {
          await upsertTrySariAnalytics({ sessionId: input.sessionId, exampleUsed: input.exampleUsed });
        }

        if (!(await reserveTrySariMessageSlot(input.sessionId, 5))) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'وصلت للحد الأقصى من الرسائل في هذه الجلسة. سجل حساب لتجربة كاملة!' });
        }

        try {
          const { chatWithSari } = await import('./ai/sari-personality');
          const response = await chatWithSari({
            merchantId: demoMerchant.id,
            customerPhone: input.sessionId,
            customerName: 'زائر',
            message: input.message,
          });
          return { response };
        } catch (error) {
          await releaseTrySariMessageSlot(input.sessionId);
          throw error;
        }
      }),

    // Track signup prompt shown
    trackSignupPrompt: publicProcedure
      .input(z.object({
        sessionId: z.string(),
      }))
      .mutation(async ({ input }) => {
        await markSignupPromptShown(input.sessionId);
        return { success: true };
      }),

    // Track conversion to signup
    trackConversion: publicProcedure
      .input(z.object({
        sessionId: z.string(),
      }))
      .mutation(async ({ input }) => {
        await markConvertedToSignup(input.sessionId);
        return { success: true };
      }),
  }),

  // Test Sari AI - Playground for testing conversations
  testSari: router({
    // Send a test message and get AI response
    sendMessage: protectedProcedure
      .input(z.object({
        message: z.string(),
        conversationHistory: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { chatWithSari } = await import('./ai/sari-personality');

        const response = await chatWithSari({
          merchantId: merchant.id,
          customerPhone: 'test-playground',
          customerName: 'عميل تجريبي',
          message: input.message,
        });

        return { response };
      }),

    // Reset test conversation (no-op, just for UI)
    resetConversation: protectedProcedure.mutation(async () => {
      return { success: true };
    }),

    // Save test message to database
    saveMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        sender: z.enum(['user', 'sari']),
        content: z.string(),
        responseTime: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await saveTestMessage(input);
        return { success: true };
      }),

    // Mark conversation as deal
    markAsDeal: protectedProcedure
      .input(z.object({
        conversationId: z.number().optional(),
        dealValue: z.number().positive(),
        messageCount: z.number(),
        timeToConversion: z.number(), // in seconds
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const dealId = await markTestConversationAsDeal({
          merchantId: merchant.id,
          conversationId: input.conversationId,
          dealValue: input.dealValue,
          messageCount: input.messageCount,
          timeToConversion: input.timeToConversion,
        });

        return { success: true, dealId };
      }),

    // Get all 15 metrics
    getMetrics: protectedProcedure
      .input(z.object({
        period: z.enum(['day', 'week', 'month']).default('day'),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { calculateAllMetrics } = await import('./metrics');
        const metrics = await calculateAllMetrics(merchant.id, input.period);

        return metrics;
      }),

    // Create test conversation
    createConversation: protectedProcedure
      .mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const conversationId = await createTestConversation(merchant.id);
        return { conversationId };
      }),
  }),

  // Bot Settings — REMOVED inline router (now using modular botSettingsRouter above)

  // Scheduled Messages
  scheduledMessages: router({
    // List all scheduled messages
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getScheduledMessages(merchant.id);
    }),

    // Create new scheduled message
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
        dayOfWeek: z.number().min(0).max(6),
        time: z.string().regex(/^\d{2}:\d{2}$/),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await createScheduledMessage({
          ...input,
          merchantId: merchant.id,
        });
      }),

    // Update scheduled message
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        message: z.string().min(1).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { id, ...data } = input;
        return await updateScheduledMessage(id, merchant.id, data);
      }),

    // Delete scheduled message
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        await deleteScheduledMessage(input.id, merchant.id);
        return { success: true };
      }),

    // Toggle active status
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await toggleScheduledMessage(input.id, merchant.id, input.isActive);
      }),
  }),

  // Sari Personality Settings
  personality: router({
    // Get personality settings
    get: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getOrCreatePersonalitySettings(merchant.id);
    }),

    // Update personality settings
    update: protectedProcedure
      .input(z.object({
        tone: z.enum(['friendly', 'professional', 'casual', 'enthusiastic']).optional(),
        style: z.enum(['saudi_dialect', 'formal_arabic', 'english', 'bilingual']).optional(),
        emojiUsage: z.enum(['none', 'minimal', 'moderate', 'frequent']).optional(),
        customInstructions: z.string().optional(),
        brandVoice: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await updateSariPersonalitySettings(merchant.id, input);
      }),
  }),

  // Quick Responses
  quickResponses: router({
    // List all quick responses
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await getQuickResponses(merchant.id);
    }),

    // Create quick response
    create: protectedProcedure
      .input(z.object({
        trigger: z.string().trim().min(1).max(255),
        response: z.string().trim().min(1).max(2000).refine(response => !containsUnverifiedActionClaim(response), {
          message: 'لا يمكن حفظ رد يؤكد طلباً أو حجزاً أو تحويلاً دون عملية موثقة',
        }),
        keywords: z.string().max(2000).optional(),
        priority: z.number().min(1).max(10).optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await createQuickResponse({
          ...input,
          merchantId: merchant.id,
        });
      }),

    // Update quick response
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        trigger: z.string().trim().min(1).max(255).optional(),
        response: z.string().trim().min(1).max(2000).refine(response => !containsUnverifiedActionClaim(response), {
          message: 'لا يمكن حفظ رد يؤكد طلباً أو حجزاً أو تحويلاً دون عملية موثقة',
        }).optional(),
        keywords: z.string().max(2000).optional(),
        priority: z.number().min(1).max(10).optional(),
        category: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const existingResponse = await getQuickResponseById(input.id);
        if (!existingResponse || existingResponse.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { id, isActive, ...data } = input;
        return await updateQuickResponse(id, {
          ...data,
          ...(isActive === undefined ? {} : { isActive: isActive ? 1 : 0 }),
        });
      }),

    // Delete quick response
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const existingResponse = await getQuickResponseById(input.id);
        if (!existingResponse || existingResponse.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await deleteQuickResponse(input.id);
        return { success: true };
      }),

    // Get statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const responses = await getQuickResponses(merchant.id);
      return {
        total: responses.length,
        active: responses.filter(r => r.isActive).length,
        inactive: responses.filter(r => !r.isActive).length,
      };
    }),
  }),

  // Sentiment Analysis
  sentiment: router({
    // Get sentiment statistics
    getStats: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getMerchantSentimentStats(merchant.id, input.days || 30);
      }),

    // Get sentiment distribution
    getDistribution: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const stats = await getMerchantSentimentStats(merchant.id, input.days || 30);
        return {
          positive: stats.positive,
          negative: stats.negative,
          neutral: stats.neutral,
          angry: stats.angry,
          happy: stats.happy,
          sad: stats.sad,
          frustrated: stats.frustrated,
        };
      }),
  }),

  // ============================================
  // Keyword Analysis APIs
  // ============================================
  keywords: router({
    // Get keyword statistics
    getStats: protectedProcedure
      .input(z.object({
        category: z.enum(['product', 'price', 'shipping', 'complaint', 'question', 'other']).optional(),
        status: z.enum(['new', 'reviewed', 'response_created', 'ignored']).optional(),
        minFrequency: z.number().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getKeywordStats(merchant.id, input);
      }),

    // Get new keywords that need review
    getNew: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getNewKeywords(merchant.id, input.limit || 20);
      }),

    // Get suggested responses based on frequent questions
    getSuggested: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Get top keywords
        const keywords = await getKeywordStats(merchant.id, {
          status: 'new',
          minFrequency: 3,
          limit: 10,
        });

        if (keywords.length === 0) {
          return [];
        }

        // Import AI function
        const { suggestQuickResponses } = await import('./ai/keyword-analysis');

        // Convert to format expected by AI
        const frequentQuestions = keywords.map((k: any) => ({
          question: k.keyword,
          frequency: k.frequency,
          category: k.category,
        }));

        // Get suggestions
        const suggestions = await suggestQuickResponses(frequentQuestions, {
          businessName: merchant.businessName,
        });

        return suggestions;
      }),

    // Update keyword status
    updateStatus: protectedProcedure
      .input(z.object({
        keywordId: z.number(),
        status: z.enum(['new', 'reviewed', 'response_created', 'ignored']),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const keyword = await getKeywordAnalysisById(input.keywordId);
        if (!keyword || keyword.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        await updateKeywordStatus(input.keywordId, input.status);
        return { success: true };
      }),

    // Delete keyword
    delete: protectedProcedure
      .input(z.object({
        keywordId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const keyword = await getKeywordAnalysisById(input.keywordId);
        if (!keyword || keyword.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        await deleteKeywordAnalysis(input.keywordId);
        return { success: true };
      }),
  }),

  // ============================================
  // Weekly Sentiment Reports APIs
  // ============================================
  weeklyReports: router({
    // Get merchant's weekly reports
    list: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getWeeklySentimentReports(merchant.id, input.limit || 10);
      }),

    // Get specific report
    getById: protectedProcedure
      .input(z.object({
        reportId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const report = await getWeeklySentimentReportById(input.reportId);
        if (!report || report.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        return report;
      }),

    // Generate test report (for current week)
    generateTest: protectedProcedure
      .mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Import report generator
        const { generateWeeklyReport } = await import('./reports/sentiment-weekly');

        // Generate report for current week
        const reportId = await generateWeeklyReport(merchant.id);

        return { reportId, success: true };
      }),
  }),

  // ============================================
  // A/B Testing APIs
  // ============================================
  abTests: router({
    // Create new A/B test
    create: protectedProcedure
      .input(z.object({
        testName: z.string(),
        keyword: z.string(),
        variantAText: z.string(),
        variantBText: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if there's already an active test for this keyword
        const existing = await getActiveABTestForKeyword(merchant.id, input.keyword);
        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'There is already an active A/B test for this keyword'
          });
        }

        const testId = await createABTest({
          merchantId: merchant.id,
          testName: input.testName,
          keyword: input.keyword,
          variantAText: input.variantAText,
          variantBText: input.variantBText,
        });

        return { testId, success: true };
      }),

    // Get all tests
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['running', 'completed', 'paused']).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await getABTests(merchant.id, input.status);
      }),

    // Get specific test
    getById: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const test = await getABTestById(input.testId);
        if (!test || test.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        return test;
      }),

    // Declare winner
    declareWinner: protectedProcedure
      .input(z.object({
        testId: z.number(),
        winner: z.enum(['variant_a', 'variant_b', 'no_winner']),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const test = await getABTestById(input.testId);
        if (!test || test.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Calculate confidence level based on sample size and difference
        const totalA = test.variantAUsageCount;
        const totalB = test.variantBUsageCount;
        const successRateA = totalA > 0 ? (test.variantASuccessCount / totalA) * 100 : 0;
        const successRateB = totalB > 0 ? (test.variantBSuccessCount / totalB) * 100 : 0;
        const difference = Math.abs(successRateA - successRateB);
        const sampleSize = totalA + totalB;

        // Simple confidence calculation
        let confidence = 0;
        if (sampleSize >= 100 && difference >= 10) {
          confidence = 95;
        } else if (sampleSize >= 50 && difference >= 15) {
          confidence = 90;
        } else if (sampleSize >= 30 && difference >= 20) {
          confidence = 80;
        } else {
          confidence = 50;
        }

        await declareABTestWinner(input.testId, input.winner, confidence);

        return { success: true, confidence };
      }),

    // Pause test
    pause: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const test = await getABTestById(input.testId);
        if (!test || test.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        await pauseABTest(input.testId);
        return { success: true };
      }),

    // Resume test
    resume: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const test = await getABTestById(input.testId);
        if (!test || test.merchantId !== merchant.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        await resumeABTest(input.testId);
        return { success: true };
      }),
  }),

  // Try Sari Analytics (Admin only)
  trySariAnalytics: router({
    // Get analytics stats
    getStats: adminProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ input }) => {
        return await getTrySariAnalyticsStats(input.days || 30);
      }),

    // Get daily data for charts
    getDailyData: adminProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ input }) => {
        return await getTrySariDailyData(input.days || 30);
      }),
  }),

  // Insights router
  insights: insightsRouter,

  // Performance Metrics
  performance: performanceRouter,

  // Offers and AB Testing
  offers: offersRouter.offers,
  signupPrompt: offersRouter.signupPrompt,

  // Merchant Promotions — AI-driven promotional offers
  promotions: promotionsRouter,

  // Media Library — centralized media asset management
  media: mediaRouter,

  // SEO Router
  seo: router({
    // Dashboard
    getDashboard: adminProcedure.query(async () => {
      return await seoDb.getSeoPageDashboard();
    }),

    // Pages
    getPages: adminProcedure.query(async () => {
      return await seoDb.getSeoPages();
    }),

    getPageBySlug: adminProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        return await seoDb.getSeoPageBySlug(input.slug);
      }),

    getPageFullData: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getSeoPageFullData(input.pageId);
      }),

    createPage: adminProcedure
      .input(z.object({
        pageSlug: z.string(),
        pageTitle: z.string(),
        pageDescription: z.string(),
        keywords: z.string().optional(),
        author: z.string().optional(),
        canonicalUrl: z.string().optional(),
        isIndexed: z.number().optional(),
        isPriority: z.number().optional(),
        changeFrequency: z.string().optional(),
        priority: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await seoDb.createSeoPage(input);
      }),

    updatePage: adminProcedure
      .input(z.object({
        pageId: z.number(),
        pageSlug: z.string().optional(),
        pageTitle: z.string().optional(),
        pageDescription: z.string().optional(),
        keywords: z.string().optional(),
        author: z.string().optional(),
        canonicalUrl: z.string().optional(),
        isIndexed: z.number().min(0).max(1).optional(),
        isPriority: z.number().min(0).max(1).optional(),
        changeFrequency: z.string().optional(),
        priority: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { pageId, ...safeData } = input;
        // Only pass defined fields
        const data: Record<string, any> = {};
        for (const [k, v] of Object.entries(safeData)) {
          if (v !== undefined) data[k] = v;
        }
        return await seoDb.updateSeoPage(pageId, data);
      }),

    // Meta Tags
    getMetaTags: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getMetaTagsByPageId(input.pageId);
      }),

    createMetaTag: adminProcedure
      .input(z.object({
        pageId: z.number(),
        metaName: z.string(),
        metaContent: z.string(),
        metaProperty: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await seoDb.createMetaTag(input);
      }),

    // Open Graph
    getOpenGraph: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getOpenGraphByPageId(input.pageId);
      }),

    createOpenGraph: adminProcedure
      .input(z.object({
        pageId: z.number(),
        ogTitle: z.string(),
        ogDescription: z.string(),
        ogImage: z.string().optional(),
        ogImageAlt: z.string().optional(),
        ogImageWidth: z.number().optional(),
        ogImageHeight: z.number().optional(),
        ogType: z.string().optional(),
        ogUrl: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return await seoDb.createOpenGraph(input);
      }),

    // Tracking Codes
    getTrackingCodes: adminProcedure.query(async () => {
      return await seoDb.getTrackingCodes();
    }),

    // Public endpoint — tracking pixels must load for all visitors
    getPublicTrackingCodes: publicProcedure.query(async () => {
      const codes = await seoDb.getTrackingCodes();
      // Only return active codes, strip internal fields
      // SEC-01: Sanitize trackingId server-side to prevent stored XSS
      const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9\-_.\/]/g, '').substring(0, 100);
      return (codes || [])
        .filter((c: any) => c.isActive === 1)
        .map((c: any) => ({ type: c.trackingType, trackingId: sanitizeId(c.trackingId || '') }))
        .filter((c: any) => c.trackingId.length > 0);
    }),

    createTrackingCode: adminProcedure
      .input(z.object({
        pageId: z.number().optional(),
        trackingType: z.enum(['google_analytics', 'google_tag_manager', 'facebook_pixel', 'tiktok_pixel', 'snapchat_pixel', 'custom']),
        // SEC-01: Only allow safe characters in tracking IDs to prevent stored XSS
        trackingId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_.\/]+$/, 'Invalid tracking ID format'),
        trackingCode: z.string().max(5000).optional(),
        isActive: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        return await seoDb.createTrackingCode(input);
      }),

    // Analytics
    getAnalytics: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getAnalyticsByPageId(input.pageId);
      }),

    // Keywords
    getKeywords: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getKeywordsByPageId(input.pageId);
      }),

    // Backlinks
    getBacklinks: adminProcedure
      .input(z.object({ pageId: z.number() }))
      .query(async ({ input }) => {
        return await seoDb.getBacklinksByPageId(input.pageId);
      }),

    // Sitemaps
    getSitemaps: adminProcedure
      .input(z.object({ type: z.string().optional() }))
      .query(async ({ input }) => {
        return await seoDb.getSitemaps(input.type);
      }),

    // Recommendations
    getRecommendations: adminProcedure
      .input(z.object({ pageId: z.number().optional() }))
      .query(async ({ input }) => {
        if (input.pageId) {
          return await seoDb.getRecommendationsByPageId(input.pageId);
        }
        return await seoDb.getPendingRecommendations();
      }),

    getAllRecommendations: adminProcedure
      .query(async () => {
        return await seoDb.getPendingRecommendations();
      }),

    updateRecommendation: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['pending', 'in_progress', 'completed', 'dismissed']).optional(),
        completedAt: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const updateData: any = {};
        if (input.status) updateData.status = input.status;
        if (input.completedAt) updateData.completedAt = input.completedAt;
        return await seoDb.updateRecommendation(input.id, updateData);
      }),

    // Seed all SEO data (one-time admin action)
    seedAllData: adminProcedure.mutation(async () => {
      const { seedAllSeoData } = await import('./seo-seed');
      return await seedAllSeoData();
    }),
  }),

  // Canonical setup wizard lives in one module to prevent contract drift.
  setupWizard: setupWizardRouter,

  // Google Calendar Integration
  calendar: router({
    // Get authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const { getAuthUrl } = await import('./_core/googleCalendar');
      const authUrl = getAuthUrl(merchant.id.toString());

      return { authUrl };
    }),

    // Handle OAuth callback (called from backend route)
    handleCallback: protectedProcedure
      .input(z.object({
        code: z.string(),
        calendarId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { getTokensFromCode } = await import('./_core/googleCalendar');
        const tokens = await getTokensFromCode(input.code);

        // Save integration
        const existing = await getGoogleIntegration(merchant.id, 'calendar');

        if (existing) {
          await updateGoogleIntegration(existing.id, {
            credentials: JSON.stringify(tokens),
            calendarId: input.calendarId || existing.calendarId,
            isActive: 1,
          });
        } else {
          await createGoogleIntegration({
            merchantId: merchant.id,
            integrationType: 'calendar',
            credentials: JSON.stringify(tokens),
            calendarId: input.calendarId || 'primary',
            isActive: 1,
          });
        }

        return { success: true };
      }),

    // Get available time slots
    getAvailableSlots: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        date: z.string(), // YYYY-MM-DD
        staffId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        // Get service details
        const service = await getServiceById(input.serviceId);
        if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

        // Get Google Calendar integration
        const integration = await getGoogleIntegration(merchant.id, 'calendar');
        if (!integration || !integration.isActive) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google Calendar not connected' });
        }

        const credentials = JSON.parse(integration.credentials || '{}');
        const { getAvailableSlots, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

        // Validate and refresh credentials if needed
        const validCredentials = await validateAndRefreshCredentials(credentials);

        // Update credentials if refreshed
        if (JSON.stringify(validCredentials) !== JSON.stringify(credentials)) {
          await updateGoogleIntegration(integration.id, {
            credentials: JSON.stringify(validCredentials),
          });
        }

        // Get working hours from merchant or staff
        let workingHours = { start: '09:00', end: '17:00' };

        if (input.staffId) {
          const staff = await getStaffMemberById(input.staffId);
          if (staff && staff.workingHours) {
            const staffHours = JSON.parse(staff.workingHours);
            const dayName = new Date(input.date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            if (staffHours[dayName]) {
              workingHours = staffHours[dayName];
            }
          }
        } else if (merchant.workingHours) {
          const merchantHours = JSON.parse(merchant.workingHours);
          // @ts-ignore
          const dayName = new Date(input.date).toLocaleDateString('en-US', { weekday: 'lowercase' });
          if (merchantHours[dayName]) {
            workingHours = merchantHours[dayName];
          }
        }

        // Get available slots
        const slots = await getAvailableSlots(
          validCredentials,
          integration.calendarId || 'primary',
          new Date(input.date),
          service.durationMinutes,
          workingHours,
          service.bufferTimeMinutes
        );

        return { slots };
      }),

    // Book appointment
    bookAppointment: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        customerPhone: z.string(),
        customerName: z.string(),
        appointmentDate: z.string(), // YYYY-MM-DD
        startTime: z.string(), // HH:MM
        staffId: z.number().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        // Get service details
        const service = await getServiceById(input.serviceId);
        if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

        // Calculate end time
        const [startHour, startMinute] = input.startTime.split(':').map(Number);
        const endDate = new Date(input.appointmentDate);
        endDate.setHours(startHour, startMinute + service.durationMinutes, 0, 0);
        const endTime = endDate.toTimeString().substring(0, 5);

        // Check for conflicts
        const hasConflict = await checkAppointmentConflict(
          merchant.id,
          input.appointmentDate,
          input.startTime,
          endTime,
          input.staffId
        );

        if (hasConflict) {
          throw new TRPCError({ code: 'CONFLICT', message: 'This time slot is already booked' });
        }

        // Get Google Calendar integration
        const integration = await getGoogleIntegration(merchant.id, 'calendar');
        let googleEventId: string | undefined;

        if (integration && integration.isActive) {
          const credentials = JSON.parse(integration.credentials || '{}');
          const { createCalendarEvent, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

          // Validate and refresh credentials if needed
          const validCredentials = await validateAndRefreshCredentials(credentials);

          // Create calendar event
          const startDateTime = new Date(`${input.appointmentDate}T${input.startTime}:00`);
          const endDateTime = new Date(startDateTime.getTime() + service.durationMinutes * 60000);

          try {
            const event = await createCalendarEvent(
              validCredentials,
              integration.calendarId || 'primary',
              {
                summary: `${service.name} - ${input.customerName}`,
                description: `Customer: ${input.customerName}\nPhone: ${input.customerPhone}\nService: ${service.name}${input.notes ? `\nNotes: ${input.notes}` : ''}`,
                start: startDateTime,
                end: endDateTime,
              }
            );

            googleEventId = event.id || undefined;
          } catch (error) {
            console.error('Failed to create calendar event:', error);
            // Continue without calendar event
          }
        }

        // Create appointment in database
        const appointmentId = await createAppointment({
          merchantId: merchant.id,
          customerPhone: input.customerPhone,
          customerName: input.customerName,
          serviceId: input.serviceId,
          staffId: input.staffId,
          appointmentDate: input.appointmentDate,
          startTime: input.startTime,
          endTime: endTime,
          status: 'confirmed',
          googleEventId: googleEventId,
          notes: input.notes,
        });

        return { success: true, appointmentId };
      }),

    // Cancel appointment
    cancelAppointment: protectedProcedure
      .input(z.object({
        appointmentId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        // Get appointment
        const appointment = await getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });

        // Verify ownership
        if (appointment.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        // Delete from Google Calendar if exists
        if (appointment.googleEventId) {
          const integration = await getGoogleIntegration(merchant.id, 'calendar');
          if (integration && integration.isActive) {
            const credentials = JSON.parse(integration.credentials || '{}');
            const { deleteCalendarEvent, validateAndRefreshCredentials } = await import('./_core/googleCalendar');

            try {
              const validCredentials = await validateAndRefreshCredentials(credentials);
              await deleteCalendarEvent(
                validCredentials,
                integration.calendarId || 'primary',
                appointment.googleEventId
              );
            } catch (error) {
              console.error('Failed to delete calendar event:', error);
              // Continue with cancellation
            }
          }
        }

        // Cancel appointment in database
        await cancelAppointment(input.appointmentId, input.reason);

        return { success: true };
      }),

    // List appointments
    listAppointments: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const appointments = await getAppointmentsByMerchant(merchant.id, input.status);

        // Filter by date range if provided
        let filtered = appointments;
        if (input.startDate) {
          filtered = filtered.filter(a => a.appointmentDate >= input.startDate!);
        }
        if (input.endDate) {
          filtered = filtered.filter(a => a.appointmentDate <= input.endDate!);
        }

        return { appointments: filtered };
      }),

    // Get appointment statistics
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const stats = await getAppointmentStats(merchant.id, input.startDate, input.endDate);

        return stats;
      }),

    // Disconnect Google Calendar
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const integration = await getGoogleIntegration(merchant.id, 'calendar');
      if (integration) {
        await deleteGoogleIntegration(integration.id);
      }

      return { success: true };
    }),

    // Get integration status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const integration = await getGoogleIntegration(merchant.id, 'calendar');

      return {
        connected: !!integration && integration.isActive === 1,
        calendarId: integration?.calendarId,
        lastSync: integration?.lastSync,
      };
    }),
  }),

  // Staff Members Management
  staff: router({
    // Create staff member
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        role: z.string().optional(),
        workingHours: z.record(z.string(), z.object({
          start: z.string(),
          end: z.string(),
        })).optional(),
        googleCalendarId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const staffId = await createStaffMember({
          merchantId: merchant.id,
          name: input.name,
          phone: input.phone,
          email: input.email,
          role: input.role,
          workingHours: input.workingHours ? JSON.stringify(input.workingHours) : undefined,
          googleCalendarId: input.googleCalendarId,
          isActive: 1,
        });

        return { success: true, staffId };
      }),

    // List staff members
    list: protectedProcedure
      .input(z.object({
        activeOnly: z.boolean().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const staff = input?.activeOnly
          ? await getActiveStaffByMerchant(merchant.id)
          : await getStaffMembersByMerchant(merchant.id);

        return { staff };
      }),

    // Get staff member by ID
    getById: protectedProcedure
      .input(z.object({ staffId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const staff = await getStaffMemberById(input.staffId);
        if (!staff || staff.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
        }

        return { staff };
      }),

    // Update staff member
    update: protectedProcedure
      .input(z.object({
        staffId: z.number(),
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        role: z.string().optional(),
        workingHours: z.record(z.string(), z.object({
          start: z.string(),
          end: z.string(),
        })).optional(),
        googleCalendarId: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        // Verify ownership
        const staff = await getStaffMemberById(input.staffId);
        if (!staff || staff.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
        }

        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.phone !== undefined) updateData.phone = input.phone;
        if (input.email !== undefined) updateData.email = input.email;
        if (input.role !== undefined) updateData.role = input.role;
        if (input.workingHours !== undefined) updateData.workingHours = JSON.stringify(input.workingHours);
        if (input.googleCalendarId !== undefined) updateData.googleCalendarId = input.googleCalendarId;
        if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

        await updateStaffMember(input.staffId, updateData);

        return { success: true };
      }),

    // Delete staff member
    delete: protectedProcedure
      .input(z.object({ staffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        // Verify ownership
        const staff = await getStaffMemberById(input.staffId);
        if (!staff || staff.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
        }

        await deleteStaffMember(input.staffId);

        return { success: true };
      }),
  }),

  googleAuth: googleAuthRouter,

  sheets: sheetsRouter,

  loyalty: loyaltyRouter,

  // Team Members RBAC
  team: teamRouter,

  // Platform Integrations
  zid: zidRouter,
  calendly: calendlyRouter,

  // Advanced Notifications & Reports
  advancedNotifications: notificationsRouter,

  // Notification Management (Super Admin)
  notificationManagement: notificationManagementRouter,

  // ============================================
  // Services Management
  // ============================================
  services: router({
    // Create service
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        category: z.string().optional(),
        categoryId: z.number().optional(),
        priceType: z.enum(['fixed', 'variable', 'custom']),
        basePrice: z.number().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        durationMinutes: z.number(),
        bufferTimeMinutes: z.number().optional(),
        requiresAppointment: z.boolean().optional(),
        maxBookingsPerDay: z.number().optional(),
        advanceBookingDays: z.number().optional(),
        staffIds: z.array(z.number()).optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const serviceId = await createService({
          merchantId: merchant.id,
          name: input.name,
          description: input.description,
          category: input.category,
          categoryId: input.categoryId,
          priceType: input.priceType,
          basePrice: input.basePrice,
          minPrice: input.minPrice,
          maxPrice: input.maxPrice,
          durationMinutes: input.durationMinutes,
          bufferTimeMinutes: input.bufferTimeMinutes || 0,
          requiresAppointment: input.requiresAppointment ? 1 : 0,
          maxBookingsPerDay: input.maxBookingsPerDay,
          advanceBookingDays: input.advanceBookingDays || 30,
          staffIds: input.staffIds ? JSON.stringify(input.staffIds) : undefined,
          displayOrder: input.displayOrder || 0,
          isActive: 1,
        });

        return { success: true, serviceId };
      }),

    // List services
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const services = await getServicesByMerchant(merchant.id);
      return { services };
    }),

    // Get service by ID with booking stats
    getById: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        // Get booking statistics
        const bookingStats = await getBookingStats(merchant.id, { serviceId: input.serviceId });

        // Get recent bookings
        const recentBookings = await getBookingsByService(input.serviceId, { limit: 10 } as any);

        // Get rating stats
        const ratingStats = await getServiceRatingStats(input.serviceId);

        return {
          service,
          bookingStats,
          recentBookings,
          ratingStats
        };
      }),

    // Update service
    update: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        categoryId: z.number().optional(),
        priceType: z.enum(['fixed', 'variable', 'custom']).optional(),
        basePrice: z.number().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        durationMinutes: z.number().optional(),
        bufferTimeMinutes: z.number().optional(),
        requiresAppointment: z.boolean().optional(),
        maxBookingsPerDay: z.number().optional(),
        advanceBookingDays: z.number().optional(),
        staffIds: z.array(z.number()).optional(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.category !== undefined) updateData.category = input.category;
        if (input.categoryId !== undefined) updateData.categoryId = input.categoryId;
        if (input.priceType !== undefined) updateData.priceType = input.priceType;
        if (input.basePrice !== undefined) updateData.basePrice = input.basePrice;
        if (input.minPrice !== undefined) updateData.minPrice = input.minPrice;
        if (input.maxPrice !== undefined) updateData.maxPrice = input.maxPrice;
        if (input.durationMinutes !== undefined) updateData.durationMinutes = input.durationMinutes;
        if (input.bufferTimeMinutes !== undefined) updateData.bufferTimeMinutes = input.bufferTimeMinutes;
        if (input.requiresAppointment !== undefined) updateData.requiresAppointment = input.requiresAppointment ? 1 : 0;
        if (input.maxBookingsPerDay !== undefined) updateData.maxBookingsPerDay = input.maxBookingsPerDay;
        if (input.advanceBookingDays !== undefined) updateData.advanceBookingDays = input.advanceBookingDays;
        if (input.staffIds !== undefined) updateData.staffIds = JSON.stringify(input.staffIds);
        if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
        if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

        await updateService(input.serviceId, updateData);

        return { success: true };
      }),

    // Delete service
    delete: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        await deleteService(input.serviceId);

        return { success: true };
      }),

    // Get services by category
    getByCategory: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const services = await getServicesByCategory(input.categoryId);
        return { services };
      }),
  }),

  // ============================================
  // Service Categories Management
  // ============================================
  serviceCategories: router({
    // Create category
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        nameEn: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        displayOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const categoryId = await createServiceCategory({
          merchantId: merchant.id,
          name: input.name,
          nameEn: input.nameEn,
          description: input.description,
          icon: input.icon,
          color: input.color,
          displayOrder: input.displayOrder || 0,
        });

        return { success: true, categoryId };
      }),

    // List categories
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const categories = await getServiceCategoriesByMerchant(merchant.id);
      return { categories };
    }),

    // Update category
    update: protectedProcedure
      .input(z.object({
        categoryId: z.number(),
        name: z.string().optional(),
        nameEn: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        displayOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const category = await getServiceCategoryById(input.categoryId);
        if (!category || category.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }

        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.nameEn !== undefined) updateData.nameEn = input.nameEn;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.icon !== undefined) updateData.icon = input.icon;
        if (input.color !== undefined) updateData.color = input.color;
        if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
        if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

        await updateServiceCategory(input.categoryId, updateData);

        return { success: true };
      }),

    // Delete category
    delete: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const category = await getServiceCategoryById(input.categoryId);
        if (!category || category.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }

        await deleteServiceCategory(input.categoryId);

        return { success: true };
      }),
  }),

  // ============================================
  // Service Packages Management
  // ============================================
  servicePackages: router({
    // Create package
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        serviceIds: z.array(z.number()),
        originalPrice: z.number(),
        packagePrice: z.number(),
        discountPercentage: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const packageId = await createServicePackage({
          merchantId: merchant.id,
          name: input.name,
          description: input.description,
          serviceIds: JSON.stringify(input.serviceIds),
          originalPrice: input.originalPrice,
          packagePrice: input.packagePrice,
          discountPercentage: input.discountPercentage,
          isActive: 1,
        });

        return { success: true, packageId };
      }),

    // List packages
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const packages = await getServicePackagesByMerchant(merchant.id);
      return { packages };
    }),

    // Get package by ID
    getById: protectedProcedure
      .input(z.object({ packageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const pkg = await getServicePackageById(input.packageId);
        if (!pkg || pkg.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
        }

        return { package: pkg };
      }),

    // Update package
    update: protectedProcedure
      .input(z.object({
        packageId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        serviceIds: z.array(z.number()).optional(),
        originalPrice: z.number().optional(),
        packagePrice: z.number().optional(),
        discountPercentage: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const pkg = await getServicePackageById(input.packageId);
        if (!pkg || pkg.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
        }

        const updateData: any = {};
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.serviceIds !== undefined) updateData.serviceIds = JSON.stringify(input.serviceIds);
        if (input.originalPrice !== undefined) updateData.originalPrice = input.originalPrice;
        if (input.packagePrice !== undefined) updateData.packagePrice = input.packagePrice;
        if (input.discountPercentage !== undefined) updateData.discountPercentage = input.discountPercentage;
        if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;

        await updateServicePackage(input.packageId, updateData);

        return { success: true };
      }),

    // Delete package
    delete: protectedProcedure
      .input(z.object({ packageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const pkg = await getServicePackageById(input.packageId);
        if (!pkg || pkg.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
        }

        await deleteServicePackage(input.packageId);

        return { success: true };
      }),
  }),

  // Google OAuth Settings (Super Admin only) — modularized to routers-google-oauth-settings.ts
  googleOAuthSettings: googleOAuthSettingsRouter,

  // ============================================
  // Bookings Management
  // ============================================
  bookings: router({
    // Create a new booking
    create: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        customerPhone: z.string().min(8).max(20).regex(/^\+?\d+$/, 'Invalid phone format'),
        customerName: z.string().max(255).optional(),
        customerEmail: z.string().email().optional(),
        staffId: z.number().optional(),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
        durationMinutes: z.number().min(1).max(1440),
        basePrice: z.number().min(0),
        discountAmount: z.number().min(0).optional(),
        finalPrice: z.number().min(0),
        notes: z.string().max(2000).optional(),
        bookingSource: z.enum(['whatsapp', 'website', 'phone', 'walk_in']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // PEN-BK-01: Verify service belongs to this merchant
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        // Check for conflicts
        const hasConflict = await checkBookingConflict(
          input.serviceId,
          input.staffId || null,
          input.bookingDate,
          input.startTime,
          input.endTime
        );

        if (hasConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This time slot is already booked'
          });
        }

        const bookingId = await createBooking({
          merchantId: merchant.id,
          ...input,
        });

        return { success: true, bookingId };
      }),

    // Get booking by ID
    getById: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const booking = await getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }

        return { booking };
      }),

    // List bookings with filters
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
        serviceId: z.number().optional(),
        staffId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(500).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const bookings = await getBookingsByMerchant(merchant.id, input);
        return { bookings };
      }),

    // Get bookings by service
    getByService: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // PEN-BK-02: Verify service belongs to this merchant
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const bookings = await getBookingsByService(input.serviceId, input);
        return { bookings };
      }),

    // Get bookings by customer
    getByCustomer: protectedProcedure
      .input(z.object({ customerPhone: z.string() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const bookings = await getBookingsByCustomer(merchant.id, input.customerPhone);
        return { bookings };
      }),

    // Update booking
    update: protectedProcedure
      .input(z.object({
        bookingId: z.number(),
        status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
        paymentStatus: z.enum(['unpaid', 'paid', 'refunded']).optional(),
        staffId: z.number().optional(),
        bookingDate: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        notes: z.string().optional(),
        cancellationReason: z.string().optional(),
        cancelledBy: z.enum(['customer', 'merchant', 'system']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const booking = await getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }

        // Check for conflicts if time is being changed
        if (input.bookingDate || input.startTime || input.endTime) {
          const hasConflict = await checkBookingConflict(
            booking.serviceId,
            input.staffId || booking.staffId,
            input.bookingDate || booking.bookingDate as any,
            input.startTime || booking.startTime,
            input.endTime || booking.endTime,
            booking.id
          );

          if (hasConflict) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'This time slot is already booked'
            });
          }
        }

        const { bookingId, ...updateData } = input;
        await updateBooking(bookingId, updateData);

        return { success: true };
      }),

    // Delete booking
    delete: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const booking = await getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }

        await deleteBooking(input.bookingId);
        return { success: true };
      }),

    // Get booking statistics
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        serviceId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const stats = await getBookingStats(merchant.id, input);
        return { stats };
      }),

    // Check availability
    checkAvailability: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        staffId: z.number().optional(),
        bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
      }))
      .query(async ({ ctx, input }) => {
        // PEN-BK-03: Verify service belongs to this merchant
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const hasConflict = await checkBookingConflict(
          input.serviceId,
          input.staffId || null,
          input.bookingDate,
          input.startTime,
          input.endTime
        );

        return { available: !hasConflict };
      }),

    // Get available time slots
    getAvailableSlots: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
        staffId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        // PEN-BK-04: Verify service belongs to this merchant
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const slots = await getAvailableTimeSlots(
          input.serviceId,
          input.date,
          input.staffId
        );
        return { slots };
      }),
  }),

  // ============================================
  // Booking Reviews
  // ============================================
  bookingReviews: router({
    // Create a review
    create: protectedProcedure
      .input(z.object({
        bookingId: z.number(),
        serviceId: z.number(),
        staffId: z.number().optional(),
        customerPhone: z.string(),
        customerName: z.string().optional(),
        overallRating: z.number().min(1).max(5),
        serviceQuality: z.number().min(1).max(5).optional(),
        professionalism: z.number().min(1).max(5).optional(),
        valueForMoney: z.number().min(1).max(5).optional(),
        comment: z.string().optional(),
        isPublic: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // PEN-BK-11: Verify booking belongs to this merchant
        const booking = await getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }

        const reviewId = await createBookingReview({
          merchantId: merchant.id,
          ...input,
          isPublic: input.isPublic ? 1 : 0,
        });

        return { success: true, reviewId };
      }),

    // List reviews
    list: protectedProcedure
      .input(z.object({
        serviceId: z.number().optional(),
        staffId: z.number().optional(),
        minRating: z.number().optional(),
        isPublic: z.boolean().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const reviews = await getBookingReviews(merchant.id, {
          ...input,
          isPublic: input.isPublic !== undefined ? (input.isPublic ? 1 : 0) : undefined,
        });
        return { reviews };
      }),

    // Get reviews by service
    getByService: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ ctx, input }) => {
        // PEN-BK-05: Verify service belongs to this merchant
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const reviews = await getReviewsByService(input.serviceId);
        return { reviews };
      }),

    // Reply to review
    reply: protectedProcedure
      .input(z.object({
        reviewId: z.number(),
        reply: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // PEN-BK-06: Verify review belongs to this merchant
        const review = await getBookingReviewById(input.reviewId);
        if (!review || review.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
        }

        await replyToReview(input.reviewId, input.reply);
        return { success: true };
      }),

    // Get rating statistics
    getStats: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ ctx, input }) => {
        // PEN-BK-07: Verify service belongs to this merchant
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const service = await getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }

        const stats = await getServiceRatingStats(input.serviceId);
        return { stats };
      }),
  }),

  // ============================================
  // Payment System - Tap Payments Integration
  // ============================================
  payments: router({
    // Public checkout data contains no merchant credentials or customer information.
    getPublicLink: publicProcedure
      .input(z.object({ linkId: z.string().regex(PAYMENT_LINK_ID_PATTERN) }).strict())
      .query(async ({ input }) => {
        const dbPayments = await import('./db_payments');
        const { getPaymentLinkAvailability } = await import('./payment/payment-link-policy');
        const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
        if (!link) throw new TRPCError({ code: 'NOT_FOUND', message: 'رابط الدفع غير موجود' });

        const availability = getPaymentLinkAvailability(link);
        return {
          linkId: link.linkId,
          title: link.title,
          description: link.description,
          amount: link.amount,
          currency: link.currency,
          available: availability.available,
          unavailableReason: availability.available ? null : availability.reason,
        };
      }),

    checkoutLink: publicProcedure
      .input(z.object({
        linkId: z.string().regex(PAYMENT_LINK_ID_PATTERN),
        customerName: z.string().trim().min(2).max(120),
        customerPhone: z.string().trim().min(9).max(20),
        customerEmail: z.string().trim().email().max(255).optional(),
        checkoutAttemptId: z.string().uuid(),
      }).strict())
      .mutation(async ({ input }) => {
        const dbPayments = await import('./db_payments');
        const {
          buildTapCheckoutIdempotentReference,
          getPaymentLinkAvailability,
          halalasToTapAmount,
          isTapPaymentReady,
          normalizeSaudiPhone,
          readPaymentLinkId,
          validateTapCheckoutCharge,
        } =
          await import('./payment/payment-link-policy');
        const { postTapCharge, TapClientError } = await import('./payment/tap-client');
        const { publicPaymentUrls } = await import('./utils/public-url');

        const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
        if (!link) throw new TRPCError({ code: 'NOT_FOUND', message: 'رابط الدفع غير موجود' });

        const availability = getPaymentLinkAvailability(link);
        if (!availability.available) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الدفع غير متاح أو منتهي' });
        }

        const settings = await getMerchantPaymentSettings(link.merchantId);
        if (!settings || !settings.tapSecretKey || !isTapPaymentReady(settings)) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'بوابة الدفع غير جاهزة لهذا المتجر' });
        }
        if (link.currency !== 'SAR') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'عملة رابط الدفع غير مدعومة' });
        }

        let phoneNumber: string;
        try {
          phoneNumber = normalizeSaudiPhone(input.customerPhone);
        } catch {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'رقم الجوال غير صالح' });
        }

        const idempotentReference = buildTapCheckoutIdempotentReference(link.id, input.checkoutAttemptId);
        const localMetadata = { paymentLinkId: link.id };
        const chargePayload = {
          amount: halalasToTapAmount(link.amount),
          currency: link.currency,
          customer: {
            first_name: input.customerName,
            email: input.customerEmail,
            phone: { country_code: '966', number: phoneNumber },
          },
          source: { id: 'src_all' },
          redirect: { url: publicPaymentUrls.linkStatus(link.linkId) },
          post: { url: publicPaymentUrls.webhook() },
          description: link.description || link.title,
          metadata: { udf1: idempotentReference },
          reference: {
            transaction: idempotentReference,
            order: idempotentReference,
            idempotent: idempotentReference,
          },
        };

        let tapResponse: Awaited<ReturnType<typeof postTapCharge>>;
        try {
          tapResponse = await postTapCharge(settings.tapSecretKey, chargePayload);
        } catch (error) {
          console.error('[PaymentLink] Tap charge creation failed', {
            merchantId: link.merchantId,
            paymentLinkId: link.id,
            failure: error instanceof TapClientError ? error.failure : 'unknown',
          });
          throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر إنشاء جلسة الدفع، حاول لاحقاً' });
        }
        if (!tapResponse.ok) {
          console.error('[PaymentLink] Tap charge creation rejected', {
            merchantId: link.merchantId,
            paymentLinkId: link.id,
            status: tapResponse.status,
          });
          throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر إنشاء جلسة الدفع، حاول لاحقاً' });
        }
        const charge = validateTapCheckoutCharge(tapResponse.body, {
          amountInHalalas: link.amount,
          currency: 'SAR',
          testMode: Boolean(settings.tapTestMode),
        });
        if (!charge) {
          console.error('[PaymentLink] Tap returned an inconsistent checkout charge', {
            merchantId: link.merchantId,
            paymentLinkId: link.id,
          });
          throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر إنشاء جلسة الدفع، حاول لاحقاً' });
        }

        const payment = await dbPayments.createOrderPaymentIdempotent({
          merchantId: link.merchantId,
          orderId: link.orderId,
          bookingId: link.bookingId,
          customerPhone: `+966${phoneNumber}`,
          customerName: input.customerName,
          customerEmail: input.customerEmail || null,
          amount: link.amount,
          currency: link.currency,
          tapChargeId: charge.id,
          tapPaymentUrl: charge.paymentUrl,
          status: 'pending',
          description: link.description || link.title,
          metadata: JSON.stringify(localMetadata),
          expiresAt: charge.expiresInMs
            ? new Date(Date.now() + charge.expiresInMs).toISOString()
            : null,
        });
        if (
          payment.merchantId !== link.merchantId
          || payment.orderId !== link.orderId
          || payment.bookingId !== link.bookingId
          || payment.amount !== link.amount
          || payment.currency !== link.currency
          || payment.tapChargeId !== charge.id
          || payment.tapPaymentUrl !== charge.paymentUrl
          || readPaymentLinkId(payment.metadata) !== link.id
        ) {
          console.error('[PaymentLink] Idempotent Tap charge conflicts with its local payment identity', {
            merchantId: link.merchantId,
            paymentLinkId: link.id,
          });
          throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر مطابقة جلسة الدفع' });
        }

        return { paymentUrl: payment.tapPaymentUrl };
      }),

    getPublicLinkPaymentStatus: publicProcedure
      .input(z.object({
        linkId: z.string().regex(PAYMENT_LINK_ID_PATTERN),
        chargeId: z.string().regex(TAP_CHARGE_ID_PATTERN),
      }).strict())
      .query(async ({ input }) => {
        const dbPayments = await import('./db_payments');
        const { readPaymentLinkId } = await import('./payment/payment-link-policy');
        const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
        const payment = await dbPayments.getOrderPaymentByTapChargeId(input.chargeId);
        const owned = Boolean(
          link
          && payment
          && payment.merchantId === link.merchantId
          && readPaymentLinkId(payment.metadata) === link.id,
        );
        return { status: toPublicOrderPaymentStatus(owned ? payment?.status : undefined) };
      }),

    getPublicChargeStatus: publicProcedure
      .input(z.object({ chargeId: z.string().regex(TAP_CHARGE_ID_PATTERN) }).strict())
      .query(async ({ input }) => {
        const dbPayments = await import('./db_payments');
        const payment = await dbPayments.getOrderPaymentByTapChargeId(input.chargeId);
        return { status: toPublicOrderPaymentStatus(payment?.status) };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        const payment = await dbPayments.getOrderPaymentById(input.id);
        if (!payment || payment.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
        }
        return payment;
      }),

    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        const filters: any = { status: input.status, limit: input.limit };
        if (input.startDate) filters.startDate = new Date(input.startDate);
        if (input.endDate) filters.endDate = new Date(input.endDate);
        return await dbPayments.getOrderPaymentsByMerchant(merchant.id, filters);
      }),

    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await dbPayments.getPaymentStats(merchant.id, startDate, endDate);
      }),

    createLink: protectedProcedure
      .input(z.object({
        title: z.string().trim().min(2).max(255),
        description: z.string().trim().max(1000).optional(),
        amount: z.number().int().min(100).max(100_000_000),
        currency: z.enum(['SAR']).default('SAR'),
        isFixedAmount: z.boolean().default(true),
        maxUsageCount: z.number().int().min(1).max(100_000).optional(),
        expiresAt: z.string().optional(),
        orderId: z.number().int().positive().optional(),
        bookingId: z.number().int().positive().optional(),
      }).refine(input => !(input.orderId && input.bookingId), {
        message: 'لا يمكن ربط رابط الدفع بطلب وحجز معاً',
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        if (input.orderId) {
          const order = await getOrderById(input.orderId);
          if (!order || order.merchantId !== merchant.id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
          }
        }
        if (input.bookingId) {
          const booking = await getBookingById(input.bookingId);
          if (!booking || booking.merchantId !== merchant.id) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
          }
        }
        const dbPayments = await import('./db_payments');
        const crypto = await import('node:crypto');
        const linkId = `link_${crypto.randomBytes(16).toString('hex')}`;
        const { publicPaymentUrls } = await import('./utils/public-url');
        const tapPaymentUrl = publicPaymentUrls.link(linkId);

        const link = await dbPayments.createPaymentLink({
          merchantId: merchant.id,
          linkId,
          title: input.title,
          description: input.description || null,
          amount: input.amount,
          currency: input.currency,
          isFixedAmount: input.isFixedAmount ? 1 : 0,
          minAmount: null,
          maxAmount: null,
          tapPaymentUrl,
          maxUsageCount: input.maxUsageCount || null,
          expiresAt: input.expiresAt || null,
          status: 'active',
          isActive: 1,
          orderId: input.orderId || null,
          bookingId: input.bookingId || null,
        });

        return { linkId: link?.linkId, paymentUrl: tapPaymentUrl, link };
      }),

    getLink: protectedProcedure
      .input(z.object({ linkId: z.string() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
        if (!link || link.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
        }
        return link;
      }),

    listLinks: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        isActive: z.boolean().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        return await dbPayments.getPaymentLinksByMerchant(merchant.id, { status: input.status, isActive: input.isActive, limit: input.limit });
      }),

    disableLink: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const dbPayments = await import('./db_payments');
        const link = await dbPayments.getPaymentLinkById(input.id);
        if (!link || link.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
        }
        await dbPayments.disablePaymentLink(input.id);
        return { success: true };
      }),

  }),

  // ==================== Merchant Payment Settings ====================
  merchantPayments: router({
    // Get merchant's payment settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const settings = await getMerchantPaymentSettings(merchant.id);

      if (!settings) return null;

      const { toMerchantPaymentSettingsView } = await import('./payment/payment-link-policy');
      return toMerchantPaymentSettingsView(settings);
    }),

    // Save/update payment settings
    saveSettings: protectedProcedure
      .input(z.object({
        tapEnabled: z.boolean(),
        tapPublicKey: z.string().trim().max(500).optional(),
        tapSecretKey: z.string().trim().max(500).optional(),
        tapTestMode: z.boolean().default(true),
        autoSendPaymentLink: z.boolean().default(true),
        paymentLinkMessage: z.string().max(1000).optional(),
        defaultCurrency: z.enum(['SAR']).default('SAR'),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const existingSettings = await getMerchantPaymentSettings(merchant.id);
        const secretWasSupplied = Boolean(input.tapSecretKey && !input.tapSecretKey.includes('****'));
        const effectiveSecret = secretWasSupplied ? input.tapSecretKey! : existingSettings?.tapSecretKey;
        const effectivePublicKey = input.tapPublicKey || existingSettings?.tapPublicKey;
        const { tapKeyMatchesMode, tapPublicKeyMatchesMode } = await import('./payment/payment-link-policy');
        if (input.tapEnabled && (!effectiveSecret || !effectivePublicKey)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'أدخل مفتاحي Tap العام والسري قبل التفعيل' });
        }
        if (effectiveSecret && !tapKeyMatchesMode(effectiveSecret, input.tapTestMode)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع مفتاح Tap لا يطابق وضع الاختبار/الإنتاج المحدد' });
        }
        if (effectivePublicKey && !tapPublicKeyMatchesMode(effectivePublicKey, input.tapTestMode)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع مفتاح Tap العام لا يطابق وضع الاختبار/الإنتاج المحدد' });
        }

        const credentialsChanged = secretWasSupplied
          || (input.tapPublicKey != null && input.tapPublicKey !== existingSettings?.tapPublicKey)
          || Boolean(existingSettings && Boolean(existingSettings.tapTestMode) !== input.tapTestMode);
        const updateData: any = {
          tapEnabled: input.tapEnabled ? 1 : 0,
          tapTestMode: input.tapTestMode ? 1 : 0,
          autoSendPaymentLink: input.autoSendPaymentLink ? 1 : 0,
          defaultCurrency: input.defaultCurrency,
          ...(credentialsChanged || !input.tapEnabled ? { isVerified: 0, lastVerifiedAt: null } : {}),
        };

        if (input.tapPublicKey) {
          updateData.tapPublicKey = input.tapPublicKey;
        }

        if (input.tapSecretKey && !input.tapSecretKey.includes('****')) {
          updateData.tapSecretKey = input.tapSecretKey;
        }

        if (input.paymentLinkMessage !== undefined) {
          updateData.paymentLinkMessage = input.paymentLinkMessage;
        }

        await upsertMerchantPaymentSettings(merchant.id, updateData);

        return { success: true, message: 'تم حفظ الإعدادات بنجاح' };
      }),

    // Test Tap connection with merchant's keys
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const settings = await getMerchantPaymentSettings(merchant.id);
      if (!settings?.tapPublicKey || !settings.tapSecretKey) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'لم يتم إدخال مفاتيح Tap' });
      }
      const { tapKeyMatchesMode, tapPublicKeyMatchesMode } = await import('./payment/payment-link-policy');
      const testMode = Boolean(settings.tapTestMode);
      if (!tapKeyMatchesMode(settings.tapSecretKey, testMode)
        || !tapPublicKeyMatchesMode(settings.tapPublicKey, testMode)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'نوع المفتاح لا يطابق وضع الاختبار/الإنتاج' });
      }

      const { verifyMerchantTapCredentialsSnapshot } = await import('./payment/merchant-tap-credential-probe');
      const probe = await verifyMerchantTapCredentialsSnapshot(merchant.id, {
        tapPublicKey: settings.tapPublicKey,
        tapSecretKey: settings.tapSecretKey,
        tapTestMode: settings.tapTestMode,
      });
      if (probe.outcome === 'verified') {
        return { success: true, message: 'تم التحقق من الاتصال بنجاح' };
      }
      if (probe.outcome === 'changed') {
        throw new TRPCError({ code: 'CONFLICT', message: 'تغيرت إعدادات Tap أثناء الاختبار؛ أعد المحاولة' });
      }
      if (probe.outcome === 'rejected') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'فشل التحقق من مفاتيح Tap' });
      }
      console.warn('[TapCredentials] Credential probe unavailable', {
        merchantId: merchant.id,
        failure: probe.failure,
      });
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'تعذر الاتصال بـ Tap؛ حاول لاحقاً' });
    }),

  }),

  // AI Suggestions Router
  aiSuggestions: aiSuggestionsRouter,

  // Customers Management
  customers: router({
    // Get all customers with stats
    list: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        status: z.enum(['all', 'active', 'new', 'inactive']).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        let customers = await getCustomersByMerchant(merchant.id);

        // Apply search filter
        if (input.search) {
          customers = await searchCustomers(merchant.id, input.search);
        }

        // Apply status filter
        if (input.status && input.status !== 'all') {
          customers = customers.filter(c => c.status === input.status);
        }

        return customers;
      }),

    // Get customer by phone
    getByPhone: protectedProcedure
      .input(z.object({ customerPhone: z.string() }))
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        const customer = await getCustomerByPhone(merchant.id, input.customerPhone);
        if (!customer) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'العميل غير موجود' });
        }
        return customer;
      }),

    // Get customer statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await getCustomerStats(merchant.id);
    }),

    // Export customers data
    export: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      const customers = await getCustomersByMerchant(merchant.id);
      return customers.map(c => ({
        '\u0627\u0644\u0627\u0633\u0645': c.customerName || '\u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641',
        '\u0631\u0642\u0645 \u0627\u0644\u062c\u0648\u0627\u0644': c.customerPhone,
        '\u0639\u062f\u062f \u0627\u0644\u0637\u0644\u0628\u0627\u062a': c.orderCount,
        '\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u0634\u062a\u0631\u064a\u0627\u062a': c.totalSpent,
        '\u0646\u0642\u0627\u0637 \u0627\u0644\u0648\u0644\u0627\u0621': c.loyaltyPoints,
        '\u0627\u0644\u062d\u0627\u0644\u0629': c.status === 'active' ? '\u0646\u0634\u0637' : c.status === 'new' ? '\u062c\u062f\u064a\u062f' : '\u063a\u064a\u0631 \u0646\u0634\u0637',
        '\u0622\u062e\u0631 \u062a\u0641\u0627\u0639\u0644': new Date(c.lastMessageAt).toLocaleDateString('ar-SA'),
      }));
    }),

    // Download-ready UTF-8 CSV. Tenant identity is derived exclusively from the session.
    exportCsv: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

      const customers = await getCustomersByMerchant(merchant.id);
      const { buildCsv } = await import('./utils/csv');
      const data = buildCsv(
        ['الاسم', 'رقم الجوال', 'عدد الطلبات', 'إجمالي المشتريات', 'نقاط الولاء', 'الحالة', 'آخر تفاعل'],
        customers.map(customer => [
          customer.customerName || 'غير معروف',
          customer.customerPhone,
          customer.orderCount || 0,
          customer.totalSpent || 0,
          customer.loyaltyPoints || 0,
          customer.status === 'active' ? 'نشط' : customer.status === 'new' ? 'جديد' : 'غير نشط',
          customer.lastMessageAt ? new Date(customer.lastMessageAt).toISOString() : '',
        ]),
      );

      return {
        filename: `customers-${merchant.id}-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        count: customers.length,
        data,
      };
    }),
  }),

  // Website Analysis
  websiteAnalysis: websiteAnalysisRouter,

  // Smart Website Analysis
  analysis: analysisRouter,

  // Zid Integration - Using imported modular router (see line 6022)
  // The inline definition below is deprecated and commented out to fix duplicate key error
  /*
  zid: router({
    // Get Zid connection status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const dbZid = await import('./db_zid');
      const settings = await dbZid.getZidSettings(ctx.user.id);
  
      if (!settings) {
        return { connected: false };
      }
  
      return {
        connected: settings.isActive === 1,
        storeName: settings.storeName,
        storeUrl: settings.storeUrl,
        autoSyncProducts: settings.autoSyncProducts === 1,
        autoSyncOrders: settings.autoSyncOrders === 1,
        autoSyncCustomers: settings.autoSyncCustomers === 1,
        lastProductSync: settings.lastProductSync,
        lastOrderSync: settings.lastOrderSync,
        lastCustomerSync: settings.lastCustomerSync,
      };
    }),
  
    // Get authorization URL
    getAuthUrl: protectedProcedure
      .input(z.object({
        clientId: z.string(),
        redirectUri: z.string(),
      }))
      .query(async ({ input }) => {
        const { ZidClient } = await import('./integrations/zid/zidClient');
        const client = new ZidClient({
          clientId: input.clientId,
          clientSecret: '', // Will be provided in callback
          redirectUri: input.redirectUri,
        });
  
        return { authUrl: client.getAuthorizationUrl() };
      }),
  
    // Handle OAuth callback
    handleCallback: protectedProcedure
      .input(z.object({
        code: z.string(),
        clientId: z.string(),
        clientSecret: z.string(),
        redirectUri: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          // Check for existing platform connections
          const { validateNewPlatformConnection } = await import('./integrations/platform-checker');
          try {
            await validateNewPlatformConnection(ctx.user.id, 'زد');
          } catch (error: any) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error.message
            });
          }
  
          const { ZidClient } = await import('./integrations/zid/zidClient');
          const dbZid = await import('./db_zid');
  
          const client = new ZidClient({
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            redirectUri: input.redirectUri,
          });
  
          // Exchange code for tokens
          const tokens = await client.exchangeCodeForToken(input.code);
  
          // Calculate token expiry (1 year from now)
          const expiresAt = new Date();
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  
          // Check if settings exist
          const existingSettings = await dbZid.getZidSettings(ctx.user.id);
  
          if (existingSettings) {
            // Update existing settings
            await dbZid.updateZidSettings(ctx.user.id, {
              clientId: input.clientId,
              clientSecret: input.clientSecret,
              accessToken: tokens.access_token,
              managerToken: tokens.Authorization,
              refreshToken: tokens.refresh_token,
              tokenExpiresAt: expiresAt.toISOString(),
              isActive: 1,
            });
          } else {
            // Create new settings
            await dbZid.createZidSettings({
              merchantId: ctx.user.id,
              clientId: input.clientId,
              clientSecret: input.clientSecret,
              accessToken: tokens.access_token,
              managerToken: tokens.Authorization,
              refreshToken: tokens.refresh_token,
              tokenExpiresAt: expiresAt.toISOString(),
              isActive: 1,
            });
          }
  
          return { success: true, message: 'تم ربط Zid بنجاح!' };
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'فشل في ربط Zid',
          });
        }
      }),
  
    // Disconnect Zid
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const dbZid = await import('./db_zid');
      await dbZid.deleteZidSettings(ctx.user.id);
      return { success: true, message: 'تم فصل Zid بنجاح' };
    }),
  
    // Update auto-sync settings
    updateAutoSync: protectedProcedure
      .input(z.object({
        autoSyncProducts: z.boolean().optional(),
        autoSyncOrders: z.boolean().optional(),
        autoSyncCustomers: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbZid = await import('./db_zid');
        await dbZid.updateAutoSyncSettings(ctx.user.id, input);
        return { success: true, message: 'تم تحديث إعدادات المزامنة' };
      }),
  
    // Sync products from Zid
    syncProducts: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const dbZid = await import('./db_zid');
        const { ZidClient } = await import('./integrations/zid/zidClient');
  
        const settings = await dbZid.getZidSettings(ctx.user.id);
        if (!settings || !settings.accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط Zid أولاً' });
        }
  
        // Create sync log
        const syncLog = await dbZid.createZidSyncLog({
          merchantId: ctx.user.id,
          syncType: 'products',
          status: 'in_progress',
        });
  
        try {
          const client = new ZidClient({
            clientId: settings.clientId!,
            clientSecret: settings.clientSecret!,
            redirectUri: '',
            accessToken: settings.accessToken,
            managerToken: settings.managerToken || undefined,
          });
  
          // Fetch products from Zid
          const { products, pagination } = await client.getProducts();
  
          // Update sync log
          await dbZid.updateSyncStats(syncLog.id, {
            processedItems: products.length,
            successCount: products.length,
            failedCount: 0,
          });
  
          await dbZid.updateSyncStatus(syncLog.id, 'completed');
          await dbZid.updateLastSync(ctx.user.id, 'products');
  
          return {
            success: true,
            message: `تم مزامنة ${products.length} منتج بنجاح`,
            productsCount: products.length,
          };
        } catch (error: any) {
          await dbZid.updateSyncStatus(syncLog.id, 'failed', error.message);
          throw error;
        }
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'فشل في مزامنة المنتجات',
        });
      }
    }),
  
    // Sync orders from Zid
    syncOrders: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const dbZid = await import('./db_zid');
        const { ZidClient } = await import('./integrations/zid/zidClient');
  
        const settings = await dbZid.getZidSettings(ctx.user.id);
        if (!settings || !settings.accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط Zid أولاً' });
        }
  
        const syncLog = await dbZid.createZidSyncLog({
          merchantId: ctx.user.id,
          syncType: 'orders',
          status: 'in_progress',
        });
  
        try {
          const client = new ZidClient({
            clientId: settings.clientId!,
            clientSecret: settings.clientSecret!,
            redirectUri: '',
            accessToken: settings.accessToken,
            managerToken: settings.managerToken || undefined,
          });
  
          const { orders, pagination } = await client.getOrders();
  
          await dbZid.updateSyncStats(syncLog.id, {
            processedItems: orders.length,
            successCount: orders.length,
            failedCount: 0,
          });
  
          await dbZid.updateSyncStatus(syncLog.id, 'completed');
          await dbZid.updateLastSync(ctx.user.id, 'orders');
  
          return {
            success: true,
            message: `تم مزامنة ${orders.length} طلب بنجاح`,
            ordersCount: orders.length,
          };
        } catch (error: any) {
          await dbZid.updateSyncStatus(syncLog.id, 'failed', error.message);
          throw error;
        }
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'فشل في مزامنة الطلبات',
        });
      }
    }),
  
    // Sync customers from Zid
    syncCustomers: protectedProcedure.mutation(async ({ ctx }) => {
      try {
        const dbZid = await import('./db_zid');
        const { ZidClient } = await import('./integrations/zid/zidClient');
  
        const settings = await dbZid.getZidSettings(ctx.user.id);
        if (!settings || !settings.accessToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'يجب ربط Zid أولاً' });
        }
  
        const syncLog = await dbZid.createZidSyncLog({
          merchantId: ctx.user.id,
          syncType: 'customers',
          status: 'in_progress',
        });
  
        try {
          const client = new ZidClient({
            clientId: settings.clientId!,
            clientSecret: settings.clientSecret!,
            redirectUri: '',
            accessToken: settings.accessToken,
            managerToken: settings.managerToken || undefined,
          });
  
          const { customers, pagination } = await client.getCustomers();
  
          await dbZid.updateSyncStats(syncLog.id, {
            processedItems: customers.length,
            successCount: customers.length,
            failedCount: 0,
          });
  
          await dbZid.updateSyncStatus(syncLog.id, 'completed');
          await dbZid.updateLastSync(ctx.user.id, 'customers');
  
          return {
            success: true,
            message: `تم مزامنة ${customers.length} عميل بنجاح`,
            customersCount: customers.length,
          };
        } catch (error: any) {
          await dbZid.updateSyncStatus(syncLog.id, 'failed', error.message);
          throw error;
        }
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'فشل في مزامنة العملاء',
        });
      }
    }),
  
    // Get sync logs
    getSyncLogs: protectedProcedure
      .input(z.object({
        syncType: z.enum(['products', 'orders', 'customers', 'inventory']).optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const dbZid = await import('./db_zid');
        return await dbZid.getZidSyncLogs(ctx.user.id, input.syncType, input.limit);
      }),
  
    // Get sync statistics
    getSyncStats: protectedProcedure.query(async ({ ctx }) => {
      const dbZid = await import('./db_zid');
      return await dbZid.getZidSyncStats(ctx.user.id);
    }),
  }),
  */ // End of deprecated zid inline router

  // WooCommerce Integration — static import (IIFE async returns Promise<Router>, not Router)
  woocommerce: woocommerceRouter,

  // Reports — using modular router from routers-reports.ts
  reports: reportsRouter,

  // Platform Integrations Management — moved to routers-integrations.ts
  // (registered as `integrations: integrationsRouter` at top of appRouter)


  // Push Notifications Management
  push: router({
    // Get VAPID public key
    getVapidPublicKey: publicProcedure.query(async () => {
      const { getVapidPublicKey } = await import('./_core/pushNotifications');
      return { publicKey: getVapidPublicKey() };
    }),

    // Subscribe to push notifications
    subscribe: protectedProcedure
      .input(
        z.object({
          endpoint: z.string(),
          p256dh: z.string(),
          auth: z.string(),
          userAgent: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const { createPushSubscription } = await import('./db_push');
        await createPushSubscription({
          merchantId: merchant.id,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        });
        return { success: true };
      }),

    // Unsubscribe from push notifications
    unsubscribe: protectedProcedure
      .input(
        z.object({
          endpoint: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const { getActivePushSubscriptions, deactivatePushSubscription } = await import('./db_push');
        const subscriptions = await getActivePushSubscriptions(merchant.id);
        const subscription = subscriptions.find((s) => s.endpoint === input.endpoint);
        if (subscription) {
          await deactivatePushSubscription(subscription.id);
        }
        return { success: true };
      }),

    // Send test notification
    sendTest: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      const { sendPushNotification } = await import('./_core/pushNotifications');
      const result = await sendPushNotification(merchant.id, {
        title: 'اختبار الإشعارات - ساري',
        body: 'هذا إشعار تجريبي للتحقق من عمل الإشعارات الفورية',
        url: '/merchant/dashboard',
      });
      return result;
    }),

    // Get notification logs
    getLogs: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        const { getPushNotificationLogs } = await import('./db_push');
        return await getPushNotificationLogs(merchant.id, input.limit);
      }),

    // Get notification stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      const { getPushNotificationStats } = await import('./db_push');
      return await getPushNotificationStats(merchant.id);
    }),
  }),

  // SMTP Email Management (Admin only)
  smtp: router({
    // Get SMTP settings
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { getSmtpSettings } = await import('./db_smtp');
      const settings = await getSmtpSettings();
      if (!settings) return null;
      // Don't send password to frontend
      return {
        ...settings,
        password: undefined,
      };
    }),

    // Update SMTP settings
    updateSettings: protectedProcedure
      .input(
        z.object({
          host: z.string(),
          port: z.number(),
          username: z.string(),
          password: z.string().optional(),
          fromEmail: z.string().email(),
          fromName: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { upsertSmtpSettings } = await import('./db_smtp');
        await upsertSmtpSettings(input);
        return { success: true };
      }),

    // Test SMTP connection
    testConnection: protectedProcedure
      .input(
        z.object({
          email: z.string().email(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { testSmtpConnection } = await import('./_core/smtpEmail');
        const { createEmailLog, updateEmailLogStatus } = await import('./db_smtp');

        // Create log entry
        const [logResult] = await createEmailLog({
          toEmail: input.email,
          subject: 'اختبار SMTP - ساري',
          body: 'رسالة تجريبية للتحقق من إعدادات SMTP',
          status: 'pending',
        });

        try {
          await testSmtpConnection(input.email);
          await updateEmailLogStatus(logResult.insertId, 'sent');
          return { success: true };
        } catch (error) {
          await updateEmailLogStatus(
            logResult.insertId,
            'failed',
            error instanceof Error ? error.message : 'Unknown error'
          );
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to send test email',
          });
        }
      }),

    // Get email logs
    getEmailLogs: protectedProcedure
      .input(
        z.object({
          limit: z.number().default(50),
        })
      )
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getEmailLogs } = await import('./db_smtp');
        return await getEmailLogs(input.limit);
      }),

    // Get email stats
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }
      const { getEmailStats } = await import('./db_smtp');
      return await getEmailStats();
    }),
  }),

  // Notification Management APIs - Using imported modular router (see line 6029)
  // The inline definition below is deprecated and commented out to fix duplicate key error
  /*
  notificationManagement: router({
    // Get all notification logs
    getAllLogs: adminProcedure
      .input(z.object({
        limit: z.number().default(50),
        merchantId: z.number().optional(),
        type: z.string().optional(),
        status: z.enum(['pending', 'sent', 'failed']).optional(),
      }))
      .query(async ({ input }) => {
        const dbConn = await getDb();
        if (!dbConn) return [];
  
        let query = dbConn.select().from(notificationLogs);
  
        const conditions = [];
        if (input.merchantId) {
          conditions.push(eq(notificationLogs.merchantId, input.merchantId));
        }
        if (input.type) {
          conditions.push(eq(notificationLogs.type, input.type));
        }
        if (input.status) {
          conditions.push(eq(notificationLogs.status, input.status));
        }
  
        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }
  
        const logs = await query.orderBy(desc(notificationLogs.createdAt)).limit(input.limit);
        return logs;
      }),
  
    // Get notification stats
    getStats: adminProcedure.query(async () => {
      const dbConn = await getDb();
      if (!dbConn) return { total: 0, sent: 0, failed: 0, pending: 0 };
  
      const logs = await dbConn.select().from(notificationLogs);
  
      return {
        total: logs.length,
        sent: logs.filter(l => l.status === 'sent').length,
        failed: logs.filter(l => l.status === 'failed').length,
        pending: logs.filter(l => l.status === 'pending').length,
      };
    }),
  
    // Resend notification
    resend: adminProcedure
      .input(z.object({ logId: z.number() }))
      .mutation(async ({ input }) => {
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });
  
        const log = await dbConn.query.notificationLogs.findFirst({
          where: eq(notificationLogs.id, input.logId),
        });
  
        if (!log) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification log not found' });
        }
  
        const { sendNotification } = await import('./_core/notificationService');
        const success = await sendNotification({
          merchantId: log.merchantId,
          type: log.type as any,
          title: log.title,
          body: log.body,
          url: log.url || undefined,
          metadata: log.metadata ? JSON.parse(log.metadata) : undefined,
        });
  
        return { success };
      }),
  
    // Get global notification settings
    getGlobalSettings: adminProcedure.query(async () => {
      const dbConn = await getDb();
      if (!dbConn) return null;
  
      const settings = await dbConn.query.notificationSettings.findFirst();
      return settings;
    }),
  
    // Update global notification settings
    updateGlobalSettings: adminProcedure
      .input(z.object({
        newOrdersGlobalEnabled: z.boolean().optional(),
        newMessagesGlobalEnabled: z.boolean().optional(),
        appointmentsGlobalEnabled: z.boolean().optional(),
        orderStatusGlobalEnabled: z.boolean().optional(),
        missedMessagesGlobalEnabled: z.boolean().optional(),
        whatsappDisconnectGlobalEnabled: z.boolean().optional(),
        weeklyReportsGlobalEnabled: z.boolean().optional(),
        weeklyReportDay: z.number().optional(),
        weeklyReportTime: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database connection failed' });
  
        const existing = await dbConn.query.notificationSettings.findFirst();
  
        if (existing) {
          await dbConn.update(notificationSettings)
            .set(input)
            .where(eq(notificationSettings.id, existing.id));
        } else {
          await dbConn.insert(notificationSettings).values(input);
        }
  
        return { success: true };
      }),
  }),
  */ // End of deprecated notificationManagement inline router

  // Weekly Report API
  weeklyReport: router({
    // Send manual weekly report
    sendManual: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { sendManualWeeklyReport } = await import('./weeklyReportCron');
        const success = await sendManualWeeklyReport(input.merchantId);

        if (!success) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send weekly report' });
        }

        return { success: true };
      }),
  }),

  // Notification Preferences APIs
  notificationPreferences: router({
    // Get merchant's notification preferences
    get: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const dbConn = await getDb();
        if (!dbConn) {
          // Return default preferences if DB not available
          return {
            merchantId: merchant.id,
            newOrdersEnabled: true,
            newMessagesEnabled: true,
            appointmentsEnabled: true,
            orderStatusEnabled: true,
            missedMessagesEnabled: true,
            whatsappDisconnectEnabled: true,
            preferredMethod: 'both' as const,
            quietHoursEnabled: false,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            instantNotifications: true,
            batchNotifications: false,
            batchInterval: 30,
          };
        }

        const result = await dbConn.select().from(notificationPreferences)
          .where(eq(notificationPreferences.merchantId, merchant.id))
          .limit(1);

        // Return default preferences if not found
        if (result.length === 0) {
          return {
            merchantId: merchant.id,
            newOrdersEnabled: true,
            newMessagesEnabled: true,
            appointmentsEnabled: true,
            orderStatusEnabled: true,
            missedMessagesEnabled: true,
            whatsappDisconnectEnabled: true,
            preferredMethod: 'both' as const,
            quietHoursEnabled: false,
            quietHoursStart: '22:00',
            quietHoursEnd: '08:00',
            instantNotifications: true,
            batchNotifications: false,
            batchInterval: 30,
          };
        }

        return result[0];
      }),

    // Update notification preferences
    update: protectedProcedure
      .input(z.object({
        newOrdersEnabled: z.boolean().optional(),
        newMessagesEnabled: z.boolean().optional(),
        appointmentsEnabled: z.boolean().optional(),
        orderStatusEnabled: z.boolean().optional(),
        missedMessagesEnabled: z.boolean().optional(),
        whatsappDisconnectEnabled: z.boolean().optional(),
        preferredMethod: z.enum(['push', 'email', 'both']).optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
        instantNotifications: z.boolean().optional(),
        batchNotifications: z.boolean().optional(),
        batchInterval: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const dbConn = await getDb();
        if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

        const updateData = input;

        // Check if preferences exist
        const existing = await dbConn.select().from(notificationPreferences)
          .where(eq(notificationPreferences.merchantId, merchant.id))
          .limit(1);

        if (existing.length > 0) {
          // Update existing preferences
          await dbConn.update(notificationPreferences)
            .set(updateData)
            .where(eq(notificationPreferences.merchantId, merchant.id));
        } else {
          // Create new preferences
          await dbConn.insert(notificationPreferences).values({
            merchantId: merchant.id,
            ...updateData,
          });
        }

        return { success: true };
      }),
  }),

  // Email Templates APIs — MIGRATED to routers-email-templates.ts (registered below as emailTemplates: emailTemplatesRouter)

  // Template Translations Router
  templateTranslations: router({
    // Create translation
    create: adminProcedure
      .input(z.object({
        templateId: z.number(),
        language: z.enum(['ar', 'en']),
        templateName: z.string(),
        description: z.string().optional(),
        suitableFor: z.string().optional(),
        botPersonality: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Check if translation already exists
        const existing = await getTemplateTranslation(input.templateId, input.language);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Translation already exists for this language' });
        }

        const id = await createTemplateTranslation({
          // @ts-ignore
          templateId: input.templateId,
          language: input.language,
          templateName: input.templateName,
          description: input.description,
          suitableFor: input.suitableFor,
          botPersonality: input.botPersonality,
        });

        return { id, success: true };
      }),

    // Update translation
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        templateName: z.string().optional(),
        description: z.string().optional(),
        suitableFor: z.string().optional(),
        botPersonality: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTemplateTranslation(id, data);
        return { success: true };
      }),

    // Delete translation
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteTemplateTranslation(input.id);
        return { success: true };
      }),

    // Get translations by template
    getByTemplate: adminProcedure
      .input(z.object({ templateId: z.number() }))
      .query(async ({ input }) => {
        return await getTemplateTranslationsByTemplateId(input.templateId);
      }),

    // Get all templates with translation status
    getAllWithStatus: adminProcedure
      .query(async () => {
        const templates = await getAllBusinessTemplates();

        const templatesWithStatus = await Promise.all(
          templates.map(async (template) => {
            const translations = await getTemplateTranslationsByTemplateId(template.id);
            return {
              ...template,
              hasArabic: translations.some(t => t.language === 'ar'),
              hasEnglish: translations.some(t => t.language === 'en'),
              translations,
            };
          })
        );

        return templatesWithStatus;
      }),
  }),

  // Subscription Management
  subscriptionPlans: subscriptionPlansRouter,
  subscriptionAddons: subscriptionAddonsRouter,
  merchantSubscription: merchantSubscriptionRouter,
  merchantAddons: merchantAddonsRouter,
  payment: paymentRouter,
  tapSettings: tapSettingsRouter,
  adminSubscriptions: adminSubscriptionsRouter,
  subscriptionSignup: subscriptionSignupRouter,

  // Discount Coupons
  coupons: router({
    list: adminProcedure.query(async () => {
      return await getAllDiscountCoupons();
    }),

    create: adminProcedure
      .input(z.object({
        code: z.string(),
        description: z.string().optional(),
        discountType: z.enum(['percentage', 'fixed']),
        discountValue: z.number(),
        minPurchaseAmount: z.number().optional(),
        maxDiscountAmount: z.number().optional(),
        validFrom: z.date(),
        validUntil: z.date(),
        maxUsageCount: z.number().optional(),
        maxUsagePerMerchant: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        const id = await createDiscountCoupon({
          ...input,
          createdBy: ctx.user.id,
        });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        discountType: z.enum(['percentage', 'fixed']).optional(),
        discountValue: z.number().optional(),
        minPurchaseAmount: z.number().optional(),
        maxDiscountAmount: z.number().optional(),
        validFrom: z.date().optional(),
        validUntil: z.date().optional(),
        maxUsageCount: z.number().optional(),
        maxUsagePerMerchant: z.number().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateDiscountCoupon(id, data);
        return { success: true };
      }),

    deactivate: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deactivateDiscountCoupon(input.id);
        return { success: true };
      }),

    validate: protectedProcedure
      .input(z.object({ code: z.string(), planId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'التاجر غير موجود' });

        const coupon = await getDiscountCouponByCode(input.code);
        if (!coupon) throw new TRPCError({ code: 'NOT_FOUND', message: 'الكوبون غير موجود' });

        // Check if active
        if (!coupon.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون غير نشط' });

        // Check dates
        const now = new Date();
        if (new Date(coupon.validFrom) > now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون لم يبدأ بعد' });
        if (new Date(coupon.validUntil) < now) throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون منتهي' });

        // Check usage limits
        if (coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'الكوبون مستنفذ' });
        }

        // Check merchant usage
        const merchantUsage = await getCouponUsageCountByMerchant(coupon.id, merchant.id);
        if (merchantUsage >= (coupon.maxUsagePerMerchant ?? 1)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'لقد استخدمت هذا الكوبون من قبل' });
        }

        return coupon;
      }),
  }),

  // Usage & Statistics — modularized to routers-usage.ts
  usage: usageRouter,

  // Subscription Reports (Admin) — modularized to routers-subscription-reports.ts
  subscriptionReports: subscriptionReportsRouter,

  // Smart Notifications
  smartNotifications: smartNotificationsRouter,

  // Email Notifications — modularized to routers-email.ts
  email: emailRouter,

  // Trial Management — modularized to routers-trial.ts
  trial: trialRouter,

  // Knowledge Base Documents — modularized to routers-knowledge-docs.ts
  knowledgeDocs: knowledgeDocsRouter,

  // Sari Brain Management — modularized to routers-sari-brain.ts
  sariBrain: sariBrainRouter,

  // Sales Pipeline Board — modularized to routers-sales-pipeline.ts
  salesPipeline: salesPipelineRouter,

  // AI Settings & Usage — modularized to routers-ai-settings.ts
  aiSettings: aiSettingsRouter,

  // AI Training Center — modularized to routers-ai-directives.ts
  aiDirectives: aiDirectivesRouter,

  // Google Analytics 4 — modularized to routers-google-analytics.ts
  googleAnalytics: googleAnalyticsRouter,

  // Dashboard Analytics — modularized to routers-dashboard.ts
  dashboard: dashboardRouter,

  // Message Delivery Monitor — modularized to routers-monitor.ts
  monitor: monitorRouter,

  // Admin AI Analytics — modularized to routers-admin-ai-analytics.ts
  adminAiAnalytics: adminAiAnalyticsRouter,

  // Email Templates — modularized to routers-email-templates.ts
  emailTemplates: emailTemplatesRouter,

  // Byaan Integration — modularized to routers-byaan.ts
  byaan: byaanRouter,
});
export type AppRouter = typeof appRouter;
