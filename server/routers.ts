import { z } from 'zod';
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from '@trpc/server';
import * as db from './db';

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

    // Get all campaigns (Admin only)
    listAll: adminProcedure.query(async () => {
      return db.getAllCampaigns();
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
        return db.getPlanById(input.id);
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
});

export type AppRouter = typeof appRouter;
