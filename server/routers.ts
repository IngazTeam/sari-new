import { z } from 'zod';
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { insightsRouter } from "./routers-insights";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import type { WhatsAppRequest } from '../drizzle/schema';
import * as db from './db';
import bcrypt from 'bcryptjs';
import { sdk } from './_core/sdk';
import { ONE_YEAR_MS } from '@shared/const';

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
    me: publicProcedure.query(opts => opts.ctx.user),
    
    // Login with email and password
    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(6),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = await db.getUserByEmail(input.email);
        
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
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || '',
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
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || '',
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

    // Get all connection requests (Admin only)
    listRequests: adminProcedure
      .input(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }))
      .query(async ({ input }) => {
        return await db.getAllWhatsAppConnectionRequests(input.status);
      }),

    // Approve connection request (Admin only)
    approveRequest: adminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const request = await db.getWhatsAppConnectionRequestById(input.requestId);
        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' });
        }

        if (request.status !== 'pending') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Request already processed' });
        }

        const userId = typeof ctx.user.id === 'string' ? parseInt(ctx.user.id) : ctx.user.id;
        await db.approveWhatsAppConnectionRequest(input.requestId, userId);

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

    // Get QR Code for connection
    getQRCode: protectedProcedure.mutation(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const whatsapp = await import('./whatsapp');
      return await whatsapp.getQRCode();
    }),

    // Get connection status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const merchant = await db.getMerchantByUserId(ctx.user.id);
      if (!merchant) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
      }

      const whatsapp = await import('./whatsapp');
      return await whatsapp.getConnectionStatus();
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

  // Payments Router
  payments: router({ createSession: protectedProcedure
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

  // Insights router
  insights: insightsRouter,
});
export type AppRouter = typeof appRouter;
