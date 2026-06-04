/**
 * Merchants Router Module
 * Handles merchant profile and management operations
 * 
 * This is a standalone module following the "Parallel Coexistence" pattern.
 * The original code in routers.ts remains unchanged.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  cancelMerchantSubscription,
  completeOnboarding,
  createMerchant,
  createMerchantSubscription,
  createUser,
  getActiveSubscriptionByMerchantId,
  getActiveSubscriptionPlans,
  getAllMerchants,
  getCampaignsByMerchantId,
  getMerchantById,
  getMerchantByUserId,
  getMerchantCurrentSubscription,
  getMerchantSubscriptionById,
  getOnboardingStatus,
  getPlanById,
  getPool,
  getSubscriptionPlanById,
  getUserByEmail,
  rawUpdateSubscriptionEndDate,
  updateMerchant,
  updateMerchantCurrentSubscriptionId,
  updateMerchantCustomerLimit,
  updateMerchantSubscriptionStatus,
  updateOnboardingStep,
  updateUser,
  updateUserPassword,
} from './db';
import { syncGreenAPIData } from "./data-sync/green-api-sync";

// PEN-ESC-05 FIX: Rate limiter for escalation phone chain updates
const _escalationPhoneRateLimit: Record<number, number> = {};

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
    }
    return next({ ctx });
});

export const merchantsRouter = router({
    // Get current merchant for logged-in user
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        return merchant;
    }),

    // Create merchant profile
    create: protectedProcedure
        .input(z.object({
            businessName: z.string().min(1).max(255), // SEC-R3-03
            phone: z.string().max(20).regex(/^[0-9+\-\s()]*$/).optional(), // SEC-R3-03
        }))
        .mutation(async ({ input, ctx }) => {
            const existing = await getMerchantByUserId(ctx.user.id);
            if (existing) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Merchant profile already exists' });
            }

            const merchant = await createMerchant({
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
            businessName: z.string().min(1).max(255).optional(), // SEC-R3-03
            phone: z.string().max(20).regex(/^[0-9+\-\s()]*$/).optional(), // SEC-R3-03
            autoReplyEnabled: z.boolean().optional(),
            currency: z.enum(['SAR', 'USD']).optional(),
            logoUrl: z.string().url().max(500).nullable().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // @ts-ignore
            await updateMerchant(merchant.id, input);
            return { success: true };
        }),

    // Get all merchants (Admin only)
    list: adminProcedure.query(async () => {
        return await getAllMerchants();
    }),

    // Update merchant status (Admin only)
    updateStatus: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            status: z.enum(['active', 'suspended', 'pending']),
        }))
        .mutation(async ({ input }) => {
            // SEC-R3-02: Verify merchant exists before updating
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            await updateMerchant(input.merchantId, { status: input.status });
            return { success: true };
        }),

    // Admin: Update merchant profile data (email, phone, business name)
    adminUpdate: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            businessName: z.string().min(1).max(255).optional(),
            phone: z.string().max(20).regex(/^[0-9+\-\s()]*$/).optional(),
            email: z.string().email().optional(),
            name: z.string().min(2).max(255).optional(),
        }))
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // Update merchant fields
            const merchantUpdate: Record<string, any> = {};
            if (input.businessName) merchantUpdate.businessName = input.businessName;
            if (input.phone !== undefined) merchantUpdate.phone = input.phone || null;

            if (Object.keys(merchantUpdate).length > 0) {
                await updateMerchant(input.merchantId, merchantUpdate);
            }

            // Update user fields (email, name)
            if (merchant.userId && (input.email || input.name)) {
                const userUpdate: Record<string, any> = {};
                if (input.email) {
                    // Check email uniqueness
                    const existingUser = await getUserByEmail(input.email);
                    if (existingUser && existingUser.id !== merchant.userId) {
                        throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الإيميل مسجل بالفعل لحساب آخر' });
                    }
                    userUpdate.email = input.email;
                }
                if (input.name) userUpdate.name = input.name;

                if (Object.keys(userUpdate).length > 0) {
                    await updateUser(merchant.userId, userUpdate);
                }
            }

            console.log(`[Admin] Merchant UPDATED: id=${input.merchantId}, fields=${Object.keys({ ...merchantUpdate, ...(input.email ? { email: 1 } : {}), ...(input.name ? { name: 1 } : {}) }).join(',')}`);
            return { success: true };
        }),

    // Admin: Reset merchant password
    adminResetPassword: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            newPassword: z.string().min(6).max(128),
        }))
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            if (!merchant.userId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'لا يوجد مستخدم مرتبط بهذا التاجر' });
            }

            const bcrypt = await import('bcryptjs');
            const hashedPassword = await bcrypt.hash(input.newPassword, 10);
            await updateUserPassword(merchant.userId, hashedPassword);

            console.log(`[Admin] Password RESET for merchant: id=${input.merchantId}`);
            return { success: true };
        }),

    // Admin: Create a new merchant + user
    adminCreate: adminProcedure
        .input(z.object({
            name: z.string().min(2).max(255),
            email: z.string().email(),
            password: z.string().min(6).max(128),
            businessName: z.string().min(1).max(255),
            phone: z.string().max(20).regex(/^[0-9+\-\s()]*$/).optional(),
            status: z.enum(['active', 'pending', 'suspended']).default('active'),
        }))
        .mutation(async ({ input }) => {
            // Check email uniqueness
            const existingUser = await getUserByEmail(input.email);
            if (existingUser) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'هذا الإيميل مسجل بالفعل' });
            }

            const bcrypt = await import('bcryptjs');
            const crypto = await import('node:crypto');
            const hashedPassword = await bcrypt.hash(input.password, 10);
            const openId = `admin_${crypto.randomBytes(16).toString('hex')}`;

            // Create user
            const user = await createUser({
                openId,
                name: input.name,
                email: input.email,
                password: hashedPassword,
                loginMethod: 'email',
                role: 'user',
            });

            if (!user) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'فشل إنشاء المستخدم' });
            }

            // Create merchant
            const merchant = await createMerchant({
                userId: user.id,
                businessName: input.businessName,
                phone: input.phone || null,
                status: input.status,
            });

            console.log(`[Admin] Merchant CREATED: id=${merchant?.id}, email=${input.email}, business=${input.businessName}`);
            return { success: true, merchantId: merchant?.id, userId: user.id };
        }),

    // Delete merchant and all related data (Admin only)
    delete: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const pool = await getPool();
            if (!pool) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });

            // SEC-PENTEST-02: Frozen array — these are hardcoded table names, NOT user input.
            // Object.freeze prevents accidental mutation and signals code-review intent.
            const tables = Object.freeze([
                'brain_activity_log',
                'notification_preferences',
                'abandoned_carts',
                'discount_codes',
                'occasion_campaigns',
                'scheduled_messages',
                'campaign_logs',
                'campaigns',
                'messages',
                'conversations',
                'invoices', // SEC-R3-06: was missing (no FK cascade)
                'orders',
                'customers',
                'sari_conversions',
                'sari_api_keys',
                'merchant_addons',
                'merchant_subscriptions',
                'products',
                'extracted_faqs',
                'knowledge_docs',
                'bot_settings',
                'sari_personality_settings',
                'byaan_connections',
                'salla_connections',
                'whatsapp_connection_requests',
                'whatsapp_instances',
            ] as const);

            for (const table of tables) {
                try {
                    await pool.execute(`DELETE FROM \`${table}\` WHERE merchant_id = ?`, [input.merchantId]);
                } catch (e: any) {
                    // Table may not exist or column name differs — try without underscore
                    try {
                        await pool.execute(`DELETE FROM \`${table}\` WHERE merchantId = ?`, [input.merchantId]);
                    } catch {
                        // Skip silently
                    }
                }
            }

            // Delete merchant
            await pool.execute('DELETE FROM `merchants` WHERE id = ?', [input.merchantId]);

            // Delete associated user
            if (merchant.userId) {
                await pool.execute('DELETE FROM `users` WHERE id = ?', [merchant.userId]);
            }

            // SEC-R3-04: Persistent audit log for deletions
            try {
                await pool.execute(
                    `INSERT INTO brain_activity_log (merchant_id, action_type, description, details, created_at) VALUES (0, 'merchant_deleted', ?, ?, NOW())`,
                    [`Admin deleted merchant #${input.merchantId}: ${merchant.businessName}`, JSON.stringify({ deletedMerchantId: input.merchantId, businessName: merchant.businessName, userId: merchant.userId })]
                );
            } catch { /* audit log is best-effort */ }

            console.log(`[Admin] Merchant DELETED: id=${input.merchantId}, business=${merchant.businessName}`);
            return { success: true, deletedId: input.merchantId };
        }),

    // Get merchant by ID (Admin only)
    getById: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            return await getMerchantById(input.merchantId);
        }),

    // Get merchant subscriptions (Admin only)
    getSubscriptions: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            // Use merchant_subscriptions table (not legacy subscriptions table)
            const subscription = await getMerchantCurrentSubscription(input.merchantId);
            if (subscription) {
                // SEC-R3-05: Removed auto-sync side-effect from query.
                // Status sync should be handled by a dedicated mutation or scheduled job.

                // Enrich with plan name
                const plan = subscription.planId ? await getSubscriptionPlanById(subscription.planId) : null;
                return [{ ...subscription, planName: plan?.name || 'غير معروف' }];
            }
            return [];
        }),

    // ============================================
    // Admin Subscription Management
    // ============================================

    // Assign/Activate subscription for a merchant (Admin only)
    assignSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            planId: z.number(),
            durationDays: z.number().int().min(1).max(730).default(30),
            billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
        }))
        .mutation(async ({ input }) => {
            const merchant = await getMerchantById(input.merchantId);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            const plan = await getSubscriptionPlanById(input.planId);
            if (!plan) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
            }

            // PEN-04 FIX: Ensure plan is active
            if (!plan.isActive) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot assign an inactive plan' });
            }

            // Cancel any existing active subscription
            const existing = await getMerchantCurrentSubscription(input.merchantId);
            if (existing) {
                await cancelMerchantSubscription(existing.id, 'تم استبداله بتفعيل يدوي من الأدمن');
            }

            // Create new subscription
            const now = new Date();
            const endDate = new Date(now.getTime() + input.durationDays * 24 * 60 * 60 * 1000);

            const subscriptionId = await createMerchantSubscription({
                merchantId: input.merchantId,
                planId: input.planId,
                status: 'active',
                billingCycle: input.billingCycle,
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
                autoRenew: 0,
            });

            // Update merchant status and limits
            await updateMerchantSubscriptionStatus(input.merchantId, 'active');
            await updateMerchantCustomerLimit(input.merchantId, plan.maxCustomers);
            await updateMerchant(input.merchantId, { status: 'active' });
            // PEN-13 FIX: Keep currentSubscriptionId in sync
            await updateMerchantCurrentSubscriptionId(input.merchantId, subscriptionId);

            console.log(`[Admin] Subscription assigned: merchant=${input.merchantId}, plan=${plan.name}, duration=${input.durationDays}d`);

            return {
                success: true,
                subscriptionId,
                planName: plan.name,
                startDate: now.toISOString(),
                endDate: endDate.toISOString(),
            };
        }),

    // Extend subscription duration (Admin only)
    extendSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            extraDays: z.number().min(1).max(365),
        }))
        .mutation(async ({ input }) => {
            const subscription = await getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found for this merchant' });
            }

            const currentEnd = new Date(subscription.endDate);
            const newEnd = new Date(currentEnd.getTime() + input.extraDays * 24 * 60 * 60 * 1000);
            const toMySQL = (d: string) => d.includes('T') ? d.slice(0, 19).replace('T', ' ') : d;
            const newEndMySQL = toMySQL(newEnd.toISOString());

            // Direct raw SQL to guarantee update (bypass Drizzle typing issues)
            await rawUpdateSubscriptionEndDate(subscription.id, newEndMySQL);

            // Verify the update was saved
            const updated = await getMerchantSubscriptionById(subscription.id);
            const actualEndDate = updated?.endDate || newEndMySQL;
            console.log(`[Admin] Subscription extended: merchant=${input.merchantId}, sub=${subscription.id}, +${input.extraDays}d, DB end=${actualEndDate}`);

            return {
                success: true,
                previousEndDate: currentEnd.toISOString(),
                newEndDate: actualEndDate,
            };
        }),

    // Cancel merchant subscription (Admin only)
    cancelMerchantSubscription: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            reason: z.string().max(500).optional(), // PEN-05 FIX: limit length
        }))
        .mutation(async ({ input }) => {
            const subscription = await getMerchantCurrentSubscription(input.merchantId);
            if (!subscription) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No active subscription found' });
            }

            await cancelMerchantSubscription(subscription.id, input.reason || 'تم الإلغاء بواسطة الأدمن');
            // SEC-07 FIX: DB enum is ['none','trial','active','expired'] — 'cancelled' doesn't exist
            await updateMerchantSubscriptionStatus(input.merchantId, 'expired');

            console.log(`[Admin] Subscription cancelled: merchant=${input.merchantId}, reason=${input.reason || 'admin action'}`);

            return { success: true };
        }),

    // Get all plans (Admin helper - for the assign dropdown)
    getAvailablePlans: adminProcedure.query(async () => {
        return await getActiveSubscriptionPlans();
    }),

    // ============================================
    // Platform Integration Keys (Admin only)
    // ============================================

    // List all platform keys
    listPlatformKeys: adminProcedure.query(async () => {
        const { getPlatformKeys } = await import('./api/rest');
        return await getPlatformKeys();
    }),

    // Generate a new platform key
    generatePlatformKey: adminProcedure
        .input(z.object({
            platform: z.string().min(2).max(50),
            label: z.string().max(100).optional(),
        }))
        .mutation(async ({ input }) => {
            const { generatePlatformKeyValue, setPlatformKey } = await import('./api/rest');
            const keyValue = generatePlatformKeyValue(input.platform);
            await setPlatformKey(input.platform, keyValue, input.label || `${input.platform} integration`);
            // Return full key ONCE — admin copies it, never shown again
            return { platform: input.platform, key: keyValue };
        }),

    // Regenerate platform key (overwrites existing)
    regeneratePlatformKey: adminProcedure
        .input(z.object({ platform: z.string().min(2).max(50) })) // SEC-R3-07
        .mutation(async ({ input }) => {
            const { generatePlatformKeyValue, setPlatformKey } = await import('./api/rest');
            const keyValue = generatePlatformKeyValue(input.platform);
            await setPlatformKey(input.platform, keyValue);
            return { platform: input.platform, key: keyValue };
        }),

    // Delete platform key
    deletePlatformKey: adminProcedure
        .input(z.object({ platform: z.string().min(2).max(50) })) // SEC-R3-07
        .mutation(async ({ input }) => {
            const { deletePlatformKey } = await import('./api/rest');
            await deletePlatformKey(input.platform);
            return { success: true };
        }),

    // Get merchant campaigns (Admin only)
    getCampaigns: adminProcedure
        .input(z.object({ merchantId: z.number() }))
        .query(async ({ input }) => {
            return await getCampaignsByMerchantId(input.merchantId);
        }),

    // Sync Green API data (Admin only)
    syncGreenAPIData: adminProcedure
        .input(z.object({
            merchantId: z.number(),
            instanceId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9]+$/), // SEC-R3-08
            token: z.string().min(1).max(200), // SEC-R3-08
            syncChats: z.boolean().default(true),
            syncMessages: z.boolean().default(true),
            limit: z.number().min(1).max(500).default(100), // SEC-R3-08: bound limit
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
                // SEC-06 FIX: Don't expose raw error details
                console.error('[Merchants] Green API sync failed:', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'فشل مزامنة بيانات Green API. تحقق من بيانات الاتصال.',
                });
            }
        }),

    // Get current plan for merchant
    getCurrentPlan: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        const subscription = await getActiveSubscriptionByMerchantId(merchant.id);
        if (!subscription) {
            return null;
        }

        const plan = await getPlanById(subscription.planId);
        return {
            subscription,
            plan,
        };
    }),

    // Request plan upgrade — PEN-01/PEN-03 FIX: no free subscriptions
    requestUpgrade: protectedProcedure
        .input(z.object({ planId: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            if (merchant.status !== 'active') {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchant account is not active' });
            }

            const plan = await getPlanById(input.planId);
            if (!plan || !plan.isActive) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found or inactive' });
            }

            const currentSubscription = await getActiveSubscriptionByMerchantId(merchant.id);

            // PEN-01 FIX: If no subscription, redirect to payment flow instead of free activation
            if (!currentSubscription) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'لا يوجد اشتراك نشط. يرجى الاشتراك عبر صفحة الباقات.',
                });
            }

            if (currentSubscription.planId === input.planId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'You are already subscribed to this plan' });
            }

            // PEN-03 FIX: Block free plan changes — must go through payment/admin
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'لتغيير الباقة، يرجى التواصل مع الدعم أو استخدام صفحة الترقية مع الدفع.',
            });
        }),

    // Get onboarding status
    getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return await getOnboardingStatus(merchant.id);
    }),

    // Update onboarding step
    updateOnboardingStep: protectedProcedure
        .input(z.object({ step: z.number().min(0).max(4) }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            await updateOnboardingStep(merchant.id, input.step);
            return { success: true };
        }),

    // Complete onboarding
    completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        await completeOnboarding(merchant.id);
        return { success: true };
    }),

    // ============================================
    // Escalation Phone Chain — Smart Escalation Alert Numbers
    // ============================================

    /** Get merchant's escalation phone chain */
    getEscalationPhones: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }

        // Use raw SQL to avoid Drizzle type mismatches
        const pool = await getPool();
        let phones: { phone: string; label: string; order: number }[] = [];
        
        if (pool) {
            try {
                const [rows] = await pool.execute(
                    `SELECT escalation_phones, emergency_phone FROM merchants WHERE id = ?`,
                    [merchant.id]
                );
                const row = (rows as any[])[0];
                if (row?.escalation_phones) {
                    phones = JSON.parse(row.escalation_phones);
                } else if (row?.emergency_phone) {
                    phones = [{ phone: row.emergency_phone, label: 'المسؤول الأول', order: 1 }];
                }
            } catch (e: any) {
                // Columns may not exist yet — fall through to default
                console.warn('[Escalation] getEscalationPhones SQL error:', e?.message);
            }
        }

        // Default: use merchant's registered phone if no escalation phones configured
        if (phones.length === 0 && merchant.phone) {
            phones = [{ phone: merchant.phone, label: 'المدير (افتراضي)', order: 1 }];
        }

        return {
            phones: phones.sort((a, b) => a.order - b.order),
            emergencyPhone: phones.length > 0 ? phones[0].phone : (merchant.phone || null),
        };
    }),

    /** Update merchant's escalation phone chain */
    updateEscalationPhones: protectedProcedure
        .input(z.object({
            phones: z.array(z.object({
                phone: z.string().max(30).regex(/^[\d\s+\-().]+$/, 'رقم غير صالح — يجب أن يحتوي أرقام فقط'),
                label: z.string().max(50).default(''),
                order: z.number().int().min(1).max(5),
            })).max(5),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }

            // PEN-ESC-05 FIX: Rate limit phone chain updates (10s cooldown)
            const now = Date.now();
            const lastUpdate = _escalationPhoneRateLimit[merchant.id];
            if (lastUpdate && now - lastUpdate < 10_000) {
                throw new TRPCError({
                    code: 'TOO_MANY_REQUESTS',
                    message: 'يرجى الانتظار قبل تحديث أرقام التصعيد مرة أخرى',
                });
            }
            _escalationPhoneRateLimit[merchant.id] = now;

            // Ensure columns exist (auto-migration)
            const pool = await getPool();
            if (pool) {
                try {
                    await pool.execute(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS escalation_phones TEXT DEFAULT NULL`);
                    await pool.execute(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20) DEFAULT NULL`);
                } catch { /* columns already exist */ }
            }

            // === Normalize phone numbers: ensure country code ===
            const normalizePhone = (phone: string): string => {
                let p = phone.replace(/[\s\-()]/g, '');
                // Saudi local → international: 05xxxxxxxx → 9665xxxxxxxx
                if (/^05\d{8}$/.test(p)) {
                    p = '966' + p.slice(1); // drop leading 0
                }
                // Ensure no leading +
                p = p.replace(/^\+/, '');
                return p;
            };

            // Clean and normalize phones
            const cleaned = input.phones
                .map(p => ({ ...p, phone: normalizePhone(p.phone) }))
                .filter(p => p.phone.length > 0)
                .sort((a, b) => a.order - b.order);

            // === LOOP GUARD: Block bot's own WhatsApp number ===
            // If merchant adds the same number the bot uses, escalation messages
            // would be received by the webhook → treated as customer → infinite loop
            try {
                const { getWhatsAppInstancesByMerchantId } = await import('./db');
                const instances = await getWhatsAppInstancesByMerchantId(merchant.id);
                const botPhones = instances
                    .filter((i: any) => i.status === 'active')
                    .map((i: any) => normalizePhone(String(i.phoneNumber || '')))
                    .filter(p => p.length > 0);

                const conflicting = cleaned.filter(c => botPhones.includes(c.phone));
                if (conflicting.length > 0) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: '⚠️ لا يمكن إضافة نفس رقم الواتساب المفعّل للبوت كرقم تصعيد — سيسبب حلقة لا نهائية',
                    });
                }
            } catch (e: any) {
                // Only rethrow if it's our TRPCError — don't block on DB failures
                if (e instanceof TRPCError) throw e;
                console.warn('[Escalation] Bot phone check failed (non-blocking):', e?.message);
            }

            // Save using raw SQL to avoid Drizzle type issues with 'as any'
            if (pool) {
                const escalationJson = cleaned.length > 0 ? JSON.stringify(cleaned) : null;
                const emergencyPhone = cleaned.length > 0 ? cleaned[0].phone : null;
                await pool.execute(
                    `UPDATE merchants SET escalation_phones = ?, emergency_phone = ? WHERE id = ?`,
                    [escalationJson, emergencyPhone, merchant.id]
                );
            } else {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
            }

            console.log(`[Escalation] 📱 Chain updated for merchant ${merchant.id}: ${cleaned.length} contacts`);
            return { success: true, count: cleaned.length };
        }),

    // Legacy endpoint — backward compat
    getEmergencyPhone: protectedProcedure.query(async ({ ctx }) => {
        const merchant = await getMerchantByUserId(ctx.user.id);
        if (!merchant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
        }
        return {
            emergencyPhone: (merchant as any).emergencyPhone || null,
            phone: merchant.phone || null,
        };
    }),

    updateEmergencyPhone: protectedProcedure
        .input(z.object({
            emergencyPhone: z.string().max(20).regex(/^[0-9+\-\s()]*$/, 'رقم غير صالح').nullable(),
        }))
        .mutation(async ({ input, ctx }) => {
            const merchant = await getMerchantByUserId(ctx.user.id);
            if (!merchant) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Merchant not found' });
            }
            const pool = await getPool();
            if (pool) {
                try {
                    await pool.execute(`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20) DEFAULT NULL`);
                } catch { /* column already exists */ }
            }
            await updateMerchant(merchant.id, { emergencyPhone: input.emergencyPhone } as any);
            return { success: true };
        }),
});

export type MerchantsRouter = typeof merchantsRouter;