import { z } from 'zod';
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
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

        // Update status to sending
        await db.updateCampaign(input.id, { status: 'sending' });

        // Parse recipients from targetAudience (assuming JSON array of phone numbers)
        let recipients: string[] = [];
        try {
          if (campaign.targetAudience) {
            recipients = JSON.parse(campaign.targetAudience);
          }
        } catch (error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid target audience format' });
        }

        if (recipients.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No recipients found' });
        }

        // Send campaign in background
        const whatsapp = await import('./whatsapp');
        whatsapp.sendCampaign(
          recipients,
          campaign.message,
          campaign.imageUrl || undefined
        ).then(async (results) => {
          // Count successes
          const successCount = results.filter((r: any) => r.success).length;
          
          // Update campaign status
          await db.updateCampaign(input.id, {
            status: 'completed',
            sentCount: successCount,
          });
        }).catch(async (error) => {
          console.error('Error sending campaign:', error);
          await db.updateCampaign(input.id, { status: 'failed' });
        });

        return { success: true, message: 'Campaign is being sent' };
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
        // Green API format: https://api.green-api.com/waInstance{instanceId}/{token}/method
        const url = `https://api.green-api.com/waInstance${input.instanceId}/${input.token}/getStateInstance`;
        
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
          
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: errorMessage,
            cause: errorDetails,
          });
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
        const baseURL = `https://api.green-api.com/waInstance${input.instanceId}/${input.token}`;
        
        const response = await axios.default.post(`${baseURL}/sendMessage`, {
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
        const baseURL = `https://api.green-api.com/waInstance${input.instanceId}/${input.token}`;
        
        const response = await axios.default.post(`${baseURL}/sendFileByUrl`, {
          chatId: `${input.phoneNumber}@c.us`,
          urlFile: input.imageUrl,
          fileName: 'image.jpg',
          caption: input.caption || '',
        });

        return response.data;
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

  // Referrals Management
  referrals: router({
    // List all referral codes
    list: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        // Get all referral codes for this merchant
        const db_instance = await db.getDb();
        if (!db_instance) return [];

        const { referralCodes } = await import('../drizzle/schema.js');
        const { eq } = await import('drizzle-orm');
        
        return await db_instance.select().from(referralCodes).where(eq(referralCodes.merchantId, input.merchantId));
      }),

    // Get statistics
    getStats: protectedProcedure
      .input(z.object({ merchantId: z.number() }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const db_instance = await db.getDb();
        if (!db_instance) return { totalReferrals: 0, successfulReferrals: 0, rewardsGiven: 0 };

        const { referralCodes, referrals } = await import('../drizzle/schema.js');
        const { eq, and } = await import('drizzle-orm');
        
        const codes = await db_instance.select().from(referralCodes).where(eq(referralCodes.merchantId, input.merchantId));
        const totalReferrals = codes.reduce((sum, c) => sum + c.referralCount, 0);
        const rewardsGiven = codes.filter(c => c.rewardGiven).length;

        // Count successful referrals (completed orders)
        let successfulReferrals = 0;
        for (const code of codes) {
          const codeReferrals = await db_instance.select().from(referrals).where(
            and(
              eq(referrals.referralCodeId, code.id),
              eq(referrals.orderCompleted, true)
            )
          );
          successfulReferrals += codeReferrals.length;
        }

        return {
          totalReferrals,
          successfulReferrals,
          rewardsGiven,
        };
      }),

    // Get top referrers
    getTopReferrers: protectedProcedure
      .input(z.object({ merchantId: z.number(), limit: z.number().default(5) }))
      .query(async ({ input, ctx }) => {
        const merchant = await db.getMerchantById(input.merchantId);
        if (!merchant || merchant.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const db_instance = await db.getDb();
        if (!db_instance) return [];

        const { referralCodes } = await import('../drizzle/schema.js');
        const { eq, desc } = await import('drizzle-orm');
        
        return await db_instance.select().from(referralCodes)
          .where(eq(referralCodes.merchantId, input.merchantId))
          .orderBy(desc(referralCodes.referralCount))
          .limit(input.limit);
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
});

export type AppRouter = typeof appRouter;
