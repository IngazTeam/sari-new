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
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        await db.updatePlan(id, updateData);
        return { success: true };
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
});

export type AppRouter = typeof appRouter;
