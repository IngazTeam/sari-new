import {selfProfileProcedures} from "./routers-self-profile-workspace";
import { notificationPreferenceProcedures } from './routers-notification-preference-workspace';
import {scheduledMessagesRouter} from './routers-scheduled-messages';
import { reviewsRouter } from './routers-reviews';
import {abandonedCartsRouter} from './routers-abandoned-carts';
import { referralsRouter } from './routers-referrals';
import { discountsRouter } from './routers-discounts';
import { sallaDashboardProcedures } from './routers-salla-dashboard';
import { calendarConnectionProcedures } from './routers-calendar-connection';
import { staffRouter } from './routers-staff';
import { conversationImportProcedures } from './routers-conversation-import';
import { conversationConnectionProcedures } from './routers-conversation-connection';
import { conversationHistoryProcedures } from "./routers-conversation-history";
import { conversationInboxProcedure } from "./routers-conversation-inbox";
import { orderWorkspaceRouter } from "./routers-order-workspace";
import { testMetricsWorkspaceRouter } from "./routers-test-metrics-workspace";
import { overviewWorkspaceRouter } from "./routers-overview-workspace";
import { messageAnalyticsRouter } from "./routers-message-analytics";
import { weeklyReportsRouter } from './routers-weekly-reports';
import { messageWorkspaceRouter } from './routers-message-workspace';
import { keywordsRouter } from './routers-keywords';
import { quickResponsesRouter } from './routers-quick-responses';
import { testSariRouter } from './routers-test-sari';
import { quickPreviewProcedure } from './routers-test-workspace';
import { staffVoiceInput } from '../shared/staff-dashboard-voice';
import { staffAttemptReviewProcedures } from './routers-staff-attempt-review';
import { routeDashboardStaffVoice } from './staff-dashboard-voice-route';
import { abTestsRouter } from './routers-ab-tests';
import { staffDashboardReplyInput } from '../shared/staff-dashboard-reply';
import { routeDashboardStaffReply } from './staff-dashboard-reply-route';
import { calendarReconciliationProcedures } from './routers-calendar-reconciliation';
import { calendarAppointmentProcedures } from './routers-calendar-appointments';
import { bookingCreationProcedure } from './routers-booking-creation';
import { bookingOperationProcedures } from './routers-booking-operations';
import { bookingReadProcedures } from './routers-booking-reads';
import { COOKIE_NAME } from "@shared/const";
import { invoiceApprovalSchema, previewMarginSchema } from '../shared/checkout-margin';
import { reconcileCheckoutSchema } from '../shared/checkout-reconciliation';
import { reconcileBookingCheckoutSchema } from '../shared/booking-checkout-reconciliation';
import { bookingPaymentLinkRenewalSchema } from '../shared/booking-payment-link-renewal';
import { checkoutDiscountReleaseSchema } from '../shared/checkout-discount-release';
import { sallaOrderCreateSchema } from '../shared/salla-order-create';
import { sallaCheckoutCartInput } from '../shared/salla-checkout-cart';
import { runSallaCheckoutCart, SallaCheckoutCartError } from './integrations/salla-checkout-carts';
import { sallaEffectReviewProcedures } from './routers-salla-effect-review';
import { sallaCheckoutEvidenceProcedures } from './routers-salla-checkout-evidence';
import { runSallaOrderCreation, readSallaCreationConfirmation, SallaCreationError } from './integrations/salla-order-creation';
import { conversationHandoffProcedures } from './routers-conversation-handoff';
import { escalationReconciliationProcedures } from './routers-escalation-reconciliation';
import { salesOfferReviewProcedures } from './routers-sales-offer-review';
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
import { campaignsRouter } from "./routers-campaigns";
import { occasionCampaignsRouter } from "./routers-occasion-campaigns";
import { aiSettingsRouter } from "./routers-ai-settings";
import { aiDirectivesRouter } from "./routers-ai-directives";
import { googleAnalyticsRouter } from "./routers-google-analytics";
import { dashboardRouter } from "./routers-dashboard";
import { merchantsRouter } from "./routers-merchants";
import { monitorRouter } from "./routers-monitor";
import { inboundOperationsRouter } from './routers-inbound-operations';
import { merchantSelectionRouter } from './routers-merchant-selection';
import { customersRouter } from "./routers-customers";
import { botSettingsRouter } from "./routers-bot-settings";
import { personalityRouter } from "./routers-personality";
import { adminAiAnalyticsRouter } from "./routers-admin-ai-analytics";
import { emailTemplatesRouter } from "./routers-email-templates";
import { teamRouter } from "./routers-team";
import { byaanRouter } from "./routers-byaan";
import { orderNotificationsRouter } from "./routers-order-notifications";
import { publicProcedure, protectedProcedure, merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import type { WhatsAppRequest } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { decodeValidatedAudio } from './utils/audio';
import { completeMetaEmbeddedSignup as completeMetaEmbeddedSignupService } from './channels/whatsapp/meta-embedded-signup';
import {
  approveWhatsAppConnectionRequest,
  approveWhatsAppRequest,
  checkBookingConflict,
  claimReward,
  completeWhatsAppRequest,
  createBooking,
  createDiscountCode,
  createDiscountCoupon,
  createGoogleIntegration,
  createMessage,
  createNotification,
  createPlan,
  createPlanChangeLog,
  createProduct,
  createReferral,
  createReward,
  createService,
  createServiceCategory,
  createServicePackage,
  createSubscription,
  createTemplateTranslation,
  createWhatsAppConnectionRequest,
  createWhatsAppInstance,
  createWhatsAppRequest,
  deactivateDiscountCoupon,
  deleteBooking,
  deleteDiscountCode,
  deleteGoogleIntegration,
  deleteService,
  deleteServiceCategory,
  deleteServicePackage,
  deleteTemplateTranslation,
  deleteWhatsAppConnectionRequest,
  deleteWhatsAppInstance,
  generateReferralCode,
  getActiveStaffByMerchant,
  getActiveSubscriptionByMerchantId,
  getActiveWhatsAppInstancesCount,
  getAllBusinessTemplates,
  getAllDiscountCoupons,
  getAllInvoices,
  getAllPlanChangeLogs,
  getAllPlans,
  getAllWhatsAppConnectionRequests,
  getAllWhatsAppRequests,
  getAppointmentById,
  getAppointmentsByMerchant,
  getAvailableTimeSlots,
  getBookingById,
  getBookingStats,
  getBookingsByCustomer,
  getBookingsByMerchant,
  getBookingsByService,
  getBotSettings,
  getConversationById,
  getConversationCountByMerchantId,
  getConversationsByMerchantId,
  getCouponUsageCountByMerchant,
  getDb,
  getDiscountCodeById,
  getDiscountCodesByMerchantId,
  getDiscountCouponByCode,
  getExpiringWhatsAppInstances,
  getGoogleIntegration,
  getInvoiceById,
  getInvoicesByMerchantId,
  getMerchantById,
  getMerchantByUserId,
  getMerchantCurrentSubscription,
  getMerchantPaymentSettings,
  getMerchantSentimentStats,
  getMessagesByConversationId,
  getOrderById,
  getPaymentByTransactionId,
  getPendingWhatsAppRequests,
  getPlanById,
  getPlanChangeLogs,
  getPrimaryWhatsAppInstance,
  getProductsByMerchantId,
  getReferralCodeByCode,
  getReferralCodeByMerchantId,
  getReferralStats,
  getReferralsWithDetails,
  getRewardById,
  getRewardsByMerchantId,
  getServiceById,
  getServiceCategoriesByMerchant,
  getServiceCategoryById,
  getServicePackageById,
  getServicePackagesByMerchant,
  getServicesByCategory,
  getServicesByMerchant,
  getStaffMemberById,
  getStaffMembersByMerchant,
  getSubscriptionPlanById,
  getTemplateTranslation,
  getTemplateTranslationsByTemplateId,
  getTrySariAnalyticsBySessionId,
  getTrySariAnalyticsStats,
  getTrySariDailyData,
  getUserByEmail,
  getUserById,
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
  markConvertedToSignup,
  markSignupPromptShown,
  rejectWhatsAppConnectionRequest,
  rejectWhatsAppRequest,
  setWhatsAppInstanceAsPrimary,
  shouldBotRespond,
  updateBooking,
  updateBotSettings,
  updateConversation,
  updateDiscountCode,
  updateDiscountCoupon,
  updateGoogleIntegration,
  updateMerchant,
  updatePlan,
  updateService,
  updateServiceCategory,
  updateServicePackage,
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
import { SignupConflictError } from './accounts/signup-errors';
import { signupSchema } from '@shared/signup-validation';
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
import { whatsappWorkspaceRouter } from './routers/whatsapp-workspace';
import { reconnectWorkspaceInstance, workspaceUsage, listWorkspaceRequests, workspaceQR, confirmWorkspaceRequest, workspaceInstanceQR, confirmWorkspaceInstance } from './whatsapp/tenant-workspace';

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
    ...selfProfileProcedures,
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
      .input(signupSchema)
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
          if (error instanceof SignupConflictError) {
            throw new TRPCError({ code: 'CONFLICT', message: 'تعذر إنشاء الحساب بهذه البيانات', cause: error });
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



  // Products Management (reviewed CSV/Excel imports and Google Sheets tools)
  products: productsRouter,

  // Virtual Agents — AI team personas
  virtualAgents: virtualAgentsRouter,

  // Campaign Management — canonical hardened module
  campaigns: campaignsRouter,

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

    // The retired global reset deleted every connection. Require a specific connection instead.
    disconnect: protectedProcedure.mutation(async () => {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Open WhatsApp numbers and select the connection to pause or reconnect.' });
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

        console.log('[QR Code] Fetching', { merchantId: merchant.id, instanceId: request.instanceId });

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
        console.error('[QR Code] Provider request failed', { status: error.response?.status, code: error.code });
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'تعذر جلب رمز الربط من المزوّد. حاول لاحقًا.',
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
    ...staffAttemptReviewProcedures,
    ...escalationReconciliationProcedures,
    ...salesOfferReviewProcedures,
    ...conversationHandoffProcedures,
    list: conversationInboxProcedure,

    // Lightweight: get only recent conversations (for Dashboard)
    listRecent: permissionProcedure('conversations.read')
      .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return getConversationsByMerchantId(merchant.id, { limit: input.limit });
      }),

    // Lightweight: get count only (for Dashboard stats)
    count: permissionProcedure('conversations.read').query(async ({ ctx }) => {
      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return getConversationCountByMerchantId(merchant.id);
    }),

    ...conversationHistoryProcedures,

    // Send reply from merchant dashboard
    sendReply: permissionProcedure('conversations.reply')
      .input(staffDashboardReplyInput)
      .mutation(async ({ input, ctx }) => {
        return routeDashboardStaffReply(ctx.merchantId,ctx.user.id,input);
      }),

    // Reserve validated voice bytes before upload; the client supplies no storage URL or key.
    sendVoiceReply: permissionProcedure('conversations.reply')
      .input(staffVoiceInput)
      .mutation(async ({ input, ctx }) => {
        return routeDashboardStaffVoice(ctx.merchantId,ctx.user.id,input);
      }),

    ...conversationImportProcedures,
    ...conversationConnectionProcedures,
  }),

  // Subscription Payments Router
  subscriptionPayments: router({
    createSession: protectedProcedure
      .input(z.object({
        planId: z.number().int().positive(),
        gateway: z.literal('tap'),
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

  // Salla dashboard and recorded-effect review share the selected tenant permission boundary.
  salla: router({ ...sallaDashboardProcedures, ...sallaEffectReviewProcedures }),

  // Orders from WhatsApp Chat
  orders: router({
    workspace: orderWorkspaceRouter,
    ...sallaCheckoutEvidenceProcedures,
    // Create order from chat
    prepareSallaCheckout: permissionProcedure('orders.manage')
      .input(sallaCheckoutCartInput)
      .mutation(async ({ctx,input})=>{
        try{return await runSallaCheckoutCart(input,ctx.merchantId,ctx.user.id);}
        catch(error){
          if(error instanceof SallaCheckoutCartError){
            const messages={
              request_conflict:'معرف العملية مرتبط بطلب مختلف. راجع العملية الأصلية.',
              cart_pending:'تجهيز السلة قيد التحقق. احتفظ بمعرف العملية نفسه للاستعلام.',
              cart_review:'لم تتأكد نتيجة تجهيز السلة. يلزم مراجعتها؛ لا تُنشئ محاولة بديلة تلقائيًا.',
              cart_rejected:'تعذر تجهيز السلة بهذه المنتجات. راجع الاختيار والاتصال قبل طلب جديد.',
              cart_unavailable:'تعذر التحقق من السلة الحالية. راجع محتواها واتصال المتجر قبل مشاركتها.',
            };
            throw new TRPCError({code:'CONFLICT',message:messages[error.code]});
          }
          throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'تعذر التحقق من تجهيز السلة. احتفظ بمعرف العملية وراجع حالتها قبل المحاولة مجددًا.'});
        }
      }),

    createFromChat: permissionProcedure('orders.manage')
      .input(sallaOrderCreateSchema)
      .mutation(async ({ input, ctx }) => {
        const merchant = await getMerchantById(ctx.merchantId);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });

        const { parseOrderMessage, createOrderFromChat } = await import('./automation/order-from-chat');

        const { requestId, ...intent } = input;
        let result, confirmationMessage;
        try {
          result = await runSallaOrderCreation({ merchantId:merchant.id, actorUserId:ctx.user.id, requestId, intent }, async creation => {
            const parsedOrder = await parseOrderMessage(intent.message,merchant.id);
            if (!parsedOrder || parsedOrder.products.length === 0) return null;
            return createOrderFromChat(merchant.id,intent.customerPhone,intent.customerName,
              { ...parsedOrder,shipTo:intent.shipTo },intent.message,creation);
          });
          confirmationMessage = await readSallaCreationConfirmation({merchantId:merchant.id,actorUserId:ctx.user.id,requestId,intent});
        } catch (error) {
          if (error instanceof SallaCreationError) {
            const messages = {
              request_conflict:'معرّف العملية مستخدم بتفاصيل أو مستخدم مختلف. لم يُنشأ طلب جديد.',
              operation_pending:'هذه العملية قيد التنفيذ أو التحقق. احتفظ بمعرّفها ولا تنشئ عملية بديلة حتى تتأكد من نتيجتها.',
              operation_review:'نتيجة إنشاء الطلب تحتاج مراجعة في سلة. لم نعد إرسال الطلب لتجنب تكراره.',
              operation_rejected:'توقفت العملية قبل إرسال الطلب إلى سلة. راجع المنتجات والعنوان ثم أنشئ عملية جديدة.',
              result_unavailable:'تعذر التحقق من الطلب أو عرضه حاليًا. لم يُنشأ طلب بديل.',
            };
            throw new TRPCError({code:'CONFLICT',message:messages[error.code]});
          }
          // An unavailable local acknowledgement is not permission to use a new request ID.
          throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'تعذر تأكيد حالة العملية. احتفظ بمعرّفها وأعد الاستعلام بالبيانات نفسها؛ لا تنشئ طلبًا بديلًا.'});
        }

        // The durable creation transaction owns notification and Sheets tasks.

        return {
          success: true,
          orderId: result.orderId,
          orderNumber: result.orderNumber,
          paymentUrl: result.paymentUrl,
          replayed: result.replayed,
          confirmationMessage
        };
      }),

    listZidReconciliations: merchantProcedure
      .input(z.object({ beforeId: z.number().int().positive().safe().optional() }).strict().optional())
      .query(async ({ input, ctx }) => {
        const { listZidReconciliations } = await import('./ai/zid-checkout-reconciliation');
        const { hasPermission } = await import('./_core/permissions');
        return { ...await listZidReconciliations(ctx.merchantId, input?.beforeId), canManage: hasPermission(ctx.merchantRole, 'orders.manage') };
      }),

    reconcileZidCheckout: permissionProcedure('orders.manage')
      .input(z.object({ quotationId: z.number().int().positive().safe(), orderId: z.number().int().positive().safe(), reviewed: z.literal(true) }).strict())
      .mutation(async ({ input, ctx }) => {
        const { reconcileZidCheckout } = await import('./ai/zid-checkout-reconciliation');
        try { return await reconcileZidCheckout({ ...input, merchantId: ctx.merchantId, actorUserId: ctx.user.id }); }
        catch { throw new TRPCError({ code: 'CONFLICT', message: 'تعذر التحقق من تطابق الطلب والعميل ومرجع التنفيذ لدى زد. لم تُعد محاولة إنشائه.' }); }
      }),

    getCheckoutAttempts: permissionProcedure('orders.manage').input(z.object({orderId:z.number().int().positive()}).strict()).query(async ({ctx,input}) => {
      const { getOrderCheckoutAttempts } = await import('./payment/order-checkout-attempts');
      try { return await getOrderCheckoutAttempts(ctx.merchantId,input.orderId); }
      catch { throw new TRPCError({code:'CONFLICT',message:'Checkout attempt evidence unavailable'}); }
    }),
    getCheckoutDiscountRelease: permissionProcedure('orders.manage').input(z.object({orderId:z.number().int().positive().safe()}).strict()).query(async({ctx,input})=>{
      const {getCheckoutDiscountRelease}=await import('./ai/checkout-discount-release');
      try{return await getCheckoutDiscountRelease(ctx.merchantId,input.orderId);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Coupon release evidence unavailable'});}
    }),
    releaseCheckoutDiscount: permissionProcedure('orders.manage').input(checkoutDiscountReleaseSchema).mutation(async({ctx,input})=>{
      const {releaseCheckoutDiscount}=await import('./ai/checkout-discount-release');
      try{return await releaseCheckoutDiscount(ctx.merchantId,ctx.user.id,input);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Coupon release requires current verified evidence'});}
    }),
    reconcileCheckoutAttempt: permissionProcedure('orders.manage').input(reconcileCheckoutSchema).mutation(async ({ctx,input}) => {
      const {reconcileOrderCheckout}=await import('./payment/checkout-reconciliation');
      try {return await reconcileOrderCheckout(ctx.merchantId,ctx.user.id,input);}
      catch {throw new TRPCError({code:'CONFLICT',message:'Checkout reconciliation unavailable; refresh evidence before another review'});}
    }),
    getCheckoutMarginException: permissionProcedure('orders.manage').input(z.object({orderId:z.number().int().positive()}).strict()).query(async ({ctx,input}) => {
      const { getCheckoutMarginException } = await import('./ai/checkout-margin');
      try { return await getCheckoutMarginException(ctx.merchantId,input.orderId); }
      catch { throw new TRPCError({code:'CONFLICT',message:'Invoice exception audit unavailable'}); }
    }),
    previewCheckoutMargin: permissionProcedure('orders.manage').input(previewMarginSchema).query(async ({ctx,input}) => {
      const { previewCheckoutMargin } = await import('./ai/checkout-margin');
      try { return await previewCheckoutMargin({...input,merchantId:ctx.merchantId}); }
      catch { throw new TRPCError({code:'CONFLICT',message:'Invoice or cost evidence changed or unavailable'}); }
    }),
    approveCheckoutInvoice: permissionProcedure('orders.manage')
      .input(invoiceApprovalSchema)
      .mutation(async ({ input, ctx }) => {
        const { hasPermission } = await import('./_core/permissions');
        const authorizeMarginException=!!input.margin?.exception && hasPermission(ctx.merchantRole,'bot_settings.manage');
        if (input.margin?.exception && !authorizeMarginException) throw new TRPCError({code:'FORBIDDEN',message:'Margin exceptions require settings management permission'});
        const { approveCheckoutInvoice } = await import('./ai/checkout-agreements');
        const { issueCanonicalOrderPaymentLink } = await import('./payment/order-payment-link');
        let approval;
        try {
          approval = await approveCheckoutInvoice({ ...input, merchantId: ctx.merchantId, actorUserId: ctx.user.id,
            ...(authorizeMarginException?{authorizeMarginException:true}:{}) });
        } catch {
          throw new TRPCError({ code: 'CONFLICT', message: 'تعذر اعتماد الفاتورة؛ تحقق من حالة الطلب والكميات والأسعار وموافقة العميل.' });
        }
        // Local link only. No charge or WhatsApp message is sent by this mutation.
        const link = await issueCanonicalOrderPaymentLink({ merchantId: ctx.merchantId, orderId: input.orderId,
          requestedAmountInHalalas: input.expectedAmountMinor, conversationId: approval.conversationId });
        return { approved: true, paymentUrl: link.issued ? link.paymentUrl : null };
      }),

  }),

  // Discount Codes Management
  discounts: discountsRouter,

  // Referrals & Rewards Management
  referrals: referralsRouter,

  // Abandoned Carts Management
  abandonedCarts: abandonedCartsRouter,

  // Canonical occasion router: tenant scope comes only from the session.
  occasionCampaigns: occasionCampaignsRouter,

  // Advanced Analytics
  analytics: router({
    // Dashboard KPIs
    getDashboardKPIs: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getDashboardKPIs, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getDashboardKPIs(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        }, resolveAnalyticsCurrency(merchant.currency, input.currency));
      }),

    // Revenue Trends
    getRevenueTrends: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
          groupBy: z.enum(['day', 'week', 'month']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getRevenueTrends, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getRevenueTrends(
          input.merchantId,
          {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          },
          input.groupBy, resolveAnalyticsCurrency(merchant.currency, input.currency)
        );
      }),

    // Top Products
    getTopProducts: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
          limit: z.number().optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getTopProducts, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getTopProducts(
          input.merchantId,
          {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          },
          input.limit, resolveAnalyticsCurrency(merchant.currency, input.currency)
        );
      }),

    // Campaign Analytics
    getCampaignAnalytics: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getCampaignAnalytics } = await import('./analytics/analytics');
        return await getCampaignAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        });
      }),

    // Customer Segments
    getCustomerSegments: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getCustomerSegments, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getCustomerSegments(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        }, resolveAnalyticsCurrency(merchant.currency, input.currency));
      }),

    // Hourly Analytics
    getHourlyAnalytics: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getHourlyAnalytics, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getHourlyAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        }, resolveAnalyticsCurrency(merchant.currency, input.currency));
      }),

    // Weekday Analytics
    getWeekdayAnalytics: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getWeekdayAnalytics, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getWeekdayAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        }, resolveAnalyticsCurrency(merchant.currency, input.currency));
      }),

    // Discount Code Analytics
    getDiscountCodeAnalytics: permissionProcedure('analytics.read')
      .input(
        z.object({
          merchantId: z.number().int().positive(),
          startDate: z.string(),
          endDate: z.string(),
          currency: z.enum(['SAR', 'USD']).optional(),
        })
      )
      .query(async ({ input, ctx }) => {
        const merchant = await getMerchantById(input.merchantId);
        if (!merchant || merchant.id !== ctx.merchantId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { getDiscountCodeAnalytics, resolveAnalyticsCurrency } = await import('./analytics/analytics');
        return await getDiscountCodeAnalytics(input.merchantId, {
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        }, resolveAnalyticsCurrency(merchant.currency, input.currency));
      }),
  }),

  whatsappWorkspace: whatsappWorkspaceRouter,

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
          const quota = await workspaceUsage(input.merchantId);
          if (!quota.known || quota.max === null || quota.max === 0 || quota.total > quota.max) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Subscription limit prevents activation' });
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

    // Count all registered slots, matching subscription enforcement; never fabricate a free slot.
    getUsage: protectedProcedure.input(z.object({ merchantId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const merchant = await getMerchantById(input.merchantId);
      if (!merchant || merchant.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      return workspaceUsage(merchant.id);
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
    
    // Verify provider logout before changing the selected connection locally.
    reconnect: protectedProcedure.input(z.object({ instanceId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      return reconnectWorkspaceInstance(merchant.id, input.instanceId);
    }),

    getReconnectQR: protectedProcedure.input(z.object({ instanceId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      return workspaceInstanceQR(merchant.id, input.instanceId);
    }),
    confirmReconnect: protectedProcedure.input(z.object({ instanceId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      return confirmWorkspaceInstance(merchant.id, input.instanceId, true, true);
    }),
    refreshInstance: protectedProcedure.input(z.object({ instanceId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      const { checkRateLimit } = await import('./_core/rateLimiter');
      if (!checkRateLimit('wa_refresh:' + merchant.id, 5, 10 * 60 * 1000).allowed) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Retry later' });
      const result = await confirmWorkspaceInstance(merchant.id, input.instanceId, true, true);
      if (!result.connected) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Provider session is not connected' });
      return { success: true, phoneNumber: result.phoneNumber, webhookRegistered: true };
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
          merchantId: z.number().int().positive(),
          phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{6,14}$/).optional(),
          businessName: z.string().trim().max(255).optional(),
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
        const existingRequests = await listWorkspaceRequests(input.merchantId);
        const pendingRequest = existingRequests.find(r => r.status === 'pending' || r.status === 'approved');
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

    getQRCode: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      return workspaceQR(merchant.id, { ...input, source: 'current' });
    }),
    checkConnection: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      const merchant = await getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'FORBIDDEN', message: 'Owner access required' });
      return confirmWorkspaceRequest(merchant.id, { ...input, source: 'current' });
    }),
  }),

  orderNotifications: orderNotificationsRouter,

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
    transcribe: merchantProcedure
      .input(z.object({
        audioUrl: z.string().url(),
        language: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          const { transcribeAudio } = await import('./_core/voiceTranscription');
          const result = await transcribeAudio({
            merchantId: ctx.merchantId,
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

  messageWorkspace: messageWorkspaceRouter,
  overviewWorkspace: overviewWorkspaceRouter,
  testMetricsWorkspace: testMetricsWorkspaceRouter,
  // Message Analytics APIs
  messageAnalytics: messageAnalyticsRouter,

  // Dashboard Analytics — MIGRATED to routers-dashboard.ts (registered below as dashboard: dashboardRouter)
  // Inline router removed to fix duplicate key warning

  // Reviews Management
  reviews: reviewsRouter,

  // AI & Sari Assistant
  ai: router({
    // Chat with Sari AI
    chat: quickPreviewProcedure,

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

  testSari: testSariRouter,

  // Bot Settings — REMOVED inline router (now using modular botSettingsRouter above)

  // Selected-tenant weekly workspace and reviewed actions.
  scheduledMessages: scheduledMessagesRouter,

  // Legacy API retained; shared permissions and atomic settings store.
  personality: personalityRouter,

  // Selected-tenant quick response workspace and reviewed writes.
  quickResponses: quickResponsesRouter,

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
  keywords: keywordsRouter,

  // ============================================
  // Weekly Sentiment Reports APIs
  // ============================================
  weeklyReports: weeklyReportsRouter,

  // ============================================
  // A/B Testing APIs
  // ============================================
  abTests: abTestsRouter,

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
    ...calendarConnectionProcedures,

    ...calendarAppointmentProcedures,

    ...calendarReconciliationProcedures,

  }),

  // Staff Members Management
  staff: staffRouter,

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
  services: servicesRouter,
  serviceCategories: serviceCategoriesRouter,
  servicePackages: servicePackagesRouter,

  // Google OAuth Settings (Super Admin only) — modularized to routers-google-oauth-settings.ts
  googleOAuthSettings: googleOAuthSettingsRouter,

  // ============================================
  // Bookings Management
  // ============================================
  bookings: router({
    getPaymentLinkRenewal: permissionProcedure('orders.manage').input(z.object({bookingId:z.number().int().positive().safe()}).strict()).query(async({ctx,input})=>{
      const {getBookingPaymentLinkRenewal}=await import('./payment/booking-payment-link-renewal');
      try{return await getBookingPaymentLinkRenewal(ctx.merchantId,input.bookingId);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Booking payment link renewal evidence unavailable'});}
    }),
    renewPaymentLink: permissionProcedure('orders.manage').input(bookingPaymentLinkRenewalSchema).mutation(async({ctx,input})=>{
      const {renewBookingPaymentLink}=await import('./payment/booking-payment-link-renewal');
      try{return await renewBookingPaymentLink(ctx.merchantId,ctx.user.id,input);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Booking payment link renewal unavailable; refresh evidence before another review'});}
    }),
    getCheckoutAttempts: permissionProcedure('orders.manage').input(z.object({bookingId:z.number().int().positive().safe()}).strict()).query(async({ctx,input})=>{
      const {getBookingCheckoutAttempts}=await import('./payment/booking-checkout-reconciliation');
      try{return await getBookingCheckoutAttempts(ctx.merchantId,input.bookingId);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Booking checkout evidence unavailable'});}
    }),
    reconcileCheckoutAttempt: permissionProcedure('orders.manage').input(reconcileBookingCheckoutSchema).mutation(async({ctx,input})=>{
      const {reconcileBookingCheckout}=await import('./payment/booking-checkout-reconciliation');
      try{return await reconcileBookingCheckout(ctx.merchantId,ctx.user.id,input);}
      catch{throw new TRPCError({code:'CONFLICT',message:'Booking checkout reconciliation unavailable; refresh evidence before another review'});}
    }),
    create: bookingCreationProcedure,

    ...bookingReadProcedures,
    ...bookingOperationProcedures,
  }),

  // ============================================
  // Booking Reviews
  // ============================================
  bookingReviews: bookingReviewsRouter,

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
          readPaymentLinkContext,
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

        if (link.orderId != null) {
          const order = await getOrderById(link.orderId);
          if (!order || order.merchantId !== link.merchantId || order.sallaOrderId
            || !['pending', 'processing'].includes(order.status)
            || order.totalAmount !== link.amount || order.currency !== link.currency) {
            throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'رابط الدفع لا يطابق طلبًا محليًا قابلًا للدفع' });
          }
          const { createDurableOrderCheckout } = await import('./payment/order-checkout-attempts');
          try { return await createDurableOrderCheckout(input); }
          catch { throw new TRPCError({code:'CONFLICT',message:'تعذر اعتماد جلسة دفع لهذا الطلب. قد تكون محاولة سابقة قيد التحقق؛ راجع حالة الطلب قبل إعادة المحاولة.'}); }
        }
        if (link.bookingId != null || link.bookingCheckoutPolicyVersion !== 0) {
          const { createDurableBookingCheckout } = await import('./payment/booking-checkout');
          try { return await createDurableBookingCheckout(input); }
          catch { throw new TRPCError({code:'CONFLICT',message:'تعذر اعتماد جلسة دفع لهذا الحجز. راجع حالة الحجز ومحاولات الدفع السابقة قبل إعادة المحاولة.'}); }
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
        const linkContext = readPaymentLinkContext(link.metadata);
        const localMetadata = {
          paymentLinkId: link.id,
          ...(linkContext.conversationId ? { conversationId: linkContext.conversationId } : {}),
        };
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
        if (input.orderId) {
          if (!input.isFixedAmount || (input.maxUsageCount != null && input.maxUsageCount !== 1)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'رابط الطلب يجب أن يكون ثابتًا ولا يستخدم إلا مرة واحدة' });
          }
          const { issueCanonicalOrderPaymentLink } = await import('./payment/order-payment-link');
          const issued = await issueCanonicalOrderPaymentLink({
            merchantId: merchant.id,
            orderId: input.orderId,
            requestedAmountInHalalas: input.amount,
            title: input.title,
            description: input.description,
            expiresAt: input.expiresAt,
          });
          if (!issued.issued) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: issued.reason === 'gateway_not_ready'
                ? 'بوابة الدفع غير جاهزة لهذا المتجر'
                : 'الطلب أو رابط الدفع غير متاح',
            });
          }
          return { linkId: issued.link.linkId, paymentUrl: issued.paymentUrl, link: issued.link };
        }
        if (input.bookingId) {
          if (!input.isFixedAmount || (input.maxUsageCount != null && input.maxUsageCount !== 1)) {
            throw new TRPCError({code:'BAD_REQUEST',message:'رابط الحجز يجب أن يكون ثابتًا ولا يستخدم إلا مرة واحدة'});
          }
          const { issueCanonicalBookingPaymentLink } = await import('./payment/booking-checkout');
          try { return await issueCanonicalBookingPaymentLink({merchantId:merchant.id,bookingId:input.bookingId,
            amount:input.amount,title:input.title,description:input.description,expiresAt:input.expiresAt}); }
          catch { throw new TRPCError({code:'PRECONDITION_FAILED',message:'الحجز أو رابط الدفع غير متاح، أو يحتاج سجل الدفع السابق إلى مراجعة'}); }
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
    getSettings: permissionProcedure('settings.manage').query(async ({ ctx }) => {
      const merchant = await getMerchantById(ctx.merchantId);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const settings = await getMerchantPaymentSettings(merchant.id);

      if (!settings) return null;

      const { toMerchantPaymentSettingsView } = await import('./payment/payment-link-policy');
      return toMerchantPaymentSettingsView(settings);
    }),

    // Save/update payment settings
    saveSettings: permissionProcedure('settings.manage')
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
        const merchant = await getMerchantById(ctx.merchantId);
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
    testConnection: permissionProcedure('settings.manage').mutation(async ({ ctx }) => {
      const merchant = await getMerchantById(ctx.merchantId);
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
  customers: customersRouter,

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
  notificationPreferences: router(notificationPreferenceProcedures),

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
  inboundOperations: inboundOperationsRouter,
  merchantSelection: merchantSelectionRouter,

  // Admin AI Analytics — modularized to routers-admin-ai-analytics.ts
  adminAiAnalytics: adminAiAnalyticsRouter,

  // Email Templates — modularized to routers-email-templates.ts
  emailTemplates: emailTemplatesRouter,

  // Byaan Integration — modularized to routers-byaan.ts
  byaan: byaanRouter,
});
export type AppRouter = typeof appRouter;
