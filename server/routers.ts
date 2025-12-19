import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { insightsRouter } from "./routers-insights";
import { offersRouter } from "./routers-offers";
import { googleAuthRouter } from "./routers-google-auth";
import { sheetsRouter } from "./routers-sheets";
import { loyaltyRouter } from "./routers-loyalty";
import { syncGreenAPIData } from "./data-sync/green-api-sync";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import type { WhatsAppRequest } from '../drizzle/schema';
import * as db from './db';
import * as seoDb from './seo-functions';
import bcrypt from 'bcryptjs';
import { createSessionToken } from './_core/auth';
import { ONE_YEAR_MS } from '@shared/const';
import { z } from 'zod';

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getNotificationsByUserId(ctx.user.id);
    }),
    
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUnreadNotificationsCount(ctx.user.id);
    }),
    
    markAsRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.markNotificationAsRead(input.id, ctx.user.id);
      }),
    
    markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
      return await db.markAllNotificationsAsRead(ctx.user.id);
    }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.deleteNotification(input.id, ctx.user.id);
      }),
  }),
  system: systemRouter,
  
  auth: router({
    me: protectedProcedure.query(opts => opts.ctx.user),
    
    // Login with email and password
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        console.log('🔵 [AUTH] Login attempt:', input.email);
        const user = await db.getUserByEmail(input.email);
        console.log('🔵 [AUTH] User found:', user?.email);
        
        if (!user || !user.password) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }
        
        const isValidPassword = await bcrypt.compare(input.password, user.password);
        
        if (!isValidPassword) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
        }
        
        // Update last signed in
        await db.updateUserLastSignedIn(user.id);
        
        // Create session token using SDK
        const sessionToken = await createSessionToken(String(user.id), {
          name: user.name || '',
          email: user.email || '',
          expiresInMs: ONE_YEAR_MS,
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        
        // Set cookie using both methods to ensure it works
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        
        // Also set via header as backup
        const securePart = cookieOptions.secure ? '; Secure' : '';
        const cookieString = `${COOKIE_NAME}=${sessionToken}; Path=${cookieOptions.path}; HttpOnly; SameSite=${cookieOptions.sameSite}${securePart}; Max-Age=${Math.floor(ONE_YEAR_MS / 1000)}`;
        const existingCookies = ctx.res.getHeader('Set-Cookie');
        if (existingCookies) {
          const cookieArray = Array.isArray(existingCookies) ? existingCookies : [String(existingCookies)];
          ctx.res.setHeader('Set-Cookie', [...cookieArray, cookieString] as string[]);
        } else {
          ctx.res.setHeader('Set-Cookie', cookieString);
        }
        
        console.log('🟢 [AUTH] Login successful for:', user.email);
        return {
          success: true,
          token: sessionToken,
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
    sendVerificationEmail: publicProcedure
      .input(z.object({ email: z.string().email(), userId: z.number() }))
      .mutation(async ({ input }) => {
        const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        
        await db.createEmailVerificationToken({
          userId: input.userId,
          email: input.email,
          token,
          expiresAt,
        });
        
        // In production, send email here
        return { token, expiresAt };
      }),
    
    verifyEmail: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const verificationToken = await db.getEmailVerificationToken(input.token);
        
        if (!verificationToken) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Token not found' });
        }
        
        if (verificationToken.isUsed) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token already used' });
        }
        
        if (new Date(verificationToken.expiresAt) < new Date()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Token expired' });
        }
        
        await db.markEmailVerificationTokenAsUsed(verificationToken.id);
        await db.updateUserEmailVerified(verificationToken.userId, verificationToken.email);
        
        return { success: true };
      }),
  }),
    
    // Sign up with email and password
    signup: publicProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        businessName: z.string().min(2),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if email already exists
        const existingUser = await db.getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(input.password, 10);
        
        // Generate unique openId for the user
        const openId = `local_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Create user
        const user = await db.createUser({
          openId,
          name: input.name,
          email: input.email,
          password: hashedPassword,
          loginMethod: 'email',
          role: 'user',
        });
        
        if (!user) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create user' });
        }
        
        // Create merchant profile automatically
        await db.createMerchant({
          userId: user.id,
          businessName: input.businessName,
          phone: input.phone || null,
          status: 'pending',
        });
        
        // Send welcome email
        try {
          const { sendWelcomeEmail } = await import('./notifications/email-notifications');
          await sendWelcomeEmail(input.email, input.businessName, input.name);
        } catch (error) {
          console.error('[Signup] Failed to send welcome email:', error);
          // Don't fail signup if email fails
        }
        
        // Create session token
        const sessionToken = await createSessionToken(String(user.id), {
          name: user.name || '',
          email: user.email || '',
          expiresInMs: ONE_YEAR_MS,
        });
        
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        
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
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    
    // Update user profile
    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.updateUser(ctx.user.id, input);
        return { success: true };
      }),
    
    // Request password reset
    requestPasswordReset: publicProcedure
      .input(z.object({
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        // Check rate limiting first
        const rateLimitCheck = await db.canRequestReset(input.email);
        
        if (!rateLimitCheck.allowed) {
          const minutes = Math.floor(rateLimitCheck.remainingTime! / 60);
          const seconds = rateLimitCheck.remainingTime! % 60;
          const timeString = minutes > 0 
            ? `${minutes} دقيقة و ${seconds} ثانية`
            : `${seconds} ثانية`;
          
          throw new TRPCError({ 
            code: 'TOO_MANY_REQUESTS', 
            message: `لقد تجاوزت الحد الأقصى للمحاولات (3 محاولات). يرجى الانتظار ${timeString} قبل المحاولة مرة أخرى.`,
            cause: {
              remainingTime: rateLimitCheck.remainingTime,
              attemptsCount: rateLimitCheck.attemptsCount,
            }
          });
        }
        
        // Track this attempt
        await db.trackResetAttempt({ email: input.email });
        
        const user = await db.getUserByEmail(input.email);
        
        // Don't reveal if user exists or not (security best practice)
        if (!user) {
          return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
        }
        
        // Generate unique token
        const token = `${Date.now()}_${Math.random().toString(36).substring(2)}_${Math.random().toString(36).substring(2)}`;
        
        // Token expires in 1 hour
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        
        // Create reset token in database
        await db.createPasswordResetToken({
          userId: user.id,
          email: user.email!,
          token,
          expiresAt,
        });
        
        // Send email with reset link
        try {
          const { sendEmail } = await import('./reports/email-sender');
          const { getPasswordResetEmailTemplate } = await import('./email/templates/passwordReset');
          
          const resetLink = `${process.env.VITE_APP_URL || 'http://localhost:3000'}/reset-password/${token}`;
          
          const emailTemplate = getPasswordResetEmailTemplate({
            userName: user.name || 'المستخدم',
            resetLink,
            expiryHours: 1,
          });
          
          await sendEmail({
            to: user.email!,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
          });
        } catch (error) {
          console.error('[Password Reset] Failed to send email:', error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send reset email' });
        }
        
        return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
      }),
    
    // Validate reset token
    validateResetToken: publicProcedure
      .input(z.object({
        token: z.string(),
      }))
      .query(async ({ input }) => {
        const validation = await db.validatePasswordResetToken(input.token);
        
        if (!validation.valid) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: validation.reason === 'invalid_token' ? 'Invalid reset token' :
                     validation.reason === 'token_already_used' ? 'This reset link has already been used' :
                     validation.reason === 'token_expired' ? 'This reset link has expired' :
                     'Invalid reset token'
          });
        }
        
        return { valid: true };
      }),
    
    // Reset password with token
    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        const validation = await db.validatePasswordResetToken(input.token);
        
        if (!validation.valid || !validation.token) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: validation.reason === 'invalid_token' ? 'Invalid reset token' :
                     validation.reason === 'token_already_used' ? 'This reset link has already been used' :
                     validation.reason === 'token_expired' ? 'This reset link has expired' :
                     'Invalid reset token'
          });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);
        
        // Update user password
        await db.updateUser(validation.token.userId, { password: hashedPassword });
        
        // Mark token as used
        await db.markPasswordResetTokenAsUsed(validation.token.id);
        
        // Delete all other reset tokens for this user (cleanup)
        await db.deletePasswordResetTokensByUserId(validation.token.userId);
        
        return { success: true, message: 'Password has been reset successfully' };
      }),
  }),

  // Merchant Management
  merchants: router({
    // Get current merchant for logged-in user
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      return merchant;
    }),

    // Create merchant profile
    create: protectedProcedure
      .input(z.object({
        businessName: z.string().min(1),
        phone: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Check if merchant already exists
        const existing = await db.getMerchantByUserId(ctx.user.id);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Merchant profile already exists' });
        }

        const merchant = await db.createMerchant({
          userId: ctx.user.id,
          businessName: input.businessName,
          phone: input.phone || null,
          status: 'pending',
        });

        return merchant;
      }),

    // Update merchant profile
    update: protectedProcedure
      .input(z.object({
        businessName: z.string().optional(),
        phone: z.string().optional(),
        autoReplyEnabled: z.boolean().optional(),
        currency: z.enum(['SAR', 'USD']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        await db.updateMerchant(merchant.id, input);
        return { success: true };
      }),

    // Get all merchants (Admin only)
    list: adminProcedure.query(async () => {
      return await db.getAllMerchants();
    }),

    // Update merchant status (Admin only)
    updateStatus: adminProcedure
      .input(z.object({
        merchantId: z.number(),
        status: z.enum(['active', 'suspended', 'pending']),
      }))
      .mutation(async ({ input }) => {
        await db.updateMerchant(input.merchantId, { status: input.status });
        return { success: true };
      }),

    // Get merchant by ID (Admin only)
    getById: adminProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input }) => {
        return await db.getMerchantById(input.merchantId);
      }),

    // Get merchant subscriptions (Admin only)
    getSubscriptions: adminProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input }) => {
        const subscription = await db.getActiveSubscriptionByMerchantId(input.merchantId);
        return subscription ? [subscription] : [];
      }),

    // Get merchant campaigns (Admin only)
    getCampaigns: adminProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCampaignsByMerchantId(input.merchantId);
      }),

    // Sync Green API data (Admin only)
    syncGreenAPIData: adminProcedure
      .input(z.object({
        merchantId: z.number(),
        instanceId: z.string(),
        token: z.string(),
        syncChats: z.boolean().default(true),
        syncMessages: z.boolean().default(true),
        limit: z.number().default(100),
      }))
      .mutation(async ({ input }) => {
        try {
          const result = await syncGreenAPIData(
            input.merchantId.toString(),
            input.instanceId,
            input.token,
            {
              syncChats: input.syncChats,
              syncMessages: input.syncMessages,
              limit: input.limit,
            }
          );
          return result;
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Failed to sync Green API data: ${error}`,
          });
        }
      }),

    // Get current plan for merchant
    getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const subscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
      if (!subscription) {
        return null;
      }

      const plan = await db.getPlanById(subscription.planId);
      return {
        subscription,
        plan,
      };
    }),

    // Request plan upgrade
    requestUpgrade: protectedProcedure
      .input(z.object({ planId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if merchant is active
        if (merchant.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
        }

        // Get the requested plan
        const plan = await db.getPlanById(input.planId);
        if (!plan || !plan.isActive) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found or inactive' });
        }

        // Get current subscription
        const currentSubscription = await db.getActiveSubscriptionByMerchantId(merchant.id);
        
        // If no current subscription, create new one
        if (!currentSubscription) {
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 30); // 30 days subscription

          await db.createSubscription({
            merchantId: merchant.id,
            planId: input.planId,
            status: 'active',
            startDate,
            endDate,
          });

          // Notify owner about new subscription
          const { notifyOwner } = await import('./_core/notification');
          await notifyOwner({
            title: 'اشتراك جديد',
            content: `التاجر ${merchant.businessName} اشترك في الباقة ${plan.nameAr}`,
          });

          return { success: true, message: 'تم الاشتراك بنجاح' };
        }

        // Check if trying to upgrade to same plan
        if (currentSubscription.planId === input.planId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already subscribed to this plan' });
        }

        // Update subscription to new plan
        await db.updateSubscription(currentSubscription.id, {
          planId: input.planId,
          startDate: new Date(),
        });

        // Notify owner about upgrade
        const currentPlan = await db.getPlanById(currentSubscription.planId);
        const { notifyOwner } = await import('./_core/notification');
        await notifyOwner({
          title: 'ترقية باقة',
          content: `التاجر ${merchant.businessName} قام بالترقية من ${currentPlan?.nameAr} إلى ${plan.nameAr}`,
        });

        return { success: true, message: 'تم الترقية بنجاح' };
      }),

    // Get onboarding status
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      return await db.getOnboardingStatus(merchant.id);
    }),

    // Update onboarding step
    updateOnboardingStep: protectedProcedure
      .input(z.object({ step: z.number().min(0).max(4) }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        await db.updateOnboardingStep(merchant.id, input.step);
        return { success: true };
      }),

    // Complete onboarding
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }
      await db.completeOnboarding(merchant.id);
      return { success: true };
    }),
  }),

  // Products Management
  products: router({
    // List products for merchant
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      return await db.getProductsByMerchantId(merchant.id);
    }),

    // Create product
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().positive(),
        imageUrl: z.string().url().optional(),
        stock: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const productId = await db.createProduct({
          merchantId: merchant.id,
          ...input,
        });
        return { success: true, productId };
      }),

    // Update product
    update: protectedProcedure
      .input(z.object({
        productId: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().positive().optional(),
        imageUrl: z.string().url().optional(),
        stock: z.number().int().min(0).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const { productId, ...updates } = input;
        await db.updateProduct(productId, updates);
        return { success: true };
      }),

    // Delete product
    delete: protectedProcedure
      .input(z.object({ productId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        await db.deleteProduct(input.productId);
        return { success: true };
      }),

    // Upload CSV
    uploadCSV: protectedProcedure
      .input(z.object({
        csvData: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Parse CSV data
        const lines = input.csvData.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CSV file is empty or invalid' });
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const products = [];
        let successCount = 0;
        let errorCount = 0;

        for (let i = 1; i < lines.length; i++) {
          try {
            const values = lines[i].split(',').map(v => v.trim());
            const product: any = {};
            
            headers.forEach((header, index) => {
              if (values[index]) {
                product[header] = values[index];
              }
            });

            if (product.name && product.price) {
              await db.createProduct({
                merchantId: merchant.id,
                name: product.name,
                description: product.description || null,
                price: parseFloat(product.price),
                imageUrl: product.imageurl || product.image || null,
                stock: product.stock ? parseInt(product.stock) : null,
              });
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }

        return { 
          success: true, 
          imported: successCount,
          failed: errorCount,
          total: lines.length - 1
        };
      }),
  }),

  // Campaign Management
  campaigns: router({
    // Get all campaigns for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return db.getCampaignsByMerchantId(merchant.id);
    }),

    // Get all campaigns with merchant info (Admin only)
    listAll: adminProcedure.query(async () => {
      return await db.getAllCampaignsWithMerchants();
    }),

    // Get single campaign
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check merchant status
        if (merchant.status !== 'active') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
        }

        const campaign = await db.createCampaign({
          merchantId: merchant.id,
          name: input.name,
          message: input.message,
          imageUrl: input.imageUrl || null,
          targetAudience: input.targetAudience || null,
          status: input.scheduledAt ? 'scheduled' : 'draft',
          scheduledAt: input.scheduledAt || null,
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
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Can't edit completed or sending campaigns
        if (campaign.status === 'completed' || campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot edit campaign in current status' });
        }

        const { id, ...updateData } = input;
        await db.updateCampaign(id, updateData);

        return { success: true };
      }),

      // Delete campaign
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Mark campaign as failed to hide it (soft delete)
        await db.updateCampaign(input.id, { status: 'failed' });
        return { success: true };
      }),

    // Send campaign
    send: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || campaign.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Check if campaign is already sent or in progress
        if (campaign.status === 'completed' || campaign.status === 'sending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already sent or in progress' });
        }

        // Get primary WhatsApp instance
        const instance = await db.getPrimaryWhatsAppInstance(merchant.id);
        if (!instance || instance.status !== 'active') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active WhatsApp instance found. Please connect WhatsApp first.' });
        }

        // Get all customers from conversations
        const conversations = await db.getConversationsByMerchantId(merchant.id);
        const recipients = conversations
          .filter(c => c.customerPhone)
          .map(c => c.customerPhone);

        if (recipients.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No customers found to send campaign' });
        }

        // Update status to sending and set total recipients
        await db.updateCampaign(input.id, { 
          status: 'sending',
          totalRecipients: recipients.length,
        });

        // Send campaign in background
        const axios = await import('axios');
        const instancePrefix = instance.instanceId.substring(0, 4);
        const baseURL = `https://${instancePrefix}.api.greenapi.com/waInstance${instance.instanceId}`;

        // Send messages asynchronously
        Promise.all(
          recipients.map(async (phone, index) => {
            // Find conversation for this phone
            const conversation = conversations.find(c => c.customerPhone === phone);
            
            try {
              // Send message
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
              
              // Log success
              await db.createCampaignLog({
                campaignId: input.id,
                customerId: conversation?.id || null,
                customerPhone: phone,
                customerName: conversation?.customerName || null,
                status: 'success',
                errorMessage: null,
                sentAt: new Date(),
              });
              
              return { phone, success: true };
            } catch (error: any) {
              console.error(`Failed to send to ${phone}:`, error.message);
              
              // Log failure
              await db.createCampaignLog({
                campaignId: input.id,
                customerId: conversation?.id || null,
                customerPhone: phone,
                customerName: conversation?.customerName || null,
                status: 'failed',
                errorMessage: error.message || 'Unknown error',
                sentAt: new Date(),
              });
              
              return { phone, success: false, error: error.message };
            }
          })
        ).then(async (results) => {
          // Count successes
          const successCount = results.filter(r => r.success).length;
          
          // Update campaign status
          await db.updateCampaign(input.id, {
            status: 'completed',
            sentCount: successCount,
          });

          console.log(`Campaign ${input.id} completed: ${successCount}/${recipients.length} sent`);
        }).catch(async (error) => {
          console.error('Error sending campaign:', error);
          await db.updateCampaign(input.id, { status: 'failed' });
        });

        return { 
          success: true, 
          message: 'Campaign is being sent',
          totalRecipients: recipients.length,
        };
      }),



    // Get campaign statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const campaigns = await db.getCampaignsByMerchantId(merchant.id);
      
      // Calculate statistics
      const totalCampaigns = campaigns.length;
      const completedCampaigns = campaigns.filter(c => c.status === 'completed');
      const totalSent = completedCampaigns.reduce((sum, c) => sum + (c.sentCount || 0), 0);
      const totalRecipients = completedCampaigns.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);
      
      // Calculate delivery rate (assuming sentCount is successful deliveries)
      const deliveryRate = totalRecipients > 0 ? (totalSent / totalRecipients) * 100 : 0;
      
      // For demo purposes, simulate read rate (in real app, track this from WhatsApp API)
      const readRate = deliveryRate > 0 ? deliveryRate * 0.75 : 0; // Assume 75% of delivered messages are read

      return {
        totalCampaigns,
        completedCampaigns: completedCampaigns.length,
        totalSent,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        readRate: Math.round(readRate * 10) / 10,
      };
    }),

    // Get timeline data for charts
    getTimelineData: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(365).default(30),
      }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const campaigns = await db.getCampaignsByMerchantId(merchant.id);
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
              existing.delivered += campaign.sentCount || 0; // Assume all sent are delivered for demo
              existing.read += Math.round((campaign.sentCount || 0) * 0.75); // Simulate 75% read rate
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
        const campaign = await db.getCampaignById(input.id);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || (campaign.merchantId !== merchant.id && ctx.user.role !== 'admin')) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        // Get logs with stats
        const { logs, stats } = await db.getCampaignLogsWithStats(input.id);

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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Get all conversations for this merchant
        const conversations = await db.getConversationsByMerchantId(merchant.id);
        
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
          const orders = await db.getOrdersByMerchantId(merchant.id);
          
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
      return db.getAllPlans();
    }),

    // Get plan by ID
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const plan = await db.getPlanById(input.id);
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
        return db.createPlan(input);
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
        const oldPlan = await db.getPlanById(id);
        if (!oldPlan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }
        
        // Update plan
        await db.updatePlan(id, updateData);
        
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
        if (updateData.isActive !== undefined && updateData.isActive !== oldPlan.isActive) {
          changes.push({ field: 'isActive', oldValue: oldPlan.isActive.toString(), newValue: updateData.isActive.toString() });
        }
        
        // Save change logs
        for (const change of changes) {
          await db.createPlanChangeLog({
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
          return db.getPlanChangeLogs(input.planId);
        }
        return db.getAllPlanChangeLogs();
      }),
  }),

  // Subscriptions
  subscriptions: router({
    // Get current subscription
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        return null;
      }

      return db.getActiveSubscriptionByMerchantId(merchant.id);
    }),
    
    // Get usage statistics
    getUsage: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const plan = await db.getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }

        // Check if there's already an active subscription
        const existing = await db.getActiveSubscriptionByMerchantId(merchant.id);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Active subscription already exists' });
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        const subscription = await db.createSubscription({
          merchantId: merchant.id,
          planId: input.planId,
          status: 'pending',
          conversationsUsed: 0,
          voiceMessagesUsed: 0,
          startDate,
          endDate,
          autoRenew: true,
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if there's already a pending request
        const existingRequest = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
        if (existingRequest && existingRequest.status === 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
        }

        // Create new request
        const fullNumber = `${input.countryCode}${input.phoneNumber}`;
        const request = await db.createWhatsAppConnectionRequest({
          merchantId: merchant.id,
          countryCode: input.countryCode,
          phoneNumber: input.phoneNumber,
          fullNumber,
          status: 'pending',
        });

        // Notify admin
        const notifyOwner = await import('./_core/notification');
        await notifyOwner.notifyOwner({
          title: 'طلب ربط واتساب جديد',
          content: `التاجر ${merchant.businessName} يطلب ربط رقم الواتساب: ${fullNumber}`,
        });

        return { success: true, request };
      }),

    // Get current connection request status
    getRequestStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
    }),

    // Disconnect WhatsApp (Reset) - allows merchant to remove current connection and request a new one
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get current connection request
      const existingRequest = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
      if (!existingRequest) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No WhatsApp connection found' });
      }

      // Delete the connection request
      await db.deleteWhatsAppConnectionRequest(existingRequest.id);

      // Also delete any WhatsApp instances associated with this merchant
      const instances = await db.getWhatsAppInstancesByMerchantId(merchant.id);
      for (const instance of instances) {
        await db.deleteWhatsAppInstance(instance.id);
      }

      // Notify admin about the disconnection
      const notifyOwner = await import('./_core/notification');
      await notifyOwner.notifyOwner({
        title: 'فك ربط واتساب',
        content: `التاجر ${merchant.businessName} قام بفك ربط رقم الواتساب: ${existingRequest.fullNumber}`,
      });

      return { success: true };
    }),

    // Get all connection requests (Admin only)
    listRequests: adminProcedure
      .input(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }))
      .query(async ({ input }) => {
        return await db.getAllWhatsAppConnectionRequests(input.status);
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
        const request = await db.getWhatsAppConnectionRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
        await db.approveWhatsAppConnectionRequest(
          input.requestId,
          userId,
          input.instanceId,
          input.apiToken,
          input.apiUrl
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
            input.apiUrl
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
          await db.createNotification({
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
        const request = await db.getWhatsAppConnectionRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
        await db.rejectWhatsAppConnectionRequest(input.requestId, userId, input.reason);

        return { success: true };
      }),

    // Get QR Code for connection (from approved request)
    getQRCode: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get the approved request with credentials
      const request = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get the approved request with credentials
      const request = await db.getWhatsAppConnectionRequestByMerchantId(merchant.id);
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
            await db.updateWhatsAppConnectionRequest(request.id, {
              status: 'connected',
              connectedAt: new Date(),
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        
        // Request details for debugging
        const requestDetails = {
          url,
          method: 'GET',
          instanceId: input.instanceId,
          tokenPreview: input.token.substring(0, 10) + '...',
          timestamp: new Date().toISOString(),
        };
        
        console.log('[Green API Test] Request Details:', JSON.stringify(requestDetails, null, 2));

        try {
          const response = await axios.default.get(url, {
            timeout: 15000,
          });

          console.log('[Green API Test] Response:', response.data);

          const isConnected = response.data.stateInstance === 'authorized';
          return {
            success: isConnected,
            status: response.data.stateInstance || 'unknown',
            phoneNumber: response.data.phoneNumber,
            // Debug info
            debug: {
              url,
              method: 'GET',
              responseStatus: response.status,
              responseData: response.data,
            },
          };
        } catch (error: any) {
          const errorDetails = {
            url,
            method: 'GET',
            errorMessage: error.message,
            errorCode: error.code,
            responseStatus: error.response?.status,
            responseStatusText: error.response?.statusText,
            responseData: error.response?.data,
            timestamp: new Date().toISOString(),
          };
          
          console.error('[Green API Test] Error Details:', JSON.stringify(errorDetails, null, 2));
          
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
            debug: errorDetails,
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if instance already exists
        const existing = await db.getWhatsAppInstanceByInstanceId(input.instanceId);
        if (existing && existing.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already in use' });
        }

        if (existing) {
          // Update existing instance
          await db.updateWhatsAppInstance(existing.id, {
            token: input.token,
            phoneNumber: input.phoneNumber,
            status: 'active',
            connectedAt: new Date(),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          });
          return { success: true, instanceId: existing.id };
        } else {
          // Create new instance
          const instance = await db.createWhatsAppInstance({
            merchantId: merchant.id,
            instanceId: input.instanceId,
            token: input.token,
            phoneNumber: input.phoneNumber,
            status: 'active',
            isPrimary: true, // First instance is primary
            connectedAt: new Date(),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          });
          return { success: true, instanceId: instance?.id };
        }
      }),

    // Get primary WhatsApp instance
    getPrimaryInstance: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getPrimaryWhatsAppInstance(merchant.id);
    }),

    // Get all WhatsApp instances
    listInstances: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getWhatsAppInstancesByMerchantId(merchant.id);
    }),

    // Delete WhatsApp instance
    deleteInstance: protectedProcedure
      .input(z.object({ instanceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify ownership
        const instance = await db.getWhatsAppInstanceById(input.instanceId);
        if (!instance || instance.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }

        await db.deleteWhatsAppInstance(input.instanceId);
        return { success: true };
      }),
  }),

  // Conversations
  conversations: router({
    // Get all conversations for current merchant
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return db.getConversationsByMerchantId(merchant.id);
    }),

    // Get messages for a conversation
    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input, ctx }) => {
        const conversation = await db.getConversationById(input.conversationId);
        if (!conversation) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Check ownership
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant || conversation.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }

        return db.getMessagesByConversationId(input.conversationId);
      }),
  }),

  // Subscription Payments Router
  subscriptionPayments: router({ createSession: protectedProcedure
      .input(z.object({
        planId: z.number(),
        gateway: z.enum(['tap', 'paypal']),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get merchant
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Get plan
        const plan = await db.getPlanById(input.planId);
        if (!plan) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
        }

        // Create subscription first
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30); // 30 days subscription

        const subscription = await db.createSubscription({
          merchantId: merchant.id,
          planId: plan.id,
          status: 'pending',
          startDate,
          endDate,
          autoRenew: true,
        });

        if (!subscription) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create subscription' });
        }

        // Prepare payment parameters
        const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/merchant/payment/success?subscriptionId=${subscription.id}`;
        const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/merchant/payment/cancel?subscriptionId=${subscription.id}`;

        // Create payment session based on gateway
        if (input.gateway === 'tap') {
          const { createTapCharge } = await import('./payment/tap');
          const result = await createTapCharge({
            amount: plan.priceMonthly,
            currency: 'SAR',
            merchantId: merchant.id,
            subscriptionId: subscription.id,
            planId: plan.id,
            customerEmail: ctx.user.email || '',
            customerPhone: merchant.phone || '',
            returnUrl,
          });

          if (!result.success) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create payment' });
          }

          return {
            success: true,
            paymentUrl: result.paymentUrl,
            subscriptionId: subscription.id,
          };
        } else if (input.gateway === 'paypal') {
          const { createPayPalOrder } = await import('./payment/paypal');
          const result = await createPayPalOrder({
            amount: plan.priceMonthly,
            currency: 'USD', // PayPal typically uses USD
            merchantId: merchant.id,
            subscriptionId: subscription.id,
            planId: plan.id,
            returnUrl,
            cancelUrl,
          });

          if (!result.success) {
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: result.error || 'Failed to create payment' });
          }

          return {
            success: true,
            paymentUrl: result.paymentUrl,
            subscriptionId: subscription.id,
          };
        }

        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid payment gateway' });
      }),

    verifyPayment: protectedProcedure
      .input(z.object({
        subscriptionId: z.number(),
        transactionId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Get payment
        const payment = await db.getPaymentByTransactionId(input.transactionId);
        if (!payment || payment.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
        }

        // Verify based on gateway
        if (payment.paymentMethod === 'tap') {
          const { verifyTapPayment } = await import('./payment/tap');
          const result = await verifyTapPayment(input.transactionId);
          
          if (result.success && result.status === 'CAPTURED') {
            // Update subscription status
            await db.updateSubscription(input.subscriptionId, { status: 'active' });
            // Update merchant subscription
            await db.updateMerchant(merchant.id, { subscriptionId: input.subscriptionId });
          }

          return result;
        } else if (payment.paymentMethod === 'paypal') {
          const { capturePayPalOrder } = await import('./payment/paypal');
          const result = await capturePayPalOrder(input.transactionId);
          
          if (result.success && result.status === 'COMPLETED') {
            await db.updateSubscription(input.subscriptionId, { status: 'active' });
            await db.updateMerchant(merchant.id, { subscriptionId: input.subscriptionId });
          }

          return result;
        }

        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid payment method' });
      }),
  }),

  // Payment Gateways Router (Admin only)
  paymentGateways: router({
    list: adminProcedure.query(async () => {
      return await db.getAllPaymentGateways();
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
        const result = await db.createOrUpdatePaymentGateway(input);
        if (!result) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to save payment gateway' });
        }
        return { success: true, gateway: result };
      }),
  }),

  // Invoices router
  invoices: router({
    list: adminProcedure.query(async () => {
      return await db.getAllInvoices();
    }),

    getByMerchant: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input }) => {
        return await db.getInvoicesByMerchantId(input.merchantId);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getInvoiceById(input.id);
      }),
  }),

  // Salla Integration Router
  salla: router({
    // Get connection status
    getConnection: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const connection = await db.getSallaConnectionByMerchantId(input.merchantId);
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
        merchantId: z.number(),
        storeUrl: z.string().url(),
        accessToken: z.string().min(10),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Test connection first
        const { SallaIntegration } = await import('./integrations/salla');
        const salla = new SallaIntegration(input.merchantId, input.accessToken);
        const testResult = await salla.testConnection();

        if (!testResult.success) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'فشل الاتصال بـ Salla. تأكد من صحة الرابط والـ Token' 
          });
        }

        // Check if connection already exists
        const existing = await db.getSallaConnectionByMerchantId(input.merchantId);
        
        if (existing) {
          // Update existing connection
          await db.updateSallaConnection(input.merchantId, {
            storeUrl: input.storeUrl,
            accessToken: input.accessToken,
            syncStatus: 'active',
          });
        } else {
          // Create new connection
          await db.createSallaConnection({
            merchantId: input.merchantId,
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
      .input(z.object({ merchantId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.deleteSallaConnection(input.merchantId);
        return { success: true, message: 'تم فصل المتجر بنجاح' };
      }),

    // Manual sync
    syncNow: protectedProcedure
      .input(z.object({ 
        merchantId: z.number(),
        syncType: z.enum(['full', 'stock']).default('stock'),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const connection = await db.getSallaConnectionByMerchantId(input.merchantId);
        if (!connection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'المتجر غير مربوط' });
        }

        const { SallaIntegration } = await import('./integrations/salla');
        const salla = new SallaIntegration(input.merchantId, connection.accessToken);

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
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getSyncLogsByMerchantId(input.merchantId, 20);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const order = await db.getOrderById(result.orderId);
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
        const order = await db.getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'الطلب غير موجود' });
        }

        // Verify user owns this merchant
        const merchant = await db.getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return order;
      }),

    // List orders for merchant
    listByMerchant: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getOrdersByMerchantId(input.merchantId);
      }),

    // Get orders with filters
    getWithFilters: protectedProcedure
      .input(z.object({
        merchantId: z.number(),
        status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchQuery: z.string().optional(),
      }))
      .query(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const filters: any = {};
        if (input.status) filters.status = input.status;
        if (input.startDate) filters.startDate = new Date(input.startDate);
        if (input.endDate) filters.endDate = new Date(input.endDate);
        if (input.searchQuery) filters.searchQuery = input.searchQuery;

        return await db.getOrdersWithFilters(input.merchantId, filters);
      }),

    // Get order statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getOrderStats(input.merchantId);
      }),

    // Cancel order
    cancel: protectedProcedure
      .input(z.object({
        orderId: z.number(),
        reason: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const order = await db.getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Verify user owns this merchant
        const merchant = await db.getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.cancelOrder(input.orderId, input.reason);
        
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
        const order = await db.getOrderById(input.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        // Verify user owns this merchant
        const merchant = await db.getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.updateOrderStatus(input.orderId, input.status, input.trackingNumber);
        
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
        merchantId: z.number(),
        code: z.string().min(4).max(50),
        type: z.enum(['percentage', 'fixed']),
        value: z.number().positive(),
        minOrderAmount: z.number().optional(),
        maxUses: z.number().optional(),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Verify user owns this merchant
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const discountCode = await db.createDiscountCode({
          merchantId: input.merchantId,
          code: input.code.toUpperCase(),
          type: input.type,
          value: input.value,
          minOrderAmount: input.minOrderAmount || null,
          maxUses: input.maxUses || null,
          usedCount: 0,
          isActive: true,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        });

        return { success: true, discountCode };
      }),

    // List all discount codes
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getDiscountCodesByMerchantId(input.merchantId);
      }),

    // Get discount code by ID
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const discountCode = await db.getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await db.getMerchantById(discountCode.merchantId);
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
        maxUses: z.number().optional(),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const discountCode = await db.getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await db.getMerchantById(discountCode.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.updateDiscountCode(input.id, {
          isActive: input.isActive,
          maxUses: input.maxUses,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        });

        return { success: true, message: 'تم تحديث كود الخصم' };
      }),

    // Delete discount code
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const discountCode = await db.getDiscountCodeById(input.id);
        if (!discountCode) {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }

        const merchant = await db.getMerchantById(discountCode.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.deleteDiscountCode(input.id);
        return { success: true, message: 'تم حذف كود الخصم' };
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const codes = await db.getDiscountCodesByMerchantId(input.merchantId);
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Try to get existing code
      let code = await db.getReferralCodeByMerchantId(merchant.id);
      
      // Generate new code if doesn't exist
      if (!code) {
        code = await db.generateReferralCode(
          merchant.id,
          merchant.businessName,
          merchant.phone || ''
        );
      }

      return code;
    }),

    // Get my referrals list
    getMyReferrals: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getReferralsWithDetails(merchant.id);
    }),

    // Get my rewards
    getMyRewards: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getRewardsByMerchantId(merchant.id);
    }),

    // Get referral statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getReferralStats(merchant.id);
    }),

    // Apply referral code during signup
    applyReferralCode: publicProcedure
      .input(z.object({
        code: z.string(),
        referredMerchantId: z.number(),
      }))
      .mutation(async ({ input }) => {
        // Get referral code
        const referralCode = await db.getReferralCodeByCode(input.code);
        if (!referralCode || !referralCode.isActive) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'كود الإحالة غير صحيح' });
        }

        // Get referred merchant info
        const referredMerchant = await db.getMerchantById(input.referredMerchantId);
        if (!referredMerchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Create referral record
        const referral = await db.createReferral({
          referralCodeId: referralCode.id,
          referredPhone: referredMerchant.phone || '',
          referredName: referredMerchant.businessName,
          orderCompleted: false,
        });

        if (!referral) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل تسجيل الإحالة' });
        }

        // Increment referral count
        await db.incrementReferralCount(referralCode.id);

        // Grant reward to referrer (90 days expiry)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        await db.createReward({
          merchantId: referralCode.merchantId,
          referralId: referral.id,
          rewardType: 'discount_10', // Default: 10% discount
          status: 'pending',
          expiresAt,
          description: `خصم 10% على الاشتراك القادم لإحالة ${referredMerchant.businessName}`,
        });

        // Notify referrer
        const { notifyOwner } = await import('./_core/notification');
        const referrer = await db.getMerchantById(referralCode.merchantId);
        if (referrer) {
          await notifyOwner({
            title: 'إحالة جديدة!',
            content: `${referrer.businessName} حصل على إحالة جديدة من ${referredMerchant.businessName}`,
          });
        }

        return { success: true, message: 'تم تطبيق كود الإحالة بنجاح' };
      }),

    // Claim a reward
    claimReward: protectedProcedure
      .input(z.object({ rewardId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const reward = await db.getRewardById(input.rewardId);
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

        await db.claimReward(input.rewardId);

        return { success: true, message: 'تم استخدام المكافأة بنجاح' };
      }),
  }),

  // Abandoned Carts Management
  abandonedCarts: router({
    // List abandoned carts for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getAbandonedCartsByMerchantId(input.merchantId);
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
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
        const cart = await db.getAbandonedCartById(input.cartId);
        if (!cart) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
        }

        const merchant = await db.getMerchantById(cart.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.markAbandonedCartRecovered(input.cartId);
      }),

    // Send reminder manually
    sendReminder: protectedProcedure
      .input(z.object({ cartId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const cart = await db.getAbandonedCartById(input.cartId);
        if (!cart) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart not found' });
        }

        const merchant = await db.getMerchantById(cart.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getOccasionCampaignsByMerchantId(input.merchantId);
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getOccasionCampaignsStats(input.merchantId);
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
        const campaign = await db.getOccasionCampaignById(input.campaignId);
        if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found' });
        }

        const merchant = await db.getMerchantById(campaign.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await db.updateOccasionCampaign(input.campaignId, {
          enabled: input.enabled,
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const year = new Date().getFullYear();

        // Check if campaign already exists
        const existing = await db.getOccasionCampaignByTypeAndYear(
          input.merchantId,
          input.occasionType,
          year
        );

        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign already exists for this occasion' });
        }

        // Create campaign
        const campaign = await db.createOccasionCampaign({
          merchantId: input.merchantId,
          occasionType: input.occasionType,
          year,
          enabled: true,
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
        const merchant = await db.getMerchantById(input.merchantId);
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
    // List all instances for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getWhatsAppInstancesByMerchantId(input.merchantId);
      }),

    // Get primary instance
    getPrimary: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getPrimaryWhatsAppInstance(input.merchantId);
      }),

    // Create new instance
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Check if instance ID already exists
        const existing = await db.getWhatsAppInstanceByInstanceId(input.instanceId);
        if (existing) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Instance ID already exists' });
        }

        const instance = await db.createWhatsAppInstance({
          merchantId: input.merchantId,
          instanceId: input.instanceId,
          token: input.token,
          apiUrl: input.apiUrl || 'https://api.green-api.com',
          phoneNumber: input.phoneNumber || null,
          webhookUrl: input.webhookUrl || null,
          status: 'pending',
          isPrimary: input.isPrimary || false,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          metadata: null,
        });

        // If this is set as primary, update all others
        if (input.isPrimary && instance) {
          await db.setWhatsAppInstanceAsPrimary(instance.id, input.merchantId);
        }

        return instance;
      }),

    // Update instance
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instance = await db.getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        await db.updateWhatsAppInstance(input.id, {
          instanceId: input.instanceId,
          token: input.token,
          apiUrl: input.apiUrl,
          phoneNumber: input.phoneNumber,
          webhookUrl: input.webhookUrl,
          status: input.status,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        });

        return await db.getWhatsAppInstanceById(input.id);
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instance = await db.getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        await db.setWhatsAppInstanceAsPrimary(input.id, input.merchantId);
        return { success: true };
      }),

    // Delete instance
    delete: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          merchantId: z.number(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instance = await db.getWhatsAppInstanceById(input.id);
        if (!instance || instance.merchantId !== input.merchantId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Instance not found' });
        }

        // Don't allow deleting the primary instance if it's the only one
        if (instance.isPrimary) {
          const count = await db.getActiveWhatsAppInstancesCount(input.merchantId);
          if (count <= 1) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot delete the only active instance' });
          }
        }

        await db.deleteWhatsAppInstance(input.id);
        return { success: true };
      }),

    // Test connection
    testConnection: protectedProcedure
      .input(
        z.object({
          instanceId: z.string(),
          token: z.string(),
          apiUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const baseUrl = input.apiUrl || 'https://api.green-api.com';
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const instances = await db.getWhatsAppInstancesByMerchantId(input.merchantId);
        const activeCount = instances.filter(i => i.status === 'active').length;
        const inactiveCount = instances.filter(i => i.status === 'inactive').length;
        const expiredCount = instances.filter(i => i.status === 'expired').length;
        const primary = instances.find(i => i.isPrimary);

        return {
          total: instances.length,
          active: activeCount,
          inactive: inactiveCount,
          expired: expiredCount,
          primary: primary || null,
        };
      }),

    // Get expiring instances
    getExpiring: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const { expiring7Days, expiring3Days, expiring1Day, expired } = await db.getExpiringWhatsAppInstances();
        
        // Filter by merchant
        const merchantExpiring7Days = expiring7Days.filter(i => i.merchantId === input.merchantId);
        const merchantExpiring3Days = expiring3Days.filter(i => i.merchantId === input.merchantId);
        const merchantExpiring1Day = expiring1Day.filter(i => i.merchantId === input.merchantId);
        const merchantExpired = expired.filter(i => i.merchantId === input.merchantId);

        return {
          expiring7Days: merchantExpiring7Days,
          expiring3Days: merchantExpiring3Days,
          expiring1Day: merchantExpiring1Day,
          expired: merchantExpired,
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
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Check if there's already a pending request
        const existingRequests = await db.getWhatsAppRequestsByMerchantId(input.merchantId);
        const pendingRequest = existingRequests.find((r: WhatsAppRequest) => r.status === 'pending');
        if (pendingRequest) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already have a pending request' });
        }

        const request = await db.createWhatsAppRequest({
          merchantId: input.merchantId,
          phoneNumber: input.phoneNumber,
          businessName: input.businessName || merchant.businessName,
          status: 'pending',
        });

        return request;
      }),

    // Get all requests (admin only)
    listAll: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        return db.getAllWhatsAppRequests();
      }),

    // Get pending requests (admin only)
    listPending: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        return db.getPendingWhatsAppRequests();
      }),

    // Get merchant's requests
    listMine: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return db.getWhatsAppRequestsByMerchantId(input.merchantId);
      }),

    // Approve request and add instance details (admin only)
    approve: protectedProcedure
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
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        const request = await db.approveWhatsAppRequest(
          input.requestId,
          input.instanceId,
          input.token,
          input.apiUrl,
          ctx.user.id
        );

        if (input.adminNotes) {
          await db.updateWhatsAppRequest(input.requestId, { adminNotes: input.adminNotes });
        }

        return request;
      }),

    // Reject request (admin only)
    reject: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          rejectionReason: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }

        return db.rejectWhatsAppRequest(
          input.requestId,
          input.rejectionReason,
          ctx.user.id
        );
      }),

    // Get QR code for approved request (merchant)
    getQRCode: protectedProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const request = await db.getWhatsAppRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        const merchant = await db.getMerchantById(request.merchantId);
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
          const url = `${baseUrl}/waInstance${request.instanceId}/qr/${request.token}`;
          
          const response = await fetch(url);
          const data = await response.json();

          if (response.ok && data.type === 'qrCode') {
            // Update request with QR code
            await db.updateWhatsAppRequest(request.id, {
              qrCodeUrl: data.message,
              qrCodeExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
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
        const request = await db.getWhatsAppRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        const merchant = await db.getMerchantById(request.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        if (!request.instanceId || !request.token) {
          return { connected: false, status: 'pending' };
        }

        try {
          const baseUrl = request.apiUrl || 'https://api.green-api.com';
          const url = `${baseUrl}/waInstance${request.instanceId}/getStateInstance/${request.token}`;
          
          const response = await fetch(url);
          const data = await response.json();

          if (response.ok && data.stateInstance === 'authorized') {
            // Connection successful - create WhatsApp instance
            if (request.status === 'approved') {
              await db.createWhatsAppInstance({
                merchantId: request.merchantId,
                instanceId: request.instanceId,
                token: request.token,
                apiUrl: request.apiUrl || 'https://api.green-api.com',
                status: 'active',
                isPrimary: true,
                connectedAt: new Date(),
              });

              // Mark request as completed
              await db.completeWhatsAppRequest(request.id, data.phoneNumber || '');
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return db.getNotificationTemplatesByMerchantId(merchant.id);
      }),

    // Update notification template (merchant)
    updateTemplate: protectedProcedure
      .input(z.object({
        id: z.number(),
        template: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify template belongs to merchant
        const template = await db.getNotificationTemplateById(input.id);
        if (!template || template.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return db.updateNotificationTemplate(input.id, {
          template: input.template,
          enabled: input.enabled,
        });
      }),

    // Get notification history (merchant)
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return db.getOrderNotificationsByMerchantId(merchant.id, input.limit);
      }),

    // Get notifications for specific order (merchant)
    getByOrderId: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Verify order belongs to merchant
        const order = await db.getOrderById(input.orderId);
        if (!order || order.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return db.getOrderNotificationsByOrderId(input.orderId);
      }),
  }),

  // Voice router
  voice: router({
    // رفع ملف صوتي إلى S3
    uploadAudio: protectedProcedure
      .input(z.object({
        audioBase64: z.string(), // الملف الصوتي بصيغة base64
        mimeType: z.string(), // نوع الملف (audio/webm, audio/mp4, etc.)
        duration: z.number(), // مدة التسجيل بالثواني
        conversationId: z.number().optional(), // معرف المحادثة (اختياري)
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // تحويل base64 إلى Buffer
          const audioBuffer = Buffer.from(input.audioBase64, 'base64');
          
          // التحقق من حجم الملف (16MB max)
          const sizeMB = audioBuffer.length / (1024 * 1024);
          if (sizeMB > 16) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `حجم الملف كبير جداً (${sizeMB.toFixed(2)}MB). الحد الأقصى 16MB`
            });
          }

          // تحديد امتداد الملف
          const extension = input.mimeType.includes('webm') ? 'webm' : 'mp3';
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(7);
          const fileName = `voice-${ctx.user.id}-${timestamp}-${randomStr}.${extension}`;
          
          // رفع الملف إلى S3
          const { storagePut } = await import('./storage');
          const { url } = await storagePut(
            `audio/${fileName}`,
            audioBuffer,
            input.mimeType
          );

          return {
            success: true,
            audioUrl: url,
            duration: input.duration,
            size: sizeMB,
          };
        } catch (error) {
          console.error('[Voice] Upload failed:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'فشل رفع الملف الصوتي'
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return db.getMessageStats(merchant.id, startDate, endDate);
      }),

    // أوقات الذروة
    getPeakHours: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return db.getPeakHours(merchant.id, startDate, endDate);
      }),

    // المنتجات الأكثر استفساراً
    getTopProducts: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        return db.getTopProducts(merchant.id, input.limit || 10);
      }),

    // معدل التحويل
    getConversionRate: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        return db.getConversionRate(merchant.id, startDate, endDate);
      }),

    // عدد الرسائل اليومي
    getDailyMessageCount: protectedProcedure
      .input(z.object({
        days: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        return db.getDailyMessageCount(merchant.id, input.days || 30);
      }),

    // تصدير PDF
    exportPDF: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        // Gather all analytics data
        const messageStats = await db.getMessageStats(merchant.id, startDate, endDate);
        const peakHours = await db.getPeakHours(merchant.id, startDate, endDate);
        const topProducts = await db.getTopProducts(merchant.id, 10);
        const conversionRate = await db.getConversionRate(merchant.id, startDate, endDate);
        const dailyMessages = await db.getDailyMessageCount(merchant.id, 30);

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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;

        // Gather all analytics data
        const messageStats = await db.getMessageStats(merchant.id, startDate, endDate);
        const peakHours = await db.getPeakHours(merchant.id, startDate, endDate);
        const topProducts = await db.getTopProducts(merchant.id, 10);
        const conversionRate = await db.getConversionRate(merchant.id, startDate, endDate);
        const dailyMessages = await db.getDailyMessageCount(merchant.id, 30);

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

  // Dashboard Analytics
  dashboard: router({
    // اتجاه الطلبات
    getOrdersTrend: protectedProcedure
      .input(z.object({
        days: z.number().optional().default(30),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const { getOrdersTrend } = await import('./dashboard-analytics');
        return await getOrdersTrend(merchant.id, input.days);
      }),

    // اتجاه الإيرادات
    getRevenueTrend: protectedProcedure
      .input(z.object({
        days: z.number().optional().default(30),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const { getRevenueTrend } = await import('./dashboard-analytics');
        return await getRevenueTrend(merchant.id, input.days);
      }),

    // المقارنة مع الفترة السابقة
    getComparisonStats: protectedProcedure
      .input(z.object({
        days: z.number().optional().default(30),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const { getComparisonStats } = await import('./dashboard-analytics');
        return await getComparisonStats(merchant.id, input.days);
      }),

    // أفضل المنتجات
    getTopProducts: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(5),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const { getTopProducts } = await import('./dashboard-analytics');
        return await getTopProducts(merchant.id, input.limit);
      }),

    // إحصائيات Dashboard الرئيسية
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'لم يتم العثور على المتجر' });
        }

        const { getDashboardStats } = await import('./dashboard-analytics');
        return await getDashboardStats(merchant.id);
      }),
  }),

  // Reviews Management
  reviews: router({
    // List all reviews for merchant
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        return await db.getCustomerReviewsByMerchantId(input.merchantId);
      }),

    // Get review statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
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
        const review = await db.getCustomerReviewById(input.id);
        if (!review) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
        }

        const order = await db.getOrderById(review.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
        }

        const merchant = await db.getMerchantById(order.merchantId);
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
        const review = await db.getCustomerReviewById(input.reviewId);
        if (!review) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
        }

        const order = await db.getOrderById(review.orderId);
        if (!order) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
        }

        const merchant = await db.getMerchantById(order.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Update review with merchant reply
        await db.updateCustomerReview(input.reviewId, {
          merchantReply: input.reply,
          repliedAt: new Date(),
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const conversation = await db.getConversationById(input.conversationId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        message: z.string(),
        sessionId: z.string(),
        exampleUsed: z.string().optional(),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Use a demo merchant for public testing
        const demoMerchant = await db.getMerchantById(1);
        
        if (!demoMerchant) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Demo merchant not configured' });
        }

        // Track analytics
        const session = await db.getTrySariAnalyticsBySessionId(input.sessionId);
        if (!session) {
          // Create new session
          await db.upsertTrySariAnalytics({
            sessionId: input.sessionId,
            messageCount: 1,
            exampleUsed: input.exampleUsed,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          });
        } else {
          // Increment message count
          await db.incrementTrySariMessageCount(input.sessionId);
          
          // Update example if provided
          if (input.exampleUsed && !session.exampleUsed) {
            await db.upsertTrySariAnalytics({
              sessionId: input.sessionId,
              exampleUsed: input.exampleUsed,
            });
          }
        }

        const { chatWithSari } = await import('./ai/sari-personality');
        
        const response = await chatWithSari({
          merchantId: demoMerchant.id,
          customerPhone: input.sessionId,
          customerName: 'زائر',
          message: input.message,
        });

        return { response };
      }),
    
    // Track signup prompt shown
    trackSignupPrompt: publicProcedure
      .input(z.object({
        sessionId: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.markSignupPromptShown(input.sessionId);
        return { success: true };
      }),
    
    // Track conversion to signup
    trackConversion: publicProcedure
      .input(z.object({
        sessionId: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.markConvertedToSignup(input.sessionId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        await db.saveTestMessage(input);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const dealId = await db.markTestConversationAsDeal({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const conversationId = await db.createTestConversation(merchant.id);
        return { conversationId };
      }),
  }),

  // Bot Settings
  botSettings: router({
    // Get bot settings for current merchant
    get: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getBotSettings(merchant.id);
    }),

    // Update bot settings
    update: protectedProcedure
      .input(z.object({
        autoReplyEnabled: z.boolean().optional(),
        workingHoursEnabled: z.boolean().optional(),
        workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        workingDays: z.string().optional(),
        welcomeMessage: z.string().optional(),
        outOfHoursMessage: z.string().optional(),
        responseDelay: z.number().min(1).max(10).optional(),
        maxResponseLength: z.number().min(50).max(500).optional(),
        tone: z.enum(['friendly', 'professional', 'casual']).optional(),
        language: z.enum(['ar', 'en', 'both']).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.updateBotSettings(merchant.id, input);
      }),

    // Check if bot should respond (for testing)
    shouldRespond: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.shouldBotRespond(merchant.id);
    }),

    // Send test message
    sendTestMessage: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      // Get WhatsApp connection
      const connection = await db.getWhatsappConnectionByMerchantId(merchant.id);
      if (!connection || connection.status !== 'connected') {
        throw new TRPCError({ 
          code: 'PRECONDITION_FAILED', 
          message: 'يجب ربط حساب WhatsApp أولاً' 
        });
      }

      // Get bot settings
      const settings = await db.getBotSettings(merchant.id);
      if (!settings) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bot settings not found' });
      }

      // Import WhatsApp module
      const { sendTextMessage } = await import('./whatsapp');

      // Send welcome message to merchant's phone
      if (!merchant.phone) {
        throw new TRPCError({ 
          code: 'PRECONDITION_FAILED', 
          message: 'يجب إضافة رقم هاتف في الإعدادات' 
        });
      }

      const result = await sendTextMessage(
        merchant.phone,
        settings.welcomeMessage || 'مرحباً! هذه رسالة تجريبية من ساري.'
      );

      if (!result.success) {
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `فشل إرسال الرسالة: ${result.error}` 
        });
      }

      return { success: true, message: 'تم إرسال الرسالة التجريبية بنجاح!' };
    }),
  }),

  // Scheduled Messages
  scheduledMessages: router({
    // List all scheduled messages
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getScheduledMessages(merchant.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.createScheduledMessage({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { id, ...data } = input;
        return await db.updateScheduledMessage(id, merchant.id, data);
      }),

    // Delete scheduled message
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        await db.deleteScheduledMessage(input.id, merchant.id);
        return { success: true };
      }),

    // Toggle active status
    toggle: protectedProcedure
      .input(z.object({ id: z.number(), isActive: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.toggleScheduledMessage(input.id, merchant.id, input.isActive);
      }),
  }),

  // Sari Personality Settings
  personality: router({
    // Get personality settings
    get: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getOrCreatePersonalitySettings(merchant.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.updateSariPersonalitySettings(merchant.id, input);
      }),
  }),

  // Quick Responses
  quickResponses: router({
    // List all quick responses
    list: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      return await db.getQuickResponses(merchant.id);
    }),

    // Create quick response
    create: protectedProcedure
      .input(z.object({
        trigger: z.string().min(1),
        response: z.string().min(1),
        keywords: z.string().optional(),
        priority: z.number().min(1).max(10).optional(),
        category: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.createQuickResponse({
          ...input,
          merchantId: merchant.id,
        });
      }),

    // Update quick response
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        trigger: z.string().min(1).optional(),
        response: z.string().min(1).optional(),
        keywords: z.string().optional(),
        priority: z.number().min(1).max(10).optional(),
        category: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const { id, ...data } = input;
        return await db.updateQuickResponse(id, data);
      }),

    // Delete quick response
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        await db.deleteQuickResponse(input.id);
        return { success: true };
      }),

    // Get statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const responses = await db.getQuickResponses(merchant.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getMerchantSentimentStats(merchant.id, input.days || 30);
      }),

    // Get sentiment distribution
    getDistribution: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const stats = await db.getMerchantSentimentStats(merchant.id, input.days || 30);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getKeywordStats(merchant.id, input);
      }),

    // Get new keywords that need review
    getNew: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getNewKeywords(merchant.id, input.limit || 20);
      }),

    // Get suggested responses based on frequent questions
    getSuggested: protectedProcedure
      .query(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Get top keywords
        const keywords = await db.getKeywordStats(merchant.id, {
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
      .mutation(async ({ input }) => {
        await db.updateKeywordStatus(input.keywordId, input.status);
        return { success: true };
      }),

    // Delete keyword
    delete: protectedProcedure
      .input(z.object({
        keywordId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.deleteKeywordAnalysis(input.keywordId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getWeeklySentimentReports(merchant.id, input.limit || 10);
      }),

    // Get specific report
    getById: protectedProcedure
      .input(z.object({
        reportId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getWeeklySentimentReportById(input.reportId);
      }),

    // Generate test report (for current week)
    generateTest: protectedProcedure
      .mutation(async ({ ctx }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Check if there's already an active test for this keyword
        const existing = await db.getActiveABTestForKeyword(merchant.id, input.keyword);
        if (existing) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'There is already an active A/B test for this keyword' 
          });
        }

        const testId = await db.createABTest({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        return await db.getABTests(merchant.id, input.status);
      }),

    // Get specific test
    getById: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .query(async ({ input }) => {
        return await db.getABTestById(input.testId);
      }),

    // Declare winner
    declareWinner: protectedProcedure
      .input(z.object({
        testId: z.number(),
        winner: z.enum(['variant_a', 'variant_b', 'no_winner']),
      }))
      .mutation(async ({ input }) => {
        const test = await db.getABTestById(input.testId);
        if (!test) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Test not found' });
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

        await db.declareABTestWinner(input.testId, input.winner, confidence);

        return { success: true, confidence };
      }),

    // Pause test
    pause: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.pauseABTest(input.testId);
        return { success: true };
      }),

    // Resume test
    resume: protectedProcedure
      .input(z.object({
        testId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.resumeABTest(input.testId);
        return { success: true };
      }),
   }),

  // SMTP Configuration Router
  smtp: router({
    // Update SMTP2GO API settings (Admin only)
    updateSettings: adminProcedure
      .input(z.object({
        apiKey: z.string(),
        from: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        // In production, store these in a secure settings table
        // For now, we'll just validate and return success
        // Note: Actual env vars need to be set via the platform UI
        return { success: true, message: 'Settings saved. Please update SMTP2GO_API_KEY and SMTP_FROM in platform settings.' };
      }),

    // Send test email
    sendTestEmail: adminProcedure
      .input(z.object({
        to: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        const { sendEmail } = await import('./reports/email-sender');
        
        const success = await sendEmail({
          to: input.to,
          subject: 'اختبار SMTP - ساري',
          html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; direction: rtl;">
              <div style="background: linear-gradient(135deg, #00d25e 0%, #00a84d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">ساري</h1>
                <p style="color: white; margin: 10px 0 0 0; font-size: 14px;">مساعد المبيعات الذكي</p>
              </div>
              
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
                <h2 style="color: #333; margin-top: 0;">✅ اختبار ناجح!</h2>
                
                <p style="color: #555; line-height: 1.6;">
                  تهانينا! تم إعداد SMTP بنجاح. هذا بريد تجريبي للتأكد من أن النظام يعمل بشكل صحيح.
                </p>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #00d25e;">
                  <p style="margin: 0; color: #666;">
                    <strong>الوقت:</strong> ${new Date().toLocaleString('ar-SA')}
                  </p>
                  <p style="margin: 10px 0 0 0; color: #666;">
                    <strong>الخادم:</strong> SMTP2GO
                  </p>
                </div>
                
                <p style="color: #666; font-size: 13px; margin-top: 20px;">
                  يمكنك الآن استخدام النظام لإرسال الفواتير والتقارير الأسبوعية تلقائياً.
                </p>
              </div>
              
              <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
                <p style="color: #666; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} ساري - مساعد المبيعات الذكي على الواتساب
                </p>
                <p style="color: #999; font-size: 11px; margin: 5px 0 0 0;">
                  <a href="https://sary.live" style="color: #00d25e; text-decoration: none;">sary.live</a>
                </p>
              </div>
            </div>
          `,
        });
        
        if (!success) {
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Failed to send email. Please check SMTP settings.' 
          });
        }
        
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
        return await db.getTrySariAnalyticsStats(input.days || 30);
      }),
    
    // Get daily data for charts
    getDailyData: adminProcedure
      .input(z.object({
        days: z.number().min(1).max(365).optional(),
      }))
      .query(async ({ input }) => {
        return await db.getTrySariDailyData(input.days || 30);
      }),
  }),

  // Insights router
  insights: insightsRouter,
  
  // Offers and AB Testing
  offers: offersRouter.offers,
  signupPrompt: offersRouter.signupPrompt,
  
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
        data: z.record(z.any()),
      }))
      .mutation(async ({ input }) => {
        return await seoDb.updateSeoPage(input.pageId, input.data);
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
    
    createTrackingCode: adminProcedure
      .input(z.object({
        pageId: z.number().optional(),
        trackingType: z.string(),
        trackingId: z.string(),
        trackingCode: z.string().optional(),
        isActive: z.number().optional(),
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
  }),
  
  // Setup Wizard APIs
  setupWizard: router({
    // Get wizard progress
    getProgress: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      let progress = await db.getSetupWizardProgress(merchant.id);
      if (!progress) {
        // Create initial progress
        const progressId = await db.createSetupWizardProgress({
          merchantId: merchant.id,
          currentStep: 1,
          completedSteps: JSON.stringify([]),
          wizardData: JSON.stringify({}),
          isCompleted: 0,
        });
        progress = await db.getSetupWizardProgress(merchant.id);
      }
      return progress;
    }),
    
    // Save progress
    saveProgress: protectedProcedure
      .input(z.object({
        currentStep: z.number(),
        completedSteps: z.array(z.number()),
        wizardData: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        await db.updateSetupWizardProgress(merchant.id, {
          currentStep: input.currentStep,
          completedSteps: JSON.stringify(input.completedSteps),
          wizardData: JSON.stringify(input.wizardData),
        });
        
        return { success: true };
      }),
    
    // Complete setup
    completeSetup: protectedProcedure
      .input(z.object({
        businessType: z.enum(['store', 'services', 'both']),
        businessName: z.string(),
        phone: z.string(),
        address: z.string().optional(),
        description: z.string().optional(),
        workingHoursType: z.enum(['24_7', 'weekdays', 'custom']),
        workingHours: z.record(z.string(), z.any()).optional(),
        botTone: z.enum(['friendly', 'professional', 'casual']).optional(),
        botLanguage: z.enum(['ar', 'en', 'both']).optional(),
        welcomeMessage: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Update merchant
        await db.updateMerchant(merchant.id, {
          businessType: input.businessType,
          businessName: input.businessName,
          phone: input.phone,
          address: input.address,
          description: input.description,
          workingHoursType: input.workingHoursType,
          workingHours: input.workingHours ? JSON.stringify(input.workingHours) : undefined,
        });
        
        // Update bot settings if provided
        if (input.botTone || input.botLanguage || input.welcomeMessage) {
          await db.updateBotSettings(merchant.id, {
            tone: input.botTone,
            language: input.botLanguage,
            welcomeMessage: input.welcomeMessage,
          });
        }
        
        // Mark setup as completed
        await db.completeSetupWizard(merchant.id);
        
        return { success: true };
      }),
    
    // Get templates
    getTemplates: publicProcedure
      .input(z.object({
        businessType: z.enum(['store', 'services', 'both']).optional(),
      }))
      .query(async ({ input }) => {
        if (input.businessType) {
          return await db.getBusinessTemplatesByType(input.businessType);
        }
        return await db.getAllBusinessTemplates();
      }),
    
    // Apply template
    applyTemplate: protectedProcedure
      .input(z.object({
        templateId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const template = await db.getBusinessTemplateById(input.templateId);
        if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found' });
        
        // Parse template data
        const services = template.services ? JSON.parse(template.services) : [];
        const products = template.products ? JSON.parse(template.products) : [];
        const workingHours = template.working_hours ? JSON.parse(template.working_hours) : {};
        const botPersonality = template.bot_personality ? JSON.parse(template.bot_personality) : {};
        
        // Apply services
        for (const service of services) {
          await db.createService({
            merchantId: merchant.id,
            ...service,
          });
        }
        
        // Apply products
        for (const product of products) {
          await db.createProduct({
            merchantId: merchant.id,
            ...product,
          });
        }
        
        // Update merchant working hours
        await db.updateMerchant(merchant.id, {
          workingHours: JSON.stringify(workingHours),
        });
        
        // Update bot personality
        await db.updateBotSettings(merchant.id, botPersonality);
        
        // Increment template usage
        await db.incrementTemplateUsage(input.templateId);
        
        return { success: true };
      }),
    
    // Reset wizard (allow merchant to restart setup)
    resetWizard: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      // Reset wizard progress to initial state
      await db.updateSetupWizardProgress(merchant.id, {
        currentStep: 1,
        completedSteps: JSON.stringify([]),
        wizardData: JSON.stringify({}),
        isCompleted: 0,
      });
      
      return { success: true };
    }),
  }),
  
  // Google Calendar Integration
  calendar: router({
    // Get authorization URL
    getAuthUrl: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const { getTokensFromCode } = await import('./_core/googleCalendar');
        const tokens = await getTokensFromCode(input.code);
        
        // Save integration
        const existing = await db.getGoogleIntegration(merchant.id, 'calendar');
        
        if (existing) {
          await db.updateGoogleIntegration(existing.id, {
            credentials: JSON.stringify(tokens),
            calendarId: input.calendarId || existing.calendarId,
            isActive: 1,
          });
        } else {
          await db.createGoogleIntegration({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Get service details
        const service = await db.getServiceById(input.serviceId);
        if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        
        // Get Google Calendar integration
        const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
        if (!integration || !integration.isActive) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Google Calendar not connected' });
        }
        
        const credentials = JSON.parse(integration.credentials || '{}');
        const { getAvailableSlots, validateAndRefreshCredentials } = await import('./_core/googleCalendar');
        
        // Validate and refresh credentials if needed
        const validCredentials = await validateAndRefreshCredentials(credentials);
        
        // Update credentials if refreshed
        if (JSON.stringify(validCredentials) !== JSON.stringify(credentials)) {
          await db.updateGoogleIntegration(integration.id, {
            credentials: JSON.stringify(validCredentials),
          });
        }
        
        // Get working hours from merchant or staff
        let workingHours = { start: '09:00', end: '17:00' };
        
        if (input.staffId) {
          const staff = await db.getStaffMemberById(input.staffId);
          if (staff && staff.workingHours) {
            const staffHours = JSON.parse(staff.workingHours);
            const dayName = new Date(input.date).toLocaleDateString('en-US', { weekday: 'lowercase' });
            if (staffHours[dayName]) {
              workingHours = staffHours[dayName];
            }
          }
        } else if (merchant.workingHours) {
          const merchantHours = JSON.parse(merchant.workingHours);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Get service details
        const service = await db.getServiceById(input.serviceId);
        if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        
        // Calculate end time
        const [startHour, startMinute] = input.startTime.split(':').map(Number);
        const endDate = new Date(input.appointmentDate);
        endDate.setHours(startHour, startMinute + service.durationMinutes, 0, 0);
        const endTime = endDate.toTimeString().substring(0, 5);
        
        // Check for conflicts
        const hasConflict = await db.checkAppointmentConflict(
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
        const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
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
            
            googleEventId = event.id;
          } catch (error) {
            console.error('Failed to create calendar event:', error);
            // Continue without calendar event
          }
        }
        
        // Create appointment in database
        const appointmentId = await db.createAppointment({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Get appointment
        const appointment = await db.getAppointmentById(input.appointmentId);
        if (!appointment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Appointment not found' });
        
        // Verify ownership
        if (appointment.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }
        
        // Delete from Google Calendar if exists
        if (appointment.googleEventId) {
          const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
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
        await db.cancelAppointment(input.appointmentId, input.reason);
        
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const appointments = await db.getAppointmentsByMerchant(merchant.id, input.status);
        
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const stats = await db.getAppointmentStats(merchant.id, input.startDate, input.endDate);
        
        return stats;
      }),
    
    // Disconnect Google Calendar
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
      if (integration) {
        await db.deleteGoogleIntegration(integration.id);
      }
      
      return { success: true };
    }),
    
    // Get integration status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      const integration = await db.getGoogleIntegration(merchant.id, 'calendar');
      
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
        workingHours: z.record(z.object({
          start: z.string(),
          end: z.string(),
        })).optional(),
        googleCalendarId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const staffId = await db.createStaffMember({
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
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const staff = input.activeOnly 
          ? await db.getActiveStaffByMerchant(merchant.id)
          : await db.getStaffMembersByMerchant(merchant.id);
        
        return { staff };
      }),
    
    // Get staff member by ID
    getById: protectedProcedure
      .input(z.object({ staffId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const staff = await db.getStaffMemberById(input.staffId);
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
        workingHours: z.record(z.object({
          start: z.string(),
          end: z.string(),
        })).optional(),
        googleCalendarId: z.string().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Verify ownership
        const staff = await db.getStaffMemberById(input.staffId);
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
        
        await db.updateStaffMember(input.staffId, updateData);
        
        return { success: true };
      }),
    
    // Delete staff member
    delete: protectedProcedure
      .input(z.object({ staffId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        // Verify ownership
        const staff = await db.getStaffMemberById(input.staffId);
        if (!staff || staff.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Staff member not found' });
        }
        
        await db.deleteStaffMember(input.staffId);
        
        return { success: true };
      }),
  }),
  
  googleAuth: googleAuthRouter,
  
  sheets: sheetsRouter,
  
  loyalty: loyaltyRouter,
  
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const serviceId = await db.createService({
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      const services = await db.getServicesByMerchant(merchant.id);
      return { services };
    }),
    
    // Get service by ID with booking stats
    getById: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const service = await db.getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }
        
        // Get booking statistics
        const bookingStats = await db.getBookingStats(merchant.id, { serviceId: input.serviceId });
        
        // Get recent bookings
        const recentBookings = await db.getBookingsByService(input.serviceId, { limit: 10 });
        
        // Get rating stats
        const ratingStats = await db.getServiceRatingStats(input.serviceId);
        
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const service = await db.getServiceById(input.serviceId);
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
        
        await db.updateService(input.serviceId, updateData);
        
        return { success: true };
      }),
    
    // Delete service
    delete: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const service = await db.getServiceById(input.serviceId);
        if (!service || service.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }
        
        await db.deleteService(input.serviceId);
        
        return { success: true };
      }),
    
    // Get services by category
    getByCategory: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const services = await db.getServicesByCategory(input.categoryId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const categoryId = await db.createServiceCategory({
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      const categories = await db.getServiceCategoriesByMerchant(merchant.id);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const category = await db.getServiceCategoryById(input.categoryId);
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
        
        await db.updateServiceCategory(input.categoryId, updateData);
        
        return { success: true };
      }),
    
    // Delete category
    delete: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const category = await db.getServiceCategoryById(input.categoryId);
        if (!category || category.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
        }
        
        await db.deleteServiceCategory(input.categoryId);
        
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const packageId = await db.createServicePackage({
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
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      
      const packages = await db.getServicePackagesByMerchant(merchant.id);
      return { packages };
    }),
    
    // Get package by ID
    getById: protectedProcedure
      .input(z.object({ packageId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const pkg = await db.getServicePackageById(input.packageId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const pkg = await db.getServicePackageById(input.packageId);
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
        
        await db.updateServicePackage(input.packageId, updateData);
        
        return { success: true };
      }),
    
    // Delete package
    delete: protectedProcedure
      .input(z.object({ packageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        
        const pkg = await db.getServicePackageById(input.packageId);
        if (!pkg || pkg.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Package not found' });
        }
        
        await db.deleteServicePackage(input.packageId);
        
        return { success: true };
      }),
  }),
  
  // Google OAuth Settings (Super Admin only)
  googleOAuthSettings: router({
    // Get Google OAuth settings
    get: adminProcedure.query(async () => {
      const settings = await db.getGoogleOAuthSettings();
      return { settings };
    }),
    
    // Update Google OAuth settings
    update: adminProcedure
      .input(z.object({
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        isEnabled: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const settings = await db.upsertGoogleOAuthSettings({
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          isEnabled: input.isEnabled ? 1 : 0,
        });
        
        return { success: true, settings };
      }),
    
    // Toggle enabled status
    toggleEnabled: adminProcedure
      .input(z.object({ isEnabled: z.boolean() }))
      .mutation(async ({ input }) => {
        const settings = await db.toggleGoogleOAuthEnabled(input.isEnabled);
        return { success: true, settings };
      }),
  }),
  
  // ============================================
  // Bookings Management
  // ============================================
  bookings: router({
    // Create a new booking
    create: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        customerPhone: z.string(),
        customerName: z.string().optional(),
        customerEmail: z.string().email().optional(),
        staffId: z.number().optional(),
        bookingDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        durationMinutes: z.number(),
        basePrice: z.number(),
        discountAmount: z.number().optional(),
        finalPrice: z.number(),
        notes: z.string().optional(),
        bookingSource: z.enum(['whatsapp', 'website', 'phone', 'walk_in']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        // Check for conflicts
        const hasConflict = await db.checkBookingConflict(
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
        
        const bookingId = await db.createBooking({
          merchantId: merchant.id,
          ...input,
        });
        
        return { success: true, bookingId };
      }),
    
    // Get booking by ID
    getById: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const booking = await db.getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }
        
        return { booking };
      }),
    
    // List bookings with filters
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        serviceId: z.number().optional(),
        staffId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const bookings = await db.getBookingsByMerchant(merchant.id, input);
        return { bookings };
      }),
    
    // Get bookings by service
    getByService: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        status: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const bookings = await db.getBookingsByService(input.serviceId, input);
        return { bookings };
      }),
    
    // Get bookings by customer
    getByCustomer: protectedProcedure
      .input(z.object({ customerPhone: z.string() }))
      .query(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const bookings = await db.getBookingsByCustomer(merchant.id, input.customerPhone);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const booking = await db.getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }
        
        // Check for conflicts if time is being changed
        if (input.bookingDate || input.startTime || input.endTime) {
          const hasConflict = await db.checkBookingConflict(
            booking.serviceId,
            input.staffId || booking.staffId,
            input.bookingDate || booking.bookingDate,
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
        await db.updateBooking(bookingId, updateData);
        
        return { success: true };
      }),
    
    // Delete booking
    delete: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const booking = await db.getBookingById(input.bookingId);
        if (!booking || booking.merchantId !== merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }
        
        await db.deleteBooking(input.bookingId);
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const stats = await db.getBookingStats(merchant.id, input);
        return { stats };
      }),
    
    // Check availability
    checkAvailability: protectedProcedure
      .input(z.object({
        serviceId: z.number(),
        staffId: z.number().optional(),
        bookingDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const hasConflict = await db.checkBookingConflict(
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
        date: z.string(),
        staffId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const slots = await db.getAvailableTimeSlots(
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const reviewId = await db.createBookingReview({
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
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        const reviews = await db.getBookingReviews(merchant.id, {
          ...input,
          isPublic: input.isPublic !== undefined ? (input.isPublic ? 1 : 0) : undefined,
        });
        return { reviews };
      }),
    
    // Get reviews by service
    getByService: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ input }) => {
        const reviews = await db.getReviewsByService(input.serviceId);
        return { reviews };
      }),
    
    // Reply to review
    reply: protectedProcedure
      .input(z.object({
        reviewId: z.number(),
        reply: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const merchant = await db.getMerchantByUserId(ctx.user.id);
        if (!merchant) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        
        await db.replyToReview(input.reviewId, input.reply);
        return { success: true };
      }),
    
    // Get rating statistics
    getStats: protectedProcedure
      .input(z.object({ serviceId: z.number() }))
      .query(async ({ input }) => {
        const stats = await db.getServiceRatingStats(input.serviceId);
        return { stats };
      }),
  }),

  // ============================================
  // Payment System - Tap Payments Integration
  // ============================================
  payments: router({
    // Create payment charge
    createCharge: protectedProcedure
      .input(z.object({
        amount: z.number().positive(),
        currency: z.string().default('SAR'),
        customerName: z.string(),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string(),
        description: z.string().optional(),
        orderId: z.number().optional(),
        bookingId: z.number().optional(),
        redirectUrl: z.string().url(),
        metadata: z.record(z.any()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const tapPayments = await import('./_core/tapPayments');
        
        const charge = await tapPayments.createCharge({
          ...input,
          webhookUrl: `${process.env.VITE_FRONTEND_FORGE_API_URL}/api/webhooks/tap`,
        });
        
        const payment = await dbPayments.createOrderPayment({
          merchantId: ctx.merchant.id,
          orderId: input.orderId || null,
          bookingId: input.bookingId || null,
          customerPhone: input.customerPhone,
          customerName: input.customerName,
          customerEmail: input.customerEmail || null,
          amount: input.amount,
          currency: input.currency,
          tapChargeId: charge.id,
          tapPaymentUrl: charge.transaction.url,
          status: 'pending',
          description: input.description || null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          expiresAt: new Date(Date.now() + charge.transaction.expiry.period * 60 * 60 * 1000).toISOString(),
        });
        
        return {
          paymentId: payment?.id,
          chargeId: charge.id,
          paymentUrl: charge.transaction.url,
          expiresAt: charge.transaction.expiry,
        };
      }),
    
    verifyPayment: protectedProcedure
      .input(z.object({ chargeId: z.string() }))
      .query(async ({ input }) => {
        const tapPayments = await import('./_core/tapPayments');
        const dbPayments = await import('./db_payments');
        
        const verification = await tapPayments.verifyPayment(input.chargeId);
        const payment = await dbPayments.getOrderPaymentByTapChargeId(input.chargeId);
        if (payment) {
          await dbPayments.updateOrderPaymentStatus(payment.id, verification.status.toLowerCase() as any);
        }
        return verification;
      }),
    
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const payment = await dbPayments.getOrderPaymentById(input.id);
        if (!payment || payment.merchantId !== ctx.merchant.id) {
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
        const dbPayments = await import('./db_payments');
        const filters: any = { status: input.status, limit: input.limit };
        if (input.startDate) filters.startDate = new Date(input.startDate);
        if (input.endDate) filters.endDate = new Date(input.endDate);
        return await dbPayments.getOrderPaymentsByMerchant(ctx.merchant.id, filters);
      }),
    
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await dbPayments.getPaymentStats(ctx.merchant.id, startDate, endDate);
      }),
    
    createRefund: protectedProcedure
      .input(z.object({
        paymentId: z.number(),
        amount: z.number().positive(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const tapPayments = await import('./_core/tapPayments');
        
        const payment = await dbPayments.getOrderPaymentById(input.paymentId);
        if (!payment || payment.merchantId !== ctx.merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
        }
        if (!payment.tapChargeId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Payment has no Tap charge ID' });
        }
        
        const refund = await tapPayments.createRefund({
          chargeId: payment.tapChargeId,
          amount: input.amount,
          currency: payment.currency,
          reason: input.reason,
        });
        
        const dbRefund = await dbPayments.createPaymentRefund({
          paymentId: payment.id,
          merchantId: ctx.merchant.id,
          amount: input.amount,
          currency: payment.currency,
          reason: input.reason,
          tapRefundId: refund.id,
          status: 'pending',
          processedBy: ctx.user.id,
        });
        
        await dbPayments.updateOrderPaymentStatus(payment.id, 'refunded');
        return { refundId: dbRefund?.id, tapRefundId: refund.id, status: refund.status };
      }),
    
    listRefunds: protectedProcedure
      .input(z.object({
        paymentId: z.number().optional(),
        status: z.string().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        if (input.paymentId) {
          return await dbPayments.getPaymentRefundsByPaymentId(input.paymentId);
        }
        return await dbPayments.getPaymentRefundsByMerchant(ctx.merchant.id, { status: input.status, limit: input.limit });
      }),
    
    createLink: protectedProcedure
      .input(z.object({
        title: z.string(),
        description: z.string().optional(),
        amount: z.number().positive(),
        currency: z.string().default('SAR'),
        isFixedAmount: z.boolean().default(true),
        maxUsageCount: z.number().optional(),
        expiresAt: z.string().optional(),
        orderId: z.number().optional(),
        bookingId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const linkId = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tapPaymentUrl = `${process.env.VITE_FRONTEND_FORGE_API_URL}/pay/${linkId}`;
        
        const link = await dbPayments.createPaymentLink({
          merchantId: ctx.merchant.id,
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
        const dbPayments = await import('./db_payments');
        const link = await dbPayments.getPaymentLinkByLinkId(input.linkId);
        if (!link || link.merchantId !== ctx.merchant.id) {
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
        const dbPayments = await import('./db_payments');
        return await dbPayments.getPaymentLinksByMerchant(ctx.merchant.id, { status: input.status, isActive: input.isActive, limit: input.limit });
      }),
    
    disableLink: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbPayments = await import('./db_payments');
        const link = await dbPayments.getPaymentLinkById(input.id);
        if (!link || link.merchantId !== ctx.merchant.id) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment link not found' });
        }
        await dbPayments.disablePaymentLink(input.id);
        return { success: true };
      }),
    
    // Webhook handler for Tap Payments
    handleWebhook: publicProcedure
      .input(z.object({
        payload: z.any(),
        signature: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const tapWebhook = await import('./webhooks/tap-webhook');
        
        // التحقق من التوقيع (إذا كان موجوداً)
        if (input.signature && process.env.TAP_WEBHOOK_SECRET) {
          const isValid = tapWebhook.verifyTapSignature(
            JSON.stringify(input.payload),
            input.signature,
            process.env.TAP_WEBHOOK_SECRET
          );
          
          if (!isValid) {
            throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid webhook signature' });
          }
        }
        
        // معالجة الـ webhook
        const result = await tapWebhook.processTapWebhook(input.payload);
        return result;
      }),
  }),
});
export type AppRouter = typeof appRouter;
